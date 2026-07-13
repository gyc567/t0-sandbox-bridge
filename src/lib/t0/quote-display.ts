// Format a successful GetQuoteResult for human display in the OFI console.
// Mirrors quote-message.ts in shape: one exported pure function + private
// helpers, no React, no DOM, no global time source. The caller passes `now`
// so the helper is deterministic and tests need no clock mocks.
//
// Responsibility: turn a quote + amounts into a presentation-ready struct.
// The OFI console renders this struct; the JSON dump is kept separately for
// support tickets (see ofi.tsx).
//
// Off-ramp only: the sandbox today only models pay-out (Sell USDT → Buy XXX).
// If a pay-in direction is added later, introduce a `direction` parameter and
// swap the `SELL` constant below.

import type { GetQuoteResult } from "./network";
import type { Quote } from "./types";

/** Sell side is always USDT for off-ramp. Keeps the pair label stable. */
const SELL = "USDT" as const;

/** Decimals + symbol per corridor. Anything not in this table falls back to
 *  a "CODE amount" string and never throws. */
interface CurrencyFormat {
  symbol: string;
  decimals: number;
}
const CURRENCY_FORMAT: Record<string, CurrencyFormat> = {
  USD: { symbol: "$", decimals: 2 },
  EUR: { symbol: "€", decimals: 2 },
  GBP: { symbol: "£", decimals: 2 },
  CHF: { symbol: "CHF ", decimals: 2 },
  CAD: { symbol: "CA$", decimals: 2 },
  AUD: { symbol: "A$", decimals: 2 },
  CNH: { symbol: "CNH ", decimals: 2 },
  CNY: { symbol: "¥", decimals: 2 },
  HKD: { symbol: "HK$", decimals: 2 },
  SGD: { symbol: "S$", decimals: 2 },
  INR: { symbol: "₹", decimals: 2 },
  IDR: { symbol: "Rp", decimals: 0 },
  PHP: { symbol: "₱", decimals: 2 },
  THB: { symbol: "฿", decimals: 2 },
  MYR: { symbol: "RM", decimals: 2 },
  VND: { symbol: "₫", decimals: 0 },
  TWD: { symbol: "NT$", decimals: 2 },
  AED: { symbol: "AED ", decimals: 2 },
  SAR: { symbol: "SAR ", decimals: 2 },
  ILS: { symbol: "₪", decimals: 2 },
  TRY: { symbol: "₺", decimals: 2 },
  SEK: { symbol: "kr", decimals: 2 },
  NOK: { symbol: "kr", decimals: 2 },
  DKK: { symbol: "kr", decimals: 2 },
  PLN: { symbol: "zł", decimals: 2 },
  CZK: { symbol: "Kč", decimals: 2 },
  ZAR: { symbol: "R", decimals: 2 },
  EGP: { symbol: "E£", decimals: 2 },
  NGN: { symbol: "₦", decimals: 2 },
  KES: { symbol: "KSh", decimals: 2 },
  BRL: { symbol: "R$", decimals: 2 },
  MXN: { symbol: "MX$", decimals: 2 },
  ARS: { symbol: "AR$", decimals: 2 },
  CLP: { symbol: "CLP$", decimals: 0 },
  COP: { symbol: "COL$", decimals: 0 },
  // JPY and KRW share the ¥/₩ glyph slot but with 0 decimals — register them
  // last so the per-key lookup picks them up correctly.
  JPY: { symbol: "¥", decimals: 0 },
  KRW: { symbol: "₩", decimals: 0 },
};

export interface QuoteDisplay {
  /** "Sell USDT → Buy EUR" — the off-ramp pair. */
  pair: string;
  sell: string;
  buy: string;
  /** e.g. "0.92" / "152.34" / "0.00012" — at most 6 significant digits. */
  rate: string;
  /** Formatted local amount, e.g. "€920.00" / "¥92,000". */
  payout: string;
  /** Formatted USD settlement amount, e.g. "$1,000.00". */
  settlement: string;
  /** Seconds remaining until quote.expiresAt; floored at 0. */
  expiresInSeconds: number;
  /** Raw epoch ms — drives the absolute "Expires at HH:MM:SS UTC" footer. */
  expiresAt: number;
  /** Raw epoch ms — drives the "Quoted at HH:MM:SS UTC" footer. */
  createdAt: number;
}

/** The success-arm payload from `GetQuote`. Equal to
 *  `Extract<GetQuoteResult, { success: unknown }>["success"]`. */
export interface QuoteSuccessPayload {
  quote: Quote;
  payoutAmount: number;
  settlementAmount: number;
}

export function formatQuoteForDisplay(result: QuoteSuccessPayload, now: number): QuoteDisplay {
  const { quote, payoutAmount, settlementAmount } = result;
  return {
    sell: SELL,
    buy: quote.currency,
    pair: `Sell ${SELL} → Buy ${quote.currency}`,
    rate: formatRate(quote.rate),
    payout: formatMoney(payoutAmount, quote.currency),
    settlement: formatMoney(settlementAmount, "USD"),
    expiresInSeconds: Math.max(0, Math.floor((quote.expiresAt - now) / 1000)),
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
  };
}

/** Format an amount with the currency's symbol and decimals.
 *  Falls back to "<CODE> <amount.toFixed(2)>" for unknown codes — never throws. */
function formatMoney(amount: number, currency: string): string {
  const fmt = CURRENCY_FORMAT[currency];
  if (!fmt) return `${currency} ${amount.toFixed(2)}`;
  // Manual grouping with `,` — Intl output can be locale-dependent (e.g.
  // spaces in fr-FR) which would clash with the font-mono aesthetic.
  const fixed = amount.toFixed(fmt.decimals);
  return `${fmt.symbol}${groupThousands(fixed)}`;
}

/** Insert comma group separators into a fixed-decimal string without
 *  flipping to a locale that uses spaces or dots. */
function groupThousands(fixed: string): string {
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fracPart === undefined ? grouped : `${grouped}.${fracPart}`;
}

/** Render a rate with at most 5 significant digits and no scientific notation. */
function formatRate(rate: number): string {
  if (rate === 0) return "0";
  // toPrecision gives us significant-digit control without scientific notation,
  // up to 21 digits. We then strip trailing zeros and reattach grouping commas.
  const precise = rate.toPrecision(5);
  return groupThousands(stripTrailingZeros(precise));
}

/** Drop trailing zeros from a fixed-decimal string. `toPrecision` always
 *  emits a decimal, so we know the input has one — keep the implementation
 *  linear and the coverage 100%. */
function stripTrailingZeros(s: string): string {
  return s.replace(/0+$/, "").replace(/\.$/, "");
}
