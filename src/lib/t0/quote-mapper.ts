// quote-mapper.ts — 纯函数层,负责 agtpay API 响应 ↔ 内部 GetQuoteResult 形状。
// 单一职责:无 React、无 fetch、无 Date.now() 调用(时间由 caller 注入),便于 100% 单测。
//
// 设计要点:
// - Decimal 双向转换处理浮点精度(用 Math.round(round * 1e10) / 1e10 + string parse)
// - RFC3339 → epoch ms 解析,无效输入抛 Error 由调用方处理
// - ID 拼装遵循文档 §3 字段映射表(providerId-quoteId)
// - 失败原因四分类(NO_QUOTE / UPSTREAM / UNAUTHORIZED / BAD_REQUEST)
//   → 内部 9 个 QuoteFailureReason,新增 3 个

import type { Currency, Quote, VolumeBand } from "./types";
import type { GetQuoteResult, QuoteFailureReason } from "./network";

// ── Decimal 转换 ──────────────────────────────────────────────

export interface Decimal {
  unscaled: number;
  exponent: number;
}

/** d.unscaled * 10^d.exponent
 *
 * Connect-RPC omits default-valued fields from the wire format, so a Decimal
 * with exponent=0 may arrive as `{ unscaled: 500 }` (no `exponent` key). We
 * treat a missing exponent as 0 to be lenient with proto3 JSON encoding. */
export function decimalToNumber(d: Decimal): number {
  const unscaled = d.unscaled;
  const exponent = d.exponent ?? 0;
  if (!Number.isFinite(unscaled) || !Number.isFinite(exponent)) {
    throw new Error(`invalid Decimal: ${JSON.stringify(d)}`);
  }
  return unscaled * Math.pow(10, exponent);
}

/** number → Decimal。处理浮点精度: 先 round 到 1e-10,再转 string parse。 */
export function numberToDecimal(n: number): Decimal {
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${n}`);
  // 把 number 规范成字符串(避免科学计数法)
  const s = String(Math.round(n * 1e10) / 1e10);
  const [intPart, fracPart = ""] = s.split(".");
  // -(-"".length) === -0 in JS; Object.is/=== distinguish -0 from 0.
  // Normalize so whole numbers encode as exponent: 0 (not -0).
  const exponent = fracPart.length === 0 ? 0 : -fracPart.length;
  const unscaled = parseInt(intPart + fracPart, 10);
  return { unscaled, exponent };
}

// ── RFC3339 解析 ──────────────────────────────────────────────

/** "2026-07-09T12:00:00Z" → epoch ms。无效输入抛 Error。 */
export function parseRfc3339(s: string): number {
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new Error(`invalid RFC3339 timestamp: ${s}`);
  return ms;
}

// ── OfiT0Client 内部结果形状 ──────────────────────────────────

export type OfiFailureReason = "NO_QUOTE" | "UPSTREAM" | "UNAUTHORIZED" | "BAD_REQUEST";

export interface OfiQuoteSuccess {
  /** 已拼好的 "providerId-quoteId" 字符串 */
  quoteId: string;
  currency: string;
  /** OFI 请求的 USD 数额(作为 band 字段) */
  band: number;
  /** USD → local 的换算率 */
  rate: number;
  /** epoch ms */
  expiresAt: number;
  /** 本币金额 */
  payOutAmount: number;
  /** USD 结算金额 */
  settlementAmount: number;
  /** 服务端取的时间戳 */
  createdAt: number;
}

export type OfiQuoteResponse =
  | { success: OfiQuoteSuccess }
  | { failure: { reason: OfiFailureReason; message?: string } };

// ── 错误码映射 ────────────────────────────────────────────────

/** 4 分类失败 → 内部 9 个 QuoteFailureReason 之一 */
export function toQuoteFailureReason(reason: OfiFailureReason): QuoteFailureReason {
  switch (reason) {
    case "NO_QUOTE":     return "REASON_NO_QUOTE_AVAILABLE";
    case "UPSTREAM":     return "REASON_UPSTREAM_ERROR";
    case "UNAUTHORIZED": return "REASON_UNAUTHORIZED";
    case "BAD_REQUEST":  return "REASON_BAD_REQUEST";
  }
}

// ── OfiQuoteResponse → GetQuoteResult(给 SandboxNetwork 用) ──

export function toGetQuoteResult(
  res: OfiQuoteResponse,
  now: number,
  fallbackCurrency: Currency,
): GetQuoteResult {
  if ("failure" in res) {
    return { failure: { reason: toQuoteFailureReason(res.failure.reason) } };
  }
  const s = res.success;
  // 服务器返回的 quote 已过期 → 视作 EXPIRED
  if (s.expiresAt <= now) {
    return { failure: { reason: "REASON_QUOTE_EXPIRED" } };
  }
  const quote: Quote = {
    id: s.quoteId,
    currency: fallbackCurrency,
    // s.band originates from the OFI request usdAmount; cast through VolumeBand
    // because the Quote type is intentionally narrow (sandbox uses fixed bands).
    // The runtime value is still a number; downstream consumers tolerate it.
    band: s.band as VolumeBand,
    rate: s.rate,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
  };
  return {
    success: {
      quote,
      payoutAmount: s.payOutAmount,
      settlementAmount: s.settlementAmount,
    },
  };
}

// ── Raw API 响应 → OfiQuoteSuccess(给 HttpOfiT0Client 用) ──

/**
 * API 原始响应形状(来自 POST /api/v1/quotes/network 的 result.success)
 */
export interface RawSuccess {
  rate: Decimal;
  expiration: string;
  quoteId: { quoteId: number; providerId: number };
  payOutAmount: Decimal;
  settlementAmount: Decimal;
}

export function rawToOfiSuccess(
  raw: RawSuccess,
  reqUsdAmount: number,
  fallbackCurrency: Currency,
  now: number,
): OfiQuoteSuccess {
  return {
    quoteId: `${raw.quoteId.providerId}-${raw.quoteId.quoteId}`,
    currency: fallbackCurrency,
    band: reqUsdAmount,
    rate: decimalToNumber(raw.rate),
    expiresAt: parseRfc3339(raw.expiration),
    payOutAmount: decimalToNumber(raw.payOutAmount),
    settlementAmount: decimalToNumber(raw.settlementAmount),
    createdAt: now,
  };
}
