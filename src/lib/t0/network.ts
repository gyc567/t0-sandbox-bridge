// SandboxNetwork — Facade: the single seam between OFI and Provider services.
// Mirrors the role of the real T-0 Network orchestration layer so that swapping
// for an HTTP client only changes this class.

import { PayoutProviderService } from "./provider";
import type { Currency, Payment, Quote } from "./types";
import { isSupportedCurrency } from "./currencies";

// Aligned with docs.t-0.network GetQuoteResponse.oneof (Failure reason enum).
export type QuoteFailureReason =
  | "REASON_NO_QUOTE_AVAILABLE"
  | "REASON_LIMIT_EXCEEDED"
  | "REASON_CURRENCY_NOT_SUPPORTED"
  | "REASON_INVALID_AMOUNT"
  | "REASON_INVALID_QUOTE_ID"
  | "REASON_QUOTE_EXPIRED";

export type GetQuoteResult =
  | { success: { quote: Quote; payoutAmount: number; settlementAmount: number } }
  | { failure: { reason: QuoteFailureReason } };

export interface CreatePaymentInput {
  paymentClientId: string;
  quoteId: string;
  beneficiaryRef: string;
  usdAmount: number;
}

export class SandboxNetwork {
  constructor(public readonly provider: PayoutProviderService) {}

  /** GetQuote — pick the best (lowest local-amount = best rate) live quote for the request. */
  getQuote(input: { usdAmount: number; currency: Currency; now?: number }): GetQuoteResult {
    const now = input.now ?? Date.now();
    if (input.usdAmount <= 0) {
      return { failure: { reason: "REASON_INVALID_AMOUNT" } };
    }
    if (!isSupportedCurrency(input.currency)) {
      return { failure: { reason: "REASON_CURRENCY_NOT_SUPPORTED" } };
    }
    const candidates = this.provider
      .snapshot()
      .quotes.filter(
        (q) => q.currency === input.currency && q.expiresAt > now && q.band >= input.usdAmount,
      );
    if (candidates.length === 0) {
      return { failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } };
    }
    // Best = lowest local-amount for the same USD input.
    const best = candidates.reduce((a, b) => (a.rate <= b.rate ? a : b));
    return {
      success: {
        quote: best,
        payoutAmount: input.usdAmount * best.rate,
        settlementAmount: input.usdAmount,
      },
    };
  }

  /** GetQuote by id — validates the specific quote. */
  getQuoteById(quoteId: string, now: number = Date.now()): GetQuoteResult {
    const q = this.provider.snapshot().quotes.find((x) => x.id === quoteId);
    if (!q) return { failure: { reason: "REASON_INVALID_QUOTE_ID" } };
    if (q.expiresAt <= now) return { failure: { reason: "REASON_QUOTE_EXPIRED" } };
    return {
      success: {
        quote: q,
        payoutAmount: q.band * q.rate,
        settlementAmount: q.band,
      },
    };
  }

  /**
   * CreatePayment — idempotent on paymentClientId.
   * Rule 1 (docs §6): repeated clientId returns the original response, never an error.
   */
  async createPayment(input: CreatePaymentInput, now: number = Date.now()): Promise<
    | { success: { payment: Payment; created: boolean } }
    | { failure: { reason: QuoteFailureReason } }
  > {
    // Idempotency: if a payment with this clientId already exists, return it.
    const existing = this.provider
      .snapshot()
      .payments.find((p) => p.id === input.paymentClientId);
    if (existing) return { success: { payment: existing, created: false } };

    const qr = this.getQuoteById(input.quoteId, now);
    if ("failure" in qr) return qr;

    const payment = await this.provider.acceptPayment({
      quoteId: input.quoteId,
      beneficiaryRef: input.beneficiaryRef,
    });
    // Re-key under the client-supplied idempotency key so subsequent calls dedup
    // and provider lookups (e.g. completeManualAml) use the same id.
    if (payment.id !== input.paymentClientId) {
      this.provider.rekeyPayment(payment.id, input.paymentClientId);
    }
    return { success: { payment, created: true } };
  }

  /** Snapshot of payments visible to an OFI operator (everything; sandbox has one OFI). */
  listPayments(): Payment[] {
    return this.provider.snapshot().payments;
  }

  /** OFI-driven manual AML decision. */
  completeManualAml(paymentId: string, approved: boolean): Payment {
    return this.provider.completeManualAml(paymentId, approved);
  }
}
