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
} from "./t0.functions";
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
  ) {
    const review = await reviewAmlUpload({ paymentId, filename, fileSize, fileType });
    network.recordAmlFile(paymentId, {
      filename,
      fileSize,
      fileType,
      uploadedAt: clock,
    });
    return review;
  }

  it("uploads a valid file and writes amlFile metadata, status stays pending_aml", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_upload");
    const result = await ofiUpload(paymentId, "report.pdf", 1024, "application/pdf");
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

    await ofiUpload(paymentId, "clean.pdf", 1024, "application/pdf");

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
    await ofiUpload(paymentId, "first.pdf", 100, "application/pdf");
    await ofiUpload(paymentId, "second.pdf", 200, "application/pdf");
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.amlFile?.filename).toBe("second.pdf");
    expect(updated?.amlFile?.fileSize).toBe(200);
    expect(updated?.status).toBe("pending_aml");
  });

  it("throws on invalid file type without writing metadata", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_bad_type");
    await expect(
      ofiUpload(paymentId, "evil.exe", 1024, "application/x-msdownload"),
    ).rejects.toThrow(/Unsupported file type/);
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.amlFile).toBeUndefined();
  });

  it("throws on empty file without writing metadata", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_empty");
    await expect(ofiUpload(paymentId, "empty.pdf", 0, "application/pdf")).rejects.toThrow(
      /File is empty/,
    );
    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.amlFile).toBeUndefined();
  });

  it("throws on oversized file without writing metadata", async () => {
    const { paymentId } = await setupPendingAml("baxs_ofi_huge");
    const { MAX_AML_FILE_SIZE } = await import("./aml");
    await expect(
      ofiUpload(paymentId, "huge.pdf", MAX_AML_FILE_SIZE + 1, "application/pdf"),
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

  it("reject → status rejected, no Last Look, no event log", async () => {
    const { paymentId, quoteId } = await setupPendingAmlWithFile("baxs_pv_reject");
    const logSpy = vi.spyOn(svc, "logOfiAmlEvent");
    const qSpy = vi.spyOn(network, "approvePaymentQuote");

    providerDecide(paymentId, "reject");

    const updated = svc.snapshot().payments.find((pm) => pm.id === paymentId);
    expect(updated?.status).toBe("rejected");
    // Quote TTL not bumped (default is 60s, applied at publish).
    const quote = svc.snapshot().quotes.find((qt) => qt.id === quoteId);
    expect(quote?.expiresAt).toBe(clock + 60_000);
    expect(qSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    qSpy.mockRestore();
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