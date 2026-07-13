// ofi-client.ts — OFI 拉取方向的客户端接口。
// 与 client.ts (HttpT0Client, provider 推送方向) 解耦:职责分离。
//
// - HttpOfiT0Client: 实调 agtpay POST /api/v1/quotes/network
// - MockOfiT0Client: 复用原 "按 usdAmount+currency 过滤 + 选最优 quote" 逻辑
//                    作为开发 / CI 通道(由 T0_QUOTE_CLIENT_MODE=mock 启用)

import type { Currency } from "./types";
import {
  numberToDecimal,
  rawToOfiSuccess,
  type OfiFailureReason,
  type OfiQuoteResponse,
  type RawProviderQuote,
} from "./quote-mapper";

type RawDecimal = { unscaled: number; exponent: number };

/**
 * Live-observed "no quote" reason code from agtpay (integer 10).
 *
 * SOURCE: Live testing on 2026-07-10 — agtpay server returned
 *   Result.Failure.reason = 10 (integer) for a no-quote condition,
 *   distinct from the documented REASON_QUOTE_NOT_FOUND (integer 1).
 *
 * TREATMENT: Accept as NO_QUOTE for resilience. REMOVE once agtpay
 * confirms the official enum value; until then this constant exists
 * so the source and expiry of the workaround are auditable.
 *
 * See audit §6.1 A8.
 */
export const LIVE_OBSERVED_NO_QUOTE_REASON = 10;

// ── 接口 ──────────────────────────────────────────────────────

export interface OfiQuoteRequest {
  usdAmount: number;
  currency: Currency;
  /** t-0 enum string, e.g. "PAYMENT_METHOD_TYPE_SEPA". 来自 env,UI 不传。 */
  paymentMethod: string;
}

export interface OfiT0Client {
  getQuote(req: OfiQuoteRequest, now: () => number): Promise<OfiQuoteResponse>;
}

// ── HTTP 实现 ─────────────────────────────────────────────────

export interface HttpOfiT0ClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  /** 注入用(测试);默认全局 fetch */
  fetchImpl?: typeof fetch;
}

export class HttpOfiT0Client implements OfiT0Client {
  constructor(private readonly opts: HttpOfiT0ClientOptions) {}

  async getQuote(req: OfiQuoteRequest, now: () => number): Promise<OfiQuoteResponse> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await fetchImpl(`${this.opts.baseUrl}/api/v1/quotes/network`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          amount: numberToDecimal(req.usdAmount),
          amountType: "settlement",
          payOutCurrency: req.currency,
          payOutMethod: req.paymentMethod,
        }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        return { failure: { reason: "UNAUTHORIZED" as OfiFailureReason } };
      }
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => "");
        return { failure: { reason: "BAD_REQUEST" as OfiFailureReason, message: text } };
      }
      if (res.status >= 500) {
        return { failure: { reason: "UPSTREAM" as OfiFailureReason } };
      }
      if (!res.ok) {
        return { failure: { reason: "UPSTREAM" as OfiFailureReason } };
      }

      const json: unknown = await res.json();
      return this.parseResponse(json, req, now());
    } catch {
      // timeout / network error / JSON parse failure → 上游不可用
      return { failure: { reason: "UPSTREAM" as OfiFailureReason } };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse a /api/v1/quotes/network response body.
   *
   * agtpay uses Connect-RPC over HTTP, which means the actual wire format is
   * proto3 JSON — not the camelCase shown in the OpenAPI spec. Concretely:
   *
   *   OpenAPI spec          |  Actual wire
   *   --------------------- |  ---------------------------------
   *   result.success        |  Result.Success
   *   result.failure.reason |  Result.Failure.reason (INTEGER, not string)
   *   quoteId              |  quote_id
   *   payOutAmount         |  pay_out_amount
   *   settlementAmount     |  settlement_amount
   *   expiration (RFC3339) |  expiration: { seconds, nanos } (proto Timestamp)
   *
   * To be resilient we look at BOTH shapes. camelCase is checked first because
   * it matches the spec; PascalCase is a fallback. Unknown reason codes (integer
   * or string) are reported as `UPSTREAM` so the UI shows a friendly error
   * and the operator can decide whether to retry.
   */
  private parseResponse(json: unknown, req: OfiQuoteRequest, now: number): OfiQuoteResponse {
    const env = json as Record<string, unknown>;

    // Find the result envelope under either casing.
    const result =
      (env.result as Record<string, unknown> | undefined) ??
      (env.Result as Record<string, unknown> | undefined);

    // ── Failure path ─────────────────────────────────────────────
    const failure =
      (result?.failure as Record<string, unknown> | undefined) ??
      (result?.Failure as Record<string, unknown> | undefined);
    if (failure) {
      const reason = failure.reason;
      // REASON_QUOTE_NOT_FOUND — spec lists it as a string. The integer enum
      // value is 1; we accept both forms and any other "no quote" reason code
      // (agtpay server returned reason=10 in live tests, distinct from
      // the documented 1) as NO_QUOTE.
      if (
        reason === "REASON_QUOTE_NOT_FOUND" ||
        reason === 1 ||
        reason === LIVE_OBSERVED_NO_QUOTE_REASON
      ) {
        return { failure: { reason: "NO_QUOTE" } };
      }
      // String REASON_UNSPECIFIED → UPSTREAM (per spec mapping).
      // Any other integer reason → also UPSTREAM (unknown code), but include
      // the raw reason in the message for operator debugging.
      const message = typeof reason === "string" ? reason : `unknown reason code: ${reason}`;
      return { failure: { reason: "UPSTREAM", message } };
    }

    // ── Success path ─────────────────────────────────────────────
    const success =
      (result?.success as Record<string, unknown> | undefined) ??
      (result?.Success as Record<string, unknown> | undefined);
    if (!success) {
      return { failure: { reason: "UPSTREAM" } };
    }

    // ── Field extraction (spec OR wire) ──────────────────────────
    const rate = success.rate as RawDecimal | undefined;
    // audit §6.1 A4: unparseable upstream expiration must surface as
    // UPSTREAM, not as a quote that silently expires.
    const expiration = this.parseExpiration(success.expiration);
    const quoteIdRaw =
      (success.quoteId as
        | { quoteId?: number; providerId?: number }
        | { quote_id?: number; provider_id?: number }
        | undefined) ??
      (success.quote_id as
        | { quoteId?: number; providerId?: number }
        | { quote_id?: number; provider_id?: number }
        | undefined);
    const payOutAmount =
      (success.payOutAmount as RawDecimal | undefined) ??
      (success.pay_out_amount as RawDecimal | undefined);
    const settlementAmount =
      (success.settlementAmount as RawDecimal | undefined) ??
      (success.settlement_amount as RawDecimal | undefined);

    if (!rate || !quoteIdRaw || !payOutAmount || !settlementAmount) {
      return { failure: { reason: "UPSTREAM", message: "missing fields in success payload" } };
    }
    if (expiration === null) {
      return { failure: { reason: "UPSTREAM", message: "unparseable expiration" } };
    }

    // Build the QuoteID in our standard "providerId-quoteId" string form.
    // Wire format may be camelCase (quoteId/providerId) OR snake_case
    // (quote_id/provider_id) — accept both.
    let providerIdInternal: number | undefined;
    let quoteIdInner: number | undefined;
    if (typeof (quoteIdRaw as { providerId?: number }).providerId === "number") {
      providerIdInternal = (quoteIdRaw as { providerId: number }).providerId;
      quoteIdInner = (quoteIdRaw as { quoteId: number }).quoteId;
    } else if (typeof (quoteIdRaw as { provider_id?: number }).provider_id === "number") {
      providerIdInternal = (quoteIdRaw as { provider_id: number }).provider_id;
      quoteIdInner = (quoteIdRaw as { quote_id: number }).quote_id;
    }

    if (providerIdInternal === undefined || quoteIdInner === undefined) {
      return { failure: { reason: "UPSTREAM", message: "invalid quoteId object" } };
    }

    // ── Optional: forward `allQuotes[]` to the mapper so the settlement
    //    breakdown is preserved (audit §1.2 #6). The mapper matches the
    //    selected composite quoteId against this array.
    const allQuotes =
      (env.allQuotes as readonly RawProviderQuote[] | undefined) ??
      (env.AllQuotes as readonly RawProviderQuote[] | undefined);

    try {
      return {
        success: rawToOfiSuccess(
          {
            rate,
            expiration,
            quoteId: { quoteId: quoteIdInner, providerId: providerIdInternal },
            payOutAmount,
            settlementAmount,
          },
          req.usdAmount,
          req.currency,
          now,
          allQuotes,
        ),
      };
    } catch (e) {
      // rawToOfiSuccess throws on RFC3339 parse error. audit A4: don't
      // pretend this is an expired quote — it's a malformed upstream
      // response.
      return {
        failure: {
          reason: "UPSTREAM",
          message: e instanceof Error ? e.message : "upstream parse error",
        },
      };
    }
  }

  /**
   * Parse the `expiration` field from either:
   *   - RFC3339 string: "2026-07-09T12:00:00Z"
   *   - proto3 JSON Timestamp: { seconds: number, nanos: number }
   *
   * Returns `null` on failure (callers must treat this as UPSTREAM).
   * Audit §6.1 A4: previously the fallback was an epoch string which masked
   * the failure as an expired quote.
   */
  private parseExpiration(exp: unknown): string | null {
    if (typeof exp === "string") return exp;
    if (exp && typeof exp === "object") {
      const t = exp as { seconds?: number | string; nanos?: number };
      const sec = typeof t.seconds === "string" ? Number(t.seconds) : t.seconds;
      if (typeof sec === "number" && Number.isFinite(sec) && sec > 0) {
        const ms = sec * 1000 + Math.floor((t.nanos ?? 0) / 1_000_000);
        if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
      }
    }
    return null;
  }
}

// ── Mock 实现 ─────────────────────────────────────────────────

/**
 * 由 SandboxNetwork 注入:从 provider 内存快照中按 usdAmount+currency 过滤
 * 并选最优 quote。返回 null 表示"没有可用 quote"。
 */
export type PickBestQuoteFn = (
  usdAmount: number,
  currency: Currency,
  now: number,
) => { rate: number; expiresAt: number; createdAt: number; quoteId: string } | null;

export interface MockOfiT0ClientOptions {
  pickBestQuote: PickBestQuoteFn;
  /**
   * Optional external-rate fallback (plan §4.1). Invoked only when
   * `pickBestQuote` returns null. Returning a non-null value produces an
   * `OfiQuoteSuccess` with rate/expiresAt taken verbatim from the fallback
   * (plan §5.2: preserve upstream precision). Returning null propagates
   * the NO_QUOTE failure to the caller. Throwing propagates the error
   * (plan §7: fallback failures must surface, not be silently swallowed).
   */
  fallbackQuoteProvider?: (
    req: OfiQuoteRequest,
    now: () => number,
  ) => Promise<{ rate: number; expiresAt: number } | null>;
}

export class MockOfiT0Client implements OfiT0Client {
  constructor(private readonly opts: MockOfiT0ClientOptions) {}

  async getQuote(req: OfiQuoteRequest, now: () => number): Promise<OfiQuoteResponse> {
    if (req.usdAmount <= 0) {
      return { failure: { reason: "BAD_REQUEST", message: "usdAmount must be > 0" } };
    }
    let picked = this.opts.pickBestQuote(req.usdAmount, req.currency, now());
    if (!picked && this.opts.fallbackQuoteProvider) {
      const fb = await this.opts.fallbackQuoteProvider(req, now);
      if (fb) {
        // Deterministic-but-fresh quote id (plan §10): same request + same now
        // ⇒ same id, so getQuoteById() can re-resolve it across the OFI flow.
        // Prefix "fb_quote-" distinguishes fallback from Provider quotes in logs.
        picked = {
          rate: fb.rate,
          expiresAt: fb.expiresAt,
          createdAt: now(),
          quoteId: `fb_quote-${req.usdAmount}-${req.currency}-${now()}`,
        };
      }
    }
    if (!picked) {
      return { failure: { reason: "NO_QUOTE" } };
    }
    return {
      success: {
        quoteId: picked.quoteId,
        currency: req.currency,
        band: req.usdAmount,
        rate: picked.rate,
        expiresAt: picked.expiresAt,
        payOutAmount: req.usdAmount * picked.rate,
        settlementAmount: req.usdAmount,
        createdAt: picked.createdAt,
      },
    };
  }
}
