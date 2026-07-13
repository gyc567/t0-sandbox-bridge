// ofi-client.fallback.test.ts — MockOfiT0Client fallback behavior (plan §4.1,
// §8 #1-#3). Verifies that when Provider has no quote, Mock invokes the
// optional fallback provider, that precision is preserved, and that the
// fallback quote id is deterministic-but-fresh.

import { describe, it, expect, vi } from "vitest";
import { MockOfiT0Client } from "./ofi-client";
import type { OfiQuoteRequest } from "./ofi-client";

const NOW = 1_700_000_000_000;
const NOW_LATER = NOW + 30_000;
const REQ: OfiQuoteRequest = {
  usdAmount: 1000,
  currency: "EUR",
  paymentMethod: "PAYMENT_METHOD_TYPE_SEPA",
};

describe("MockOfiT0Client fallback", () => {
  it("does not invoke fallback when Provider has a matching quote", async () => {
    const fallbackQuoteProvider = vi.fn().mockResolvedValue(null);
    const client = new MockOfiT0Client({
      pickBestQuote: (_u, _c, now) => ({
        rate: 0.91,
        expiresAt: now + 60_000,
        createdAt: now,
        quoteId: "qt_provider_1",
      }),
      fallbackQuoteProvider,
    });
    const r = await client.getQuote(REQ, () => NOW);
    expect("success" in r).toBe(true);
    if ("success" in r) {
      expect(r.success.rate).toBe(0.91);
      expect(r.success.quoteId).toBe("qt_provider_1");
    }
    expect(fallbackQuoteProvider).not.toHaveBeenCalled();
  });

  it("invokes fallback when Provider returns null", async () => {
    const fallbackQuoteProvider = vi.fn().mockResolvedValue({
      rate: 0.9203,
      expiresAt: NOW + 300_000,
    });
    const client = new MockOfiT0Client({
      pickBestQuote: () => null,
      fallbackQuoteProvider,
    });
    const r = await client.getQuote(REQ, () => NOW);
    expect("success" in r).toBe(true);
    if ("success" in r) {
      expect(r.success.rate).toBe(0.9203);
      expect(r.success.currency).toBe("EUR");
      expect(r.success.band).toBe(1000);
      expect(r.success.expiresAt).toBe(NOW + 300_000);
      expect(r.success.payOutAmount).toBe(920.3);
      expect(r.success.settlementAmount).toBe(1000);
      expect(r.success.createdAt).toBe(NOW);
      expect(r.success.quoteId).toMatch(/^fb_quote-1000-EUR-/);
    }
    expect(fallbackQuoteProvider).toHaveBeenCalledTimes(1);
    expect(fallbackQuoteProvider).toHaveBeenCalledWith(REQ, expect.any(Function));
  });

  it("preserves fallback rate precision (no rounding)", async () => {
    const client = new MockOfiT0Client({
      pickBestQuote: () => null,
      fallbackQuoteProvider: vi.fn().mockResolvedValue({
        rate: 0.876543219,
        expiresAt: NOW + 300_000,
      }),
    });
    const r = await client.getQuote(REQ, () => NOW);
    if ("success" in r) {
      expect(r.success.rate).toBe(0.876543219);
      expect(r.success.payOutAmount).toBeCloseTo(876.543219, 6);
    }
  });

  it("returns NO_QUOTE when Provider returns null AND fallback returns null", async () => {
    const fallbackQuoteProvider = vi.fn().mockResolvedValue(null);
    const client = new MockOfiT0Client({
      pickBestQuote: () => null,
      fallbackQuoteProvider,
    });
    const r = await client.getQuote(REQ, () => NOW);
    expect(r).toEqual({ failure: { reason: "NO_QUOTE" } });
  });

  it("returns NO_QUOTE when Provider returns null AND no fallback is configured", async () => {
    const client = new MockOfiT0Client({ pickBestQuote: () => null });
    const r = await client.getQuote(REQ, () => NOW);
    expect(r).toEqual({ failure: { reason: "NO_QUOTE" } });
  });

  it("emits a deterministic, time-bound quoteId", async () => {
    const client = new MockOfiT0Client({
      pickBestQuote: () => null,
      fallbackQuoteProvider: vi.fn().mockResolvedValue({
        rate: 0.92,
        expiresAt: NOW + 300_000,
      }),
    });
    const r1 = await client.getQuote(REQ, () => NOW);
    const r2 = await client.getQuote(REQ, () => NOW);
    // Same request + same now() ⇒ same quoteId (cache-friendly via getQuoteById).
    if ("success" in r1 && "success" in r2) {
      expect(r1.success.quoteId).toBe(r2.success.quoteId);
    }
    const r3 = await client.getQuote(REQ, () => NOW_LATER);
    if ("success" in r1 && "success" in r3) {
      // Different now() ⇒ different quoteId.
      expect(r3.success.quoteId).not.toBe(r1.success.quoteId);
    }
  });

  it("emits unique quoteId per currency", async () => {
    const client = new MockOfiT0Client({
      pickBestQuote: () => null,
      fallbackQuoteProvider: vi.fn().mockResolvedValue({
        rate: 1,
        expiresAt: NOW + 300_000,
      }),
    });
    const eur = await client.getQuote(REQ, () => NOW);
    const gbp = await client.getQuote(
      { ...REQ, currency: "GBP" },
      () => NOW,
    );
    if ("success" in eur && "success" in gbp) {
      expect(eur.success.quoteId).not.toBe(gbp.success.quoteId);
      expect(eur.success.quoteId).toContain("EUR");
      expect(gbp.success.quoteId).toContain("GBP");
    }
  });

  it("passes through upstream failure when fallback throws (does not crash)", async () => {
    // Plan §7: external source failure must surface as a clear error, not a
    // forged quote. MockOfiT0Client should not swallow errors silently.
    const client = new MockOfiT0Client({
      pickBestQuote: () => null,
      fallbackQuoteProvider: vi.fn().mockRejectedValue(new Error("upstream exploded")),
    });
    await expect(client.getQuote(REQ, () => NOW)).rejects.toThrow(/upstream exploded/);
  });

  it("uses fallback expiresAt (not the requested amount) as the validity window", async () => {
    const fallbackExpiresAt = NOW + 17_000;
    const client = new MockOfiT0Client({
      pickBestQuote: () => null,
      fallbackQuoteProvider: vi.fn().mockResolvedValue({
        rate: 0.9,
        expiresAt: fallbackExpiresAt,
      }),
    });
    const r = await client.getQuote(REQ, () => NOW);
    if ("success" in r) {
      expect(r.success.expiresAt).toBe(fallbackExpiresAt);
    }
  });
});