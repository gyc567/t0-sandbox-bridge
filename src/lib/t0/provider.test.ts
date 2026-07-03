import { describe, it, expect, beforeEach } from "vitest";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";

let clock = 1_700_000_000_000;
const now = () => clock;

let client: MockT0Client;
let svc: PayoutProviderService;

beforeEach(() => {
  clock = 1_700_000_000_000;
  client = new MockT0Client();
  svc = new PayoutProviderService(client, now);
});

describe("PayoutProviderService", () => {
  it("publishes a quote and forwards it to the network", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.92 });
    expect(q.id).toMatch(/^qt_/);
    expect(q.expiresAt).toBe(clock + 60_000);
    expect(client.outbound).toEqual([{ kind: "quote", payload: q }]);
    expect(svc.snapshot().events[0]).toMatchObject({ type: "QuotePublished" });
  });

  it("uses custom ttl and rejects non-positive rate", async () => {
    const q = await svc.publishQuote({ currency: "USD", band: 5000, rate: 1, ttlMs: 5_000 });
    expect(q.expiresAt).toBe(clock + 5_000);
    await expect(svc.publishQuote({ currency: "USD", band: 1000, rate: 0 })).rejects.toThrow(/rate/);
  });

  it("logs USDT settlement and credit usage; rejects bad usd", () => {
    svc.notifyUsdtSettlement("0xabc", 1000);
    svc.notifyCreditUsage("bank-a", 500);
    const evs = svc.snapshot().events.map((e) => e.type);
    expect(evs).toEqual(["USDTTransactionNotification", "CreditUsageNotification"]);
    expect(() => svc.notifyUsdtSettlement("0x", 0)).toThrow(/usd/);
  });

  it("accepts a payment against a live quote", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "ACC-1" });
    expect(p.status).toBe("accepted");
    expect(p.localAmount).toBeCloseTo(900);
    expect(client.outbound.at(-1)).toMatchObject({ kind: "event", payload: { type: "PaymentAccepted" } });
  });

  it("rejects unknown or expired quotes", async () => {
    await expect(svc.acceptPayment({ quoteId: "nope", beneficiaryRef: "x" })).rejects.toThrow(/unknown quote/);
    const q = await svc.publishQuote({ currency: "USD", band: 1000, rate: 1, ttlMs: 10 });
    clock += 1000;
    await expect(svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "x" })).rejects.toThrow(/expired/);
  });

  it("completes the full payout lifecycle and confirms the payment", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "ACC" });
    const po = await svc.processPayout(p.id);
    expect(po.status).toBe("success");
    const types = svc.snapshot().events.map((e) => e.type);
    expect(types).toContain("PayoutAccepted");
    expect(types).toContain("PayoutSuccess");
    expect(types).toContain("PaymentConfirmed");
    expect(svc.snapshot().payments[0].status).toBe("confirmed");
  });

  it("supports simulated payout failure without confirming the payment", async () => {
    const q = await svc.publishQuote({ currency: "USD", band: 1000, rate: 1 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "X" });
    const po = await svc.processPayout(p.id, { fail: true });
    expect(po.status).toBe("failed");
    expect(po.reason).toMatch(/simulated/);
    expect(svc.snapshot().payments[0].status).toBe("accepted");
  });

  it("rejects payout on unknown or non-accepted payments", async () => {
    await expect(svc.processPayout("nope")).rejects.toThrow(/unknown payment/);
    const q = await svc.publishQuote({ currency: "USD", band: 1000, rate: 1 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "X" });
    await svc.processPayout(p.id);
    // Idempotency: repeated payout returns existing payout, not error
    const po2 = await svc.processPayout(p.id);
    expect(po2.id).toBe(svc.snapshot().payouts[0].id);
  });

  it("processPayout is idempotent - returns same payout on repeat call", async () => {
    const q = await svc.publishQuote({ currency: "USD", band: 1000, rate: 1 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "X" });

    const po1 = await svc.processPayout(p.id);
    const po2 = await svc.processPayout(p.id);
    const po3 = await svc.processPayout(p.id);

    expect(po1.id).toBe(po2.id);
    expect(po2.id).toBe(po3.id);
    expect(svc.snapshot().payouts).toHaveLength(1);
  });

  it("processPayout idempotency works with fail option", async () => {
    const q = await svc.publishQuote({ currency: "USD", band: 1000, rate: 1 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "X" });

    const po1 = await svc.processPayout(p.id, { fail: true });
    expect(po1.status).toBe("failed");

    // Subsequent calls should return the same failed payout
    const po2 = await svc.processPayout(p.id);
    expect(po2.id).toBe(po1.id);
    expect(po2.status).toBe("failed");
    expect(svc.snapshot().payouts).toHaveLength(1);
  });
});

// ── Phase 8: manual-aml / last-look / payment-intent ──────────────

describe("PayoutProviderService (Phase 8 methods)", () => {
  beforeEach(() => {
    clock = 1_700_000_000_000;
    client = new MockT0Client();
    svc = new PayoutProviderService(client, now);
  });

  it("completeManualAml approves a payment and logs PaymentConfirmed", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "B" });

    const updated = svc.completeManualAml(p.id, true);
    expect(updated.status).toBe("accepted");
    const types = svc.snapshot().events.map((e) => e.type);
    expect(types).toContain("PaymentConfirmed");
  });

  it("completeManualAml rejects when approved=false", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "B" });

    const updated = svc.completeManualAml(p.id, false);
    expect(updated.status).toBe("rejected");
  });

  it("completeManualAml throws on unknown payment", () => {
    expect(() => svc.completeManualAml("nope", true)).toThrow(/unknown payment/);
  });

  it("approvePaymentQuote bumps quote TTL and returns the quote", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9, ttlMs: 1_000 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "B" });

    const updated = svc.approvePaymentQuote(p.id, q.id);
    expect(updated.id).toBe(q.id);
    expect(updated.expiresAt).toBe(clock + 60_000);
  });

  it("approvePaymentQuote throws on unknown payment or quote", async () => {
    // unknown quote checked first
    expect(() => svc.approvePaymentQuote("nope", "nope")).toThrow(/unknown quote/);
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "B" });
    expect(() => svc.approvePaymentQuote(p.id, "nope")).toThrow(/unknown quote/);
  });

  it("createPaymentIntent creates a pending payment with quote-linked amounts", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const intent = svc.createPaymentIntent({ quoteId: q.id, beneficiaryRef: "INT-1" });
    expect(intent.id).toMatch(/^pi_/);
    expect(intent.status).toBe("pending");
    expect(intent.localAmount).toBeCloseTo(900);
    expect(svc.snapshot().events.at(-1)).toMatchObject({ type: "PaymentAccepted" });
  });

  it("createPaymentIntent throws on unknown quote", () => {
    expect(() => svc.createPaymentIntent({ quoteId: "nope", beneficiaryRef: "X" })).toThrow(
      /unknown quote/,
    );
  });

  it("confirmFunds transitions payment to accepted", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const intent = svc.createPaymentIntent({ quoteId: q.id, beneficiaryRef: "INT-1" });

    const updated = svc.confirmFunds(intent.id);
    expect(updated.status).toBe("accepted");
  });

  it("confirmFunds throws on unknown payment", () => {
    expect(() => svc.confirmFunds("nope")).toThrow(/unknown payment/);
  });
});
