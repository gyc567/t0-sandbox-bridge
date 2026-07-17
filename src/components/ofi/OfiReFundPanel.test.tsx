// OfiReFundPanel.test.tsx — component tests for the OFI ReFund panel
// (Phase 7 follow-up).
//
// Tests cover: empty state, Awaiting Refund section, Refunded section,
// legacy payment display (no rejectedAt), and correct row rendering.
//
// NOTE: renderToStaticMarkup strips data-testid attributes and does not
// apply CSS truncation classes. All assertions use text content.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfiReFundPanel } from "./OfiReFundPanel";
import type { Payment } from "@/lib/t0/types";

function render(payments: Payment[]) {
  return renderToStaticMarkup(<OfiReFundPanel payments={payments} />);
}

const basePayment: Payment = {
  id: "pm_test",
  quoteId: "qt_testquoteid123456",
  currency: "EUR",
  usdAmount: 1000,
  localAmount: 900,
  beneficiaryRef: "BEN-DEMO-001",
  status: "rejected",
  createdAt: 1_700_000_000_000,
};

describe("OfiReFundPanel — empty state", () => {
  it("shows empty message when no rejected payments", () => {
    const html = render([]);
    expect(html).toContain("No rejected payments.");
    expect(html).toContain("Tracks AML-rejected payments");
  });

  it("does not render section headings when list is empty", () => {
    const html = render([]);
    expect(html).not.toContain("Awaiting Refund");
    expect(html).not.toContain("Refunded");
  });
});

describe("OfiReFundPanel — Awaiting Refund section", () => {
  const awaiting: Payment = {
    ...basePayment,
    id: "pm_awaiting",
    rejectedAt: 1_700_000_000_000,
    rejectedReason: "aml_denied",
    refundedAt: null,
  };

  it("renders the Awaiting Refund heading with count", () => {
    const html = render([awaiting]);
    expect(html).toContain("Awaiting Refund (1)");
  });

  it("shows 'Awaiting Refund' text badge (not 'Refunded ✓')", () => {
    const html = render([awaiting]);
    expect(html).toContain("Awaiting Refund");
    expect(html).not.toContain("Refunded");
  });

  it("renders the payment id", () => {
    const html = render([awaiting]);
    expect(html).toContain("pm_awaiting");
  });

  it("displays the rejected reason label 'AML Denied'", () => {
    const html = render([awaiting]);
    expect(html).toContain("AML Denied");
  });

  it("shows quoteId, local amount, USD amount, beneficiary ref", () => {
    const html = render([awaiting]);
    // Component truncates quoteId to 16 chars: slice(0,16) + "…"
    expect(html).toContain("qt_testquoteid12…");
    expect(html).toContain("EUR");
    expect(html).toContain("900.00");
    expect(html).toContain("$1,000");
    expect(html).toContain("BEN-DEMO-001");
  });

  it("does NOT show a refund timestamp when refundedAt is null", () => {
    const html = render([awaiting]);
    expect(html).not.toContain("Refunded");
    expect(html).not.toContain("(30m)");
  });
});

describe("OfiReFundPanel — Refunded section", () => {
  const refunded: Payment = {
    ...basePayment,
    id: "pm_refunded",
    rejectedAt: 1_700_000_000_000,
    rejectedReason: "aml_not_needed",
    refundedAt: 1_700_000_000_000 + 30 * 60 * 1000, // 30 min later
  };

  it("renders the Refunded heading with count", () => {
    const html = render([refunded]);
    expect(html).toContain("Refunded (1)");
  });

  it("shows 'Refunded ✓' badge", () => {
    const html = render([refunded]);
    expect(html).toContain("Refunded ✓");
  });

  it("shows refund duration (30m) next to the badge", () => {
    const html = render([refunded]);
    expect(html).toContain("(30m)");
  });

  it("shows 'AML Not Needed' reason", () => {
    const html = render([refunded]);
    expect(html).toContain("AML Not Needed");
  });
});

describe("OfiReFundPanel — mixed state (awaiting + refunded)", () => {
  const awaiting: Payment = {
    ...basePayment,
    id: "pm_mix_await",
    rejectedAt: 1_700_000_000_000,
    refundedAt: null,
  };
  const refunded: Payment = {
    ...basePayment,
    id: "pm_mix_ref",
    rejectedAt: 1_700_000_000_000,
    refundedAt: 1_700_000_000_000 + 30 * 60 * 1000,
  };

  it("renders both section headings when both states are present", () => {
    const html = render([awaiting, refunded]);
    expect(html).toContain("Awaiting Refund (1)");
    expect(html).toContain("Refunded (1)");
  });
});

describe("OfiReFundPanel — legacy payment (rejectedAt undefined)", () => {
  // A payment created before the rejectedAt field was added — rejectedAt is
  // undefined (not null). The panel must not crash and must display it as
  // awaiting refund with no duration.
  const legacy: Payment = {
    ...basePayment,
    id: "pm_legacy",
    rejectedAt: undefined,
    refundedAt: undefined,
  };

  it("renders without crashing", () => {
    const html = render([legacy]);
    expect(html).toContain("pm_legacy");
  });

  it("shows 'Awaiting Refund' (since refundedAt is falsy)", () => {
    const html = render([legacy]);
    expect(html).toContain("Awaiting Refund");
  });

  it("does not render a refund timestamp or duration", () => {
    const html = render([legacy]);
    expect(html).not.toContain("Refunded");
  });

  it("renders the payment row", () => {
    const html = render([legacy]);
    // Should show basic info without crashing
    expect(html).toContain("EUR");
    expect(html).toContain("$1,000");
    expect(html).toContain("BEN-DEMO-001");
  });
});
