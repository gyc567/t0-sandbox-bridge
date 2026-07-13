// Canonical list of currencies the T-0 sandbox accepts quotes in.
// Single source of truth: type, runtime list, and type-guard all derive from here.
//
// Aligned with the T-0 Network's "ISO 4217 uppercase" rule
// (https://docs.t-0.network/docs/network/quote-management/).
// CNH (offshore yuan) is included alongside CNY to support cross-border corridors.

export interface CurrencyMeta {
  /** ISO 4217 code, uppercase. */
  code: string;
  /** Human-readable name for UI display. */
  label: string;
  /** ISO 3166-1 alpha-2 country code of the issuing jurisdiction. */
  country: string;
}

/**
 * Major world currencies the T-0 Network supports in this sandbox.
 * Order is intentional: it defines the default display order in the OFI dropdown
 * (most-trafficked corridors first).
 */
export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar", country: "US" },
  { code: "EUR", label: "Euro", country: "EU" },
  { code: "GBP", label: "Pound Sterling", country: "GB" },
  { code: "JPY", label: "Japanese Yen", country: "JP" },
  { code: "CHF", label: "Swiss Franc", country: "CH" },
  { code: "CAD", label: "Canadian Dollar", country: "CA" },
  { code: "AUD", label: "Australian Dollar", country: "AU" },
  { code: "CNH", label: "Offshore Yuan", country: "CN" },
  { code: "CNY", label: "Onshore Yuan", country: "CN" },
  { code: "HKD", label: "Hong Kong Dollar", country: "HK" },
  { code: "SGD", label: "Singapore Dollar", country: "SG" },
  { code: "KRW", label: "South Korean Won", country: "KR" },
  { code: "INR", label: "Indian Rupee", country: "IN" },
  { code: "IDR", label: "Indonesian Rupiah", country: "ID" },
  { code: "PHP", label: "Philippine Peso", country: "PH" },
  { code: "THB", label: "Thai Baht", country: "TH" },
  { code: "MYR", label: "Malaysian Ringgit", country: "MY" },
  { code: "VND", label: "Vietnamese Dong", country: "VN" },
  { code: "TWD", label: "Taiwan Dollar", country: "TW" },
  { code: "AED", label: "UAE Dirham", country: "AE" },
  { code: "SAR", label: "Saudi Riyal", country: "SA" },
  { code: "ILS", label: "Israeli Shekel", country: "IL" },
  { code: "TRY", label: "Turkish Lira", country: "TR" },
  { code: "SEK", label: "Swedish Krona", country: "SE" },
  { code: "NOK", label: "Norwegian Krone", country: "NO" },
  { code: "DKK", label: "Danish Krone", country: "DK" },
  { code: "PLN", label: "Polish Zloty", country: "PL" },
  { code: "CZK", label: "Czech Koruna", country: "CZ" },
  { code: "ZAR", label: "South African Rand", country: "ZA" },
  { code: "EGP", label: "Egyptian Pound", country: "EG" },
  { code: "NGN", label: "Nigerian Naira", country: "NG" },
  { code: "KES", label: "Kenyan Shilling", country: "KE" },
  { code: "BRL", label: "Brazilian Real", country: "BR" },
  { code: "MXN", label: "Mexican Peso", country: "MX" },
  { code: "ARS", label: "Argentine Peso", country: "AR" },
  { code: "CLP", label: "Chilean Peso", country: "CL" },
  { code: "COP", label: "Colombian Peso", country: "CO" },
] as const satisfies readonly CurrencyMeta[];

/** Union of supported currency codes — derive the type from the data. */
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]["code"];

/** Pre-computed array of just the codes (for fast lookup). */
const CODE_SET: ReadonlySet<string> = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

/** Type-guard: does the string identify a supported currency? */
export function isSupportedCurrency(code: string): code is Currency {
  return CODE_SET.has(code);
}

/** Look up the display label for a currency code. */
export function getCurrencyLabel(code: Currency): string {
  const entry = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return entry?.label ?? code;
}
