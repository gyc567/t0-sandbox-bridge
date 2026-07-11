// read-model/-types.test.ts — 100% coverage on read-model/types.ts

import { describe, it, expect } from "vitest";
import {
  DECIMAL_ZERO,
  decimalAdd,
  decimalCompare,
  decimalGte,
  decimalSub,
  decimalToNumber,
  decimalToString,
  isDecimal,
  toDecimal,
  type Decimal,
} from "./types";

// ── isDecimal ──────────────────────────────────────────────────────────

describe("isDecimal", () => {
  it("accepts canonical Decimal objects", () => {
    expect(isDecimal({ unscaled: "100", exponent: 0 })).toBe(true);
    expect(isDecimal({ unscaled: "-50", exponent: -2 })).toBe(true);
    expect(isDecimal({ unscaled: "0", exponent: 5 })).toBe(true);
  });

  it("accepts numeric unscaled for proto tolerance", () => {
    expect(isDecimal({ unscaled: 100, exponent: 0 })).toBe(true);
    expect(isDecimal({ unscaled: -1, exponent: 0 })).toBe(true);
  });

  it("rejects null and non-objects", () => {
    expect(isDecimal(null)).toBe(false);
    expect(isDecimal(undefined)).toBe(false);
    expect(isDecimal("Decimal")).toBe(false);
    expect(isDecimal(123)).toBe(false);
  });

  it("rejects when unscaled is missing or non-numeric", () => {
    expect(isDecimal({ exponent: 0 })).toBe(false);
    expect(isDecimal({ unscaled: "abc", exponent: 0 })).toBe(false);
    expect(isDecimal({ unscaled: "1.5", exponent: 0 })).toBe(false);
    expect(isDecimal({ unscaled: "1e2", exponent: 0 })).toBe(false);
    expect(isDecimal({ unscaled: true, exponent: 0 })).toBe(false);
    expect(isDecimal({ unscaled: "", exponent: 0 })).toBe(false);
  });

  it("rejects when exponent is missing or non-integer", () => {
    expect(isDecimal({ unscaled: "1" })).toBe(false);
    expect(isDecimal({ unscaled: "1", exponent: -1.5 })).toBe(false);
    expect(isDecimal({ unscaled: "1", exponent: "0" })).toBe(false);
  });

  it("trims whitespace in numeric unscaled", () => {
    // isDecimal is lenient about surrounding whitespace on unscaled — this
    // is convenient when callers hand us JSON-decoded strings with stray
    // padding.
    expect(isDecimal({ unscaled: " 1", exponent: 0 })).toBe(true);
    expect(isDecimal({ unscaled: "1 ", exponent: 0 })).toBe(true);
    expect(isDecimal({ unscaled: " -7 ", exponent: 0 })).toBe(true);
  });

  it("rejects internal whitespace", () => {
    expect(isDecimal({ unscaled: "1 1", exponent: 0 })).toBe(false);
    expect(isDecimal({ unscaled: "1\t1", exponent: 0 })).toBe(false);
  });
});

// ── toDecimal ──────────────────────────────────────────────────────────

describe("toDecimal", () => {
  it("passes through valid Decimal objects unchanged", () => {
    const d: Decimal = { unscaled: "100", exponent: -2 };
    expect(toDecimal(d)).toBe(d);
  });

  it("converts integer numbers", () => {
    expect(toDecimal(0)).toEqual({ unscaled: "0", exponent: 0 });
    expect(toDecimal(42)).toEqual({ unscaled: "42", exponent: 0 });
    expect(toDecimal(-7)).toEqual({ unscaled: "-7", exponent: 0 });
  });

  it("converts integer strings", () => {
    expect(toDecimal("0")).toEqual({ unscaled: "0", exponent: 0 });
    expect(toDecimal("123")).toEqual({ unscaled: "123", exponent: 0 });
    expect(toDecimal("-9")).toEqual({ unscaled: "-9", exponent: 0 });
    expect(toDecimal(" 42 ")).toEqual({ unscaled: "42", exponent: 0 });
  });

  it("rejects non-finite numbers", () => {
    expect(() => toDecimal(NaN)).toThrow(/finite/);
    expect(() => toDecimal(Infinity)).toThrow(/finite/);
    expect(() => toDecimal(-Infinity)).toThrow(/finite/);
  });

  it("rejects fractional numbers", () => {
    expect(() => toDecimal(1.5)).toThrow(/integer/);
    expect(() => toDecimal(-0.1)).toThrow(/integer/);
  });

  it("rejects non-integer strings", () => {
    expect(() => toDecimal("1.5")).toThrow(/integer string/);
    expect(() => toDecimal("abc")).toThrow(/integer string/);
    expect(() => toDecimal("")).toThrow(/integer string/);
    expect(() => toDecimal("1e2")).toThrow(/integer string/);
  });

  it("rejects unsupported types", () => {
    expect(() => toDecimal(true as unknown as string)).toThrow(/unsupported/);
    expect(() => toDecimal(null as unknown as string)).toThrow(/unsupported/);
    expect(() => toDecimal(undefined as unknown as string)).toThrow(/unsupported/);
    expect(() => toDecimal({} as unknown as string)).toThrow(/unsupported/);
  });
});

// ── decimalToNumber ────────────────────────────────────────────────────

describe("decimalToNumber", () => {
  it("returns the unscaled when exponent is 0", () => {
    expect(decimalToNumber({ unscaled: "0", exponent: 0 })).toBe(0);
    expect(decimalToNumber({ unscaled: "42", exponent: 0 })).toBe(42);
    expect(decimalToNumber({ unscaled: "-7", exponent: 0 })).toBe(-7);
  });

  it("scales by 10^exponent", () => {
    expect(decimalToNumber({ unscaled: "86", exponent: -2 })).toBeCloseTo(0.86);
    expect(decimalToNumber({ unscaled: "1000", exponent: 3 })).toBe(1_000_000);
    expect(decimalToNumber({ unscaled: "-50", exponent: -2 })).toBeCloseTo(-0.5);
  });

  it("throws when unscaled is not finite", () => {
    expect(() =>
      decimalToNumber({ unscaled: "1".repeat(400), exponent: 0 }),
    ).toThrow(/finite/);
  });
});

// ── decimalToString ────────────────────────────────────────────────────

describe("decimalToString", () => {
  it("emits integer values without a decimal point", () => {
    expect(decimalToString({ unscaled: "0", exponent: 0 })).toBe("0");
    expect(decimalToString({ unscaled: "42", exponent: 0 })).toBe("42");
    expect(decimalToString({ unscaled: "-7", exponent: 0 })).toBe("-7");
  });

  it("emits positive exponent by appending zeros", () => {
    expect(decimalToString({ unscaled: "1", exponent: 3 })).toBe("1000");
    expect(decimalToString({ unscaled: "-2", exponent: 2 })).toBe("-200");
  });

  it("emits negative exponent with decimal point", () => {
    expect(decimalToString({ unscaled: "86", exponent: -2 })).toBe("0.86");
    expect(decimalToString({ unscaled: "-86", exponent: -2 })).toBe("-0.86");
  });

  it("pads the fractional part with leading zeros when needed", () => {
    expect(decimalToString({ unscaled: "5", exponent: -3 })).toBe("0.005");
    expect(decimalToString({ unscaled: "5", exponent: -1 })).toBe("0.5");
  });
});

// ── decimalCompare / decimalGte ────────────────────────────────────────

describe("decimalCompare", () => {
  it("compares equal integers", () => {
    expect(
      decimalCompare({ unscaled: "5", exponent: 0 }, { unscaled: "5", exponent: 0 }),
    ).toBe(0);
  });

  it("orders same-exponent integers by magnitude", () => {
    expect(
      decimalCompare({ unscaled: "1", exponent: 0 }, { unscaled: "2", exponent: 0 }),
    ).toBeLessThan(0);
    expect(
      decimalCompare({ unscaled: "9", exponent: 0 }, { unscaled: "1", exponent: 0 }),
    ).toBeGreaterThan(0);
  });

  it("respects sign with same exponent", () => {
    expect(
      decimalCompare({ unscaled: "-5", exponent: 0 }, { unscaled: "5", exponent: 0 }),
    ).toBeLessThan(0);
    expect(
      decimalCompare({ unscaled: "5", exponent: 0 }, { unscaled: "-5", exponent: 0 }),
    ).toBeGreaterThan(0);
  });

  it("compares aligned exponents", () => {
    expect(
      decimalCompare({ unscaled: "86", exponent: -2 }, { unscaled: "100", exponent: -2 }),
    ).toBeLessThan(0);
    expect(
      decimalCompare({ unscaled: "150", exponent: -2 }, { unscaled: "100", exponent: -2 }),
    ).toBeGreaterThan(0);
  });

  it("scales exponents before comparing", () => {
    expect(
      decimalCompare({ unscaled: "1", exponent: 0 }, { unscaled: "100", exponent: -2 }),
    ).toBe(0);
    expect(
      decimalCompare({ unscaled: "1", exponent: 0 }, { unscaled: "99", exponent: -2 }),
    ).toBeGreaterThan(0);
    expect(
      decimalCompare({ unscaled: "1", exponent: 0 }, { unscaled: "101", exponent: -2 }),
    ).toBeLessThan(0);
  });

  it("compares across large exponents", () => {
    expect(
      decimalCompare({ unscaled: "1", exponent: 6 }, { unscaled: "1", exponent: 0 }),
    ).toBeGreaterThan(0);
    expect(
      decimalCompare({ unscaled: "1", exponent: 0 }, { unscaled: "1", exponent: 6 }),
    ).toBeLessThan(0);
  });

  it("treats leading zeros correctly", () => {
    expect(
      decimalCompare({ unscaled: "005", exponent: 0 }, { unscaled: "5", exponent: 0 }),
    ).toBe(0);
    expect(
      decimalCompare({ unscaled: "0000", exponent: 0 }, { unscaled: "0", exponent: 0 }),
    ).toBe(0);
  });
});

describe("decimalGte", () => {
  it("returns true for equal and greater, false for lesser", () => {
    expect(decimalGte({ unscaled: "5", exponent: 0 }, { unscaled: "5", exponent: 0 })).toBe(true);
    expect(decimalGte({ unscaled: "6", exponent: 0 }, { unscaled: "5", exponent: 0 })).toBe(true);
    expect(decimalGte({ unscaled: "4", exponent: 0 }, { unscaled: "5", exponent: 0 })).toBe(false);
  });
});

// ── decimalAdd ─────────────────────────────────────────────────────────

describe("decimalAdd", () => {
  it("adds same-exponent integers", () => {
    expect(decimalAdd({ unscaled: "2", exponent: 0 }, { unscaled: "3", exponent: 0 })).toEqual({
      unscaled: "5",
      exponent: 0,
    });
  });

  it("adds same-sign values with carry", () => {
    expect(decimalAdd({ unscaled: "999", exponent: 0 }, { unscaled: "1", exponent: 0 })).toEqual({
      unscaled: "1000",
      exponent: 0,
    });
  });

  it("subtracts when signs differ and magnitudes are equal", () => {
    expect(decimalAdd({ unscaled: "5", exponent: 0 }, { unscaled: "-5", exponent: 0 })).toEqual({
      unscaled: "0",
      exponent: 0,
    });
  });

  it("keeps the sign of the larger magnitude", () => {
    expect(decimalAdd({ unscaled: "10", exponent: 0 }, { unscaled: "-3", exponent: 0 })).toEqual({
      unscaled: "7",
      exponent: 0,
    });
    expect(decimalAdd({ unscaled: "3", exponent: 0 }, { unscaled: "-10", exponent: 0 })).toEqual({
      unscaled: "-7",
      exponent: 0,
    });
  });

  it("scales exponents before addition", () => {
    expect(
      decimalAdd({ unscaled: "50", exponent: -2 }, { unscaled: "25", exponent: -2 }),
    ).toEqual({
      unscaled: "75",
      exponent: -2,
    });
    expect(
      decimalAdd({ unscaled: "1", exponent: 0 }, { unscaled: "50", exponent: -2 }),
    ).toEqual({
      unscaled: "150",
      exponent: -2,
    });
    expect(
      decimalAdd({ unscaled: "5", exponent: -2 }, { unscaled: "1", exponent: 0 }),
    ).toEqual({
      unscaled: "105",
      exponent: -2,
    });
  });

  it("adds to DECIMAL_ZERO", () => {
    expect(decimalAdd(DECIMAL_ZERO, { unscaled: "42", exponent: 0 })).toEqual({
      unscaled: "42",
      exponent: 0,
    });
    expect(decimalAdd({ unscaled: "42", exponent: 0 }, DECIMAL_ZERO)).toEqual({
      unscaled: "42",
      exponent: 0,
    });
  });

  it("handles very large magnitudes", () => {
    const big: Decimal = { unscaled: "9".repeat(50), exponent: 0 };
    expect(decimalAdd(big, { unscaled: "1", exponent: 0 })).toEqual({
      unscaled: "1" + "0".repeat(50),
      exponent: 0,
    });
  });
});

// ── decimalSub ─────────────────────────────────────────────────────────

describe("decimalSub", () => {
  it("subtracts same-exponent integers", () => {
    expect(decimalSub({ unscaled: "5", exponent: 0 }, { unscaled: "3", exponent: 0 })).toEqual({
      unscaled: "2",
      exponent: 0,
    });
    expect(decimalSub({ unscaled: "3", exponent: 0 }, { unscaled: "5", exponent: 0 })).toEqual({
      unscaled: "-2",
      exponent: 0,
    });
  });

  it("subtracts to zero", () => {
    expect(decimalSub({ unscaled: "5", exponent: 0 }, { unscaled: "5", exponent: 0 })).toEqual({
      unscaled: "0",
      exponent: 0,
    });
  });

  it("subtracts negative numbers (i.e. adds magnitudes)", () => {
    expect(decimalSub({ unscaled: "5", exponent: 0 }, { unscaled: "-3", exponent: 0 })).toEqual({
      unscaled: "8",
      exponent: 0,
    });
  });

  it("scales exponents before subtraction", () => {
    expect(
      decimalSub({ unscaled: "1", exponent: 0 }, { unscaled: "50", exponent: -2 }),
    ).toEqual({
      unscaled: "50",
      exponent: -2,
    });
    expect(
      decimalSub({ unscaled: "5", exponent: -2 }, { unscaled: "1", exponent: 0 }),
    ).toEqual({
      unscaled: "-95",
      exponent: -2,
    });
  });

  it("subtracts from DECIMAL_ZERO", () => {
    expect(decimalSub(DECIMAL_ZERO, { unscaled: "5", exponent: 0 })).toEqual({
      unscaled: "-5",
      exponent: 0,
    });
  });
});

// ── DECIMAL_ZERO sanity ────────────────────────────────────────────────

describe("DECIMAL_ZERO", () => {
  it("is a frozen zero", () => {
    expect(DECIMAL_ZERO).toEqual({ unscaled: "0", exponent: 0 });
    expect(Object.isFrozen(DECIMAL_ZERO)).toBe(true);
  });
});
