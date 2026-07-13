// t0.functions.aml.test.ts — server-fn boundary tests for AML upload flow.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadAmlFileFn } from "./t0.functions";
import { sandboxNetwork, providerService } from "./index";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { MockOfiT0Client } from "./ofi-client";

// We test the handler body directly by extracting the inner function.
// Since createServerFn requires AsyncLocalStorage context, we test the
// business logic by calling the underlying network functions directly.

let clock = 1_700_000_000_000;
const now = () => clock;

describe("uploadAmlFile business logic", () => {
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

  async function uploadAndReview(
    paymentId: string,
    filename: string,
    fileSize: number,
    fileType: string,
  ) {
    // Validate
    const { validateAmlFile } = await import("./aml");
    const validation = validateAmlFile(filename, fileSize, fileType);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }
    // Review
    const { SandboxAmlReviewer } = await import("./aml");
    const reviewer = new SandboxAmlReviewer();
    const result = await reviewer.review({ paymentId, filename, fileSize, fileType });
    if (result.status === "approved") {
      network.completeManualAml(paymentId, true);
      const payment = network.listPayments().find((p) => p.id === paymentId);
      if (payment) {
        network.approvePaymentQuote(paymentId, payment.quoteId);
        providerService.logOfiAmlEvent(paymentId, payment.quoteId, "approved");
      }
    }
    return result;
  }

  it("approves valid file and transitions payment to accepted", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      {
        paymentClientId: "baxs_aml_upload",
        quoteId: q.id,
        beneficiaryRef: "BEN",
        usdAmount: 1_000,
      },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    // Manually set to pending_aml to simulate the flow
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    const result = await uploadAndReview(
      p.success.payment.id,
      "aml_report.pdf",
      1024,
      "application/pdf",
    );

    expect(result.status).toBe("approved");
    const updated = svc.snapshot().payments.find((pm) => pm.id === p.success.payment.id);
    expect(updated?.status).toBe("accepted");
  });

  it("rejects file with 'reject' in name and keeps payment pending_aml", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_aml_rej", quoteId: q.id, beneficiaryRef: "BEN", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    const result = await uploadAndReview(
      p.success.payment.id,
      "aml_reject.pdf",
      1024,
      "application/pdf",
    );

    expect(result.status).toBe("rejected");
    const updated = svc.snapshot().payments.find((pm) => pm.id === p.success.payment.id);
    expect(updated?.status).toBe("pending_aml");
  });

  it("throws on invalid file type", async () => {
    await expect(
      uploadAndReview("pm_test", "script.exe", 1024, "application/x-msdownload"),
    ).rejects.toThrow(/Unsupported file type/);
  });

  it("throws on empty file", async () => {
    await expect(uploadAndReview("pm_test", "empty.pdf", 0, "application/pdf")).rejects.toThrow(
      /File is empty/,
    );
  });

  it("throws on oversized file", async () => {
    const { MAX_AML_FILE_SIZE } = await import("./aml");
    await expect(
      uploadAndReview("pm_test", "huge.pdf", MAX_AML_FILE_SIZE + 1, "application/pdf"),
    ).rejects.toThrow(/exceeds/);
  });

  it("approves payment and triggers quote approval (Last Look)", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_lastlook", quoteId: q.id, beneficiaryRef: "BEN", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    const result = await uploadAndReview(
      p.success.payment.id,
      "aml_clean.pdf",
      1024,
      "application/pdf",
    );

    expect(result.status).toBe("approved");
    // Verify quote was refreshed (Last Look)
    const refreshedQuote = svc.snapshot().quotes.find((qt) => qt.id === q.id);
    expect(refreshedQuote?.expiresAt).toBe(clock + 60_000);
  });

  it("logs OfiAmlEvent on approval", async () => {
    const q = await svc.publishQuote({ currency: "EUR", band: 1_000, rate: 0.9 });
    const p = await network.createPayment(
      { paymentClientId: "baxs_event", quoteId: q.id, beneficiaryRef: "BEN", usdAmount: 1_000 },
      clock,
    );
    if (!("success" in p)) throw new Error("setup");
    svc.markPaymentStatus(p.success.payment.id, "pending_aml");

    await uploadAndReview(p.success.payment.id, "aml_clean.pdf", 1024, "application/pdf");

    // logOfiAmlEvent is called on the singleton providerService, not the test svc.
    // We verify the event was logged by checking the singleton's event log.
    const events = providerService.snapshot().events.filter((e) => e.type === "OfiAmlEvent");
    expect(events.length).toBeGreaterThan(0);
    const lastEvent = events[events.length - 1]!;
    expect(lastEvent.type).toBe("OfiAmlEvent");
    if (lastEvent.type === "OfiAmlEvent") {
      expect(lastEvent.paymentId).toBe(p.success.payment.id);
      expect(lastEvent.action).toBe("approved");
    }
  });
});
