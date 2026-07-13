// SandboxNetwork — Facade: the single seam between OFI and Provider services.
// Mirrors the role of the real T-0 Network orchestration layer so that swapping
// for an HTTP client only changes this class.

import { PayoutProviderService } from "./provider";
import type { Currency, Payment, Payout, Quote, Settlement, SettlementState } from "./types";
import { isSupportedCurrency } from "./currencies";
import type { OfiT0Client } from "./ofi-client";
import { toGetQuoteResult } from "./quote-mapper";
import {
  hasSufficientCredit,
  type SettlementRegistry,
  type SubmitSettlementInput,
} from "./settlement";
import type { ReadModelStore } from "./read-model/store";
import type { LimitSnapshot } from "./read-model/types";

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
  | "REASON_BAD_REQUEST"
  | "REASON_NO_CREDIT_AVAILABLE";

export type GetQuoteResult =
  | { success: { quote: Quote; payoutAmount: number; settlementAmount: number } }
  | { failure: { reason: QuoteFailureReason; message?: string } };

export interface CreatePaymentInput {
  paymentClientId: string;
  quoteId: string;
  beneficiaryRef: string;
  usdAmount: number;
}

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;

/**
 * OFI GetQuote returns quotes that exist only on the upstream — they are not
 * published through the Provider's quote book. Without a registry the
 * follow-up `createPayment(quoteId)` would see "INVALID_QUOTE_ID" and silently
 * break the OFI flow (audit §6.1 A1).
 *
 * Solution: keep a small TTL-aware LRU keyed by `quote.id`. The lookup goes
 * provider-snapshot first (local publishes) then externalQuotes (HTTP fetches).
 * Capacity bound + TTL cleanup prevent unbounded growth in long processes.
 */
const EXTERNAL_QUOTE_CACHE_LIMIT = 128;

export class SandboxNetwork {
  /**
   * External GetQuote cache. Insertion order = age (Map preserves it),
   * which lets us evict the oldest entry on capacity overflow.
   */
  private readonly externalQuotes = new Map<string, Quote>();

  /**
   * Pre-Settlement settlement registry. Optional so existing tests that
   * construct SandboxNetwork without a registry keep working.
   */
  private readonly settlementRegistry: SettlementRegistry | null;

  /**
   * Phase 1 read model: durable storage for T-0 callbacks
   * (UpdateLimit / AppendLedgerEntries). Optional — when attached,
   * `latestLimit(counterpartyId)` reads from this store; otherwise it
   * returns `undefined` and `createPayment` falls back to the existing
   * SettlementRegistry credit gate.
   */
  private readonly readModel: ReadModelStore | null;
  /** Receiving provider id for the read model (used by `latestLimit`). */
  private readonly providerId: number;

  constructor(
    public readonly provider: PayoutProviderService,
    public readonly ofiClient: OfiT0Client,
    private readonly paymentMethod: string = "PAYMENT_METHOD_TYPE_SEPA",
    private readonly now: () => number = Date.now,
    settlementRegistry: SettlementRegistry | null = null,
    readModel: ReadModelStore | null = null,
    providerId: number = 0,
  ) {
    this.settlementRegistry = settlementRegistry;
    this.readModel = readModel;
    this.providerId = providerId;
  }

  /**
   * GetQuote — delegates to the injected OfiT0Client (HTTP or Mock per env).
   * Local validation only: invalid amount + unsupported currency short-circuit
   * synchronously without hitting the client. Successful upstream quotes are
   * registered so `createPayment` can resolve them later.
   */
  async getQuote(input: {
    usdAmount: number;
    currency: Currency;
    now?: number;
  }): Promise<GetQuoteResult> {
    if (!Number.isFinite(input.usdAmount) || input.usdAmount <= 0) {
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
    const result = toGetQuoteResult(res, now, input.currency);
    if ("success" in result) {
      this.recordExternalQuote(result.success.quote, now);
    }
    return result;
  }

  /**
   * Store a freshly-fetched external quote. Enforces capacity + eviction:
   *   1. Drop expired entries first.
   *   2. If still at capacity, drop the oldest insertion (Map is insertion-ordered).
   */
  private recordExternalQuote(q: Quote, now: number): void {
    this.evictExpiredExternalQuotes(now);
    if (this.externalQuotes.size >= EXTERNAL_QUOTE_CACHE_LIMIT) {
      const oldestKey = this.externalQuotes.keys().next().value;
      if (oldestKey !== undefined) this.externalQuotes.delete(oldestKey);
    }
    this.externalQuotes.set(q.id, q);
  }

  /** Drop expired entries from the external quote cache. */
  private evictExpiredExternalQuotes(now: number): void {
    for (const [id, q] of this.externalQuotes) {
      if (q.expiresAt <= now) this.externalQuotes.delete(id);
    }
  }

  /**
   * GetQuote by id — resolves both locally-published quotes and externally
   * fetched ones. Audit §6.1 A1.
   */
  getQuoteById(quoteId: string, now: number = Date.now()): GetQuoteResult {
    // 1. Locally-published quote (provider publish book).
    const local = this.provider.snapshot().quotes.find((x) => x.id === quoteId);
    if (local) {
      if (local.expiresAt <= now) return { failure: { reason: "REASON_QUOTE_EXPIRED" } };
      return {
        success: {
          quote: local,
          payoutAmount: local.band * local.rate,
          settlementAmount: local.band,
        },
      };
    }
    // 2. External OFI-fetched quote.
    const external = this.externalQuotes.get(quoteId);
    if (!external) return { failure: { reason: "REASON_INVALID_QUOTE_ID" } };
    if (external.expiresAt <= now) {
      this.externalQuotes.delete(quoteId);
      return { failure: { reason: "REASON_QUOTE_EXPIRED" } };
    }
    return {
      success: {
        quote: external,
        payoutAmount: external.band * external.rate,
        settlementAmount: external.band,
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
  async createPayment(
    input: CreatePaymentInput,
    now: number = Date.now(),
  ): Promise<
    | { success: { payment: Payment; created: boolean; payout: Payout } }
    | { failure: { reason: QuoteFailureReason; message?: string } }
  > {
    // Idempotency: if a payment with this clientId already exists, return it
    // together with the existing payout (if any) — never raise.
    const existing = this.provider.snapshot().payments.find((p) => p.id === input.paymentClientId);
    if (existing) {
      const existingPayout = this.provider
        .snapshot()
        .payouts.find((po) => po.paymentId === existing.id);
      // existingPayout is always defined after createPayment's first call.
      return { success: { payment: existing, created: false, payout: existingPayout! } };
    }

    // Pre-Settlement gate: when a settlement registry is attached, the
    // OFI must have topped up enough USDT to cover this payment. This is
    // the audit-mandated §6/§7 step that closes the OFI → Provider trust gap.
    if (this.settlementRegistry) {
      const ofiCredit = this.settlementRegistry.getCredit("ofi");
      if (!hasSufficientCredit(ofiCredit, input.usdAmount)) {
        return { failure: { reason: "REASON_NO_CREDIT_AVAILABLE" } };
      }
    }

    const qr = this.getQuoteById(input.quoteId, now);
    if ("failure" in qr) return qr;

    // Network owns the "accept" body now: validate quote + write accepted Payment
    // via the Provider's thin state seam.
    const payment = this.acceptPaymentFromQuote(qr.success.quote, input, now);

    // Reserve credit for the in-flight payment. We do this AFTER quote
    // validation so an unknown/expired quote doesn't burn a reservation.
    if (this.settlementRegistry) {
      try {
        this.settlementRegistry.reserveCredit(input.usdAmount);
      } catch (e) {
        // Should be unreachable because of the gate above, but be defensive.
        return { failure: { reason: "REASON_NO_CREDIT_AVAILABLE" } };
      }
    }

    // KISS sandbox: synchronously drive PayoutRequest → Provider.executePayout.
    // In production this would be an async RPC push.
    const payout = await this.requestPayout(payment.id);

    // Settle or release the reservation based on payout outcome.
    if (this.settlementRegistry) {
      if (payout.status === "success") {
        this.settlementRegistry.settleCredit(input.usdAmount);
        // Auto-emit CreditUsageNotification for OFI with quote context.
        this.provider.notifyCreditUsage("ofi", input.usdAmount, {
          paymentId: payment.id,
          quoteId: qr.success.quote.id,
          rate: qr.success.quote.rate,
          expiresAt: qr.success.quote.expiresAt,
        });
        // Also emit for Provider (same quote context).
        this.provider.notifyCreditUsage("provider", input.usdAmount, {
          paymentId: payment.id,
          quoteId: qr.success.quote.id,
          rate: qr.success.quote.rate,
          expiresAt: qr.success.quote.expiresAt,
        });
      } else {
        this.settlementRegistry.releaseCredit(input.usdAmount);
      }
    }

    return { success: { payment, created: true, payout } };
  }

  /**
   * Body of the "accept" step: validate quote, persist the accepted Payment.
   * Caller (createPayment) owns the idempotency check.
   */
  private acceptPaymentFromQuote(quote: Quote, input: CreatePaymentInput, now: number): Payment {
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
  createPaymentIntent(
    input: { quoteId: string; beneficiaryRef: string },
    now: number = Date.now(),
  ): Payment {
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
    const payment = this.provider.snapshot().payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error("unknown payment");
    if (payment.status !== "pending_aml") {
      throw new Error(`payment must be in pending_aml state, got ${payment.status}`);
    }
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
   * Provider marks it "pending_aml" pending operator re-approval.
   */
  handleManualAmlCheck(paymentId: string): Payment {
    return this.provider.markPaymentStatus(paymentId, "pending_aml");
  }

  /**
   * OFI → Network: simulate a network-side manual AML trigger.
   * Moves the payment to "pending_aml" so the Provider operator can
   * approve or reject it via completeManualAml.
   */
  triggerManualAml(paymentId: string): Payment {
    const payment = this.provider.snapshot().payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error(`payment not found: ${paymentId}`);
    return this.provider.markPaymentStatus(paymentId, "pending_aml");
  }

  /** Snapshot of payments visible to an OFI operator (everything; sandbox has one OFI). */
  listPayments(): Payment[] {
    return this.provider.snapshot().payments;
  }

  // ── Test-only access (kept narrow on purpose) ─────────────────────

  /**
   * Read-only accessor for the external quote registry size. Tests use this
   * to assert eviction behaviour without exposing the underlying Map.
   */
  externalQuoteCount(): number {
    this.evictExpiredExternalQuotes(this.now());
    return this.externalQuotes.size;
  }

  // ── §4 + §5 — OFI-driven settlement submission (delegated) ────

  /**
   * OFI side: submit a USDT transfer. Requires a settlement registry; throws
   * otherwise. The provider's `notifyUsdtSettlement` also calls the same
   * registry so legacy sandbox buttons converge on one path.
   */
  submitUsdtSettlement(input: SubmitSettlementInput): Settlement {
    if (!this.settlementRegistry) {
      throw new Error("submitUsdtSettlement requires a settlement registry");
    }
    return this.settlementRegistry.submitSettlement(input);
  }

  /**
   * §5 chain confirmation (Provider-driven; OFI can also call this to
   * fast-forward the demo). Throws if no registry is attached.
   */
  receiveSettlementConfirmation(txHash: string): Settlement {
    if (!this.settlementRegistry) {
      throw new Error("receiveSettlementConfirmation requires a settlement registry");
    }
    return this.settlementRegistry.confirmByChain(txHash);
  }

  getSettlementState(): SettlementState {
    if (!this.settlementRegistry) {
      return {
        pending: [],
        ledger: [],
        ofiCredit: { available: 0, reserved: 0 },
        providerCredit: { available: 0, reserved: 0 },
      };
    }
    return this.settlementRegistry.snapshot();
  }

  // ── Phase 1: read-model accessors ─────────────────────────────────

  /**
   * Latest `LimitSnapshot` for the given counterparty as recorded by
   * the T-0 `UpdateLimit` callback. Returns `undefined` when no read
   * model is attached or no limit has been recorded yet.
   */
  latestLimit(counterpartyId: number): LimitSnapshot | undefined {
    return this.readModel?.latestLimit(this.providerId, counterpartyId);
  }

  /** Whether a read model is attached. */
  hasReadModel(): boolean {
    return this.readModel !== null;
  }
}
