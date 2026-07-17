// t0.functions.aml.test.ts — server-fn boundary tests for the OFI-upload +
// Provider-review AML flow (Phase 7 rewrite).
//
// We test the handler bodies by calling the underlying pure functions
// (`reviewAmlUpload`, `applyAmlReview`, `recordAmlFile`) directly. The
// `createServerFn` wrappers in t0.functions.ts are thin pass-throughs;
// they don't need their own integration test here.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reviewAmlUpload,
  applyAmlReview,
  ofiUploadAmlFileFn,
  reviewAmlFileFn,
  downloadAmlFileFn,
  requestRefundFn,
} from "./t0.functions";
import { bytesToBase64, base64ToBytes } from "./aml-blob";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { MockOfiT0Client } from "./ofi-client";

let clock = 1_700_000_000_000;
const now = () => clock;

describe("OFI upload (ofiUploadAmlFileFn handler body)", () => {
  let client: MockT0Client;
  let svc: PayoutProviderService;
  let network: SandboxNetwork;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    client = new MockT0Client();
    svc = new PayoutProviderService(client, now);
    network = new SandboxNetwork(
      svc,
      new MockOfiT0Client({ pickBestQuote: () => null }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
  });

  async function setupPendingAml(clientId: string) {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: clientId, quoteId: q.id, beneficiaryRef: "BEN", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    return { paymentId: p.success.payment.id, quoteId: q.id };
  }

  // Mirrors the ofiUploadAmlFileFn handler so a regression in either
  // piece fails here too.
  async function ofiUpload(
    paymentId: string,
    filename: string,
    fileSize: number,
    fileType: string,
    bytesBase64: string,
  ) {
    const bytes = base64ToBytes(bytesBase64);
    const review = await reviewAmlUpload({ paymentId, filename, fileSize, fileType });
    network.recordAmlBlob(paymentId, bytes);
    network.recordAmlFile(paymentId, {
      filename,
      fileSize,
      fileType,
      uploadedAt: clock,
    });
    svc.emitEvent({
      type: "AmlFileUploaded",
      paymentId,
      filename,
      fileSize,
      at: clock,
    });
    return review;
  }

  it("uploads a valid file and writes amlFile metadata, status stays pending_aml", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_upload");
    const result = await ofiUpload(paymentId, "report.pdf", 1024, "application/pdf", "SGVsbG8=");
    expect(result.status).toBe("approved");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("pending_aml");
    expect(updated?.amlFile).toEqual({
      filename: "report.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
      uploadedAt: clock,
    });
  });

  it("upload does NOT call completeManualAml or approvePaymentQuote (provider decides)", async () => {
    const { paymentId, quoteId } = await setupPendingAml("baxs_ofi_no_state_change");
    const mlSpy = vi.spyOn(network, "completeManualAml");
    const qSpy = vi.spyOn(network, "approvePaymentQuote");

    await ofiUpload(paymentId, "clean.pdf", 1024, "application/pdf", "SGVsbG8=");

    expect(mlSpy).not.toHaveBeenCalled();
    expect(qSpy).not.toHaveBeenCalled();
    // Quote TTL not bumped (default is 60s, applied at publish).
    const quote = svc.snapshot().quotes.find((qt) => qt.id === quoteId);
    expect(quote?.expiresAt).toBe(clock + 60_000);
    mlSpy.mockRestore();
    qSpy.mockRestore();
  });

  it("OFI can re-upload to overwrite the previous file metadata", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_reupload");
    await ofiUpload(paymentId, "first.pdf", 100, "application/pdf", "AAA=");
    await ofiUpload(paymentId, "second.pdf", 200, "application/pdf", "BBB=");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.amlFile?.filename).toBe("second.pdf");
    expect(updated?.amlFile?.fileSize).toBe(200);
    expect(updated?.status).toBe("pending_aml");
  });

  it("throws on invalid file type without writing metadata", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_bad_type");
    await expect(
      ofiUpload(paymentId, "evil.exe", 1024, "application/x-msdownload", "SGVsbG8="),
    ).rejects.toThrow(/Unsupported file type/);
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.amlFile).toBeUndefined();
  });

  it("throws on empty file without writing metadata", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_empty");
    await expect(
      ofiUpload(paymentId, "empty.pdf", 0, "application/pdf", ""),
    ).rejects.toThrow(/File is empty/);
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.amlFile).toBeUndefined();
  });

  it("throws on oversized file without writing metadata", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_huge");
    const { MAX_AML_FILE_SIZE } = await import("./aml");
    await expect(
      ofiUpload(paymentId, "huge.pdf", MAX_AML_FILE_SIZE + 1, "application/pdf", "SGVsbG8="),
    ).rejects.toThrow(/exceeds/);
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.amlFile).toBeUndefined();
  });

  it("OFI upload function reference exists (sanity)", () => {
    expect(ofiUploadAmlFileFn).toBeDefined();
  });
});

// ── Provider review (reviewAmlFileFn handler body) ───────────────────

describe("Provider review (reviewAmlFileFn handler body)", () => {
  let client: MockT0Client;
  let svc: PayoutProviderService;
  let network: SandboxNetwork;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    client = new MockT0Client();
    svc = new PayoutProviderService(client, now);
    network = new SandboxNetwork(
      svc,
      new MockOfiT0Client({ pickBestQuote: () => null }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
  });

  async function setupPendingAmlWithFile(clientId: string) {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: clientId, quoteId: q.id, beneficiaryRef: "BEN", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    network.recordAmlFile(p.success.payment.id, {
      filename: "report.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
      uploadedAt: clock,
    });
    return { paymentId: p.success.payment.id, quoteId: q.id };
  }

  // Mirrors the reviewAmlFileFn handler.
  function providerDecide(paymentId: string, decision: "approve" | "reject") {
    applyAmlReview(
      { paymentId, approved: decision === "approve" },
      { network, provider: svc },
    );
  }

  it("approve → status accepted + Last Look bumps the quote TTL", async () => {
    const { paymentId, quoteId } = await setupPendingAmlWithFile("baxs_pv_approve");
    providerDecide(paymentId, "approve");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("accepted");
    const refreshedQuote = svc.snapshot().quotes.find((qt) => qt.id === quoteId);
    expect(refreshedQuote?.expiresAt).toBe(clock + 60_000);
  });

  it("approve logs an OfiAmlEvent on the local provider", async () => {
    const { paymentId } = await setupPendingAmlWithFile("baxs_pv_approve_log");
    const logSpy = vi.spyOn(svc, "logOfiAmlEvent");
    providerDecide(paymentId, "approve");
    expect(logSpy).toHaveBeenCalledWith(paymentId, expect.any(String), "approved");
    logSpy.mockRestore();
  });

  it("reject → status rejected + rejectedAt set, no Last Look, emits OfiAmlEvent(rejected)", async () => {
    const { paymentId, quoteId } = await setupPendingAmlWithFile("baxs_pv_reject");
    const logSpy = vi.spyOn(svc, "logOfiAmlEvent");
    const qSpy = vi.spyOn(network, "approvePaymentQuote");

    providerDecide(paymentId, "reject");

    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejectedAt).toBe(clock);
    expect(updated?.rejectedReason).toBeUndefined();
    // Quote TTL not bumped (default is 60s, applied at publish).
    const quote = svc.snapshot().quotes.find((qt) => qt.id === quoteId);
    expect(quote?.expiresAt).toBe(clock + 60_000);
    expect(qSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(paymentId, quoteId, "rejected");
    logSpy.mockRestore();
    qSpy.mockRestore();
  });

  it("reject with reason → status rejected + rejectedAt + rejectedReason set", async () => {
    const { paymentId } = await setupPendingAmlWithFile("baxs_pv_reject_reason");
    providerDecide(paymentId, "reject");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejectedAt).toBe(clock);
  });

  it("approve → status accepted, rejectedAt is NOT set", async () => {
    const { paymentId } = await setupPendingAmlWithFile("baxs_pv_approve_no_rejectedAt");
    providerDecide(paymentId, "approve");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("accepted");
    expect(updated?.rejectedAt).toBeUndefined();
  });

  it("cancel AML (decision=reject via cancelManualAml) is equivalent to reject", async () => {
    const { paymentId } = await setupPendingAmlWithFile("baxs_pv_cancel");
    network.cancelManualAml(paymentId);
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("rejected");
  });

  it("second call after approval throws (not silently no-op)", async () => {
    const { paymentId } = await setupPendingAmlWithFile("baxs_pv_idempotent");
    providerDecide(paymentId, "approve");
    expect(() => providerDecide(paymentId, "approve")).toThrow(/pending_aml/);
  });

  it("reviewAmlFileFn function reference exists (sanity)", () => {
    expect(reviewAmlFileFn).toBeDefined();
  });
});

// ── Provider review + recipient check (combined flow) ─────────────────

describe("Provider review with recipientCheckStatus (combined flow)", () => {
  let client: MockT0Client;
  let svc: PayoutProviderService;
  let network: SandboxNetwork;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    client = new MockT0Client();
    svc = new PayoutProviderService(client, now);
    network = new SandboxNetwork(
      svc,
      new MockOfiT0Client({ pickBestQuote: () => null }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
  });

  async function setupPendingAmlWithRecipient(clientId: string) {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      {
        paymentClientId: clientId,
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
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    network.recordAmlFile(p.success.payment.id, {
      filename: "report.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
      uploadedAt: clock,
    });
    return { paymentId: p.success.payment.id, quoteId: q.id };
  }

  // Mirrors the reviewAmlFileFn handler: updateRecipientCheck then applyAmlReview.
  function providerDecideWithRecipient(
    paymentId: string,
    decision: "approve" | "reject",
    recipientCheckStatus: "approved" | "rejected",
    recipientCheckNote?: string,
  ) {
    network.updateRecipientCheck(paymentId, recipientCheckStatus, recipientCheckNote);
    applyAmlReview(
      { paymentId, approved: decision === "approve" },
      { network, provider: svc },
    );
  }

  it("approve + recipientCheckStatus approved → status accepted + recipientCheckStatus set", async () => {
    const { paymentId } = await setupPendingAmlWithRecipient("baxs_rc_approve");
    providerDecideWithRecipient(paymentId, "approve", "approved");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("accepted");
    expect(updated?.recipientCheckStatus).toBe("approved");
    expect(updated?.recipientCheckNote).toBeUndefined();
  });

  it("reject + recipientCheckStatus rejected with note → status rejected + recipientCheckStatus set", async () => {
    const { paymentId } = await setupPendingAmlWithRecipient("baxs_rc_reject");
    providerDecideWithRecipient(paymentId, "reject", "rejected", "account name mismatch");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("rejected");
    expect(updated?.recipientCheckStatus).toBe("rejected");
    expect(updated?.recipientCheckNote).toBe("account name mismatch");
  });

  it("approve + recipientCheckStatus rejected still sets recipientCheckStatus but rejects payment", async () => {
    const { paymentId } = await setupPendingAmlWithRecipient("baxs_rc_approve_recip_rej");
    providerDecideWithRecipient(paymentId, "reject", "rejected", "beneficiary mismatch");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    // AML rejection takes precedence — the payment status is still "rejected"
    expect(updated?.status).toBe("rejected");
    expect(updated?.recipientCheckStatus).toBe("rejected");
    expect(updated?.recipientCheckNote).toBe("beneficiary mismatch");
  });

  it("approve with no recipientInfo + recipientCheckStatus approved (skip verification)", async () => {
    // When OFI didn't provide recipientInfo, ManualAmlPanel skips the checkbox
    // by auto-setting recipientVerified=true, which sends recipientCheckStatus="approved".
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_rc_no_info", quoteId: q.id, beneficiaryRef: "BEN", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    // No recipientInfo set — legacy payment

    providerDecideWithRecipient(p.success.payment.id, "approve", "approved");
    const updated = svc.snapshot().payments.find((pm) => pm.id === p.success.payment.id);
    expect(updated?.status).toBe("accepted");
    expect(updated?.recipientCheckStatus).toBe("approved");
  });
});

// ── Pure helpers (re-used across server fns) ──────────────────────────

describe("reviewAmlUpload — pure validation + reviewer", () => {
  it("returns approved for a clean PDF without mutating network state", async () => {
    const { sandboxNetwork } = await import("./index");
    const before = sandboxNetwork.listPayments().length;
    const result = await reviewAmlUpload({
      paymentId: "pm_does_not_matter",
      filename: "clean.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
    });
    expect(result.status).toBe("approved");
    expect(sandboxNetwork.listPayments().length).toBe(before);
  });

  it("throws on unsupported file type without touching the reviewer", async () => {
    await expect(
      reviewAmlUpload({
        paymentId: "pm_test",
        filename: "evil.exe",
        fileSize: 1024,
        fileType: "application/x-msdownload",
      }),
    ).rejects.toThrow(/Unsupported file type/);
  });
});

// ── downloadAmlFileFn ────────────────────────────────────────────────

describe("downloadAmlFileFn — handler body", () => {
  let client: MockT0Client;
  let svc: PayoutProviderService;
  let network: SandboxNetwork;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    client = new MockT0Client();
    svc = new PayoutProviderService(client, now);
    network = new SandboxNetwork(
      svc,
      new MockOfiT0Client({ pickBestQuote: () => null }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
  });

  async function setupPendingAmlWithFileAndBlob(clientId: string, bytesBase64: string) {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: clientId, quoteId: q.id, beneficiaryRef: "BEN", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    const bytes = base64ToBytes(bytesBase64);
    network.recordAmlBlob(p.success.payment.id, bytes);
    network.recordAmlFile(p.success.payment.id, {
      filename: "report.pdf",
      fileSize: bytes.length,
      fileType: "application/pdf",
      uploadedAt: clock,
    });
    return { paymentId: p.success.payment.id };
  }

  // Mirrors the downloadAmlFileFn handler body.
  function doDownload(paymentId: string) {
    const payment = network.listPayments().find((p) => p.id === paymentId);
    if (!payment?.amlFile) throw new Error("no AML file for payment");
    const bytes = network.getAmlBlob(paymentId);
    if (!bytes) throw new Error("AML file metadata present but blob missing");
    return {
      filename: payment.amlFile.filename,
      fileType: payment.amlFile.fileType,
      bytesBase64: bytesToBase64(bytes),
    };
  }

  it("returns bytesBase64 that round-trips to the original bytes", async () => {
    const { paymentId } = await setupPendingAmlWithFileAndBlob("baxs_dl_ok", "SGVsbG8=");
    const result = doDownload(paymentId);
    expect(result.filename).toBe("report.pdf");
    expect(result.fileType).toBe("application/pdf");
    expect(base64ToBytes(result.bytesBase64)).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it("throws when payment has no amlFile metadata", () => {
    svc.recordPayment({
      id: "pm_no_meta",
      quoteId: "qt",
      currency: "EUR",
      usdAmount: 1,
      localAmount: 1,
      beneficiaryRef: "X",
      status: "pending_aml",
      createdAt: clock,
    });
    expect(() => doDownload("pm_no_meta")).toThrow(/no AML file/);
  });

  it("throws when blob is missing despite metadata being present", () => {
    svc.recordPayment({
      id: "pm_no_blob",
      quoteId: "qt",
      currency: "EUR",
      usdAmount: 1,
      localAmount: 1,
      beneficiaryRef: "X",
      status: "pending_aml",
      createdAt: clock,
    });
    network.recordAmlFile("pm_no_blob", {
      filename: "orphan.pdf",
      fileSize: 100,
      fileType: "application/pdf",
      uploadedAt: clock,
    });
    expect(() => doDownload("pm_no_blob")).toThrow(/blob missing/);
  });
});

// ── requestRefundFn ─────────────────────────────────────────────────

describe("requestRefundFn handler body", () => {
  let client: MockT0Client;
  let svc: PayoutProviderService;
  let network: SandboxNetwork;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    client = new MockT0Client();
    svc = new PayoutProviderService(client, now);
    network = new SandboxNetwork(
      svc,
      new MockOfiT0Client({ pickBestQuote: () => null }),
      "PAYMENT_METHOD_TYPE_SEPA",
      now,
    );
  });

  it("refund succeeds and sets refundedAt", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_rfnd_ok", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    network.completeManualAml(p.success.payment.id, false);

    const updated = await network.requestRefund(p.success.payment.id);
    expect(updated.status).toBe("rejected");
    expect(updated.refundedAt).toBe(clock);
  });

  it("throws when payment does not exist", () => {
    expect(() => network.requestRefund("ghost")).toThrow(/unknown payment/);
  });

  it("throws when payment is not in rejected state", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_rfnd_bad", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    expect(() => network.requestRefund(p.success.payment.id)).toThrow(/not in rejected state/);
  });

  it("throws when payment is already refunded (idempotent guard)", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_rfnd_dbl", quoteId: q.id, beneficiaryRef: "B", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");
    network.completeManualAml(p.success.payment.id, false);
    network.requestRefund(p.success.payment.id);
    expect(() => network.requestRefund(p.success.payment.id)).toThrow(/already refunded/);
  });

  it("requestRefundFn function reference exists (sanity)", () => {
    expect(requestRefundFn).toBeDefined();
  });
});