// Pure-function formatter tests. Mirrors quote-message.test.ts style:
// one describe block per behaviour group, no mocks, no clock injection
// trickery — the helper accepts `now` as an argument so tests are
// deterministic and run synchronously.

import { describe, it, expect } from "vitest";
import { formatQuoteForDisplay, type QuoteSuccessPayload } from "./quote-display";

// Fixed test clock so "60s remaining" assertions are stable.
const NOW = 1_700_000_000_000;

// Build a payload shape that matches the helper's contract. We cast
// currencies that aren't in the legacy `Currency` union (JPY, IDR, KRW)
// via `as never` — the formatter is forward-compatible by design and the
// runtime domain wires these in via SUPPORTED_CURRENCIES.
const payload = (overrides: Partial<QuoteSuccessPayload> = {}): QuoteSuccessPayload => ({
  quote: {
    id: "qt_test_1",
    currency: "EUR",
    band: 1_000,
    rate: 0.92,
    expiresAt: NOW + 60_000,
    createdAt: NOW,
  },
  payoutAmount: 920,
  settlementAmount: 1_000,
  ...overrides,
});

describe("formatQuoteForDisplay — pair (off-ramp invariant)", () => {
  it("always reports Sell USDT — the OFI role only does pay-out today", () => {
    const d = formatQuoteForDisplay(payload(), NOW);
    expect(d.sell).toBe("USDT");
    expect(d.pair.startsWith("Sell USDT")).toBe(true);
  });

  it("reflects the target currency on the buy side", () => {
    const eur = formatQuoteForDisplay(payload({ quote: { ...payload().quote, currency: "EUR" } }), NOW);
    expect(eur.buy).toBe("EUR");
    expect(eur.pair).toBe("Sell USDT → Buy EUR");

    const jpy = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "JPY" as never } }),
      NOW,
    );
    expect(jpy.buy).toBe("JPY");
    expect(jpy.pair).toBe("Sell USDT → Buy JPY");
  });
});

describe("formatQuoteForDisplay — money formatting", () => {
  it("formats USD with $ and 2 decimals", () => {
    const d = formatQuoteForDisplay(payload({ settlementAmount: 1_234.5 }), NOW);
    expect(d.settlement).toBe("$1,234.50");
  });

  it("formats EUR with € and 2 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "EUR" }, payoutAmount: 920 }),
      NOW,
    );
    expect(d.payout).toBe("€920.00");
  });

  it("formats GBP with £ and 2 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "GBP" }, payoutAmount: 800.5 }),
      NOW,
    );
    expect(d.payout).toBe("£800.50");
  });

  it("formats JPY with ¥ and 0 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "JPY" as never }, payoutAmount: 92_000 }),
      NOW,
    );
    // Decimals clipped; comma-grouped thousands.
    expect(d.payout).toBe("¥92,000");
  });

  it("formats BRL with R$ and 2 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "BRL" }, payoutAmount: 1_840.5 }),
      NOW,
    );
    expect(d.payout).toBe("R$1,840.50");
  });

  it("formats MXN with MX$ and 2 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "MXN" }, payoutAmount: 17_500 }),
      NOW,
    );
    expect(d.payout).toBe("MX$17,500.00");
  });

  it("formats IDR with Rp and 0 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "IDR" as never }, payoutAmount: 15_200_000 }),
      NOW,
    );
    expect(d.payout).toBe("Rp15,200,000");
  });

  it("formats NGN with ₦ and 2 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "NGN" }, payoutAmount: 1_580_000.5 }),
      NOW,
    );
    expect(d.payout).toBe("₦1,580,000.50");
  });

  it("formats KRW with ₩ and 0 decimals", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "KRW" as never }, payoutAmount: 1_350_000 }),
      NOW,
    );
    expect(d.payout).toBe("₩1,350,000");
  });

  it("falls back gracefully for an unknown currency code (no throw)", () => {
    // The fallback path must never throw — it should be safe to wire
    // this into the UI even if SUPPORTED_CURRENCIES changes.
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, currency: "XBT" as never }, payoutAmount: 0.0123 }),
      NOW,
    );
    // Fallback format: "<CODE> <amount.toFixed(2)>"
    expect(d.payout).toMatch(/^XBT 0\.01$/);
    expect(d.settlement).toBe("$1,000.00");
  });
});

describe("formatQuoteForDisplay — rate precision", () => {
  it("renders rate near 1 with at most 5 significant digits", () => {
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, rate: 0.9234567 }, payoutAmount: 923.46 }),
      NOW,
    );
    // 0.9234567 → toPrecision(5) → "0.92346" (5 sig figs).
    expect(d.rate).toMatch(/^0\.92346$/);
  });

  it("renders rate ~100 without scientific notation, trimming trailing zeros", () => {
    const d = formatQuoteForDisplay(
      payload({
        quote: { ...payload().quote, currency: "JPY" as never, rate: 152.34 },
        payoutAmount: 152_340,
      }),
      NOW,
    );
    expect(d.rate).toBe("152.34");
  });

  it("renders very small rates without scientific notation", () => {
    const d = formatQuoteForDisplay(
      payload({
        quote: { ...payload().quote, currency: "IDR" as never, rate: 0.00012 },
        payoutAmount: 0.12,
      }),
      NOW,
    );
    expect(d.rate).toMatch(/^0\.00012/);
  });

  it("caps precision at five significant digits for noisy rates", () => {
    const d = formatQuoteForDisplay(
      payload({
        quote: { ...payload().quote, rate: 1234.56789 },
        payoutAmount: 1_234_567.89,
      }),
      NOW,
    );
    // 1234.56789 → toPrecision(5) → "1234.6" (5 sig figs, rounded).
    // Comma-grouped because formatRate uses groupThousands on the result.
    expect(d.rate).toMatch(/^1,234\.6$/);
    expect(d.rate.length).toBeLessThanOrEqual(10);
  });

  it("renders a zero rate as the literal '0' (no decimals, no group separator)", () => {
    // Edge case: a malformed rate of 0 should not blow up the formatter
    // with "0.0000...". Covers the early-return branch in formatRate.
    const d = formatQuoteForDisplay(
      payload({ quote: { ...payload().quote, rate: 0 }, payoutAmount: 0 }),
      NOW,
    );
    expect(d.rate).toBe("0");
  });
});

describe("formatQuoteForDisplay — expiration", () => {
  it("reports 60s remaining for a fresh 60s quote", () => {
    const d = formatQuoteForDisplay(payload(), NOW);
    expect(d.expiresInSeconds).toBe(60);
  });

  it("decrements as time elapses", () => {
    const d = formatQuoteForDisplay(payload(), NOW + 30_000);
    expect(d.expiresInSeconds).toBe(30);
  });

  it("clamps to 0 (never negative) for an expired quote", () => {
    const d = formatQuoteForDisplay(payload(), NOW + 90_000);
    expect(d.expiresInSeconds).toBe(0);
  });

  it("passes through raw expiresAt and createdAt for the absolute-time footer", () => {
    const d = formatQuoteForDisplay(payload(), NOW);
    expect(d.expiresAt).toBe(payload().quote.expiresAt);
    expect(d.createdAt).toBe(payload().quote.createdAt);
  });
});
