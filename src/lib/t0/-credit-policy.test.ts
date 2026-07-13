// credit-policy.test.ts — 100% coverage on the pure credit helpers.

import { describe, it, expect } from "vitest";
import {
  applyDelta,
  effectiveAvailable,
  hasPayoutCapacity,
  hasSufficientCredit,
  type CreditState,
} from "./credit-policy";
import type { Decimal } from "./read-model/types";

const start: CreditState = { available: 1000, reserved: 200 };

describe("effectiveAvailable", () => {
  it("returns available when reserved is zero", () => {
    expect(effectiveAvailable({ available: 500, reserved: 0 })).toBe(500);
  });

  it("subtracts reserved from available", () => {
    expect(effectiveAvailable(start)).toBe(800);
  });

  it("returns 0 when no credit and no reservation", () => {
    expect(effectiveAvailable({ available: 0, reserved: 0 })).toBe(0);
  });

  it("clamps to 0 if reserved > available (defensive; never expected)", () => {
    expect(effectiveAvailable({ available: 100, reserved: 200 })).toBe(-100);
  });
});

describe("hasSufficientCredit", () => {
  it("returns true when effective >= amount", () => {
    expect(hasSufficientCredit(start, 800)).toBe(true);
    expect(hasSufficientCredit(start, 1)).toBe(true);
  });

  it("returns false when effective < amount", () => {
    expect(hasSufficientCredit(start, 801)).toBe(false);
    expect(hasSufficientCredit(start, 9999)).toBe(false);
  });

  it("treats negative amount as insufficient", () => {
    expect(hasSufficientCredit(start, -100)).toBe(true);
  });
});

describe("applyDelta", () => {
  it("adds to available when only available delta is given", () => {
    expect(applyDelta(start, { available: 500 })).toEqual({
      available: 1500,
      reserved: 200,
    });
  });

  it("subtracts from available when negative delta", () => {
    expect(applyDelta(start, { available: -300 })).toEqual({
      available: 700,
      reserved: 200,
    });
  });

  it("moves credit between available and reserved (reserve)", () => {
    expect(applyDelta(start, { available: -100, reserved: 100 })).toEqual({
      available: 900,
      reserved: 300,
    });
  });

  it("treats missing fields as zero delta", () => {
    expect(applyDelta(start, {})).toEqual(start);
  });

  it("returns a new object (immutability)", () => {
    const next = applyDelta(start, { available: 100 });
    expect(next).not.toBe(start);
    expect(start).toEqual({ available: 1000, reserved: 200 }); // original unchanged
  });

  it("throws when resulting available would be negative", () => {
    expect(() => applyDelta(start, { available: -2000 })).toThrow(/negative/);
  });

  it("throws when resulting reserved would be negative", () => {
    expect(() => applyDelta(start, { reserved: -1000 })).toThrow(/negative/);
  });
});

// ── hasPayoutCapacity (Phase 1 Step 7) — Decimal-aware gate ────────────
// New cases appended below; existing cases above untouched.

function dec(unscaled: string, exponent: number): Decimal {
  return { unscaled, exponent };
}

describe("hasPayoutCapacity", () => {
  it("returns true when payoutLimit >= required", () => {
    expect(hasPayoutCapacity(dec("1000", 0), dec("1000", 0))).toBe(true);
    expect(hasPayoutCapacity(dec("1500", 0), dec("1000", 0))).toBe(true);
  });

  it("returns false when payoutLimit < required", () => {
    expect(hasPayoutCapacity(dec("999", 0), dec("1000", 0))).toBe(false);
    expect(hasPayoutCapacity(dec("0", 0), dec("1", 0))).toBe(false);
  });

  it("returns true when both are zero", () => {
    expect(hasPayoutCapacity(dec("0", 0), dec("0", 0))).toBe(true);
  });

  it("handles negative payoutLimit (T-0 spec: credit exceeded)", () => {
    // Network sets payout_limit negative when credit_limit < usage;
    // we must still accept the value but the gate should reject any
    // positive required amount.
    expect(hasPayoutCapacity(dec("-500", 0), dec("1", 0))).toBe(false);
  });

  it("compares across exponents", () => {
    // payout_limit is in USD; required is the same unit. Different
    // exponents are not expected here, but the Decimal compare must
    // not silently mis-rank.
    expect(hasPayoutCapacity(dec("1", 0), dec("100", -2))).toBe(true); // 1.00 vs 1.00
    expect(hasPayoutCapacity(dec("1", 0), dec("101", -2))).toBe(false); // 1.00 vs 1.01
  });

  it("compares signed values", () => {
    expect(hasPayoutCapacity(dec("0", 0), dec("-1", 0))).toBe(true);
  });
});
