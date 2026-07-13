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
  findSettlementBreakdown,
  type OfiQuoteResponse,
  type RawProviderQuote,
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
      // Message is preserved on failure for server-side logs (audit A7).
      expect(out).toEqual({
        failure: { reason: expect.any(String) as unknown as string, message: "x" },
      });
      if ("failure" in out) {
        expect(typeof out.failure.reason).toBe("string");
      }
    }
  });

  it("omits message when upstream provides none (avoid undefined noise in wire)", () => {
    const res: OfiQuoteResponse = { failure: { reason: "NO_QUOTE" } };
    const out = toGetQuoteResult(res, NOW, "EUR");
    expect(out).toEqual({ failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } });
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

  // audit §6.1 A2 — Currency is a single source of truth (currencies.ts);
  // types.ts re-exports it. JPY exists only in the wider list.
  it("supports currencies not in the legacy 8-code union (JPY etc.)", () => {
    const res: OfiQuoteResponse = {
      success: {
        quoteId: "1-1",
        currency: "JPY",
        band: 1000,
        rate: 150,
        expiresAt: NOW + 60_000,
        payOutAmount: 150_000,
        settlementAmount: 1000,
        createdAt: NOW,
      },
    };
    const out = toGetQuoteResult(res, NOW, "JPY");
    if ("success" in out) {
      expect(out.success.quote.currency).toBe("JPY");
    } else {
      throw new Error("expected success");
    }
  });

  // audit §6.1 A3 — Quote.band is `number` (USD amount), not `VolumeBand`.
  // OFI can query any legal amount; the VolumeBand constraint lives at
  // publish-time on the Provider side, not on a fetched quote.
  it("accepts arbitrary USD band amounts that are not VolumeBands", () => {
    const res: OfiQuoteResponse = {
      success: {
        quoteId: "1-1",
        currency: "EUR",
        // 777 is intentionally outside every VolumeBand literal —
        // proves the type widening (audit A3) didn't break the runtime.
        band: 777,
        rate: 0.5,
        expiresAt: NOW + 60_000,
        payOutAmount: 388.5,
        settlementAmount: 777,
        createdAt: NOW,
      },
    };
    const out = toGetQuoteResult(res, NOW, "EUR");
    if ("success" in out) {
      expect(out.success.quote.band).toBe(777);
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
    // Currency is a unified union (audit A2 — sourced from currencies.ts),
    // so we can pass any supported corridor here, not just the legacy 8 codes.
    const out = rawToOfiSuccess(buildRaw(), 1000, "JPY", NOW);
    expect(out.currency).toBe("JPY");
  });

  it("throws when expiration is null (audit A4: invalid upstream is an error, not an expired quote)", () => {
    expect(() => rawToOfiSuccess(buildRaw({ expiration: null }), 1000, "EUR", NOW)).toThrow(
      /unparseable expiration/,
    );
  });
});

// ── findSettlementBreakdown + rawToOfiSuccess(allQuotes) (Phase 1 Step 8)
// New cases appended below; existing cases above untouched.

describe("findSettlementBreakdown", () => {
  const SELECTED = "1-67890";

  it("returns undefined when allQuotes is empty or missing", () => {
    expect(findSettlementBreakdown(SELECTED, undefined)).toBeUndefined();
    expect(findSettlementBreakdown(SELECTED, [])).toBeUndefined();
  });

  it("returns undefined when no entry matches the selected quoteId", () => {
    const allQuotes: RawProviderQuote[] = [{ providerId: 99, quoteId: 1 }];
    expect(findSettlementBreakdown(SELECTED, allQuotes)).toBeUndefined();
  });

  it("returns a marker (available:false) when matched but no settlement", () => {
    const allQuotes: RawProviderQuote[] = [{ providerId: 1, quoteId: 67890, executable: true }];
    const result = findSettlementBreakdown(SELECTED, allQuotes);
    expect(result?.available).toBe(false);
    expect(result?.executable).toBe(true);
    expect(result?.providerId).toBe(1);
  });

  it("returns available breakdown when settlement is present", () => {
    const allQuotes: RawProviderQuote[] = [
      {
        providerId: 1,
        quoteId: 67890,
        executable: true,
        settlement: {
          amount: { unscaled: 1000, exponent: 0 },
          creditLimit: { unscaled: 5000, exponent: 0 },
          totalUsed: { unscaled: 1000, exponent: 0 },
          prefundingAmount: { unscaled: 750, exponent: 0 },
          providerId: 23,
        },
      },
    ];
    const result = findSettlementBreakdown(SELECTED, allQuotes);
    expect(result?.available).toBe(true);
    expect(result).toMatchObject({
      amount: 1000,
      creditLimit: 5000,
      totalUsed: 1000,
      prefundingAmount: 750,
      providerId: 23,
      executable: true,
    });
  });

  it("omits fields that the upstream did not provide", () => {
    const allQuotes: RawProviderQuote[] = [
      {
        providerId: 1,
        quoteId: 67890,
        settlement: { amount: { unscaled: 1, exponent: 0 } },
      },
    ];
    const result = findSettlementBreakdown(SELECTED, allQuotes);
    expect(result?.available).toBe(true);
    expect(result?.amount).toBe(1);
    expect(result?.creditLimit).toBeUndefined();
    expect(result?.prefundingAmount).toBeUndefined();
  });

  it("ignores entries missing providerId or quoteId", () => {
    const allQuotes: RawProviderQuote[] = [
      { settlement: { amount: { unscaled: 1, exponent: 0 } } },
      { quoteId: 67890 },
    ];
    expect(findSettlementBreakdown(SELECTED, allQuotes)).toBeUndefined();
  });

  it("matches the first qualifying entry (composite key uniqueness)", () => {
    const allQuotes: RawProviderQuote[] = [
      { providerId: 1, quoteId: 67890, settlement: { amount: { unscaled: 999, exponent: 0 } } },
    ];
    const result = findSettlementBreakdown(SELECTED, allQuotes);
    expect(result?.amount).toBe(999);
  });
});

describe("rawToOfiSuccess with allQuotes", () => {
  const NOW = 1_700_000_000_000;
  const FUTURE = "2026-07-10T00:00:00Z";
  const raw: RawSuccess = {
    rate: { unscaled: 86, exponent: -2 },
    expiration: FUTURE,
    quoteId: { quoteId: 67890, providerId: 1 },
    payOutAmount: { unscaled: 860, exponent: 0 },
    settlementAmount: { unscaled: 1000, exponent: 0 },
  };

  it("omits the settlement field when no breakdown found", () => {
    const out = rawToOfiSuccess(raw, 1000, "EUR", NOW, []);
    expect(out.settlement).toBeUndefined();
  });

  it("includes the breakdown when matched", () => {
    const allQuotes: RawProviderQuote[] = [
      {
        providerId: 1,
        quoteId: 67890,
        settlement: { prefundingAmount: { unscaled: 750, exponent: 0 } },
      },
    ];
    const out = rawToOfiSuccess(raw, 1000, "EUR", NOW, allQuotes);
    expect(out.settlement?.available).toBe(true);
    expect(out.settlement?.prefundingAmount).toBe(750);
  });

  it("treats missing allQuotes argument as no breakdown", () => {
    const out = rawToOfiSuccess(raw, 1000, "EUR", NOW);
    expect(out.settlement).toBeUndefined();
  });
});
