// ProviderReFundPanel.test.tsx — React component tests for the Provider ReFund tab.
//
// Refund sub-sections migrated from ManualAmlPanel so AML review and
// refund bookkeeping each live in their own dedicated tab.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ProviderReFundPanel } from "./ProviderReFundPanel";
import type { Payment } from "@/lib/t0/types";

// Generic payment factory for non-rejected statuses
function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pm_generic",
    quoteId: "qt_generic",
    currency: "EUR",
    usdAmount: 1000,
    localAmount: 920,
    beneficiaryRef: "BEN-001",
    status: "pending_aml",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// Rejected payment with refundedAt already set (terminal refunded state)
function makeRefundedPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pm_ref_001",
    quoteId: "qt_test_001",
    currency: "EUR",
    usdAmount: 1000,
    localAmount: 920,
    beneficiaryRef: "BEN-001",
    status: "rejected",
    rejectedReason: "aml_denied",
    rejectedAt: 1_700_000_000_000,
    refundedAt: 1_700_000_060_000,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// Rejected payment awaiting refund (refundedAt undefined)
function makeRejectedPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pm_rej_001",
    quoteId: "qt_test_001",
    currency: "EUR",
    usdAmount: 1000,
    localAmount: 920,
    beneficiaryRef: "BEN-001",
    status: "rejected",
    rejectedReason: "aml_denied",
    rejectedAt: 1_700_000_000_000,
    refundedAt: undefined,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("ProviderReFundPanel", () => {
  const onRefundAml = vi.fn(async (_paymentId: string): Promise<void> => {});

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders empty state when there are no rejected payments", () => {
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-empty"');
    expect(html).toContain("No rejected payments");
  });

  it("does NOT render refund sections when all payments are pending_aml or accepted", () => {
    // Direct object literals to guarantee correct status values (no factory confusion).
    const payments: Payment[] = [
      {
        id: "pm_not_rejected",
        quoteId: "qt_1",
        currency: "EUR",
        usdAmount: 1000,
        localAmount: 920,
        beneficiaryRef: "BEN",
        status: "pending_aml",
        createdAt: 1_700_000_000_000,
      },
      {
        id: "pm_accepted",
        quoteId: "qt_2",
        currency: "EUR",
        usdAmount: 1000,
        localAmount: 920,
        beneficiaryRef: "BEN",
        status: "accepted",
        createdAt: 1_700_000_000_000,
      },
    ];
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={payments} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-empty"');
    expect(html).not.toContain('data-testid="refund-awaiting-section"');
    expect(html).not.toContain('data-testid="refund-refunded-section"');
  });

  it("renders awaiting refund row with Refund button", () => {
    const awaiting = makeRejectedPayment({ id: "pm_await", refundedAt: undefined });
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[awaiting]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-awaiting-section"');
    expect(html).toContain('data-testid="refund-awaiting-row-pm_await"');
    expect(html).toContain('data-testid="refund-btn-pm_await"');
    expect(html).toContain("Refund");
  });

  it("renders refunded row without Refund button", () => {
    const refunded = makeRejectedPayment({
      id: "pm_done",
      refundedAt: 1_700_000_060_000,
    });
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[refunded]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-refunded-section"');
    expect(html).toContain('data-testid="refund-refunded-row-pm_done"');
    expect(html).not.toContain('data-testid="refund-btn-pm_done"');
  });

  it("Refund button is disabled when busy=true", () => {
    const awaiting = makeRejectedPayment({ id: "pm_busy", refundedAt: undefined });
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[awaiting]} busy={true} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-btn-pm_busy"');
    expect(html).toContain("disabled");
  });

  it("renders correct section counts", () => {
    const payments = [
      makeRejectedPayment({ id: "pm_w1", refundedAt: undefined }),
      makeRejectedPayment({ id: "pm_w2", refundedAt: undefined }),
      makeRejectedPayment({ id: "pm_r1", refundedAt: 1_700_000_060_000 }),
    ];
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={payments} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain("Awaiting Refund (2)");
    expect(html).toContain("Refunded (1)");
  });

  it("shows rejected reason label", () => {
    const awaiting = makeRejectedPayment({
      id: "pm_reason",
      refundedAt: undefined,
      rejectedReason: "aml_denied",
      rejectedAt: 1_700_000_000_000,
    });
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[awaiting]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain("AML Denied");
    expect(html).not.toContain("aml_denied"); // uses label map
  });

  it("shows 'AML Not Needed' for aml_not_needed reason", () => {
    const awaiting = makeRejectedPayment({
      id: "pm_not_needed",
      refundedAt: undefined,
      rejectedReason: "aml_not_needed",
    });
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[awaiting]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain("AML Not Needed");
  });

  it("shows refunded amount in the refunded row", () => {
    const refunded = makeRejectedPayment({
      id: "pm_amount",
      usdAmount: 5000,
      refundedAt: 1_700_000_060_000,
    });
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[refunded]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-amount-pm_amount"');
    expect(html).toContain("$5,000 refunded");
  });

  it("renders the step number and title", () => {
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain("05");
    expect(html).toContain("ReFund");
  });

  it("description mentions AML-rejected and Refund action", () => {
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain("AML-rejected");
    expect(html).toContain("Refund");
  });
});

describe("ProviderReFundPanel — handler interactions", () => {
  const onRefundAml = vi.fn(async (_paymentId: string): Promise<void> => {});

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("clicking Refund button calls onRefundAml with the correct paymentId", () => {
    const awaiting = makeRejectedPayment({ id: "pm_click", refundedAt: undefined });
    const { getByTestId } = render(
      <ProviderReFundPanel payments={[awaiting]} busy={false} onRefundAml={onRefundAml} />,
    );
    fireEvent.click(getByTestId("refund-btn-pm_click"));
    expect(onRefundAml).toHaveBeenCalledTimes(1);
    expect(onRefundAml).toHaveBeenCalledWith("pm_click");
  });

  it("Refund button is disabled when busy", () => {
    const awaiting = makeRejectedPayment({ id: "pm_no_click", refundedAt: undefined });
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={[awaiting]} busy={true} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-btn-pm_no_click"');
    expect(html).toContain("disabled");
  });

  it("only awaiting-refund rows have a Refund button", () => {
    const payments = [
      makeRejectedPayment({ id: "pm_await_row", refundedAt: undefined }),
      makeRejectedPayment({ id: "pm_refunded_row", refundedAt: 1_700_000_060_000 }),
    ];
    const html = renderToStaticMarkup(
      <ProviderReFundPanel payments={payments} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(html).toContain('data-testid="refund-btn-pm_await_row"');
    expect(html).not.toContain('data-testid="refund-btn-pm_refunded_row"');
  });

  it("refunded rows do not call onRefundAml even if clicked (no button exists)", () => {
    const refunded = makeRejectedPayment({ id: "pm_ref_row", refundedAt: 1_700_000_060_000 });
    const { queryByTestId } = render(
      <ProviderReFundPanel payments={[refunded]} busy={false} onRefundAml={onRefundAml} />,
    );
    expect(queryByTestId("refund-btn-pm_ref_row")).toBeNull();
  });
});
