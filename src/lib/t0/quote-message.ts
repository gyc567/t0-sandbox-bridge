// Maps the internal `QuoteFailureReason` enum to a human-readable message
// and an actionable hint. The OFI UI shows this instead of the raw JSON
// payload, which used to be the only feedback for failed quote lookups.

import type { QuoteFailureReason } from "./network";

export interface QuoteFailureMessage {
  /** Short human-readable title. */
  title: string;
  /** Longer explanation of what the user can do. */
  detail: string;
}

const MESSAGES: Record<QuoteFailureReason, QuoteFailureMessage> = {
  REASON_NO_QUOTE_AVAILABLE: {
    title: "No live quote for this corridor yet",
    detail:
      "The Provider has not published a quote that covers this amount. Sign in as the Provider role and publish a quote for this currency / band at /provider.",
  },
  REASON_LIMIT_EXCEEDED: {
    title: "Requested amount exceeds the available quote band",
    detail:
      "No published quote covers an amount this large. Try a smaller USD amount, or have the Provider publish a wider band.",
  },
  REASON_CURRENCY_NOT_SUPPORTED: {
    title: "Currency not supported by the sandbox",
    detail:
      "This currency is not in the supported list. Pick another from the Target currency dropdown.",
  },
  REASON_INVALID_AMOUNT: {
    title: "Invalid amount",
    detail: "Amount must be a positive number.",
  },
  REASON_INVALID_QUOTE_ID: {
    title: "Quote not found",
    detail:
      "The referenced quote id is unknown. Run Get Quote again to obtain a fresh id.",
  },
  REASON_QUOTE_EXPIRED: {
    title: "Quote expired",
    detail:
      "Quotes are short-lived (default 60s). Run Get Quote again and create the payment before the new quote expires.",
  },
  // ── agtpay REST bridge errors (added in OFI REST refactor) ────────
  REASON_UPSTREAM_ERROR: {
    title: "Upstream service error",
    detail:
      "agtpay /api/v1/quotes/network returned an unexpected error. Try again, or check the Provider console.",
  },
  REASON_UNAUTHORIZED: {
    title: "API key rejected",
    detail:
      "T0_OFI_API_KEY is missing or invalid. Check your .env configuration.",
  },
  REASON_BAD_REQUEST: {
    title: "Invalid quote request",
    detail:
      "The request to agtpay was malformed. Verify currency, amount, and payment method.",
  },
  REASON_NO_CREDIT_AVAILABLE: {
    title: "Insufficient USDT credit",
    detail:
      "The OFI hasn't topped up enough USDT for this payment. Submit a settlement on /ofi first.",
  },
};

/**
 * Convert a `QuoteFailureReason` (e.g. `REASON_NO_QUOTE_AVAILABLE`) into a
 * short, human-readable title + a longer detail explaining the next step.
 * The detail line points the OFI operator to the Provider console when
 * the underlying cause is missing-publishes (the common demo path).
 *
 * Falls back to a generic message for unknown reasons (forward-compat with
 * future enum values without crashing the UI).
 */
export function formatQuoteFailure(reason: QuoteFailureReason): QuoteFailureMessage {
  return (
    MESSAGES[reason] ?? {
      title: "Quote lookup failed",
      detail: `Unknown failure reason: ${reason}`,
    }
  );
}
