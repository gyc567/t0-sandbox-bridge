import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { OFIService } from "./ofi";
import { MockOfiT0Client, type OfiT0Client } from "./ofi-client";
import { SettlementRegistry } from "./settlement";

let clock = 1_700_000_000_000;
const now = () => clock;

let provider: PayoutProviderService;
let mockOfiClient: OfiT0Client;
let network: SandboxNetwork;
let ofi: OFIService;

beforeEach(() => {
  clock = 1_700_000_000_000;
  provider = new PayoutProviderService(new MockT0Client(), now);
  // Build a "real best-pick" implementation by closing over provider.snapshot().
  mockOfiClient = new MockOfiT0Client({
    pickBestQuote: (usdAmount, currency, now) => {
      const candidates = provider
        .snapshot()
        .quotes.filter(
          (q) => q.currency === currency && q.expiresAt > now && q.band >= usdAmount,
        );
      if (candidates.length === 0) return null;
      const best = candidates.reduce((a, b) => (a.rate <= b.rate ? a : b));
      return {
        rate: best.rate,
        expiresAt: best.expiresAt,
        createdAt: best.createdAt,
        quoteId: best.id,
      };
    },
  });
  network = new SandboxNetwork(provider, mockOfiClient, "PAYMENT_METHOD_TYPE_SEPA", now);
  ofi = new OFIService(network, now);
});

describe("SandboxNetwork.getQuote (delegates to OfiT0Client)", () => {
  it("returns failure INVALID_AMOUNT on non-positive usd (local validation, no client call)", async () => {
    const spy = vi.spyOn(mockOfiClient, "getQuote");
    const r = await ofi.getQuote({ usdAmount: 0, currency: "EUR" });
    expect(r).toEqual({ failure: { reason: "REASON_INVALID_AMOUNT" } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns failure CURRENCY_NOT_SUPPORTED for unknown currency (local validation)", async () => {
    const spy = vi.spyOn(mockOfiClient, "getQuote");
    // ZWL is not in the supported list — it must be rejected.
    const r = await ofi.getQuote({ usdAmount: 1000, currency: "ZWL" as never });
    expect(r).toEqual({ failure: { reason: "REASON_CURRENCY_NOT_SUPPORTED" } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns failure NO_QUOTE_AVAILABLE when no provider quotes exist", async () => {
    const r = await ofi.getQuote({ usdAmount: 1000, currency: "EUR" });
    expect(r).toEqual({ failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } });
  });

  it("returns failure NO_QUOTE_AVAILABLE when no quote covers the amount", async () => {
    await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await ofi.getQuote({ usdAmount: 5_000, currency: "EUR" });
    expect(r).toEqual({ failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } });
  });

  it("ignores expired quotes", async () => {
    await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9, ttlMs: 10 });
    clock += 11;
    const r = await ofi.getQuote({ usdAmount: 1_000, currency: "EUR" });
    expect(r).toEqual({ failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } });
  });

  it("picks the best (lowest local-amount) live quote via the mock client", async () => {
    await provider.publishQuote({ currency: "EUR", band: 5_000, rate: 0.95 });
    await provider.publishQuote({ currency: "EUR", band: 5_000, rate: 0.9 });
    await provider.publishQuote({ currency: "EUR", band: 5_000, rate: 0.92 });
    const r = await ofi.getQuote({ usdAmount: 1_000, currency: "EUR" });
    expect("success" in r).toBe(true);
    if ("success" in r) {
      expect(r.success.quote.rate).toBe(0.9);
      expect(r.success.payoutAmount).toBeCloseTo(900);
      expect(r.success.settlementAmount).toBe(1_000);
    }
  });

  it("forwards paymentMethod from the network to the client", async () => {
    const spy = vi.spyOn(mockOfiClient, "getQuote");
    await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    await ofi.getQuote({ usdAmount: 1_000, currency: "EUR" });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "PAYMENT_METHOD_TYPE_SEPA" }),
      expect.any(Function),
    );
  });
});

describe("SandboxNetwork.getQuoteById", () => {
  it("returns failure INVALID_QUOTE_ID for unknown id", () => {
    const r = ofi.getQuoteById("nope");
    expect(r).toEqual({ failure: { reason: "REASON_INVALID_QUOTE_ID" } });
  });

  it("returns failure QUOTE_EXPIRED for stale quote", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9, ttlMs: 10 });
    clock += 11;
    const r = ofi.getQuoteById(q.id);
    expect(r).toEqual({ failure: { reason: "REASON_QUOTE_EXPIRED" } });
  });

  it("returns success for a live quote", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = ofi.getQuoteById(q.id);
    expect(r).toMatchObject({ success: { quote: { id: q.id }, payoutAmount: 900, settlementAmount: 1_000 } });
  });
});

describe("SandboxNetwork.createPayment (idempotent on paymentClientId)", () => {
  it("skip rekey when ids already match (defensive branch)", async () => {
    // Set paymentClientId to match the provider-generated prefix pattern.
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await ofi.createPayment({ paymentClientId: "baxs_rekey_skip", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 });
    expect("success" in r).toBe(true);
    if ("success" in r) {
      // r.success.payment.id was overwritten by the rekeyPayment call path,
      // but the provider-side equality check returns same id -> no extra map churn.
      expect(r.success.payment.id).toBe("baxs_rekey_skip");
    }
  });

  it("creates a payment against a live quote and routes the payout to the provider", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await ofi.createPayment({ paymentClientId: "baxs_001", quoteId: q.id, beneficiaryRef: "BEN-1", usdAmount: 1_000 });
    expect("success" in r).toBe(true);
    if ("success" in r) {
      expect(r.success.created).toBe(true);
      expect(r.success.payment.id).toBe("baxs_001");
      // Per the protocol the Network drives PayoutRequest synchronously in
      // sandbox mode, so by the time CreatePayment returns the payout has
      // already succeeded and the payment is "confirmed".
      expect(r.success.payment.status).toBe("confirmed");
      expect(r.success.payout.status).toBe("success");
    }
  });

  it("returns the same payment on duplicate paymentClientId (idempotency rule 1)", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r1 = await ofi.createPayment({ paymentClientId: "baxs_001", quoteId: q.id, beneficiaryRef: "BEN-1", usdAmount: 1_000 });
    const r2 = await ofi.createPayment({ paymentClientId: "baxs_001", quoteId: q.id, beneficiaryRef: "BEN-DIFF", usdAmount: 1_000 });
    expect("success" in r1 && "success" in r2).toBe(true);
    if ("success" in r1 && "success" in r2) {
      expect(r1.success.created).toBe(true);
      expect(r2.success.created).toBe(false);
      expect(r2.success.payment.id).toBe(r1.success.payment.id);
    }
  });

  it("returns failure INVALID_QUOTE_ID for unknown quote", async () => {
    const r = await ofi.createPayment({ paymentClientId: "baxs_002", quoteId: "nope", beneficiaryRef: "X", usdAmount: 1_000 });
    expect(r).toEqual({ failure: { reason: "REASON_INVALID_QUOTE_ID" } });
  });

  it("returns failure QUOTE_EXPIRED for stale quote", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9, ttlMs: 10 });
    clock += 11;
    const r = await ofi.createPayment({ paymentClientId: "baxs_003", quoteId: q.id, beneficiaryRef: "X", usdAmount: 1_000 });
    expect(r).toEqual({ failure: { reason: "REASON_QUOTE_EXPIRED" } });
  });
});

describe("OFIService.snapshot", () => {
  it("returns empty payments and the full supported-currency list initially", () => {
    const s = ofi.snapshot();
    expect(s.payments).toEqual([]);
    // The dropdown must show all supported currencies even before any quote
    // is published — see currencies.test.ts for the canonical list.
    expect(s.availableCurrencies.length).toBeGreaterThan(20);
    expect(s.availableCurrencies).toContain("USD");
    expect(s.availableCurrencies).toContain("EUR");
    expect(s.availableCurrencies).toContain("JPY");
  });

  it("availableCurrencies does not depend on whether quotes are published", async () => {
    // Before any quote — list is full.
    const before = ofi.snapshot().availableCurrencies;
    expect(before.length).toBeGreaterThan(20);

    // After a quote — list is still the same (order independent of quotes).
    await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    await provider.publishQuote({ currency: "GBP", band: 1_000, rate: 0.8 });
    const after = ofi.snapshot().availableCurrencies;
    expect(after).toEqual(before);
  });

  it("returns payments in the snapshot", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    await ofi.createPayment({ paymentClientId: "baxs_snap_1", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 });
    expect(ofi.snapshot().payments.length).toBe(1);
  });
});

describe("Manual AML (OFI side)", () => {
  it("approve moves payment to accepted", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await ofi.createPayment({ paymentClientId: "baxs_aml_1", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 });
    expect("success" in r).toBe(true);
    if (!("success" in r)) return;
    const p = ofi.completeManualAml(r.success.payment.id, true);
    expect(p.status).toBe("accepted");
  });

  it("reject moves payment to rejected", async () => {
    const q = await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await ofi.createPayment({ paymentClientId: "baxs_aml_2", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 });
    expect("success" in r).toBe(true);
    if (!("success" in r)) return;
    const p = ofi.completeManualAml(r.success.payment.id, false);
    expect(p.status).toBe("rejected");
  });
});

// ── Pre-Settlement (audit §4–§7) — OFI-facing helpers ─────────────────

describe("OFIService Pre-Settlement (audit §4–§7)", () => {
  function buildOFIWithRegistry() {
    const registry = new SettlementRegistry({ confirmDelayMs: 0 });
    const p = new PayoutProviderService(new MockT0Client(), now, registry);
    const n = new SandboxNetwork(
      p,
      new MockOfiT0Client({ pickBestQuote: () => null }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
      registry,
    );
    return {
      registry,
      network: n,
      provider: p,
      ofi: new OFIService(n, now),
    };
  }

  it("submitUsdtSettlement delegates to the registry", () => {
    const { ofi } = buildOFIWithRegistry();
    const s = ofi.submitUsdtSettlement({
      blockchain: "TRON",
      fromAddress: "TXw1OFI",
      toAddress: "TXw2Provider",
      usdAmount: 2500,
    });
    expect(s.status).toBe("PENDING");
    expect(s.usdAmount).toBe(2500);
    expect(s.blockchain).toBe("TRON");
  });

  it("submitUsdtSettlement honours caller-supplied txHash", () => {
    const { ofi } = buildOFIWithRegistry();
    const s = ofi.submitUsdtSettlement({
      txHash: "0xfixed",
      blockchain: "BSC",
      fromAddress: "a",
      toAddress: "b",
      usdAmount: 100,
    });
    expect(s.txHash).toBe("0xfixed");
    expect(s.blockchain).toBe("BSC");
  });

  it("getSettlementState returns OFI's snapshot view", () => {
    const { ofi } = buildOFIWithRegistry();
    ofi.submitUsdtSettlement({
      blockchain: "ETHEREUM",
      fromAddress: "a",
      toAddress: "b",
      usdAmount: 750,
    });
    const state = ofi.getSettlementState();
    expect(state.pending).toHaveLength(1);
    expect(state.ofiCredit).toEqual({ available: 0, reserved: 0 });
    expect(state.providerCredit).toEqual({ available: 0, reserved: 0 });
  });
});
