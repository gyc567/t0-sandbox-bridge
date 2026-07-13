// quote-fallback.test.ts — jsDelivrCurrencyApiFallback unit tests.
// Mirrors the style of ofi-client.test.ts: vi.fn() for fetch, fixed now,
// assertion-only.

import { describe, it, expect, vi } from "vitest";
import { jsDelivrCurrencyApiFallback } from "./index";

const NOW = 1_700_000_000_000;

function mkFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("jsDelivrCurrencyApiFallback", () => {
  it("returns rate + 5-minute expiry on success", async () => {
    const fetchImpl = mkFetch({ date: "2026-07-13", usdt: { eur: 0.92 } });
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ rate: 0.92, expiresAt: NOW + 300_000 });
  });

  it("lowercases currency when looking up the rate", async () => {
    const fetchImpl = mkFetch({ date: "2026-07-13", usdt: { gbp: 0.79 } });
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "GBP", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toEqual({ rate: 0.79, expiresAt: NOW + 300_000 });
  });

  it("preserves rate precision as returned by the upstream", async () => {
    const fetchImpl = mkFetch({ date: "2026-07-13", usdt: { eur: 0.9203456 } });
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r?.rate).toBe(0.9203456);
  });

  it("returns null on non-2xx HTTP status", async () => {
    const fetchImpl = mkFetch("rate limited", 429);
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toBeNull();
  });

  it("returns null when target currency is missing from the response", async () => {
    const fetchImpl = mkFetch({ date: "2026-07-13", usdt: { jpy: 150 } });
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toBeNull();
  });

  it("returns null when the response is malformed JSON", async () => {
    const fetchImpl = mkFetch("not-json");
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toBeNull();
  });

  it("returns null when usdt field is absent", async () => {
    const fetchImpl = mkFetch({ date: "2026-07-13" });
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toBeNull();
  });

  it("returns null when rate is non-finite", async () => {
    const fetchImpl = mkFetch({ date: "2026-07-13", usdt: { eur: "not-a-number" } });
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    const r = await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    expect(r).toBeNull();
  });

  it("sends the right URL (jsDelivr currency-api)", async () => {
    const fetchImpl = mkFetch({ date: "2026-07-13", usdt: { eur: 0.9 } });
    const fn = jsDelivrCurrencyApiFallback({ fetchImpl, timeoutMs: 5000 });
    await fn(
      { usdAmount: 1000, currency: "EUR", paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" },
      () => NOW,
    );
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usdt.json",
    );
  });
});