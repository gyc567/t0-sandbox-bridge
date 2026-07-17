// ManualAmlPanel.test.tsx — React component tests for the Provider AML panel
// (Phase 7 rewrite: OFI-upload + Provider-review split).
//
// Most cases use renderToStaticMarkup (server-side rendering) for fast,
// deterministic structural assertions. Handler tests use @testing-library/react
// to exercise the click handlers + the window.confirm dialog for Cancel AML.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ManualAmlPanel, type AmlDecision, type AmlRejectReason } from "./ManualAmlPanel";
import type { Payment } from "@/lib/t0/types";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pm_test_001",
    quoteId: "qt_test_001",
    currency: "EUR",
    usdAmount: 1000,
    localAmount: 920,
    beneficiaryRef: "BEN-001",
    status: "pending_aml",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("ManualAmlPanel", () => {
  const onReviewAml = vi.fn(
    async (_paymentId: string, _decision: AmlDecision, _rc: "approved" | "rejected", _reason?: AmlRejectReason): Promise<void> => {},
  );
  const onDownloadAml = vi.fn(async (_paymentId: string): Promise<void> => {});
  const onRefundAml = vi.fn(async (_paymentId: string): Promise<void> => {});

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders empty state when there are no payments at all", () => {
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-empty"');
    expect(html).toContain("No payments pending AML review");
  });

  it("does NOT mention 'Trigger AML from the OFI console' in any state", () => {
    const samples: Payment[][] = [
      [],
      [makePayment()],
      [makePayment({ status: "accepted", id: "pm_app" })],
      [makePayment({ status: "rejected", id: "pm_rej" })],
      [
        makePayment({ id: "pm_a" }),
        makePayment({ id: "pm_b", status: "accepted" }),
        makePayment({ id: "pm_c", status: "rejected" }),
      ],
    ];
    for (const payments of samples) {
      const html = renderToStaticMarkup(
        <ManualAmlPanel payments={payments} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
      );
      expect(html).not.toContain("Trigger AML from the OFI console");
    }
  });

  it("renders approved payments in their own read-only section", () => {
    const accepted = makePayment({ status: "accepted", id: "pm_app_1" });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[accepted]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-approved-section"');
    expect(html).toContain('data-testid="aml-readonly-accepted-pm_app_1"');
    expect(html).not.toContain("No payments pending AML review");
  });

  it("renders refunded payments in their own read-only section", () => {
    const refunded = makePayment({ status: "rejected", id: "pm_rej_1", refundedAt: 1_700_000_060_000 });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[refunded]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-refunded-section"');
    expect(html).toContain('data-testid="aml-refunded-row-pm_rej_1"');
  });

  it("renders three buttons on a pending_aml row", () => {
    const payment = makePayment({
      amlFile: {
        filename: "report.pdf",
        fileSize: 1024,
        fileType: "application/pdf",
        uploadedAt: 1_700_000_000_000,
      },
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-approve-pm_test_001"');
    expect(html).toContain('data-testid="aml-reject-pm_test_001"');
    expect(html).toContain('data-testid="aml-cancel-pm_test_001"');
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).toContain("Cancel AML");
  });

  it("does NOT expose any file input (OFI owns the upload, not Provider)", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('data-testid^="aml-file-input"');
    expect(html).not.toContain('data-testid^="aml-upload"');
  });

  it("shows OFI-uploaded file metadata on a pending_aml row with amlFile", () => {
    const payment = makePayment({
      id: "pm_with_file",
      amlFile: {
        filename: "report.pdf",
        fileSize: 2048,
        fileType: "application/pdf",
        uploadedAt: 1_700_000_000_000,
      },
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-file-meta-pm_with_file"');
    expect(html).toContain("report.pdf");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("from OFI");
  });

  it("formats amlFile sizes in B / KB / MB units", () => {
    const makeWith = (bytes: number, id: string): Payment =>
      makePayment({
        id,
        amlFile: {
          filename: "x",
          fileSize: bytes,
          fileType: "application/pdf",
          uploadedAt: 0,
        },
      });
    const htmlB = renderToStaticMarkup(
      <ManualAmlPanel
        payments={[makeWith(500, "pm_b")]}
        busy={false}
        onReviewAml={onReviewAml}
        onDownloadAml={onDownloadAml}
        onRefundAml={onRefundAml}
      />,
    );
    expect(htmlB).toContain("500 B");
    const htmlMB = renderToStaticMarkup(
      <ManualAmlPanel
        payments={[makeWith(2 * 1024 * 1024, "pm_mb")]}
        busy={false}
        onReviewAml={onReviewAml}
        onDownloadAml={onDownloadAml}
        onRefundAml={onRefundAml}
      />,
    );
    expect(htmlMB).toContain("2.0 MB");
  });

  it("shows legacy warning when pending_aml has no amlFile", () => {
    const payment = makePayment({ id: "pm_legacy" });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-legacy-warning-pm_legacy"');
    expect(html).toContain("legacy");
    // Buttons still available even without a file (legacy fallback).
    expect(html).toContain('data-testid="aml-approve-pm_legacy"');
    expect(html).toContain('data-testid="aml-reject-pm_legacy"');
    expect(html).toContain('data-testid="aml-cancel-pm_legacy"');
  });

  it("disables all three buttons when busy=true", () => {
    const payment = makePayment({
      amlFile: {
        filename: "x.pdf",
        fileSize: 1,
        fileType: "application/pdf",
        uploadedAt: 0,
      },
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={true} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    // Count at least 3 'disabled=""' occurrences (one per button).
    const matches = html.match(/disabled=""/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("renders the step number and title", () => {
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain("04");
    expect(html).toContain("Payment-Manual AML (Provider view)");
  });

  it("renders the updated description text", () => {
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain("OFI uploads");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).toContain("Cancel AML");
  });

  it("renders StatusDot with pending_aml status on the active row", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="status-pending_aml"');
  });

  it("hides sections that have no payments", () => {
    const pending = makePayment({ id: "pm_only_pending" });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[pending]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-active-queue"');
    expect(html).not.toContain('data-testid="aml-approved-section"');
    expect(html).not.toContain('data-testid="aml-rejected-section"');
  });

  it("rejected (not yet refunded) chip does not expose the upload UI", () => {
    const rejected = makePayment({ status: "rejected", id: "pm_only_rej", refundedAt: undefined });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[rejected]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-refundable-section"');
    expect(html).not.toContain('type="file"');
  });

  it("approved chip does not expose the upload UI", () => {
    const accepted = makePayment({ status: "accepted", id: "pm_only_app" });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[accepted]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-approved-section"');
    expect(html).not.toContain('type="file"');
  });

  it("renders Download button when amlFile is present on pending_aml row", () => {
    const payment = makePayment({
      amlFile: {
        filename: "report.pdf",
        fileSize: 1024,
        fileType: "application/pdf",
        uploadedAt: 1_700_000_000_000,
      },
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-download-pm_test_001"');
    expect(html).toContain("Download");
  });

  it("does NOT render Download button when amlFile is absent (legacy row)", () => {
    const payment = makePayment({ id: "pm_no_file" });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).not.toContain('data-testid="aml-download-pm_no_file"');
  });

  it("Download button is disabled when busy=true", () => {
    const payment = makePayment({
      amlFile: {
        filename: "x.pdf",
        fileSize: 1,
        fileType: "application/pdf",
        uploadedAt: 0,
      },
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={true} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="aml-download-pm_test_001"');
    // disabled="" should appear for the download button when busy
    expect(html).toContain('disabled=""');
  });
});

// ── Handler-driven tests (happy-dom) ────────────────────────────────────

describe("ManualAmlPanel — handler interactions", () => {
  const onReviewAml = vi.fn(async (_paymentId: string, _decision: AmlDecision, _rc: "approved" | "rejected", _reason?: AmlRejectReason): Promise<void> => {});
  const onDownloadAml = vi.fn(async (_paymentId: string): Promise<void> => {});
  const onRefundAml = vi.fn(async (_paymentId: string): Promise<void> => {});

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function makePendingPaymentWithFile(overrides: Partial<Payment> = {}): Payment {
    return {
      ...makePayment(),
      ...overrides,
      amlFile: {
        filename: "report.pdf",
        fileSize: 1024,
        fileType: "application/pdf",
        uploadedAt: 1_700_000_000_000,
      },
    };
  }

  it("clicking Approve invokes onReviewAml(paymentId, 'approve', undefined, 'approved')", () => {
    const onReviewAml = vi.fn(async (_id: string, _d: AmlDecision, _rc: "approved" | "rejected", _r?: AmlRejectReason) => {});
    const payment = makePendingPaymentWithFile({ id: "pm_ok" });
    const { getByTestId } = render(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    fireEvent.click(getByTestId("aml-approve-pm_ok"));
    expect(onReviewAml).toHaveBeenCalledTimes(1);
    // No recipientInfo → recipientVerified defaults true → recipientCheckStatus "approved"
    // JS drops trailing undefined, so only 3 args are passed
    expect(onReviewAml).toHaveBeenCalledWith("pm_ok", "approve", "approved");
  });

  it("clicking Reject invokes onReviewAml(paymentId, 'reject', 'aml_denied', 'approved')", () => {
    const onReviewAml = vi.fn(async (_id: string, _d: AmlDecision, _rc: "approved" | "rejected", _r?: AmlRejectReason) => {});
    const payment = makePendingPaymentWithFile({ id: "pm_bad" });
    const { getByTestId } = render(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    fireEvent.click(getByTestId("aml-reject-pm_bad"));
    // recipientCheckStatus before optional reason (3 args, JS drops trailing undefined)
    expect(onReviewAml).toHaveBeenCalledWith("pm_bad", "reject", "approved", "aml_denied");
  });

  it("clicking Cancel AML prompts confirm; on cancel → onReviewAml NOT called", () => {
    const onReviewAml = vi.fn(async (_id: string, _d: AmlDecision, _rc: "approved" | "rejected", _r?: AmlRejectReason) => {});
    const payment = makePendingPaymentWithFile({ id: "pm_skip" });
    // happy-dom doesn't ship window.confirm; install it before render.
    const originalConfirm = window.confirm;
    const confirmSpy = vi.fn((_msg?: string): boolean => false);
    window.confirm = confirmSpy as unknown as typeof window.confirm;

    const { getByTestId } = render(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    fireEvent.click(getByTestId("aml-cancel-pm_skip"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect((confirmSpy.mock.calls[0] as unknown as string[])[0]).toContain("Cancel AML");
    expect(onReviewAml).not.toHaveBeenCalled();
    window.confirm = originalConfirm;
  });

  it("clicking Cancel AML + confirming → onReviewAml(paymentId, 'reject')", () => {
    const onReviewAml = vi.fn(async (_id: string, _d: AmlDecision, _rc: "approved" | "rejected", _r?: AmlRejectReason) => {});
    const payment = makePendingPaymentWithFile({ id: "pm_skip_yes" });
    const originalConfirm = window.confirm;
    const confirmSpy = vi.fn((_msg?: string): boolean => true);
    window.confirm = confirmSpy as unknown as typeof window.confirm;

    const { getByTestId } = render(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={onReviewAml} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    fireEvent.click(getByTestId("aml-cancel-pm_skip_yes"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onReviewAml).toHaveBeenCalledTimes(1);
    // No recipientInfo → recipientVerified defaults true → recipientCheckStatus "approved"
    expect(onReviewAml).toHaveBeenCalledWith("pm_skip_yes", "reject", "approved", "aml_not_needed");
    window.confirm = originalConfirm;
  });

  it("clicking Download invokes onDownloadAml(paymentId)", () => {
    const onDownloadAml = vi.fn(async () => {});
    const payment = makePendingPaymentWithFile({ id: "pm_dl" });
    const { getByTestId } = render(
      <ManualAmlPanel payments={[payment]} busy={false} onReviewAml={vi.fn(async (_id: string, _d: AmlDecision, _rc: "approved" | "rejected", _r?: AmlRejectReason) => {})} onDownloadAml={onDownloadAml} onRefundAml={onRefundAml} />,
    );
    fireEvent.click(getByTestId("aml-download-pm_dl"));
    expect(onDownloadAml).toHaveBeenCalledTimes(1);
    expect(onDownloadAml).toHaveBeenCalledWith("pm_dl");
  });
});

describe("ManualAmlPanel — refund section", () => {
  const onReviewAml = vi.fn(
    async (_paymentId: string, _decision: AmlDecision, _rc: "approved" | "rejected", _reason?: AmlRejectReason): Promise<void> => {},
  );
  const onDownloadAml = vi.fn(async (_paymentId: string): Promise<void> => {});
  const onRefundAml = vi.fn(async (_paymentId: string): Promise<void> => {});

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders refundable payment with Refund button", () => {
    const refundable = makePayment({
      id: "pm_refund_1",
      status: "rejected",
      refundedAt: undefined,
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel
        payments={[refundable]}
        busy={false}
        onReviewAml={onReviewAml}
        onDownloadAml={onDownloadAml}
        onRefundAml={onRefundAml}
      />,
    );
    expect(html).toContain('data-testid="aml-refundable-section"');
    expect(html).toContain('data-testid="aml-refundable-row-pm_refund_1"');
    expect(html).toContain('data-testid="aml-refund-pm_refund_1"');
    expect(html).toContain("Refund");
  });

  it("renders refunded payment without Refund button, shows ✓ Refunded at", () => {
    const refunded = makePayment({
      id: "pm_refunded_1",
      status: "rejected",
      refundedAt: 1_700_000_060_000,
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel
        payments={[refunded]}
        busy={false}
        onReviewAml={onReviewAml}
        onDownloadAml={onDownloadAml}
        onRefundAml={onRefundAml}
      />,
    );
    expect(html).toContain('data-testid="aml-refunded-section"');
    expect(html).toContain('data-testid="aml-refunded-row-pm_refunded_1"');
    expect(html).not.toContain('data-testid="aml-refund-pm_refunded_1"');
    expect(html).toContain("✓ Refunded at");
  });

  it("Refund button is disabled when busy", () => {
    const refundable = makePayment({
      id: "pm_refund_busy",
      status: "rejected",
      refundedAt: undefined,
    });
    const html = renderToStaticMarkup(
      <ManualAmlPanel
        payments={[refundable]}
        busy={true}
        onReviewAml={onReviewAml}
        onDownloadAml={onDownloadAml}
        onRefundAml={onRefundAml}
      />,
    );
    expect(html).toContain('data-testid="aml-refund-pm_refund_busy"');
    expect(html).toContain("disabled");
  });

  it("Refund button calls onRefundAml with paymentId", () => {
    const refundable = makePayment({
      id: "pm_refund_click",
      status: "rejected",
      refundedAt: undefined,
    });
    const { getByTestId } = render(
      <ManualAmlPanel
        payments={[refundable]}
        busy={false}
        onReviewAml={onReviewAml}
        onDownloadAml={onDownloadAml}
        onRefundAml={onRefundAml}
      />,
    );
    fireEvent.click(getByTestId("aml-refund-pm_refund_click"));
    expect(onRefundAml).toHaveBeenCalledTimes(1);
    expect(onRefundAml).toHaveBeenCalledWith("pm_refund_click");
  });
});