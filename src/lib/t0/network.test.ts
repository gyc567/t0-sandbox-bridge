// SandboxNetwork orchestration coverage.
//
// After the role-boundary refactor the Network owns:
//   - createPayment (validation + "accept" body; routes PayoutRequest to Provider)
//   - completeManualAml
//   - approvePaymentQuote (Last Look)
//   - createPaymentIntent + confirmFunds (Phase 8)
//   - requestPayout (UI-driven PayoutRequest to Provider)
//   - handleNetworkPayout / handleNetworkAccepted / handleManualAmlCheck
//     (inbound RPC ingress helpers used by provider-impl)
//
// Each section corresponds to one of those responsibilities. The moved
// tests from the old provider.test.ts live here.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { OFIService } from "./ofi";
import { MockOfiT0Client } from "./ofi-client";

let clock = 1_700_000_000_000;
const now = () => clock;

let client: MockT0Client;
let svc: PayoutProviderService;
let network: SandboxNetwork;
let ofi: OFIService;

beforeEach(() => {
  clock = 1_700_000_000_000;
  client = new MockT0Client();
  svc = new PayoutProviderService(client, now);
  // MockOfiT0Client with a "no quotes available" injector — the network-level
  // getQuote tests live elsewhere (ofi.test.ts) and use a richer provider mock.
  network = new SandboxNetwork(
    svc,
    new MockOfiT0Client({ pickBestQuote: () => null }),
    "PAYMENT_METHOD_TYPE_SEPA",
    now,
  );
  ofi = new OFIService(network, now);
});

// ── createPayment ──────────────────────────────────────────────────

describe("SandboxNetwork.createPayment (Network owns accept + routes PayoutRequest)", () => {
  it("assigns accepted state and synchronously routes the payout to the Provider", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const spy = vi.spyOn(svc, "executePayout");
    const r = await network.createPayment(
      {
        paymentClientId: "baxs_accept_routed",
        quoteId: q.id,
        beneficiaryRef: "BEN",
        usdAmount: 1_000,
      },
      clock,
    );
    expect("success" in r).toBe(true);
    if ("success" in r) {
      expect(r.success.created).toBe(true);
      expect(r.success.payment.id).toBe("baxs_accept_routed");
      // Synchronous routing means the payment is already "confirmed" by
      // the time createPayment returns.
      expect(r.success.payment.status).toBe("confirmed");
      expect(r.success.payout.status).toBe("success");
    }
    expect(spy).toHaveBeenCalledWith("baxs_accept_routed", { fail: undefined });
  });

  it("rejects unknown quote", async () => {
    const r = await network.createPayment(
      {
        paymentClientId: "baxs_bad_quote",
        quoteId: "nope",
        beneficiaryRef: "X",
        usdAmount: 1_000,
      },
      clock,
    );
    expect(r).toEqual({ failure: { reason: "REASON_INVALID_QUOTE_ID" } });
  });

  it("rejects expired quote", async () => {
    const q = await svc.publishQuote({ currency: "USD", band: 1_000, rate: 1, ttlMs: 10 });
    clock += 11;
    const r = await network.createPayment(
      {
        paymentClientId: "baxs_expired",
        quoteId: q.id,
        beneficiaryRef: "X",
        usdAmount: 1_000,
      },
      clock,
    );
    expect(r).toEqual({ failure: { reason: "REASON_QUOTE_EXPIRED" } });
  });

  it("is idempotent on paymentClientId (Rule 1)", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r1 = await network.createPayment(
      {
        paymentClientId: "baxs_idem",
        quoteId: q.id,
        beneficiaryRef: "A",
        usdAmount: 1_000,
      },
      clock,
    );
    const r2 = await network.createPayment(
      {
        paymentClientId: "baxs_idem",
        quoteId: q.id,
        beneficiaryRef: "B",
        usdAmount: 1_000,
      },
      clock,
    );
    if (!("success" in r1) || !("success" in r2)) throw new Error("setup");
    expect(r1.success.created).toBe(true);
    expect(r2.success.created).toBe(false);
    expect(r2.success.payment.id).toBe(r1.success.payment.id);
    expect(svc.snapshot().payouts).toHaveLength(1);
  });

  it("routes only one payout on repeated createPayment (no duplicate execution)", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const spy = vi.spyOn(svc, "executePayout");
    await network.createPayment(
      { paymentClientId: "baxs_one", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    await network.createPayment(
      { paymentClientId: "baxs_one", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    // Idempotent re-call returns the existing payout; no extra executePayout.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── completeManualAml ──────────────────────────────────────────────

describe("SandboxNetwork.completeManualAml", () => {
  it("approve moves payment to accepted", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    // recordPayment(seed pending → success accepted)
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_app", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    // createPayment already drives payout to success; mark rejected first
    // to verify approve restores it to accepted.
    svc.markPaymentStatus(p.success.payment.id, "rejected");
    const updated = network.completeManualAml(p.success.payment.id, true);
    expect(updated.status).toBe("accepted");
  });

  it("reject moves payment to rejected", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_rej", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    const updated = network.completeManualAml(p.success.payment.id, false);
    expect(updated.status).toBe("rejected");
  });

  it("throws on unknown payment", () => {
    expect(() => network.completeManualAml("ghost_pm", true)).toThrow(/unknown payment/);
  });
});

// ── approvePaymentQuote (Last Look) ─────────────────────────────────

describe("SandboxNetwork.approvePaymentQuote", () => {
  it("bumps the quote TTL and returns the refreshed quote", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9, ttlMs: 1_000 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_lastlook", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");

    // Advance clock so we can verify the TTL bump.
    clock += 100;
    const refreshed = network.approvePaymentQuote(p.success.payment.id, q.id);
    expect(refreshed.id).toBe(q.id);
    expect(refreshed.expiresAt).toBe(clock + 60_000);
  });

  it("throws on unknown payment", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    expect(() => network.approvePaymentQuote("ghost_pm", q.id)).toThrow(/unknown payment/);
  });

  it("throws on unknown quote (delegated to Provider)", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_bq", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    expect(() => network.approvePaymentQuote(p.success.payment.id, "ghost_qt")).toThrow(
      /unknown quote/,
    );
  });
});

// ── createPaymentIntent + confirmFunds (Phase 8) ────────────────────

describe("SandboxNetwork.createPaymentIntent / confirmFunds", () => {
  it("createPaymentIntent creates a pending payment with pi_-prefixed id", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const intent = network.createPaymentIntent({ quoteId: q.id, beneficiaryRef: "INT-1" }, clock);
    expect(intent.id).toMatch(/^pi_/);
    expect(intent.status).toBe("pending");
    expect(intent.localAmount).toBeCloseTo(900);
  });

  it("createPaymentIntent throws on unknown quote", () => {
    expect(() =>
      network.createPaymentIntent({ quoteId: "nope", beneficiaryRef: "X" }, clock),
    ).toThrow(/unknown quote/);
  });

  it("confirmFunds transitions payment from pending to accepted", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const intent = network.createPaymentIntent({ quoteId: q.id, beneficiaryRef: "INT-1" }, clock);
    const updated = network.confirmFunds(intent.id);
    expect(updated.status).toBe("accepted");
  });

  it("confirmFunds throws on unknown payment", () => {
    expect(() => network.confirmFunds("nope")).toThrow(/unknown payment/);
  });
});

// ── requestPayout ──────────────────────────────────────────────────

describe("SandboxNetwork.requestPayout (UI-driven PayoutRequest)", () => {
  it("delegates to provider.executePayout", async () => {
    svc.recordPayment({
      id: `pm_${clock}_req`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });
    const spy = vi.spyOn(svc, "executePayout");
    const result = await network.requestPayout(`pm_${clock}_req`);
    expect(spy).toHaveBeenCalledWith(`pm_${clock}_req`, { fail: undefined });
    expect(result.status).toBe("success");
  });

  it("forwards the fail flag to provider.executePayout", async () => {
    svc.recordPayment({
      id: `pm_${clock}_failreq`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });
    const spy = vi.spyOn(svc, "executePayout");
    const result = await network.requestPayout(`pm_${clock}_failreq`, { fail: true });
    expect(spy).toHaveBeenCalledWith(`pm_${clock}_failreq`, { fail: true });
    expect(result.status).toBe("failed");
  });

  it("is idempotent on paymentId", async () => {
    svc.recordPayment({
      id: `pm_${clock}_idemreq`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });
    const r1 = await network.requestPayout(`pm_${clock}_idemreq`);
    const r2 = await network.requestPayout(`pm_${clock}_idemreq`);
    expect(r1.id).toBe(r2.id);
  });
});

// ── Inbound RPC ingress helpers ─────────────────────────────────────

describe("SandboxNetwork ingress helpers (provider-impl RPC translations)", () => {
  it("handleNetworkPayout delegates to provider.executePayout", async () => {
    svc.recordPayment({
      id: `pm_${clock}_ingest`,
      quoteId: `qt_${clock}`,
      currency: "USD",
      usdAmount: 1000,
      localAmount: 1000,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });
    const spy = vi.spyOn(svc, "executePayout");
    const payout = await network.handleNetworkPayout(`pm_${clock}_ingest`);
    expect(spy).toHaveBeenCalledWith(`pm_${clock}_ingest`);
    expect(payout.status).toBe("success");
  });

  it("handleNetworkAccepted writes an accepted payment when no quote is published throws", () => {
    // Without any published quote the helper must fail loudly — the real
    // network's UpdatePayment.accepted always carries quote context.
    expect(() => network.handleNetworkAccepted("n_1", "", clock)).toThrow(
      /no quote available/,
    );
  });

  it("handleNetworkAccepted writes accepted payment when a quote exists", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = network.handleNetworkAccepted("n_1", "BEN", clock);
    expect(p.status).toBe("accepted");
    expect(p.beneficiaryRef).toBe("BEN");
    expect(p.currency).toBe(q.currency);
  });

  it("handleNetworkAccepted is idempotent on paymentClientId", async () => {
    await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p1 = network.handleNetworkAccepted("n_idem", "BEN", clock);
    const p2 = network.handleNetworkAccepted("n_idem", "BEN", clock);
    expect(p1.id).toBe(p2.id);
    expect(svc.snapshot().payments.filter((x) => x.id === "n_idem")).toHaveLength(1);
  });

  it("handleManualAmlCheck marks the payment as rejected", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await network.createPayment(
      { paymentClientId: "baxs_aml_ingress", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in r)) throw new Error("setup");
    const p = network.handleManualAmlCheck(r.success.payment.id);
    expect(p.status).toBe("rejected");
  });
});

// ── listPayments + OFI delegation ───────────────────────────────────

describe("SandboxNetwork.listPayments and OFI delegation", () => {
  it("listPayments returns the provider's payments", async () => {
    await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    await network.createPayment(
      { paymentClientId: "baxs_list_1", quoteId: svc.snapshot().quotes[0]!.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    expect(network.listPayments().map((p) => p.id)).toContain("baxs_list_1");
  });

  it("OFI completeManualAml routes through Network (not Provider directly)", async () => {
    const spy = vi.spyOn(network, "completeManualAml");
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await ofi.createPayment(
      { paymentClientId: "baxs_ofi_aml", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
    );
    if (!("success" in p)) throw new Error("setup");
    ofi.completeManualAml(p.success.payment.id, false);
    expect(spy).toHaveBeenCalled();
  });
});
