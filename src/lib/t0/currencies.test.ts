import { describe, it, expect } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  getCurrencyLabel,
  type Currency,
} from "./currencies";

describe("SUPPORTED_CURRENCIES", () => {
  it("is a non-empty list of mainstream world currencies", () => {
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThan(20);
  });

  it("starts with the most-trafficked corridors (USD, EUR, GBP)", () => {
    const head = SUPPORTED_CURRENCIES.slice(0, 3).map((c) => c.code);
    expect(head).toEqual(["USD", "EUR", "GBP"]);
  });

  it("includes all the legacy sandbox currencies (backward compat)", () => {
    const required = ["USD", "EUR", "GBP", "CNH", "MXN", "BRL", "NGN", "INR"];
    for (const code of required) {
      expect(SUPPORTED_CURRENCIES.some((c) => c.code === code)).toBe(true);
    }
  });

  it("covers the major G7 currencies", () => {
    const g7 = ["USD", "EUR", "GBP", "JPY", "CAD"];
    for (const code of g7) {
      expect(SUPPORTED_CURRENCIES.some((c) => c.code === code)).toBe(true);
    }
  });

  it("has unique codes (no duplicates)", () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("maps each code to exactly one country", () => {
    // CNH and CNY both originate from China (CN); HKD originates from Hong Kong (HK).
    // Every (code, country) pair must be unique, but multiple codes can share a country.
    const pairs = SUPPORTED_CURRENCIES.map((c) => `${c.code}:${c.country}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("uses uppercase ISO 4217 codes only", () => {
    for (const entry of SUPPORTED_CURRENCIES) {
      expect(entry.code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("uses uppercase ISO 3166-1 alpha-2 countries only", () => {
    for (const entry of SUPPORTED_CURRENCIES) {
      expect(entry.country).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("has a non-empty label for every entry", () => {
    for (const entry of SUPPORTED_CURRENCIES) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe("isSupportedCurrency", () => {
  it("returns true for every code in SUPPORTED_CURRENCIES", () => {
    for (const entry of SUPPORTED_CURRENCIES) {
      expect(isSupportedCurrency(entry.code)).toBe(true);
    }
  });

  it("returns false for an unknown code", () => {
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
    expect(isSupportedCurrency("JAPAN")).toBe(false);
  });

  it("is case-sensitive (T-0 expects uppercase per ISO 4217)", () => {
    expect(isSupportedCurrency("usd")).toBe(false);
    expect(isSupportedCurrency("Usd")).toBe(false);
  });

  it("narrows the type (compile-time check via assertion)", () => {
    const code: string = "EUR";
    if (isSupportedCurrency(code)) {
      // After the guard, TypeScript knows `code` is a Currency.
      const _typed: Currency = code;
      expect(_typed).toBe("EUR");
    }
  });
});

describe("getCurrencyLabel", () => {
  it("returns the human-readable label for a known currency", () => {
    expect(getCurrencyLabel("USD")).toBe("US Dollar");
    expect(getCurrencyLabel("EUR")).toBe("Euro");
    expect(getCurrencyLabel("GBP")).toBe("Pound Sterling");
    expect(getCurrencyLabel("JPY")).toBe("Japanese Yen");
    expect(getCurrencyLabel("CNH")).toBe("Offshore Yuan");
  });

  it("falls back to the code itself when the label is missing", () => {
    // Defensive fallback: if a code somehow isn't in the table, the UI
    // should still show *something* rather than crashing.
    expect(getCurrencyLabel("ZZZ" as Currency)).toBe("ZZZ");
  });
});
