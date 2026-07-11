import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuoteManagementTabs } from "./QuoteManagementTabs";

describe("QuoteManagementTabs", () => {
  it("renders Quote management as the selected tab with its quote content", () => {
    const html = renderToStaticMarkup(
      <QuoteManagementTabs>
        <section data-testid="get-quote">Get Quote content</section>
      </QuoteManagementTabs>,
    );

    expect(html).toContain("Quote management");
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('data-testid="get-quote"');
  });

  it("uses a vertical tab rail on desktop and a stacked layout on small screens", () => {
    const html = renderToStaticMarkup(
      <QuoteManagementTabs>
        <p>Quote</p>
      </QuoteManagementTabs>,
    );

    expect(html).toContain("md:grid-cols-[220px_minmax(0,1fr)]");
    expect(html).toContain("md:flex-col");
  });
});
