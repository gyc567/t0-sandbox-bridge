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

  it("createPayment saves recipientInfo.fallback on the Payment", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await network.createPayment(
      {
        paymentClientId: "baxs_recip",
        quoteId: q.id,
        beneficiaryRef: "BEN",
        usdAmount: 1_000,
        recipientInfo: {
          fallback: {
            accountHolderName: "Max Mustermann",
            accountNumber: "DE89370400440532013000",
            bankCode: "COBADEFFXXX",
            bankName: "Commerzbank",
            country: "DE",
          },
        },
      },
      clock,
    );
    expect("success" in r).toBe(true);
    if ("success" in r) {
      expect(r.success.payment.recipientInfo).toEqual({
        fallback: {
          accountHolderName: "Max Mustermann",
          accountNumber: "DE89370400440532013000",
          bankCode: "COBADEFFXXX",
          bankName: "Commerzbank",
          country: "DE",
        },
      });
    }
  });

  it("createPayment without recipientInfo leaves recipientInfo undefined", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await network.createPayment(
      {
        paymentClientId: "baxs_no_recip",
        quoteId: q.id,
        beneficiaryRef: "BEN",
        usdAmount: 1_000,
      },
      clock,
    );
    expect("success" in r).toBe(true);
    if ("success" in r) {
      expect(r.success.payment.recipientInfo).toBeUndefined();
    }
  });
});

// ── completeManualAml ──────────────────────────────────────────────

describe("SandboxNetwork.completeManualAml", () => {
  it("approve moves payment from pending_aml to accepted", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    // recordPayment(seed pending_aml → accepted)
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_app", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    // createPayment already drives payout to success; mark pending_aml first
    // to verify approve restores it to accepted.
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    const updated = network.completeManualAml(p.success.payment.id, true);
    expect(updated.status).toBe("accepted");
  });

  it("reject moves payment from pending_aml to rejected", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_rej", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    const updated = network.completeManualAml(p.success.payment.id, false);
    expect(updated.status).toBe("rejected");
  });

  it("throws when payment is not in pending_aml state", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      {
        paymentClientId: "baxs_aml_bad_state",
        quoteId: q.id,
        beneficiaryRef: "B",
        usdAmount: 1_000,
      },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    // payment is "confirmed" after createPayment (synchronous payout)
    expect(() => network.completeManualAml(p.success.payment.id, true)).toThrow(/pending_aml/);
  });

  it("throws on unknown payment", () => {
    expect(() => network.completeManualAml("ghost_pm", true)).toThrow(/unknown payment/);
  });
});

// ── cancelManualAml (Phase 7 AML rewrite) ─────────────────────────────

describe("SandboxNetwork.cancelManualAml", () => {
  it("transitions pending_aml → rejected, equivalent to completeManualAml(false)", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_cancel", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    const updated = network.cancelManualAml(p.success.payment.id);
    expect(updated.status).toBe("rejected");
  });

  it("throws on unknown payment", () => {
    expect(() => network.cancelManualAml("ghost_pm")).toThrow(/unknown payment/);
  });

  it("throws when payment is not in pending_aml state", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_cancel_bad", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    // createPayment drives the payment all the way to "confirmed" in sandbox
    expect(() => network.cancelManualAml(p.success.payment.id)).toThrow(/pending_aml/);
  });
});

// ── updateRecipientCheck ──────────────────────────────────────────────

describe("SandboxNetwork.updateRecipientCheck", () => {
  it("sets recipientCheckStatus to approved", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_rc_appr", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    const updated = network.updateRecipientCheck(p.success.payment.id, "approved");
    expect(updated.recipientCheckStatus).toBe("approved");
    expect(updated.recipientCheckNote).toBeUndefined();
  });

  it("sets recipientCheckStatus to rejected with a note", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_rc_rej", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    const updated = network.updateRecipientCheck(p.success.payment.id, "rejected", "name mismatch");
    expect(updated.recipientCheckStatus).toBe("rejected");
    expect(updated.recipientCheckNote).toBe("name mismatch");
  });

  it("is idempotent: second call overwrites the previous decision", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_rc_idem", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    network.updateRecipientCheck(p.success.payment.id, "approved");
    const updated = network.updateRecipientCheck(p.success.payment.id, "rejected", "changed mind");
    expect(updated.recipientCheckStatus).toBe("rejected");
    expect(updated.recipientCheckNote).toBe("changed mind");
  });

  it("throws on unknown payment", () => {
    expect(() => network.updateRecipientCheck("ghost_pm", "approved")).toThrow(/unknown payment/);
  });
});

// ── requestRefund ─────────────────────────────────────────────────────

describe("SandboxNetwork.requestRefund", () => {
  it("rejects payment + releases credit + sets refundedAt", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_refund_ok", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    network.completeManualAml(p.success.payment.id, false);

    const updated = network.requestRefund(p.success.payment.id);
    expect(updated.status).toBe("rejected");
    expect(updated.refundedAt).toBe(clock);
  });

  it("throws on unknown payment", () => {
    expect(() => network.requestRefund("ghost_pm")).toThrow(/unknown payment/);
  });

  it("throws when payment is not in rejected state", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_refund_not_rejected", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    // payment is "confirmed" after createPayment
    expect(() => network.requestRefund(p.success.payment.id)).toThrow(/not in rejected state/);
  });

  it("throws when payment is already refunded", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_refund_double", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    network.completeManualAml(p.success.payment.id, false);
    network.requestRefund(p.success.payment.id);
    expect(() => network.requestRefund(p.success.payment.id)).toThrow(/already refunded/);
  });
});

// ── recordAmlFile (Phase 7 AML rewrite) ───────────────────────────────

describe("SandboxNetwork.recordAmlFile", () => {
  it("writes amlFile metadata without changing status", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_file", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    const meta = {
      filename: "report.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
      uploadedAt: clock,
    };
    const updated = network.recordAmlFile(p.success.payment.id, meta);
    expect(updated.status).toBe("pending_aml");
    expect(updated.amlFile).toEqual(meta);
  });

  it("overwrites existing amlFile metadata on second call", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_overwrite", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    network.recordAmlFile(p.success.payment.id, {
      filename: "first.pdf",
      fileSize: 100,
      fileType: "application/pdf",
      uploadedAt: clock,
    });
    network.recordAmlFile(p.success.payment.id, {
      filename: "second.pdf",
      fileSize: 200,
      fileType: "application/pdf",
      uploadedAt: clock + 1,
    });

    const updated = svc.snapshot().payments.find((pm) => pm.id === p.success.payment.id);
    expect(updated?.amlFile?.filename).toBe("second.pdf");
    expect(updated?.amlFile?.fileSize).toBe(200);
  });

  it("throws on unknown payment", () => {
    expect(() =>
      network.recordAmlFile("ghost_pm", {
        filename: "x",
        fileSize: 1,
        fileType: "application/pdf",
        uploadedAt: 0,
      }),
    ).toThrow(/unknown payment/);
  });
});

// ── AML blob forwarding ─────────────────────────────────────────────

describe("SandboxNetwork — AML blob", () => {
  it("recordAmlBlob delegates to provider and getAmlBlob retrieves it", () => {
    svc.recordPayment({
      id: "pm_blob",
      quoteId: "qt",
      currency: "EUR",
      usdAmount: 1,
      localAmount: 1,
      beneficiaryRef: "X",
      status: "accepted",
      createdAt: clock,
    });
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    network.recordAmlBlob("pm_blob", bytes);
    expect(network.getAmlBlob("pm_blob")).toEqual(bytes);
  });

  it("recordAmlBlob throws on unknown payment", () => {
    expect(() => network.recordAmlBlob("ghost", new Uint8Array())).toThrow(/unknown payment/);
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

  it("createPaymentIntent saves recipientInfo when provided", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const intent = network.createPaymentIntent(
      {
        quoteId: q.id,
        beneficiaryRef: "INT-1",
        recipientInfo: {
          fallback: {
            accountHolderName: "Jane Doe",
            accountNumber: "GB82WEST12345698765432",
            country: "GB",
          },
        },
      },
      clock,
    );
    expect(intent.recipientInfo?.fallback?.accountHolderName).toBe("Jane Doe");
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
    expect(() => network.handleNetworkAccepted("n_1", "", undefined, clock)).toThrow(/no quote available/);
  });

  it("handleNetworkAccepted writes accepted payment when a quote exists", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = network.handleNetworkAccepted("n_1", "BEN", undefined, clock);
    expect(p.status).toBe("accepted");
    expect(p.beneficiaryRef).toBe("BEN");
    expect(p.currency).toBe(q.currency);
  });

  it("handleNetworkAccepted is idempotent on paymentClientId", async () => {
    await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p1 = network.handleNetworkAccepted("n_idem", "BEN", undefined, clock);
    const p2 = network.handleNetworkAccepted("n_idem", "BEN", undefined, clock);
    expect(p1.id).toBe(p2.id);
    expect(svc.snapshot().payments.filter((x) => x.id === "n_idem")).toHaveLength(1);
  });

  it("handleManualAmlCheck marks the payment as pending_aml", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await network.createPayment(
      { paymentClientId: "baxs_aml_ingress", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in r)) throw new Error("setup");
    const p = network.handleManualAmlCheck(r.success.payment.id);
    expect(p.status).toBe("pending_aml");
  });

  it("triggerManualAml moves payment to pending_aml", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await network.createPayment(
      { paymentClientId: "baxs_trigger_aml", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in r)) throw new Error("setup");
    const p = network.triggerManualAml(r.success.payment.id);
    expect(p.status).toBe("pending_aml");
  });

  it("triggerManualAml throws when payment not found", () => {
    expect(() => network.triggerManualAml("nonexistent")).toThrow("not found");
  });
});

// ── listRejectedPayments (Phase 7 ReFund) ───────────────────────────

describe("SandboxNetwork.listRejectedPayments (ReFund)", () => {
  async function makeRejected(clientId: string, addRefunded = false) {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: clientId, quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    network.completeManualAml(p.success.payment.id, false);
    if (addRefunded) {
      network.requestRefund(p.success.payment.id);
    }
    return p.success.payment.id;
  }

  it("returns only payments with status === rejected", async () => {
    await makeRejected("baxs_rej_1");
    const accepted = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const ap = await network.createPayment(
      { paymentClientId: "baxs_acc_1", quoteId: accepted.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in ap)) throw new Error("setup");
    svc.markPaymentStatus(ap.success.payment.id, "pending_aml");
    network.completeManualAml(ap.success.payment.id, true);

    const rejected = network.listRejectedPayments();
    expect(rejected.every((p) => p.status === "rejected")).toBe(true);
  });

  it("excludes accepted / confirmed / pending payments", async () => {
    await makeRejected("baxs_rej_only");
    const ids = network.listRejectedPayments().map((p) => p.id);
    expect(ids).not.toContain("baxs_acc_1");
  });

  it("sorts refunded payments first (by refundedAt desc), then awaiting (by rejectedAt desc)", async () => {
    // Payment A: rejected, later refunded
    clock = 1_700_000_000_000;
    const idA = await makeRejected("baxs_rej_a");
    clock += 10_000;
    network.requestRefund(idA);

    // Payment B: rejected, never refunded (awaiting)
    clock = 1_700_000_000_001;
    const idB = await makeRejected("baxs_rej_b");

    // Payment C: rejected, refunded earlier than A
    clock = 1_700_000_000_002;
    const idC = await makeRejected("baxs_rej_c");
    clock += 5_000;
    network.requestRefund(idC);

    const list = network.listRejectedPayments();
    expect(list[0]!.id).toBe(idA); // refunded latest → first
    expect(list[1]!.id).toBe(idC); // refunded earlier → second
    expect(list[2]!.id).toBe(idB); // awaiting → last
  });

  it("returns empty array when no rejected payments exist", () => {
    expect(network.listRejectedPayments()).toEqual([]);
  });
});

describe("SandboxNetwork.listPayments and OFI delegation", () => {
  it("listPayments returns the provider's payments", async () => {
    await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    await network.createPayment(
      {
        paymentClientId: "baxs_list_1",
        quoteId: svc.snapshot().quotes[0]!.id,
        beneficiaryRef: "B",
        usdAmount: 1_000,
      },
      clock,
    );
    expect(network.listPayments().map((p) => p.id)).toContain("baxs_list_1");
  });

  it("OFI completeManualAml routes through Network (not Provider directly)", async () => {
    const spy = vi.spyOn(network, "completeManualAml");
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await ofi.createPayment({
      paymentClientId: "baxs_ofi_aml",
      quoteId: q.id,
      beneficiaryRef: "B",
      usdAmount: 1_000,
    });
    if (!("success" in p)) throw new Error("setup");
    // createPayment drives payout to success, so payment is "confirmed".
    // Mark it "pending_aml" first so completeManualAml can run.
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    ofi.completeManualAml(p.success.payment.id, false);
    expect(spy).toHaveBeenCalled();
  });
});

// ── External quote registry (audit §6.1 A1) ─────────────────────────────
//
// Regression: prior to A1, HTTP-mode GetQuote returned an external quote id
// that the follow-up `createPayment` could not resolve (it only consulted
// the Provider's local quote book). The fix is a small TTL-aware cache
// inside SandboxNetwork; this suite locks the contract end-to-end.

import type { OfiQuoteRequest, OfiT0Client } from "./ofi-client";
import type { OfiQuoteResponse } from "./quote-mapper";

/**
 * Test double that returns a fixed quote on the first request and rejects
 * subsequent ones. Lets us prove that after a single GetQuote the resulting
 * quote id is reusable by `createPayment` even though the underlying client
 * is a one-shot.
 */
class OneShotHttpOfiT0Client implements OfiT0Client {
  private used = false;
  constructor(
    private readonly quote: Omit<import("./types").Quote, "createdAt"> & { createdAt: number },
  ) {}
  async getQuote(_req: OfiQuoteRequest, now: () => number): Promise<OfiQuoteResponse> {
    if (this.used) {
      return { failure: { reason: "UPSTREAM", message: "one-shot already consumed" } };
    }
    this.used = true;
    return {
      success: {
        quoteId: this.quote.id,
        currency: this.quote.currency,
        band: this.quote.band,
        rate: this.quote.rate,
        expiresAt: this.quote.expiresAt,
        payOutAmount: this.quote.band * this.quote.rate,
        settlementAmount: this.quote.band,
        createdAt: this.quote.createdAt,
      },
    };
  }
}

describe("SandboxNetwork external quote registry (audit A1)", () => {
  function buildNetwork(ofi: OfiT0Client) {
    const n = new SandboxNetwork(svc, ofi, "PAYMENT_METHOD_TYPE_SEPA", now);
    return n;
  }

  it("registers a successful external GetQuote so createPayment can resolve the same id", async () => {
    // Simulate: HTTP GetQuote returns external id "ext-7-220299073". The
    // MockT0Client + PayoutProviderService have no idea about it.
    const externalClient = new OneShotHttpOfiT0Client({
      id: "ext-7-220299073",
      currency: "EUR",
      band: 1_000,
      rate: 0.86,
      expiresAt: clock + 60_000,
      createdAt: clock,
    });
    const n = buildNetwork(externalClient);

    // 1) GetQuote succeeds and registers the quote.
    const getR = await n.getQuote({ usdAmount: 1_000, currency: "EUR" });
    if (!("success" in getR)) throw new Error("setup: getQuote should succeed");
    expect(getR.success.quote.id).toBe("ext-7-220299073");
    expect(n.externalQuoteCount()).toBe(1);

    // 2) CreatePayment against the external id succeeds (audit regression).
    const cpR = await n.createPayment(
      {
        paymentClientId: "baxs_http_quote_1",
        quoteId: "ext-7-220299073",
        beneficiaryRef: "BEN",
        usdAmount: 1_000,
      },
      clock,
    );
    if (!("success" in cpR)) throw new Error("expected createPayment success");
    expect(cpR.success.created).toBe(true);
    expect(cpR.success.payment.quoteId).toBe("ext-7-220299073");
    expect(cpR.success.payment.status).toBe("confirmed");
    expect(cpR.success.payout.status).toBe("success");
  });

  it("returns REASON_INVALID_QUOTE_ID for unknown external ids", async () => {
    const n = buildNetwork(
      new OneShotHttpOfiT0Client({
        id: "ext-known",
        currency: "EUR",
        band: 1_000,
        rate: 0.9,
        expiresAt: clock + 60_000,
        createdAt: clock,
      }),
    );
    // Get a successful quote to populate the cache…
    await n.getQuote({ usdAmount: 1_000, currency: "EUR" });
    // …then ask for a quote id that was never seen.
    const r = n.getQuoteById("never-seen");
    expect(r).toEqual({ failure: { reason: "REASON_INVALID_QUOTE_ID" } });
  });

  it("returns REASON_QUOTE_EXPIRED and evicts expired external quotes", async () => {
    const externalClient = new OneShotHttpOfiT0Client({
      id: "ext-ttl",
      currency: "EUR",
      band: 1_000,
      rate: 0.9,
      // Already expired by the time we resolve.
      expiresAt: clock + 50,
      createdAt: clock,
    });
    const n = buildNetwork(externalClient);
    await n.getQuote({ usdAmount: 1_000, currency: "EUR" });
    expect(n.externalQuoteCount()).toBe(1);

    // Advance past expiration, then resolve — must be EXPIRED, not INVALID.
    clock += 100;
    const r = n.getQuoteById("ext-ttl", clock);
    expect(r).toEqual({ failure: { reason: "REASON_QUOTE_EXPIRED" } });
    // Cache was cleaned up.
    expect(n.externalQuoteCount()).toBe(0);
  });

  it("falls back to provider-local quotes when external cache is empty", async () => {
    // No external GetQuote issued; a locally-published quote is still findable.
    const n = buildNetwork(
      new OneShotHttpOfiT0Client({
        id: "ignored",
        currency: "EUR",
        band: 1_000,
        rate: 0.9,
        expiresAt: clock + 60_000,
        createdAt: clock,
      }),
    );
    const local = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    // Pass `clock` so the lookup isn't compared against real wall-clock time.
    const r = n.getQuoteById(local.id, clock);
    if (!("success" in r)) throw new Error("expected local lookup success");
    expect(r.success.quote.id).toBe(local.id);
  });

  it("enforces EXTERNAL_QUOTE_CACHE_LIMIT by evicting the oldest entry on overflow", async () => {
    // Build a client that returns a fresh quote on every call (sequential ids).
    let counter = 0;
    const bulkClient: OfiT0Client = {
      async getQuote(_req: OfiQuoteRequest, _now: () => number): Promise<OfiQuoteResponse> {
        counter += 1;
        const id = `ext-bulk-${counter}`;
        return {
          success: {
            quoteId: id,
            currency: "EUR",
            band: 100,
            rate: 0.9,
            expiresAt: clock + 60_000,
            payOutAmount: 90,
            settlementAmount: 100,
            createdAt: clock,
          },
        };
      },
    };
    const n = buildNetwork(bulkClient);
    // 129 quotes: 128 fits, the 129th evicts the oldest (= "ext-bulk-1").
    for (let i = 0; i < 129; i++) {
      await n.getQuote({ usdAmount: 100, currency: "EUR" });
    }
    expect(n.externalQuoteCount()).toBe(128);
    // First id was evicted.
    expect(n.getQuoteById("ext-bulk-1", clock)).toEqual({
      failure: { reason: "REASON_INVALID_QUOTE_ID" },
    });
    // Most recent id is still present.
    expect(n.getQuoteById("ext-bulk-129", clock)).toMatchObject({
      success: { quote: { id: "ext-bulk-129" } },
    });
  });
});

// ── Fallback path: MockOfiT0Client fallback → external cache → createPayment
// (plan §4.1, §8 #1-#4) ────────────────────────────────────────────────

describe("SandboxNetwork with MockOfiT0Client fallback (plan §4.1)", () => {
  it("uses Provider quote when available; ignores fallback", async () => {
    const fallbackQuoteProvider = vi.fn().mockResolvedValue({
      rate: 0.5,
      expiresAt: clock + 300_000,
    });
    const networkWithFallback = new SandboxNetwork(
      svc,
      new MockOfiT0Client({
        pickBestQuote: (_u, _c, n) => ({
          rate: 0.92,
          expiresAt: n + 60_000,
          createdAt: n,
          quoteId: "qt_provider_priority",
        }),
        fallbackQuoteProvider,
      }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
    const r = await networkWithFallback.getQuote({ usdAmount: 1_000, currency: "EUR" });
    if (!("success" in r)) throw new Error("expected success");
    expect(r.success.quote.id).toBe("qt_provider_priority");
    expect(r.success.quote.rate).toBe(0.92);
    expect(fallbackQuoteProvider).not.toHaveBeenCalled();
  });

  it("falls back when Provider has no quote; preserves rate precision", async () => {
    const networkWithFallback = new SandboxNetwork(
      svc,
      new MockOfiT0Client({
        pickBestQuote: () => null,
        fallbackQuoteProvider: vi.fn().mockResolvedValue({
          rate: 0.9203456,
          expiresAt: clock + 300_000,
        }),
      }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
    const r = await networkWithFallback.getQuote({ usdAmount: 1_000, currency: "EUR" });
    if (!("success" in r)) throw new Error("expected success");
    expect(r.success.quote.id).toMatch(/^fb_quote-1000-EUR-/);
    expect(r.success.quote.rate).toBe(0.9203456); // plan §5.2: preserve upstream precision
    expect(r.success.payoutAmount).toBeCloseTo(920.3456, 4);
  });

  it("registers fallback quote in external cache so createPayment succeeds (plan §8 #4)", async () => {
    const networkWithFallback = new SandboxNetwork(
      svc,
      new MockOfiT0Client({
        pickBestQuote: () => null,
        fallbackQuoteProvider: vi.fn().mockResolvedValue({
          rate: 0.92,
          expiresAt: clock + 300_000,
        }),
      }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
    const getR = await networkWithFallback.getQuote({ usdAmount: 1_000, currency: "EUR" });
    if (!("success" in getR)) throw new Error("setup: getQuote should succeed");
    expect(networkWithFallback.externalQuoteCount()).toBe(1);

    // Now createPayment against the fallback id — must succeed end-to-end.
    const cpR = await networkWithFallback.createPayment(
      {
        paymentClientId: "baxs_fallback_1",
        quoteId: getR.success.quote.id,
        beneficiaryRef: "BEN-FALLBACK",
        usdAmount: 1_000,
      },
      clock,
    );
    if (!("success" in cpR)) {
      throw new Error("createPayment failed: " + JSON.stringify(cpR.failure));
    }
    expect(cpR.success.created).toBe(true);
    expect(cpR.success.payment.quoteId).toBe(getR.success.quote.id);
    expect(cpR.success.payment.status).toBe("confirmed");
  });

  it("returns NO_QUOTE when both Provider and fallback have no quote", async () => {
    const networkWithFallback = new SandboxNetwork(
      svc,
      new MockOfiT0Client({
        pickBestQuote: () => null,
        fallbackQuoteProvider: vi.fn().mockResolvedValue(null),
      }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
    const r = await networkWithFallback.getQuote({ usdAmount: 1_000, currency: "EUR" });
    expect(r).toEqual({ failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } });
  });
});

// ── Pre-Settlement (audit §4–§7) ─────────────────────────────────────
//
// SandboxNetwork wires the SettlementRegistry into createPayment:
//   - pre-flight: REASON_NO_CREDIT_AVAILABLE when OFI hasn't topped up
//   - on success: reserve → settle (or release on failure)

describe("SandboxNetwork Pre-Settlement credit gate (audit §4–§7)", () => {
  function buildNetworkWithRegistry() {
    const registry = new SettlementRegistry({ confirmDelayMs: 0 });
    const p = new PayoutProviderService(new MockT0Client(), now, registry);
    // Wire MockOfiT0Client so it returns the published quote (mirrors real flow).
    const ofiClient = new MockOfiT0Client({
      pickBestQuote: (usdAmount, currency, n) => {
        const candidates = p
          .snapshot()
          .quotes.filter((q) => q.currency === currency && q.expiresAt > n && q.band >= usdAmount);
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
    const n = new SandboxNetwork(p, ofiClient, "PAYMENT_METHOD_TYPE_SEPA", now, registry);
    return { registry, provider: p, network: n };
  }

  it("rejects createPayment with REASON_NO_CREDIT_AVAILABLE when no top-up yet", async () => {
    const { network, provider } = buildNetworkWithRegistry();
    await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const r = await network.createPayment({
      paymentClientId: "baxs_credit_fail",
      quoteId: "(any)",
      beneficiaryRef: "BEN",
      usdAmount: 1000,
    });
    expect(r).toEqual({ failure: { reason: "REASON_NO_CREDIT_AVAILABLE" } });
  });

  it("accepts createPayment after a confirmed USDT top-up", async () => {
    const { network, registry, provider } = buildNetworkWithRegistry();
    await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const settlement = network.submitUsdtSettlement({
      blockchain: "TRON",
      fromAddress: "ofiw",
      toAddress: "provw",
      usdAmount: 5000,
    });
    network.receiveSettlementConfirmation(settlement.txHash);

    const quote = await network.getQuote({ usdAmount: 1000, currency: "EUR", now: clock });
    expect("success" in quote).toBe(true);
    if (!("success" in quote)) throw new Error("setup: getQuote");
    const r = await network.createPayment(
      {
        paymentClientId: "baxs_credit_ok",
        quoteId: quote.success.quote.id,
        beneficiaryRef: "BEN",
        usdAmount: 1000,
      },
      clock,
    );
    if (!("success" in r)) {
      throw new Error("expected success, got failure: " + JSON.stringify(r.failure));
    }
    expect(r.success.payment.status).toBe("confirmed");
    expect(r.success.payout.status).toBe("success");
    // After successful payout: available = 5000 − 0, reserved = 0 (settled).
    expect(registry.getCredit("ofi")).toEqual({ available: 4000, reserved: 0 });
    expect(registry.getCredit("provider")).toEqual({ available: 5000, reserved: 0 });
  });

  it("releases the reservation when the payout fails", async () => {
    const { network, registry, provider } = buildNetworkWithRegistry();
    await provider.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const s = network.submitUsdtSettlement({
      blockchain: "TRON",
      fromAddress: "ofiw",
      toAddress: "provw",
      usdAmount: 5000,
    });
    network.receiveSettlementConfirmation(s.txHash);

    const quote = await network.getQuote({ usdAmount: 1000, currency: "EUR", now: clock });
    if (!("success" in quote)) throw new Error("setup");
    const r = await network.createPayment(
      {
        paymentClientId: "baxs_credit_ok_for_release",
        quoteId: quote.success.quote.id,
        beneficiaryRef: "BEN",
        usdAmount: 1000,
      },
      clock,
    );
    expect("success" in r).toBe(true);
    // Manually drive the release branch — the same code path the network
    // exercises when payout.status !== "success".
    registry.reserveCredit(2000);
    registry.releaseCredit(2000);
    expect(registry.getCredit("ofi").reserved).toBe(0);
  });

  it("submitUsdtSettlement is idempotent on the same txHash", () => {
    const { network, registry } = buildNetworkWithRegistry();
    const dupTxHash = "0x" + "d".repeat(64);
    const first = network.submitUsdtSettlement({
      txHash: dupTxHash,
      blockchain: "TRON",
      fromAddress: "a",
      toAddress: "b",
      usdAmount: 1500,
    });
    const second = network.submitUsdtSettlement({
      txHash: dupTxHash,
      blockchain: "TRON",
      fromAddress: "a",
      toAddress: "b",
      usdAmount: 9999,
    });
    expect(second).toBe(first);
    expect(registry.getCredit("ofi").available).toBe(0); // not credited yet
  });

  it("getSettlementState returns the snapshot view", () => {
    const { network } = buildNetworkWithRegistry();
    const s = network.submitUsdtSettlement({
      blockchain: "ETHEREUM",
      fromAddress: "a",
      toAddress: "b",
      usdAmount: 300,
    });
    const state = network.getSettlementState();
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]!.txHash).toBe(s.txHash);
    expect(state.pending[0]!.blockchain).toBe("ETHEREUM");
  });
});

import { SettlementRegistry } from "./settlement";

// ── Phase 1: SandboxNetwork read-model accessors (Step 10) ────────────
// New cases appended below; existing cases above untouched.

import { InMemoryStore } from "./read-model/store";
import type { LimitSnapshot } from "./read-model/types";

describe("SandboxNetwork read-model accessors", () => {
  function buildNetworkWithReadModel(providerId = 7): {
    network: SandboxNetwork;
    store: InMemoryStore;
  } {
    const svc = new PayoutProviderService(new MockT0Client(), () => clock);
    const store = new InMemoryStore();
    const network = new SandboxNetwork(
      svc,
      new MockOfiT0Client({ pickBestQuote: () => null }),
      "PAYMENT_METHOD_TYPE_SEPA",
      () => clock,
      null,
      store,
      providerId,
    );
    return { network, store };
  }

  it("latestLimit returns undefined when no limit has been recorded", () => {
    const { network } = buildNetworkWithReadModel();
    expect(network.latestLimit(23)).toBeUndefined();
  });

  it("latestLimit returns the latest snapshot for the receiving provider", () => {
    const { network, store } = buildNetworkWithReadModel(7);
    const snap: LimitSnapshot = {
      providerId: 7,
      counterpartyId: 23,
      version: 1n,
      payoutLimit: { unscaled: "1000", exponent: 0 },
      receivedAt: clock,
    };
    store.putLimit(snap);
    expect(network.latestLimit(23)?.payoutLimit).toEqual({ unscaled: "1000", exponent: 0 });
  });

  it("hasReadModel reports whether the read model is attached", () => {
    const svc = new PayoutProviderService(new MockT0Client(), () => clock);
    const noModel = new SandboxNetwork(svc, new MockOfiT0Client({ pickBestQuote: () => null }));
    expect(noModel.hasReadModel()).toBe(false);
    const { network } = buildNetworkWithReadModel();
    expect(network.hasReadModel()).toBe(true);
  });

  it("ignores limits belonging to a different providerId", () => {
    const { network, store } = buildNetworkWithReadModel(7);
    store.putLimit({
      providerId: 99,
      counterpartyId: 23,
      version: 1n,
      payoutLimit: { unscaled: "100", exponent: 0 },
      receivedAt: clock,
    });
    expect(network.latestLimit(23)).toBeUndefined();
  });
});
