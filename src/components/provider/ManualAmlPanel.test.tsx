// ManualAmlPanel.test.tsx — React component tests for the Provider AML panel.
// Uses renderToStaticMarkup (server-side rendering) to avoid happy-dom/JSDOM
// dependencies and keep tests fast and deterministic.

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ManualAmlPanel } from "./ManualAmlPanel";
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
  const onUploadAndReview = vi.fn();

  it("renders empty state when no pending_aml payments", () => {
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain("No payments pending AML review");
    expect(html).toContain("Trigger AML from the OFI console");
  });

  it("renders empty state when payments have other statuses", () => {
    const accepted = makePayment({ status: "accepted" });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[accepted]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain("No payments pending AML review");
  });

  it("renders pending_aml payment details", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain("pm_test_001");
    expect(html).toContain("EUR");
    expect(html).toContain("BEN-001");
    expect(html).toContain("920.00");
  });

  it("renders file input for each pending_aml payment", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain('type="file"');
    expect(html).toContain('data-testid="aml-file-input-pm_test_001"');
    expect(html).toContain('accept=".pdf,image/png,image/jpeg,image/jpg"');
  });

  it("renders upload button with correct test id", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain('data-testid="aml-upload-pm_test_001"');
    expect(html).toContain("Upload &amp; Review");
  });

  it("disables upload button when busy", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={true} onUploadAndReview={onUploadAndReview} />,
    );
    // When busy, both file input and button should be disabled
    expect(html).toContain('disabled=""');
  });

  it("renders multiple pending_aml payments", () => {
    const p1 = makePayment({ id: "pm_1" });
    const p2 = makePayment({ id: "pm_2" });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[p1, p2]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain('data-testid="aml-file-input-pm_1"');
    expect(html).toContain('data-testid="aml-file-input-pm_2"');
    expect(html).toContain('data-testid="aml-upload-pm_1"');
    expect(html).toContain('data-testid="aml-upload-pm_2"');
  });

  it("renders the step number and title", () => {
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain("04");
    expect(html).toContain("Payment-Manual AML (Provider view)");
  });

  it("renders payment quote and USD amount", () => {
    const payment = makePayment({ quoteId: "qt_abc123_xyz", usdAmount: 5000 });
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain("qt_abc123_xyz");
    expect(html).toContain("USD: $5,000");
  });

  it("renders description text", () => {
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain("Payments awaiting manual AML review");
    expect(html).toContain("Upload &amp; Review");
    expect(html).toContain("Last Look");
  });

  it("renders StatusDot with pending_aml status", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain('data-testid="status-pending_aml"');
  });

  it("renders file input label", () => {
    const payment = makePayment();
    const html = renderToStaticMarkup(
      <ManualAmlPanel payments={[payment]} busy={false} onUploadAndReview={onUploadAndReview} />,
    );
    expect(html).toContain("AML Document");
  });
});
