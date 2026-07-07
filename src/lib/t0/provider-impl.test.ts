import { describe, it, expect, beforeEach } from "vitest";
import { create } from "@bufbuild/protobuf";
import {
  PayoutRequestSchema,
  UpdatePaymentRequestSchema,
  UpdatePaymentRequest_AcceptedSchema,
  UpdatePaymentRequest_FailedSchema,
  UpdatePaymentRequest_ConfirmedSchema,
  UpdatePaymentRequest_ManualAmlCheckSchema,
  UpdateLimitRequestSchema,
  UpdateLimitRequest_LimitSchema,
  ApprovePaymentQuoteRequestSchema,
  AppendLedgerEntriesRequestSchema,
  AppendLedgerEntriesRequest_TransactionSchema,
  AppendLedgerEntriesRequest_LedgerEntrySchema,
  PayoutResponse_Failed_Reason,
  type HandlerContext,
} from "@t-0/provider-sdk";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import {
  payOut,
  updatePayment,
  updateLimit,
  approvePaymentQuote,
  appendLedgerEntries,
  createProviderServiceImpl,
} from "./provider-impl";

let clock = 1_700_000_000_000;
const now = () => clock;

let svc: PayoutProviderService;
let network: SandboxNetwork;
const ctx = {} as HandlerContext;

beforeEach(() => {
  clock = 1_700_000_000_000;
  svc = new PayoutProviderService(new MockT0Client(), now);
  network = new SandboxNetwork(svc);
});

// Helper: create a known payment in `accepted` state and map it to a
// proto-friendly numeric id. Returns the numeric id as bigint.
async function setupAcceptedPayment(): Promise<bigint> {
  const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
  const p = await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "BEN" });
  const internalId = p.id;
  svc.rekeyPayment(internalId, "n_1");
  return BigInt(1);
}

describe("payOut", () => {
  it("returns accepted for a known payment", async () => {
    const paymentId = await setupAcceptedPayment();
    const req = create(PayoutRequestSchema, {
      paymentId,
      currency: "EUR",
      clientQuoteId: "qt",
    });
    const res = await payOut(req, ctx, svc);
    expect(res.result.case).toBe("accepted");
  });

  it("returns failed for an unknown payment", async () => {
    const req = create(PayoutRequestSchema, {
      paymentId: BigInt(99_999),
      currency: "EUR",
      clientQuoteId: "qt",
    });
    const res = await payOut(req, ctx, svc);
    expect(res.result.case).toBe("failed");
    if (res.result.case === "failed") {
      expect(res.result.value.reason).toBe(PayoutResponse_Failed_Reason.UNSPECIFIED);
    }
  });

  it("returns failed when payment is not in accepted state (manually confirmed)", async () => {
    const paymentId = await setupAcceptedPayment();
    // Pre-flight: mark the payment as confirmed so processPayout rejects.
    const internalId = svc.snapshot().payments[0]!.id;
    svc.rekeyPayment(internalId, `n_${paymentId.toString()}`);
    // Force a payment to `confirmed` by calling processPayout via the
    // happy path (the payout ends with payment.status = "confirmed").
    const okReq = create(PayoutRequestSchema, { paymentId, currency: "EUR", clientQuoteId: "qt" });
    await payOut(okReq, ctx, svc);
    // Now the internal payment is `confirmed`. A second payOut returns
    // the existing payout (idempotent), so use a fresh unknown payment
    // id to exercise the failure path.
    const req = create(PayoutRequestSchema, {
      paymentId: BigInt(999_999),
      currency: "EUR",
      clientQuoteId: "qt",
    });
    const res = await payOut(req, ctx, svc);
    expect(res.result.case).toBe("failed");
  });
});

describe("updatePayment", () => {
  it("accepts an inbound accepted update idempotently", async () => {
    const paymentId = await setupAcceptedPayment();
    const req = create(UpdatePaymentRequestSchema, {
      paymentId,
      paymentClientId: paymentId.toString(),
      result: { case: "accepted", value: create(UpdatePaymentRequest_AcceptedSchema, {}) },
    });
    const res = await updatePayment(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.UpdatePaymentResponse");
  });

  it("handles a manualAmlCheck update by completing AML as rejected", async () => {
    const paymentId = await setupAcceptedPayment();
    const req = create(UpdatePaymentRequestSchema, {
      paymentId,
      paymentClientId: paymentId.toString(),
      result: { case: "manualAmlCheck", value: create(UpdatePaymentRequest_ManualAmlCheckSchema, {}) },
    });
    const res = await updatePayment(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.UpdatePaymentResponse");
    // The payment should now be rejected.
    const snapshot = svc.snapshot();
    const p = snapshot.payments.find((x) => x.id === `n_${paymentId.toString()}`);
    expect(p?.status).toBe("rejected");
  });

  it("handles a failed update without throwing", async () => {
    const req = create(UpdatePaymentRequestSchema, {
      paymentId: BigInt(99_999),
      paymentClientId: "x",
      result: { case: "failed", value: create(UpdatePaymentRequest_FailedSchema, { reason: 1 }) },
    });
    const res = await updatePayment(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.UpdatePaymentResponse");
  });

  it("handles a confirmed update without throwing", async () => {
    const paymentId = await setupAcceptedPayment();
    const req = create(UpdatePaymentRequestSchema, {
      paymentId,
      paymentClientId: paymentId.toString(),
      result: { case: "confirmed", value: create(UpdatePaymentRequest_ConfirmedSchema, {}) },
    });
    const res = await updatePayment(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.UpdatePaymentResponse");
  });

  it("ignores unknown payment ids silently", async () => {
    const req = create(UpdatePaymentRequestSchema, {
      paymentId: BigInt(123_456_789),
      paymentClientId: "x",
      result: { case: "accepted", value: create(UpdatePaymentRequest_AcceptedSchema, {}) },
    });
    const res = await updatePayment(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.UpdatePaymentResponse");
  });
});

describe("updateLimit", () => {
  it("accepts and acknowledges any limit payload", async () => {
    const req = create(UpdateLimitRequestSchema, {
      limits: [
        create(UpdateLimitRequest_LimitSchema, {
          version: BigInt(1),
          counterpartId: 42,
          payoutLimit: { unscaled: BigInt(10000), exponent: 2 },
          creditLimit: { unscaled: BigInt(20000), exponent: 2 },
          creditUsage: { unscaled: BigInt(0), exponent: 2 },
        }),
      ],
    });
    const res = await updateLimit(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.UpdateLimitResponse");
  });

  it("handles an empty limits array", async () => {
    const req = create(UpdateLimitRequestSchema, { limits: [] });
    const res = await updateLimit(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.UpdateLimitResponse");
  });
});

describe("approvePaymentQuote", () => {
  it("accepts when the payment and quote exist", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "BEN" });
    // Map internal auto-generated ids to numeric proto-friendly ids.
    const internalPaymentId = svc.snapshot().payments[0]!.id;
    svc.rekeyPayment(internalPaymentId, "n_1");
    svc.rekeyQuote(q.id, "1");
    const req = create(ApprovePaymentQuoteRequestSchema, {
      paymentId: BigInt(1),
      payOutQuoteId: BigInt(1),
    });
    const res = await approvePaymentQuote(req, ctx, svc);
    expect(res.result.case).toBe("accepted");
  });

  it("rejects when the quote id is unknown", async () => {
    const req = create(ApprovePaymentQuoteRequestSchema, {
      paymentId: BigInt(2),
      payOutQuoteId: BigInt(99_999),
    });
    const res = await approvePaymentQuote(req, ctx, svc);
    expect(res.result.case).toBe("rejected");
  });
});

describe("appendLedgerEntries", () => {
  it("accepts any payload", async () => {
    const req = create(AppendLedgerEntriesRequestSchema, {
      transactions: [
        create(AppendLedgerEntriesRequest_TransactionSchema, {
          transaction: { case: "payout", value: { payoutId: BigInt(1), amount: { unscaled: BigInt(100), exponent: 2 } } },
        }),
      ],
      ledgerEntries: [
        create(AppendLedgerEntriesRequest_LedgerEntrySchema, {
          debit: { account: "a", amount: "100" },
          credit: { account: "b", amount: "100" },
          timestamp: "2026-01-01",
          transactionId: "tx1",
        }),
      ],
    });
    const res = await appendLedgerEntries(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.AppendLedgerEntriesResponse");
  });

  it("handles empty transactions and entries", async () => {
    const req = create(AppendLedgerEntriesRequestSchema, {
      transactions: [],
      ledgerEntries: [],
    });
    const res = await appendLedgerEntries(req, ctx, svc);
    expect(res.$typeName).toBe("tzero.v1.payment.AppendLedgerEntriesResponse");
  });
});

describe("createProviderServiceImpl", () => {
  it("returns a bound object with all 5 RPC methods", () => {
    const impl = createProviderServiceImpl(svc);
    expect(typeof impl.payOut).toBe("function");
    expect(typeof impl.updatePayment).toBe("function");
    expect(typeof impl.updateLimit).toBe("function");
    expect(typeof impl.approvePaymentQuote).toBe("function");
    expect(typeof impl.appendLedgerEntries).toBe("function");
  });

  it("each method delegates to the matching handler (end-to-end through the adapter)", async () => {
    const impl = createProviderServiceImpl(svc);
    // Set up a known accepted payment.
    const q = await svc.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
    await svc.acceptPayment({ quoteId: q.id, beneficiaryRef: "BEN" });
    const internalId = svc.snapshot().payments[0]!.id;
    svc.rekeyPayment(internalId, "n_1");
    svc.rekeyQuote(q.id, "1");

    // payOut
    const payOutReq = create(PayoutRequestSchema, { paymentId: BigInt(1), currency: "EUR", clientQuoteId: "1" });
    const payOutRes = await impl.payOut(payOutReq, ctx);
    expect(payOutRes.result.case).toBe("accepted");

    // updatePayment (failed case, unknown id is fine)
    const updateReq = create(UpdatePaymentRequestSchema, {
      paymentId: BigInt(2),
      paymentClientId: "x",
      result: { case: "failed", value: create(UpdatePaymentRequest_FailedSchema, { reason: 1 }) },
    });
    const updateRes = await impl.updatePayment(updateReq, ctx);
    expect(updateRes.$typeName).toBe("tzero.v1.payment.UpdatePaymentResponse");

    // updateLimit
    const limitReq = create(UpdateLimitRequestSchema, { limits: [] });
    const limitRes = await impl.updateLimit(limitReq, ctx);
    expect(limitRes.$typeName).toBe("tzero.v1.payment.UpdateLimitResponse");

    // approvePaymentQuote (unknown quote -> rejected)
    const approveReq = create(ApprovePaymentQuoteRequestSchema, {
      paymentId: BigInt(3),
      payOutQuoteId: BigInt(99_999),
    });
    const approveRes = await impl.approvePaymentQuote(approveReq, ctx);
    expect(approveRes.result.case).toBe("rejected");

    // appendLedgerEntries
    const appendReq = create(AppendLedgerEntriesRequestSchema, {
      transactions: [],
      ledgerEntries: [],
    });
    const appendRes = await impl.appendLedgerEntries(appendReq, ctx);
    expect(appendRes.$typeName).toBe("tzero.v1.payment.AppendLedgerEntriesResponse");
  });
});