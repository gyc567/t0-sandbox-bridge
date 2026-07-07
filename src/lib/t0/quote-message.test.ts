import { describe, it, expect } from "vitest";
import { formatQuoteFailure } from "./quote-message";

describe("formatQuoteFailure", () => {
  it("explains REASON_NO_QUOTE_AVAILABLE with a hint to use the Provider console", () => {
    const m = formatQuoteFailure("REASON_NO_QUOTE_AVAILABLE");
    expect(m.title).toMatch(/no live quote/i);
    expect(m.detail).toMatch(/Provider/);
    expect(m.detail).toMatch(/\/provider/);
  });

  it("explains REASON_LIMIT_EXCEEDED with a hint to reduce the amount or widen the band", () => {
    const m = formatQuoteFailure("REASON_LIMIT_EXCEEDED");
    expect(m.title).toMatch(/exceeds/i);
    expect(m.detail).toMatch(/smaller/i);
  });

  it("explains REASON_CURRENCY_NOT_SUPPORTED without referring the user to login", () => {
    const m = formatQuoteFailure("REASON_CURRENCY_NOT_SUPPORTED");
    expect(m.title).toMatch(/not supported/i);
    expect(m.detail).toMatch(/dropdown/);
  });

  it("explains REASON_INVALID_AMOUNT concisely", () => {
    const m = formatQuoteFailure("REASON_INVALID_AMOUNT");
    expect(m.title).toMatch(/invalid amount/i);
    expect(m.detail.length).toBeGreaterThan(0);
  });

  it("explains REASON_INVALID_QUOTE_ID with a re-fetch hint", () => {
    const m = formatQuoteFailure("REASON_INVALID_QUOTE_ID");
    expect(m.title).toMatch(/not found/i);
    expect(m.detail).toMatch(/Get Quote/);
  });

  it("explains REASON_QUOTE_EXPIRED and tells the user quotes are short-lived", () => {
    const m = formatQuoteFailure("REASON_QUOTE_EXPIRED");
    expect(m.title).toMatch(/expired/i);
    expect(m.detail).toMatch(/60/);
  });
});
