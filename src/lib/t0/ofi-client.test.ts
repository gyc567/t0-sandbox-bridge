// ofi-client.test.ts — 覆盖 ofi-client.ts 的两组 client 实现。
// - HttpOfiT0Client: 用 vi.fn() mock fetch,覆盖成功 / 401 / 4xx / 5xx / timeout / 业务失败
// - MockOfiT0Client: 覆盖 NO_QUOTE / BAD_REQUEST / 选最优 quote

import { describe, it, expect, vi } from "vitest";
import { HttpOfiT0Client, MockOfiT0Client } from "./ofi-client";

const NOW = 1_700_000_000_000;
const FUTURE = "2026-07-09T12:00:00Z";
const FUTURE_EPOCH = Date.UTC(2026, 6, 9, 12, 0, 0);

function buildSuccessJson() {
  return {
    result: {
      success: {
        rate: { unscaled: 86, exponent: -2 },
        expiration: FUTURE,
        quoteId: { quoteId: 67890, providerId: 1 },
        payOutAmount: { unscaled: 860, exponent: 0 },
        settlementAmount: { unscaled: 1000, exponent: 0 },
      },
    },
    allQuotes: [],
  };
}

function buildFailureJson(reason: string) {
  return { result: { failure: { reason } } };
}

// ── HttpOfiT0Client ──────────────────────────────────────────

describe("HttpOfiT0Client.getQuote", () => {
  function mkFetch(body: unknown, status = 200): typeof fetch {
    return vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      json: async () => body,
    })) as unknown as typeof fetch;
  }

  function buildClient(overrides: { fetchImpl?: typeof fetch; apiKey?: string } = {}) {
    return new HttpOfiT0Client({
      baseUrl: "https://api.agtpay.xyz",
      apiKey: overrides.apiKey ?? "test-key",
      timeoutMs: 5000,
      fetchImpl: overrides.fetchImpl,
    });
  }

  it("POSTs to /api/v1/quotes/network with Bearer auth and serialized Decimal body", async () => {
    const fetchImpl = mkFetch(buildSuccessJson());
    const client = buildClient({ fetchImpl });
    await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.agtpay.xyz/api/v1/quotes/network");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      amount: { unscaled: 1000, exponent: 0 },
      amountType: "settlement",
      payOutCurrency: "EUR",
      payOutMethod: "PAYMENT_METHOD_TYPE_SEPA",
    });
  });

  it("returns success envelope on 200 with result.success", async () => {
    const client = buildClient({ fetchImpl: mkFetch(buildSuccessJson()) });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({
      success: {
        quoteId: "1-67890",
        currency: "EUR",
        band: 1000,
        rate: 0.86,
        expiresAt: FUTURE_EPOCH,
        payOutAmount: 860,
        settlementAmount: 1000,
        createdAt: NOW,
      },
    });
  });

  it("returns NO_QUOTE failure on REASON_QUOTE_NOT_FOUND", async () => {
    const client = buildClient({
      fetchImpl: mkFetch(buildFailureJson("REASON_QUOTE_NOT_FOUND")),
    });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "NO_QUOTE" } });
  });

  it("returns UPSTREAM failure on REASON_UNSPECIFIED", async () => {
    const client = buildClient({
      fetchImpl: mkFetch(buildFailureJson("REASON_UNSPECIFIED")),
    });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("UPSTREAM");
  });

  it("returns UNAUTHORIZED failure on HTTP 401", async () => {
    const client = buildClient({ fetchImpl: mkFetch({}, 401) });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "UNAUTHORIZED" } });
  });

  it("returns BAD_REQUEST failure on HTTP 400", async () => {
    const client = buildClient({ fetchImpl: mkFetch({ error: "bad json" }, 400) });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("BAD_REQUEST");
  });

  it("returns UPSTREAM failure on HTTP 500", async () => {
    const client = buildClient({ fetchImpl: mkFetch({}, 500) });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "UPSTREAM" } });
  });

  it("returns UPSTREAM failure on HTTP 502", async () => {
    const client = buildClient({ fetchImpl: mkFetch({}, 502) });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "UPSTREAM" } });
  });

  it("returns UPSTREAM failure when fetch throws (network error)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "UPSTREAM" } });
  });

  it("returns UPSTREAM failure when JSON parsing fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "not json",
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "UPSTREAM" } });
  });

  it("returns UPSTREAM failure when JSON has no result.success", async () => {
    // Response shape is missing both result.success and result.failure
    const fetchImpl = mkFetch({ result: {} });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "UPSTREAM" } });
  });

  it("returns UPSTREAM failure on non-2xx, non-4xx, non-5xx status (e.g. 3xx)", async () => {
    // 304 Not Modified — status >= 300 and < 400; falls through to !res.ok
    const fetchImpl = mkFetch({}, 304);
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "UPSTREAM" } });
  });

  it("uses default fetchImpl when none is injected", async () => {
    // Build client without fetchImpl — exercises the `?? fetch` default branch.
    // The actual fetch is intercepted by happy-dom's globals (or test runner env).
    const client = new HttpOfiT0Client({
      baseUrl: "https://api.agtpay.xyz",
      apiKey: "k",
      timeoutMs: 100,
      // fetchImpl: omitted on purpose
    });
    const r = await client.getQuote(
      { usdAmount: 1, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    // Default fetch will likely fail (no real network) → caught as UPSTREAM.
    expect("failure" in r && r.failure.reason).toBe("UPSTREAM");
  });

  it("aborts and returns UPSTREAM when timeout fires before fetch resolves", async () => {
    // Fetch that never resolves — exercises the setTimeout abort path.
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as unknown as typeof fetch;
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("UPSTREAM");
  });

  it("treats HTTP 400 even when res.text() throws (e.g. body unreadable)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => {
        throw new Error("body unreadable");
      },
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("BAD_REQUEST");
  });

  // ── Connect-RPC wire format (PascalCase + snake_case + proto Timestamp) ──

  it("parses Result.Success wire format (PascalCase envelope)", async () => {
    const fetchImpl = mkFetch({
      Result: {
        Success: {
          rate: { unscaled: 86, exponent: -2 },
          expiration: FUTURE,
          quoteId: { quoteId: 67890, providerId: 1 },
          payOutAmount: { unscaled: 860, exponent: 0 },
          settlementAmount: { unscaled: 1000, exponent: 0 },
        },
      },
      allQuotes: [],
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({
      success: {
        quoteId: "1-67890",
        currency: "EUR",
        band: 1000,
        rate: 0.86,
        expiresAt: FUTURE_EPOCH,
        payOutAmount: 860,
        settlementAmount: 1000,
        createdAt: NOW,
      },
    });
  });

  it("parses snake_case nested fields (quote_id, pay_out_amount, settlement_amount)", async () => {
    const fetchImpl = mkFetch({
      Result: {
        Success: {
          rate: { unscaled: 92, exponent: -2 },
          expiration: FUTURE,
          quote_id: { quote_id: 42, provider_id: 7 },
          pay_out_amount: { unscaled: 920, exponent: 0 },
          settlement_amount: { unscaled: 1000, exponent: 0 },
        },
      },
      AllQuotes: [],
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("success" in r && r.success.quoteId).toBe("7-42");
  });

  it("parses proto Timestamp expiration ({seconds, nanos}) into RFC3339", async () => {
    // 2026-07-09T12:00:00Z = Date.UTC(2026, 6, 9, 12, 0, 0) = 1783598400 seconds
    const seconds = Math.floor(Date.UTC(2026, 6, 9, 12, 0, 0) / 1000);
    expect(seconds).toBe(1783598400);
    const fetchImpl = mkFetch({
      Result: {
        Success: {
          rate: { unscaled: 92, exponent: -2 },
          expiration: { seconds, nanos: 0 },
          quoteId: { quoteId: 1, providerId: 1 },
          payOutAmount: { unscaled: 920, exponent: 0 },
          settlementAmount: { unscaled: 1000, exponent: 0 },
        },
      },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("success" in r && r.success.expiresAt).toBe(Date.UTC(2026, 6, 9, 12, 0, 0));
  });

  it("parses proto Timestamp with seconds as string (some Connect-RPC encoders)", async () => {
    // Connect-RPC sometimes encodes JSON numbers as strings when the proto
    // field is `int64` and the value exceeds the safe integer range. Accept
    // both representations.
    const secondsStr = String(Math.floor(Date.UTC(2026, 6, 9, 12, 0, 0) / 1000));
    const fetchImpl = mkFetch({
      Result: {
        Success: {
          rate: { unscaled: 92, exponent: -2 },
          expiration: { seconds: secondsStr, nanos: 0 },
          quoteId: { quoteId: 1, providerId: 1 },
          payOutAmount: { unscaled: 920, exponent: 0 },
          settlementAmount: { unscaled: 1000, exponent: 0 },
        },
      },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("success" in r && r.success.expiresAt).toBe(Date.UTC(2026, 6, 9, 12, 0, 0));
  });

  it("parses Result.Failure wire format with integer reason code", async () => {
    // Live agtpay server returned reason=10 for a "no quote" condition.
    const fetchImpl = mkFetch({
      Result: { Failure: { reason: 10 } },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "NO_QUOTE" } });
  });

  it("parses Result.Failure with reason=1 as NO_QUOTE (documented integer enum)", async () => {
    const fetchImpl = mkFetch({
      Result: { Failure: { reason: 1 } },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "NO_QUOTE" } });
  });

  it("parses Result.Failure with unknown integer reason as UPSTREAM", async () => {
    const fetchImpl = mkFetch({
      Result: { Failure: { reason: 99 } },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("UPSTREAM");
    if ("failure" in r) {
      expect(r.failure.message).toContain("99");
    }
  });

  it("parses Result.Failure with documented string reason REASON_QUOTE_NOT_FOUND", async () => {
    const fetchImpl = mkFetch({
      Result: { Failure: { reason: "REASON_QUOTE_NOT_FOUND" } },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "NO_QUOTE" } });
  });

  it("returns UPSTREAM when success payload has no quoteId (nullish branch)", async () => {
    // `success.quoteId ?? success.quote_id` both undefined → quoteIdRaw is
    // undefined → if (quoteIdRaw) fails → UPSTREAM
    const fetchImpl = mkFetch({
      Result: {
        Success: {
          rate: { unscaled: 92, exponent: -2 },
          expiration: FUTURE,
          payOutAmount: { unscaled: 920, exponent: 0 },
          settlementAmount: { unscaled: 1000, exponent: 0 },
          // no quoteId, no quote_id
        },
      },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("UPSTREAM");
  });

  it("falls back to epoch when expiration object has invalid (non-numeric) seconds", async () => {
    // parseExpiration tries Number(t.seconds) when seconds is a string —
    // if NaN, it falls through to the epoch fallback.
    const fetchImpl = mkFetch({
      Result: {
        Success: {
          rate: { unscaled: 92, exponent: -2 },
          expiration: { seconds: "not-a-number", nanos: 0 },
          quoteId: { quoteId: 1, providerId: 1 },
          payOutAmount: { unscaled: 920, exponent: 0 },
          settlementAmount: { unscaled: 1000, exponent: 0 },
        },
      },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("success" in r && r.success.expiresAt).toBe(0);
  });

  it("returns UPSTREAM when quoteId has neither camelCase nor snake_case fields", async () => {
    const fetchImpl = mkFetch({
      Result: {
        Success: {
          rate: { unscaled: 92, exponent: -2 },
          expiration: FUTURE,
          quoteId: { wrong: "shape" },
          payOutAmount: { unscaled: 920, exponent: 0 },
          settlementAmount: { unscaled: 1000, exponent: 0 },
        },
      },
    });
    const client = buildClient({ fetchImpl });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("UPSTREAM");
    if ("failure" in r) {
      expect(r.failure.message).toContain("invalid quoteId");
    }
  });
});

// ── MockOfiT0Client ──────────────────────────────────────────

describe("MockOfiT0Client.getQuote", () => {
  it("returns BAD_REQUEST when usdAmount <= 0", async () => {
    const client = new MockOfiT0Client({ pickBestQuote: () => null });
    const r = await client.getQuote(
      { usdAmount: 0, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect("failure" in r && r.failure.reason).toBe("BAD_REQUEST");
  });

  it("returns NO_QUOTE when pickBestQuote returns null", async () => {
    const client = new MockOfiT0Client({ pickBestQuote: () => null });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ failure: { reason: "NO_QUOTE" } });
  });

  it("returns success envelope using pickBestQuote's choice", async () => {
    const client = new MockOfiT0Client({
      pickBestQuote: (_usd, _cur, now) => ({
        rate: 0.9,
        expiresAt: now + 60_000,
        createdAt: now,
        quoteId: "qt_42",
      }),
    });
    const r = await client.getQuote(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({
      success: {
        quoteId: "qt_42",
        currency: "EUR",
        band: 1000,
        rate: 0.9,
        expiresAt: NOW + 60_000,
        payOutAmount: 900,
        settlementAmount: 1000,
        createdAt: NOW,
      },
    });
  });

  it("passes usdAmount and currency to pickBestQuote", async () => {
    const pickBestQuote = vi.fn().mockReturnValue(null);
    const client = new MockOfiT0Client({ pickBestQuote });
    await client.getQuote(
      { usdAmount: 500, currency: "GBP", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(pickBestQuote).toHaveBeenCalledWith(500, "GBP", NOW);
  });
});