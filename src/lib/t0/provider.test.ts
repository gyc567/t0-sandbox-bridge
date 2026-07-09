import { describe, it, expect, beforeEach } from "vitest";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { MockOfiT0Client } from "./ofi-client";

let clock = 1_700_000_000_000;
const now = () => clock;

let client: MockT0Client;
let svc: PayoutProviderService;
let network: SandboxNetwork;

beforeEach(() => {
  clock = 1_700_000_000_000;
  client = new MockT0Client();
  svc = new PayoutProviderService(client, now);
  network = new SandboxNetwork(svc, new MockOfiT0Client({ pickBestQuote: () => null }));
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
    await expect(svc.publishQuote({ currency: "USD", band: 1000, rate: 0 })).rejects.toThrow(
      /rate/,
    );
  });

  it("logs USDT settlement and credit usage; rejects bad usd", () => {
    svc.notifyUsdtSettlement("0xabc", 1000);
    svc.notifyCreditUsage("bank-a", 500);
    const evs = svc.snapshot().events.map((e) => e.type);
    expect(evs).toEqual(["USDTTransactionNotification", "CreditUsageNotification"]);
    expect(() => svc.notifyUsdtSettlement("0x", 0)).toThrow(/usd/);
  });

  it("completes the full payout lifecycle and confirms the payment", async () => {
    // Set up an accepted payment via the Network orchestrator.
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    const r = await network.createPayment(
      {
        paymentClientId: `setup_${clock}`,
        quoteId: q.id,
        beneficiaryRef: "ACC",
        usdAmount: 1000,
      },
      clock,
    );
    if (!("success" in r)) throw new Error("setup failed");
    // createPayment already drove the synchronous PayoutRequest, so the
    // payment is already "confirmed" — the payout has succeeded.
    expect(svc.snapshot().payments[0].status).toBe("confirmed");
    const types = svc.snapshot().events.map((e) => e.type);
    expect(types).toContain("PayoutAccepted");
    expect(types).toContain("PayoutSuccess");
    expect(types).toContain("PaymentConfirmed");
  });

  it("supports simulated payout failure without confirming the payment", async () => {
    // Seed an accepted payment directly via recordPayment so we can drive
    // executePayout with { fail: true } without the synchronous routing.
    svc.recordPayment({
      id: `pm_${clock}`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });
    const po = await svc.executePayout(`pm_${clock}`, { fail: true });
    expect(po.status).toBe("failed");
    expect(po.reason).toMatch(/simulated/);
    expect(svc.snapshot().payments[0].status).toBe("accepted");
  });

  it("rejects payout on unknown payments", async () => {
    await expect(svc.executePayout("nope")).rejects.toThrow(/unknown payment/);
  });

  it("executePayout is idempotent - returns same payout on repeat call", async () => {
    svc.recordPayment({
      id: `pm_${clock}_idemp`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });

    const po1 = await svc.executePayout(`pm_${clock}_idemp`);
    const po2 = await svc.executePayout(`pm_${clock}_idemp`);
    const po3 = await svc.executePayout(`pm_${clock}_idemp`);

    expect(po1.id).toBe(po2.id);
    expect(po2.id).toBe(po3.id);
    expect(svc.snapshot().payouts).toHaveLength(1);
  });

  it("executePayout idempotency works with fail option", async () => {
    svc.recordPayment({
      id: `pm_${clock}_fail`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });

    const po1 = await svc.executePayout(`pm_${clock}_fail`, { fail: true });
    expect(po1.status).toBe("failed");

    // Subsequent calls should return the same failed payout
    const po2 = await svc.executePayout(`pm_${clock}_fail`);
    expect(po2.id).toBe(po1.id);
    expect(po2.status).toBe("failed");
    expect(svc.snapshot().payouts).toHaveLength(1);
  });

  it("executePayout throws when payment is in a non-accepted state", async () => {
    // Seed a pending payment via recordPayment (orchestrator would normally
    // do this, but for the throw-test we go direct to Provider state).
    svc.recordPayment({
      id: `pm_${clock}_pending`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "Y",
      status: "pending",
      createdAt: clock,
    });
    await expect(svc.executePayout(`pm_${clock}_pending`)).rejects.toThrow(
      /not in accepted/,
    );
  });

  it("rekeyPayment no-ops when the new id already exists (defensive branch)", () => {
    svc.recordPayment({
      id: `pm_a`,
      quoteId: `qt_a`,
      currency: "USD",
      usdAmount: 1,
      localAmount: 1,
      beneficiaryRef: "A",
      status: "accepted",
      createdAt: clock,
    });
    svc.recordPayment({
      id: `pm_b`,
      quoteId: `qt_b`,
      currency: "USD",
      usdAmount: 1,
      localAmount: 1,
      beneficiaryRef: "B",
      status: "accepted",
      createdAt: clock,
    });
    // Attempt to rekey pm_a → pm_b (already exists). Defensive: keep pm_a.
    svc.rekeyPayment("pm_a", "pm_b");
    expect(svc.snapshot().payments.find((p) => p.id === "pm_a")).toBeDefined();
    expect(svc.snapshot().payments.find((p) => p.id === "pm_b")).toBeDefined();
  });

  it("recordPayment is idempotent on id", () => {
    const first = svc.recordPayment({
      id: `pm_dup`,
      quoteId: `qt_dup`,
      currency: "USD",
      usdAmount: 1,
      localAmount: 1,
      beneficiaryRef: "A",
      status: "accepted",
      createdAt: clock,
    });
    const second = svc.recordPayment({
      id: `pm_dup`,
      quoteId: `qt_dup`,
      currency: "USD",
      usdAmount: 999,
      localAmount: 999,
      beneficiaryRef: "B",
      status: "accepted",
      createdAt: clock,
    });
    // Second call returns the existing payment unchanged.
    expect(second.usdAmount).toBe(first.usdAmount);
    expect(second.beneficiaryRef).toBe(first.beneficiaryRef);
    expect(svc.snapshot().payments.filter((p) => p.id === "pm_dup")).toHaveLength(1);
  });

  it("rekeyQuote no-ops when the new id already exists (defensive branch)", async () => {
    const qa = await svc.publishQuote({ currency: "USD", band: 1_000, rate: 1 });
    const qb = await svc.publishQuote({ currency: "USD", band: 2_000, rate: 1.1 });
    // qb exists; attempt to rekey qa → qb → defensive branch returns.
    svc.rekeyQuote(qa.id, qb.id);
    // Both quotes still present.
    expect(svc.snapshot().quotes.map((q) => q.id)).toContain(qa.id);
    expect(svc.snapshot().quotes.map((q) => q.id)).toContain(qb.id);
  });

  it("rekeyPayment rekeys dependent payouts along with the payment", async () => {
    svc.recordPayment({
      id: `pm_seed`,
      quoteId: `qt_seed`,
      currency: "USD",
      usdAmount: 1_000,
      localAmount: 1_000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });
    // Create a payout so the rekey loop has work to do.
    await svc.executePayout(`pm_seed`);
    // Rekey the payment.
    svc.rekeyPayment(`pm_seed`, `pm_rekeyed`);
    // The payout's paymentId field should now reference the new id.
    const payout = svc.snapshot().payouts[0]!;
    expect(payout.paymentId).toBe(`pm_rekeyed`);
  });

  it("rekeyPayment throws on unknown oldId", () => {
    expect(() => svc.rekeyPayment("ghost", "new")).toThrow(/unknown payment/);
  });

  it("rekeyQuote throws on unknown oldId", () => {
    expect(() => svc.rekeyQuote("ghost", "new")).toThrow(/unknown quote/);
  });
});

// ── Role boundary guard (moved methods no longer exist on Provider) ──

describe("PayoutProviderService (role boundary)", () => {
  it("does not expose OFI / Network orchestrator methods", () => {
    const proto = Object.getPrototypeOf(svc);
    expect(proto.acceptPayment).toBeUndefined();
    expect(proto.completeManualAml).toBeUndefined();
    expect(proto.approvePaymentQuote).toBeUndefined();
    expect(proto.createPaymentIntent).toBeUndefined();
    expect(proto.confirmFunds).toBeUndefined();
    expect(proto.processPayout).toBeUndefined();
    expect(proto.requestPayout).toBeUndefined();
  });
});
