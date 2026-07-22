// countries.test.ts — unit tests for countries list and helpers
//
// 100% branch coverage for:
// - SUPPORTED_COUNTRIES array integrity
// - isSupportedCountry type-guard (true/false branches)
// - getCountryLabel (found/not-found branches)
// - CountryCode union derivation

import { describe, it, expect } from "vitest";
import {
  SUPPORTED_COUNTRIES,
  isSupportedCountry,
  getCountryLabel,
  type CountryCode,
} from "./countries";

describe("SUPPORTED_COUNTRIES", () => {
  it("contains expected entries", () => {
    const codes = SUPPORTED_COUNTRIES.map((c) => c.code);
    expect(codes).toContain("US");
    expect(codes).toContain("CN");
    expect(codes).toContain("GB");
    expect(codes).toContain("DE");
    expect(codes).toContain("JP");
  });

  it("each entry has non-empty code and label", () => {
    for (const country of SUPPORTED_COUNTRIES) {
      expect(country.code).toBeTruthy();
      expect(country.label).toBeTruthy();
    }
  });

  it("codes are unique", () => {
    const codes = SUPPORTED_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("codes are uppercase ISO 3166-1 alpha-2", () => {
    for (const country of SUPPORTED_COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("isSupportedCountry", () => {
  it("returns true for supported country code", () => {
    expect(isSupportedCountry("US")).toBe(true);
    expect(isSupportedCountry("CN")).toBe(true);
    expect(isSupportedCountry("DE")).toBe(true);
  });

  it("returns false for unsupported code", () => {
    expect(isSupportedCountry("XX")).toBe(false);
    expect(isSupportedCountry("us")).toBe(false); // lowercase
    expect(isSupportedCountry("")).toBe(false);
    expect(isSupportedCountry("USA")).toBe(false); // 3-letter
  });
});

describe("getCountryLabel", () => {
  it("returns label for supported country", () => {
    expect(getCountryLabel("US")).toBe("United States");
    expect(getCountryLabel("CN")).toBe("China");
    expect(getCountryLabel("GB")).toBe("United Kingdom");
    expect(getCountryLabel("DE")).toBe("Germany");
    expect(getCountryLabel("JP")).toBe("Japan");
  });

  it("returns code itself when not found", () => {
    expect(getCountryLabel("XX" as CountryCode)).toBe("XX");
    expect(getCountryLabel("ZZ" as CountryCode)).toBe("ZZ");
  });
});

describe("CountryCode type", () => {
  it("is a union of all country codes", () => {
    const code: CountryCode = "US";
    expect(code).toBe("US");
    // TypeScript would reject: const invalid: CountryCode = "XX";
  });
});
