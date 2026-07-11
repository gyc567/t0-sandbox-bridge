// quote-mapper.ts — 纯函数层,负责 agtpay API 响应 ↔ 内部 GetQuoteResult 形状。
// 单一职责:无 React、无 fetch、无 Date.now() 调用(时间由 caller 注入),便于 100% 单测。
//
// 设计要点:
// - Decimal 双向转换处理浮点精度(用 Math.round(round * 1e10) / 1e10 + string parse)
// - RFC3339 → epoch ms 解析,无效输入返回 null 由调用方映射为 UPSTREAM
//   (audit §6.1 A4: 改写为 epoch 会伪装成"已过期 quote")
// - ID 拼装遵循文档 §3 字段映射表(providerId-quoteId)
// - 失败原因四分类(NO_QUOTE / UPSTREAM / UNAUTHORIZED / BAD_REQUEST)
//   → 内部 9 个 QuoteFailureReason,新增 3 个

import type { Currency, Quote } from "./types";
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
  /**
   * Optional funding breakdown from the upstream AGTPay envelope's
   * `allQuotes[]` array (audit §1.2 #6). When the matched provider quote
   * carries a settlement sub-message, this is populated. Otherwise the
   * field is `undefined` and the UI renders the funding recommendation
   * as `unavailable` rather than fabricating a value.
   */
  settlement?: SettlementBreakdown;
}

/**
 * Funding breakdown for the selected quote, surfaced from the upstream
 * `allQuotes[].settlement` envelope. All fields are optional because the
 * upstream response may omit them. `available` distinguishes "this
 * envelope was present" from "we couldn't get the data" — when `false`,
 * the UI must not display any fabricated recommendation.
 */
export interface SettlementBreakdown {
  readonly available: boolean;
  amount?: number;
  creditLimit?: number;
  totalUsed?: number;
  prefundingAmount?: number;
  executable?: boolean;
  providerId?: number;
}

/**
 * Shape of a single entry from the upstream `allQuotes[]` array. Only
 * the fields we currently use are declared; everything else is passed
 * through in `rawSettlement` for diagnostic / replay purposes.
 */
export interface RawProviderQuote {
  quoteId?: number;
  providerId?: number;
  executable?: boolean;
  fix?: Decimal;
  settlement?: RawProviderSettlement;
}

export interface RawProviderSettlement {
  amount?: Decimal;
  creditLimit?: Decimal;
  totalUsed?: Decimal;
  prefundingAmount?: Decimal;
  providerId?: number;
}

/**
 * Best-effort match of the selected quote against the upstream
 * `allQuotes[]` array, returning the settlement breakdown if present.
 *
 * Match key: `${providerId}-${quoteId}` — identical to the
 * `OfiQuoteSuccess.quoteId` form built in `rawToOfiSuccess`. If the
 * upstream omits `allQuotes`, or the matching entry is missing / lacks a
 * settlement sub-message, returns `undefined`. The UI distinguishes
 * "missing breakdown" from "available breakdown" via the `?.available`
 * guard — it should never display fabricated values when this returns
 * `undefined`.
 */
export function findSettlementBreakdown(
  selectedQuoteId: string,
  allQuotes: readonly RawProviderQuote[] | undefined,
): SettlementBreakdown | undefined {
  if (!allQuotes || allQuotes.length === 0) {
    return undefined;
  }
  for (const q of allQuotes) {
    if (q.providerId === undefined || q.quoteId === undefined) continue;
    const composite = `${q.providerId}-${q.quoteId}`;
    if (composite !== selectedQuoteId) continue;
    if (!q.settlement) {
      // Matched the quote but no settlement sub-message — return a
      // marker object so the UI knows the quote exists.
      return {
        available: false,
        executable: q.executable,
        providerId: q.providerId,
      };
    }
    const s = q.settlement;
    const breakdown: SettlementBreakdown = {
      available: true,
      executable: q.executable,
      providerId: q.providerId,
    };
    if (s.amount !== undefined) breakdown.amount = decimalToNumber(s.amount);
    if (s.creditLimit !== undefined) breakdown.creditLimit = decimalToNumber(s.creditLimit);
    if (s.totalUsed !== undefined) breakdown.totalUsed = decimalToNumber(s.totalUsed);
    if (s.prefundingAmount !== undefined) breakdown.prefundingAmount = decimalToNumber(s.prefundingAmount);
    if (s.providerId !== undefined) breakdown.providerId = s.providerId;
    return breakdown;
  }
  return undefined;
}

export type OfiQuoteResponse =
  | { success: OfiQuoteSuccess }
  | { failure: { reason: OfiFailureReason; message?: string } };

// ── 错误码映射 ────────────────────────────────────────────────

/** 4 分类失败 → 内部 9 个 QuoteFailureReason 之一 */
export function toQuoteFailureReason(reason: OfiFailureReason): QuoteFailureReason {
  switch (reason) {
    case "NO_QUOTE":
      return "REASON_NO_QUOTE_AVAILABLE";
    case "UPSTREAM":
      return "REASON_UPSTREAM_ERROR";
    case "UNAUTHORIZED":
      return "REASON_UNAUTHORIZED";
    case "BAD_REQUEST":
      return "REASON_BAD_REQUEST";
  }
}

// ── OfiQuoteResponse → GetQuoteResult(给 SandboxNetwork 用) ──

/**
 * Convert OfiClient result to GetQuoteResult.
 *
 * audit §6.1 A4: if upstream returned an unparseable `expiration`, the client
 * surfaces that as `OfiQuoteResponse.success.expiresAt = NaN` (raw mapper
 * throws before reaching here), so we never coerce an invalid time to epoch.
 *
 * audit §6.1 A7: the upstream `message` is propagated into `failure.message`
 * so server-side logging retains diagnostic context (UI does not read this).
 */
export function toGetQuoteResult(
  res: OfiQuoteResponse,
  now: number,
  fallbackCurrency: Currency,
): GetQuoteResult {
  if ("failure" in res) {
    const failure: { reason: QuoteFailureReason; message?: string } = {
      reason: toQuoteFailureReason(res.failure.reason),
    };
    if (res.failure.message) failure.message = res.failure.message;
    return { failure };
  }
  const s = res.success;
  // 服务器返回的 quote 已过期 → 视作 EXPIRED
  if (s.expiresAt <= now) {
    return { failure: { reason: "REASON_QUOTE_EXPIRED" } };
  }
  const quote: Quote = {
    id: s.quoteId,
    currency: fallbackCurrency,
    band: s.band, // band is now `number` (audit A3); OFI request amount is the truth
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
  /**
   * Either RFC3339 string or proto Timestamp — `null` signals the client
   * could not parse this field, in which case `rawToOfiSuccess` throws
   * (caller maps to UPSTREAM).
   */
  expiration: string | null;
  quoteId: { quoteId: number; providerId: number };
  payOutAmount: Decimal;
  settlementAmount: Decimal;
}

export function rawToOfiSuccess(
  raw: RawSuccess,
  reqUsdAmount: number,
  fallbackCurrency: Currency,
  now: number,
  allQuotes?: readonly RawProviderQuote[],
): OfiQuoteSuccess {
  // audit §6.1 A4: invalid upstream expiration is an upstream error, not an
  // expired quote. Surface as a thrown Error so the HttpOfiT0Client can
  // classify it as UPSTREAM.
  if (raw.expiration === null) {
    throw new Error("upstream returned an unparseable expiration");
  }
  const quoteId = `${raw.quoteId.providerId}-${raw.quoteId.quoteId}`;
  const settlement = findSettlementBreakdown(quoteId, allQuotes);
  const success: OfiQuoteSuccess = {
    quoteId,
    currency: fallbackCurrency,
    band: reqUsdAmount,
    rate: decimalToNumber(raw.rate),
    expiresAt: parseRfc3339(raw.expiration),
    payOutAmount: decimalToNumber(raw.payOutAmount),
    settlementAmount: decimalToNumber(raw.settlementAmount),
    createdAt: now,
  };
  if (settlement !== undefined) success.settlement = settlement;
  return success;
}
