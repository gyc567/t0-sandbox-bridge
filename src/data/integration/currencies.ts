/**
 * Currency list from spec §1.3 + §5.1.
 * BAXS coverage: Canada / US / Hong Kong / Singapore.
 */

export type Currency = "CAD" | "USD" | "HKD" | "SGD";

export interface CurrencySpec {
  code: Currency;
  region: string;
  rail: string;
}

export const CURRENCIES: readonly CurrencySpec[] = [
  { code: "CAD", region: "Canada", rail: "Interac / EFT" },
  { code: "USD", region: "United States", rail: "Wire / ACH" },
  { code: "HKD", region: "Hong Kong", rail: "RTGS / CHATS" },
  { code: "SGD", region: "Singapore", rail: "FAST / MEPS" },
];
