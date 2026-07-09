// SandboxNetwork — Facade: the single seam between OFI and Provider services.
// Mirrors the role of the real T-0 Network orchestration layer so that swapping
// for an HTTP client only changes this class.

import { PayoutProviderService } from "./provider";
import type { Currency, Payment, Payout, Quote } from "./types";
import { isSupportedCurrency } from "./currencies";
import type { OfiT0Client } from "./ofi-client";
import { toGetQuoteResult } from "./quote-mapper";

// Aligned with docs.t-0.network GetQuoteResponse.oneof (Failure reason enum).
// Three new values (UPSTREAM_ERROR / UNAUTHORIZED / BAD_REQUEST) cover the
// agtpay POST /api/v1/quotes/network HTTP-layer error cases introduced by
// the OFI REST refactor. Existing six values are unchanged.
export type QuoteFailureReason =
  | "REASON_NO_QUOTE_AVAILABLE"
  | "REASON_LIMIT_EXCEEDED"
  | "REASON_CURRENCY_NOT_SUPPORTED"
  | "REASON_INVALID_AMOUNT"
  | "REASON_INVALID_QUOTE_ID"
  | "REASON_QUOTE_EXPIRED"
  | "REASON_UPSTREAM_ERROR"
  | "REASON_UNAUTHORIZED"
  | "REASON_BAD_REQUEST";

export type GetQuoteResult =
  | { success: { quote: Quote; payoutAmount: number; settlementAmount: number } }
  | { failure: { reason: QuoteFailureReason } };

export interface CreatePaymentInput {
  paymentClientId: string;
  quoteId: string;
  beneficiaryRef: string;
  usdAmount: number;
}

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;

export class SandboxNetwork {
  constructor(
    public readonly provider: PayoutProviderService,
    public readonly ofiClient: OfiT0Client,
    private readonly paymentMethod: string = "PAYMENT_METHOD_TYPE_SEPA",
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * GetQuote — delegates to the injected OfiT0Client (HTTP or Mock per env).
   * Local validation only: invalid amount + unsupported currency short-circuit
   * synchronously without hitting the client.
   */
  async getQuote(input: {
    usdAmount: number;
    currency: Currency;
    now?: number;
  }): Promise<GetQuoteResult> {
    if (input.usdAmount <= 0) {
      return { failure: { reason: "REASON_INVALID_AMOUNT" } };
    }
    if (!isSupportedCurrency(input.currency)) {
      return { failure: { reason: "REASON_CURRENCY_NOT_SUPPORTED" } };
    }
    const now = input.now ?? this.now();
    const res = await this.ofiClient.getQuote(
      {
        usdAmount: input.usdAmount,
        currency: input.currency,
        paymentMethod: this.paymentMethod,
      },
      this.now,
    );
    return toGetQuoteResult(res, now, input.currency);
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
   * CreatePayment — idempotent on paymentClientId. Per T-0 protocol this
   * IS the accept step: the Network validates the quote and stores the
   * accepted payment in Provider state. Rule 1 (docs §6): repeated
   * clientId returns the original response, never an error.
   *
   * In sandbox mode (KISS) we synchronously drive the next protocol step
   * (PayoutRequest → Provider.executePayout) so the UI can observe the
   * full chain end-to-end without an async queue.
   */
  async createPayment(input: CreatePaymentInput, now: number = Date.now()): Promise<
    | { success: { payment: Payment; created: boolean; payout: Payout } }
    | { failure: { reason: QuoteFailureReason } }
  > {
    // Idempotency: if a payment with this clientId already exists, return it
    // together with the existing payout (if any) — never raise.
    const existing = this.provider
      .snapshot()
      .payments.find((p) => p.id === input.paymentClientId);
    if (existing) {
      const existingPayout = this.provider
        .snapshot()
        .payouts.find((po) => po.paymentId === existing.id);
      // existingPayout is always defined after createPayment's first call.
      return { success: { payment: existing, created: false, payout: existingPayout! } };
    }

    const qr = this.getQuoteById(input.quoteId, now);
    if ("failure" in qr) return qr;

    // Network owns the "accept" body now: validate quote + write accepted Payment
    // via the Provider's thin state seam.
    const payment = this.acceptPaymentFromQuote(qr.success.quote, input, now);

    // KISS sandbox: synchronously drive PayoutRequest → Provider.executePayout.
    // In production this would be an async RPC push.
    const payout = await this.requestPayout(payment.id);

    return { success: { payment, created: true, payout } };
  }

  /**
   * Body of the "accept" step: validate quote, persist the accepted Payment.
   * Caller (createPayment) owns the idempotency check.
   */
  private acceptPaymentFromQuote(
    quote: Quote,
    input: CreatePaymentInput,
    now: number,
  ): Payment {
    const payment: Payment = {
      id: input.paymentClientId,
      quoteId: quote.id,
      currency: quote.currency,
      usdAmount: quote.band,
      localAmount: quote.band * quote.rate,
      beneficiaryRef: input.beneficiaryRef,
      status: "accepted",
      createdAt: now,
    };
    this.provider.recordPayment(payment);
    return payment;
  }

  /**
   * OFI → Network CreatePaymentIntent (Phase 8): create a pending payment
   * linked to a quote. Funds not yet confirmed; rate is indicative.
   */
  createPaymentIntent(input: { quoteId: string; beneficiaryRef: string }, now: number = Date.now()): Payment {
    const quote = this.provider.snapshot().quotes.find((q) => q.id === input.quoteId);
    if (!quote) throw new Error("unknown quote");
    const payment: Payment = {
      id: nextId("pi"),
      quoteId: quote.id,
      currency: quote.currency,
      usdAmount: quote.band,
      localAmount: quote.band * quote.rate,
      beneficiaryRef: input.beneficiaryRef,
      status: "pending",
      createdAt: now,
    };
    this.provider.recordPayment(payment);
    return payment;
  }

  /**
   * Confirm funds received from the Pay-In Provider. Locks the rate and
   * transitions the payment to "accepted".
   */
  confirmFunds(paymentId: string): Payment {
    return this.provider.lockPaymentRate(paymentId);
  }

  /**
   * Approve / refresh a payment quote (Last Look). The Network bumps the
   * quote TTL on behalf of the OFI after AML/quote approval.
   */
  approvePaymentQuote(paymentId: string, quoteId: string): Quote {
    // Validate both exist before mutating the TTL.
    const payment = this.provider.snapshot().payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error("unknown payment");
    const quote = this.provider.refreshQuoteTtl(quoteId);
    return quote;
  }

  /** OFI-driven manual AML decision. */
  completeManualAml(paymentId: string, approved: boolean): Payment {
    return this.provider.markPaymentStatus(paymentId, approved ? "accepted" : "rejected");
  }

  /**
   * UI-facing payout request — sandbox equivalent of the Network's PayoutRequest
   * RPC to the Provider. Idempotent on paymentId. The actual execution lives
   * in `provider.executePayout` (Provider owns the payout lifecycle).
   */
  async requestPayout(paymentId: string, opts: { fail?: boolean } = {}): Promise<Payout> {
    return this.provider.executePayout(paymentId, opts);
  }

  // ── Inbound RPC ingress helpers (called only by provider-impl) ────────

  /**
   * Network → Provider PayoutRequest ingress. Translates the network's
   * payment id and delegates to Provider execution.
   */
  async handleNetworkPayout(paymentId: string): Promise<Payout> {
    return this.provider.executePayout(paymentId);
  }

  /**
   * Network → Provider UpdatePayment.accepted ingress. Network accepts
   * the CreatePayment on the OFI's behalf and notifies the Provider.
   */
  handleNetworkAccepted(
    paymentClientId: string,
    beneficiaryRef: string,
    now: number = Date.now(),
  ): Payment {
    const existing = this.provider.snapshot().payments.find((p) => p.id === paymentClientId);
    if (existing) return existing;
    // Find a matching quote (best-effort: derive from any quote on the book).
    // For sandbox we synthesize an entry; the real network would include
    // quote context in the RPC payload.
    const quote = this.provider.snapshot().quotes[0];
    if (!quote) throw new Error("no quote available for handleNetworkAccepted");
    const payment: Payment = {
      id: paymentClientId,
      quoteId: quote.id,
      currency: quote.currency,
      usdAmount: quote.band,
      localAmount: quote.band * quote.rate,
      beneficiaryRef,
      status: "accepted",
      createdAt: now,
    };
    this.provider.recordPayment(payment);
    return payment;
  }

  /**
   * Network → Provider UpdatePayment.manualAmlCheck ingress. Network
   * asks the Provider to put the payment under manual AML review.
   * Provider marks it "rejected" pending operator re-approval (mirrors
   * the prior provider-impl semantics).
   */
  handleManualAmlCheck(paymentId: string): Payment {
    return this.provider.markPaymentStatus(paymentId, "rejected");
  }

  /** Snapshot of payments visible to an OFI operator (everything; sandbox has one OFI). */
  listPayments(): Payment[] {
    return this.provider.snapshot().payments;
  }
}
