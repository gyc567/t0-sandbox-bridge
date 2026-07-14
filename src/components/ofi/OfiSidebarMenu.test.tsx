// OfiSidebarMenu.test.tsx — tests for the OFI sidebar tab component
// (Phase 7 follow-up: defaultTab prop).
//
// The defaultTab wiring is the new behavior; we cover it via SSR. The
// underlying Radix Tabs interactions (onValueChange, click handlers)
// are Radix's responsibility and are not re-tested here.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { OfiSidebarMenu } from "./OfiSidebarMenu";

function renderSidebar(defaultTab?: string): string {
  return renderToStaticMarkup(
    <OfiSidebarMenu
      {...(defaultTab ? { defaultTab: defaultTab as never } : {})}
      fundingContent={<div data-testid="funding">funding</div>}
      paymentPreSettlementContent={<div data-testid="pps">pps</div>}
      paymentContinuedContent={<div data-testid="pc">pc</div>}
      paymentManualAmlContent={<div data-testid="aml">aml</div>}
    >
      <div data-testid="quote">quote</div>
    </OfiSidebarMenu>,
  );
}

describe("OfiSidebarMenu — defaultTab prop (SSR)", () => {
  it("defaults to 'quote-management' when no defaultTab is passed", () => {
    const html = renderSidebar();
    expect(html).toContain("Quote management");
    expect(html).toContain("Payment-Manual AML");
    expect((html.match(/role="tab"/g) ?? []).length).toBe(5);
    expect(html).toMatch(
      /<button[^>]*data-state="active"[^>]*>[\s\S]*?Quote management[\s\S]*?<\/button>/,
    );
  });

  it("opens the Payment-Manual AML tab when defaultTab='payment-manual-aml'", () => {
    const html = renderSidebar("payment-manual-aml");
    expect(html).toMatch(
      /<button[^>]*data-state="active"[^>]*>[\s\S]*?Payment-Manual AML[\s\S]*?<\/button>/,
    );
    expect(html).not.toMatch(
      /<button[^>]*data-state="active"[^>]*>[\s\S]*?Quote management[\s\S]*?<\/button>/,
    );
  });

  it("opens the Quote management tab when defaultTab='quote-management' (explicit)", () => {
    const html = renderSidebar("quote-management");
    expect(html).toMatch(
      /<button[^>]*data-state="active"[^>]*>[\s\S]*?Quote management[\s\S]*?<\/button>/,
    );
  });

  it("exposes all 5 tab labels", () => {
    const html = renderSidebar();
    expect(html).toContain("Quote management");
    expect(html).toContain("Payment-Pre-Settlement");
    expect(html).toContain("Payment-Payment Continued");
    expect(html).toContain("Payment-Manual AML");
    expect(html).toContain("Funding &amp; Capacity");
  });
});