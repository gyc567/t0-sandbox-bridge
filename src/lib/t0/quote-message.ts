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
};

/**
 * Convert a `QuoteFailureReason` (e.g. `REASON_NO_QUOTE_AVAILABLE`) into a
 * short, human-readable title + a longer detail explaining the next step.
 * The detail line points the OFI operator to the Provider console when
 * the underlying cause is missing-publishes (the common demo path).
 */
export function formatQuoteFailure(reason: QuoteFailureReason): QuoteFailureMessage {
  return MESSAGES[reason];
}
