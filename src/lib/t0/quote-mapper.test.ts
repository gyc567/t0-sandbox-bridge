// quote-mapper.test.ts — 100% 覆盖 quote-mapper.ts 纯函数。
// 涵盖:Decimal 双向转换、RFC3339、错误码映射、API raw → OfiQuoteSuccess、
//      OfiQuoteResponse → GetQuoteResult(含过期检测)

import { describe, it, expect } from "vitest";
import {
  decimalToNumber,
  numberToDecimal,
  parseRfc3339,
  toQuoteFailureReason,
  toGetQuoteResult,
  rawToOfiSuccess,
  type OfiQuoteResponse,
  type RawSuccess,
} from "./quote-mapper";

// ── decimalToNumber ────────────────────────────────────────────

describe("decimalToNumber", () => {
  it("computes unscaled * 10^exponent for positive cases", () => {
    expect(decimalToNumber({ unscaled: 86, exponent: -2 })).toBe(0.86);
    expect(decimalToNumber({ unscaled: 500, exponent: 0 })).toBe(500);
    expect(decimalToNumber({ unscaled: 5, exponent: 3 })).toBe(5_000);
    expect(decimalToNumber({ unscaled: -86, exponent: -2 })).toBe(-0.86);
  });

  it("treats a missing exponent as 0 (Connect-RPC omits default fields)", () => {
    // Connect-RPC proto3 JSON omits fields with default values. Live agtpay
    // returns `settlementAmount: { unscaled: 500 }` (no exponent key) when
    // exponent === 0. Accept this and compute the value.
    expect(decimalToNumber({ unscaled: 500 } as never)).toBe(500);
    expect(decimalToNumber({ unscaled: 1000 } as never)).toBe(1000);
  });

  it("throws on non-finite unscaled", () => {
    expect(() => decimalToNumber({ unscaled: NaN, exponent: 0 })).toThrow(/invalid Decimal/);
    expect(() => decimalToNumber({ unscaled: Infinity, exponent: 0 })).toThrow(/invalid Decimal/);
  });

  it("throws on non-finite exponent", () => {
    expect(() => decimalToNumber({ unscaled: 1, exponent: NaN })).toThrow(/invalid Decimal/);
  });
});

// ── numberToDecimal ────────────────────────────────────────────

describe("numberToDecimal", () => {
  it("encodes whole numbers with exponent 0", () => {
    expect(numberToDecimal(500)).toEqual({ unscaled: 500, exponent: 0 });
    expect(numberToDecimal(0)).toEqual({ unscaled: 0, exponent: 0 });
    expect(numberToDecimal(-12)).toEqual({ unscaled: -12, exponent: 0 });
  });

  it("encodes fractional numbers", () => {
    expect(numberToDecimal(0.86)).toEqual({ unscaled: 86, exponent: -2 });
    expect(numberToDecimal(0.5)).toEqual({ unscaled: 5, exponent: -1 });
    expect(numberToDecimal(0.001)).toEqual({ unscaled: 1, exponent: -3 });
  });

  it("handles float precision via 1e-10 rounding", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE754
    expect(numberToDecimal(0.1 + 0.2)).toEqual({ unscaled: 3, exponent: -1 });
    expect(numberToDecimal(1.005)).toEqual({ unscaled: 1005, exponent: -3 });
  });

  it("throws on non-finite numbers", () => {
    expect(() => numberToDecimal(NaN)).toThrow(/invalid number/);
    expect(() => numberToDecimal(Infinity)).toThrow(/invalid number/);
  });
});

// ── parseRfc3339 ───────────────────────────────────────────────

describe("parseRfc3339", () => {
  it("parses UTC ISO 8601 / RFC3339 timestamps to epoch ms", () => {
    // 2026-07-09T12:00:00Z — pick a fixed value for deterministic assertion
    expect(parseRfc3339("2026-07-09T12:00:00Z")).toBe(Date.UTC(2026, 6, 9, 12, 0, 0));
    expect(parseRfc3339("2026-01-01T00:00:00Z")).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
  });

  it("parses timestamps with explicit timezone offset", () => {
    // Offset form — Date.parse handles it
    expect(parseRfc3339("2026-07-09T12:00:00+00:00")).toBe(Date.UTC(2026, 6, 9, 12, 0, 0));
  });

  it("throws on invalid input", () => {
    expect(() => parseRfc3339("not a date")).toThrow(/invalid RFC3339/);
    expect(() => parseRfc3339("")).toThrow(/invalid RFC3339/);
  });
});

// ── toQuoteFailureReason ───────────────────────────────────────

describe("toQuoteFailureReason", () => {
  it("maps NO_QUOTE to REASON_NO_QUOTE_AVAILABLE", () => {
    expect(toQuoteFailureReason("NO_QUOTE")).toBe("REASON_NO_QUOTE_AVAILABLE");
  });

  it("maps UPSTREAM to REASON_UPSTREAM_ERROR", () => {
    expect(toQuoteFailureReason("UPSTREAM")).toBe("REASON_UPSTREAM_ERROR");
  });

  it("maps UNAUTHORIZED to REASON_UNAUTHORIZED", () => {
    expect(toQuoteFailureReason("UNAUTHORIZED")).toBe("REASON_UNAUTHORIZED");
  });

  it("maps BAD_REQUEST to REASON_BAD_REQUEST", () => {
    expect(toQuoteFailureReason("BAD_REQUEST")).toBe("REASON_BAD_REQUEST");
  });
});

// ── toGetQuoteResult ───────────────────────────────────────────

describe("toGetQuoteResult", () => {
  const NOW = 1_700_000_000_000;

  it("returns failure envelope for each OfiFailureReason variant", () => {
    for (const r of ["NO_QUOTE", "UPSTREAM", "UNAUTHORIZED", "BAD_REQUEST"] as const) {
      const res: OfiQuoteResponse = { failure: { reason: r, message: "x" } };
      const out = toGetQuoteResult(res, NOW, "EUR");
      expect(out).toEqual({ failure: { reason: expect.any(String) as unknown as string } });
      // Reason should be the mapped enum value
      if ("failure" in out) {
        expect(typeof out.failure.reason).toBe("string");
      }
    }
  });

  it("maps NO_QUOTE failure to REASON_NO_QUOTE_AVAILABLE", () => {
    const out = toGetQuoteResult({ failure: { reason: "NO_QUOTE" } }, NOW, "EUR");
    expect(out).toEqual({ failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } });
  });

  it("returns REASON_QUOTE_EXPIRED when quote is already expired", () => {
    const res: OfiQuoteResponse = {
      success: {
        quoteId: "1-67890",
        currency: "EUR",
        band: 1000,
        rate: 0.86,
        expiresAt: NOW - 1, // already expired
        payOutAmount: 860,
        settlementAmount: 1000,
        createdAt: NOW - 1000,
      },
    };
    expect(toGetQuoteResult(res, NOW, "EUR")).toEqual({
      failure: { reason: "REASON_QUOTE_EXPIRED" },
    });
  });

  it("returns success envelope for live quote (expiresAt > now)", () => {
    const res: OfiQuoteResponse = {
      success: {
        quoteId: "1-67890",
        currency: "EUR",
        band: 1000,
        rate: 0.86,
        expiresAt: NOW + 60_000,
        payOutAmount: 860,
        settlementAmount: 1000,
        createdAt: NOW,
      },
    };
    expect(toGetQuoteResult(res, NOW, "EUR")).toEqual({
      success: {
        quote: {
          id: "1-67890",
          currency: "EUR",
          band: 1000,
          rate: 0.86,
          expiresAt: NOW + 60_000,
          createdAt: NOW,
        },
        payoutAmount: 860,
        settlementAmount: 1000,
      },
    });
  });

  it("passes through the request currency as the quote currency (API doesn't return it)", () => {
    const res: OfiQuoteResponse = {
      success: {
        quoteId: "2-1",
        currency: "EUR", // ignored — fallbackCurrency wins
        band: 500,
        rate: 0.9,
        expiresAt: NOW + 60_000,
        payOutAmount: 450,
        settlementAmount: 500,
        createdAt: NOW,
      },
    };
    const out = toGetQuoteResult(res, NOW, "GBP");
    if ("success" in out) {
      expect(out.success.quote.currency).toBe("GBP");
    } else {
      throw new Error("expected success");
    }
  });
});

// ── rawToOfiSuccess ────────────────────────────────────────────

describe("rawToOfiSuccess", () => {
  const NOW = 1_700_000_000_000;
  const FUTURE = "2026-07-09T12:00:00Z";

  function buildRaw(overrides: Partial<RawSuccess> = {}): RawSuccess {
    return {
      rate: { unscaled: 86, exponent: -2 },
      expiration: FUTURE,
      quoteId: { quoteId: 67890, providerId: 1 },
      payOutAmount: { unscaled: 860, exponent: 0 },
      settlementAmount: { unscaled: 1000, exponent: 0 },
      ...overrides,
    };
  }

  it("converts raw API response to OfiQuoteSuccess", () => {
    const out = rawToOfiSuccess(buildRaw(), 1000, "EUR", NOW);
    expect(out).toEqual({
      quoteId: "1-67890", // providerId-quoteId
      currency: "EUR",
      band: 1000,
      rate: 0.86,
      expiresAt: Date.UTC(2026, 6, 9, 12, 0, 0),
      payOutAmount: 860,
      settlementAmount: 1000,
      createdAt: NOW,
    });
  });

  it("assembles quoteId as providerId-quoteId per spec", () => {
    const out = rawToOfiSuccess(
      buildRaw({ quoteId: { quoteId: 42, providerId: 7 } }),
      500,
      "GBP",
      NOW,
    );
    expect(out.quoteId).toBe("7-42");
  });

  it("propagates request usdAmount as band", () => {
    const out = rawToOfiSuccess(buildRaw(), 2500, "EUR", NOW);
    expect(out.band).toBe(2500);
  });

  it("uses caller-supplied fallbackCurrency", () => {
    // Use a currency supported by the literal Currency union in types.ts
    // (GBP). Other SUPPORTED_CURRENCIES like JPY are not in the strict
    // union — see docs/ofi-getquote-rest-refactor.md §6.1.
    const out = rawToOfiSuccess(buildRaw(), 1000, "GBP", NOW);
    expect(out.currency).toBe("GBP");
  });
});
