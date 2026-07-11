// Payout Provider service — single source of truth for the sandbox flow.
// High cohesion: owns quotes, payouts, and provider-side event log.
// Low coupling: talks to the network only via T0Client.
//
// Role note: the Sandbox orchestrator (SandboxNetwork) handles the OFI
// orchestration (CreatePayment accept, manual AML, Last Look approval,
// payment intent, confirmFunds, requestPayout routing). This class
// exposes only the Provider-side state reads / writes and the payout
// execution lifecycle in response to network-driven PayoutRequests.

import type { T0Client } from "./client";
import type { Currency, NetworkEvent, Payment, PaymentStatus, Payout, Quote, SettlementState, VolumeBand } from "./types";
import { DEFAULT_OFI_WALLET, DEFAULT_PROVIDER_WALLET, type SettlementRegistry, type SubmitSettlementInput } from "./settlement";

import type { ReadModelStore } from "./read-model/store";

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;

export interface PublishQuoteInput {
  currency: Currency;
  band: VolumeBand;
  rate: number;
  ttlMs?: number;
}

export interface Snapshot {
  quotes: Quote[];
  payments: Payment[];
  payouts: Payout[];
  events: NetworkEvent[];
}

export class PayoutProviderService {
  private quotes = new Map<string, Quote>();
  private payments = new Map<string, Payment>();
  private payouts = new Map<string, Payout>();
  private events: NetworkEvent[] = [];

  /**
   * Optional Pre-Settlement registry. When present, `notifyUsdtSettlement`
   * also drives the §4–§5 settlement flow (and the ledger side-effects).
   * When absent — typical for legacy unit tests — the old behaviour is
   * preserved: only an event log entry is written.
   */
  settlementRegistry: SettlementRegistry | null;

  /**
   * Optional ReadModelStore for persisting credit usage notifications.
   * When present, `notifyCreditUsage` also writes to the durable store.
   */
  private readonly readModel: ReadModelStore | null;

  constructor(
    private readonly client: T0Client,
    private readonly now: () => number = Date.now,
    settlementRegistry: SettlementRegistry | null = null,
    readModel: ReadModelStore | null = null,
  ) {
    this.settlementRegistry = settlementRegistry;
    this.readModel = readModel;
  }

  // ── 1. UpdateQuote ────────────────────────────────────────────
  async publishQuote(input: PublishQuoteInput): Promise<Quote> {
    if (input.rate <= 0) throw new Error("rate must be > 0");
    const ttl = input.ttlMs ?? 60_000;
    const quote: Quote = {
      id: nextId("qt"),
      currency: input.currency,
      band: input.band,
      rate: input.rate,
      createdAt: this.now(),
      expiresAt: this.now() + ttl,
    };
    this.quotes.set(quote.id, quote);
    await this.client.updateQuote(quote);
    this.log({ type: "QuotePublished", quoteId: quote.id, at: this.now() });
    return quote;
  }

  // ── 4/5. USDT settlement inbound notification ─────────────────
  /**
   * Backward-compatible notify. With a settlement registry attached this
   * also drives §4–§5 (OFI-side submit + log). Without one it falls back
   * to the original event-log-only behaviour.
   */
  notifyUsdtSettlement(txHash: string, usd: number) {
    if (usd <= 0) throw new Error("usd must be > 0");
    this.log({ type: "USDTTransactionNotification", txHash, usd, at: this.now() });
    if (this.settlementRegistry) {
      this.settlementRegistry.submitSettlement({
        txHash,
        blockchain: "TRON",
        fromAddress: DEFAULT_OFI_WALLET,
        toAddress: DEFAULT_PROVIDER_WALLET,
        usdAmount: usd,
      });
    }
  }

  // ── 6/7. Credit usage ─────────────────────────────────────────
  notifyCreditUsage(
    counterparty: string,
    used: number,
    meta?: { paymentId?: string; quoteId?: string; rate?: number; expiresAt?: number },
  ) {
    const event: NetworkEvent = {
      type: "CreditUsageNotification",
      counterparty,
      used,
      at: this.now(),
      ...meta,
    };
    this.log(event);
    if (this.readModel) {
      this.readModel.putCreditUsage({
        counterparty,
        used,
        ...meta,
        recordedAt: this.now(),
      });
    }
  }

  /**
   * §5 chain confirmation (Provider view). When the chain has included the
   * tx the OFI submitted, the Provider (or a Network simulation) calls this
   * to drive §7: ledger + both-side credit.
   */
  receiveSettlementConfirmation(txHash: string) {
    if (!this.settlementRegistry) {
      throw new Error("receiveSettlementConfirmation requires a settlement registry");
    }
    return this.settlementRegistry.confirmByChain(txHash);
  }

  /** Provider-side view of pending OFI submissions. */
  listPendingSettlements() {
    return this.settlementRegistry?.listPendingSettlements() ?? [];
  }

  /** AppendLedgerEntries-style ledger (both sides share the registry). */
  getSettlementState(): SettlementState | null {
    return this.settlementRegistry?.snapshot() ?? null;
  }

  // ── 11-16. Payout lifecycle (network-driven) ──────────────────
  /**
   * Execute a payout in response to a Network-routed PayoutRequest.
   * The Provider reacts; the Network drives the call. Idempotent on
   * paymentId (returns the existing payout if already processed).
   */
  async executePayout(paymentId: string, opts: { fail?: boolean } = {}): Promise<Payout> {
    // Idempotency: return existing payout if already processed
    for (const po of this.payouts.values()) {
      if (po.paymentId === paymentId) {
        return po;
      }
    }

    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error("unknown payment");
    if (payment.status !== "accepted") throw new Error("payment not in accepted state");

    const payout: Payout = {
      id: nextId("po"),
      paymentId,
      status: "accepted",
      updatedAt: this.now(),
    };
    this.payouts.set(payout.id, payout);
    await this.client.emit({ type: "PayoutAccepted", payoutId: payout.id, at: this.now() });
    this.log({ type: "PayoutAccepted", payoutId: payout.id, at: this.now() });

    if (opts.fail) {
      payout.status = "failed";
      payout.reason = "simulated failure";
      payout.updatedAt = this.now();
      return payout;
    }

    payout.status = "success";
    payout.updatedAt = this.now();
    await this.client.emit({ type: "PayoutSuccess", payoutId: payout.id, at: this.now() });
    this.log({ type: "PayoutSuccess", payoutId: payout.id, at: this.now() });

    payment.status = "confirmed";
    await this.client.emit({ type: "PaymentConfirmed", paymentId: payment.id, at: this.now() });
    this.log({ type: "PaymentConfirmed", paymentId: payment.id, at: this.now() });
    return payout;
  }

  // ── Read model ────────────────────────────────────────────────
  snapshot() {
    return {
      quotes: [...this.quotes.values()],
      payments: [...this.payments.values()],
      payouts: [...this.payouts.values()],
      events: [...this.events],
    };
  }

  // ── Thin state helpers (network orchestrator writes here) ─────
  /**
   * Persist a Payment constructed by the Network orchestrator. Single
   * write seam for CreatePayment, createPaymentIntent, and the inbound
   * `UpdatePayment.accepted` RPC handler. Idempotent: if a payment with
   * the same id already exists, returns it without mutation.
   */
  recordPayment(p: Payment): Payment {
    const existing = this.payments.get(p.id);
    if (existing) return existing;
    this.payments.set(p.id, p);
    return p;
  }

  /**
   * Move a payment to a new status. Throws if the payment is unknown.
   * Pure state-write — no event emission; the Network orchestrator owns
   * event semantics so it can decide what to log per call site.
   */
  markPaymentStatus(paymentId: string, status: Payment["status"]): Payment {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error("unknown payment");
    payment.status = status;
    return payment;
  }

  /**
   * Lock the rate on a pending payment (transitions pending → accepted).
   * Pure state-write; throws on unknown payment.
   */
  lockPaymentRate(paymentId: string): Payment {
    return this.markPaymentStatus(paymentId, "accepted");
  }

  /**
   * Refresh the TTL on a quote (Last Look approval). Throws on unknown quote.
   */
  refreshQuoteTtl(quoteId: string): Quote {
    const quote = this.quotes.get(quoteId);
    if (!quote) throw new Error("unknown quote");
    quote.expiresAt = this.now() + 60_000;
    return quote;
  }

  /**
   * Re-key a payment from an internal auto-generated id to a client-supplied
   * idempotency key (the OFI's `paymentClientId`). Idempotent: if the new id
   * already exists and differs, the original is kept (defensive — duplicate
   * keys should never collide in practice because the OFI surfaces one
   * paymentClientId per CreatePayment call). Updates the payment object in
   * place so callers holding a reference see the new id. Also re-keys any
   * dependent payouts so future idempotency lookups find them.
   */
  rekeyPayment(oldId: string, newId: string): void {
    if (oldId === newId) return;
    const payment = this.payments.get(oldId);
    if (!payment) throw new Error(`unknown payment: ${oldId}`);
    if (this.payments.has(newId)) {
      // Defensive: never overwrite an existing entry. In practice the OFI
      // CreatePayment idempotency check prevents this branch.
      return;
    }
    payment.id = newId;
    this.payments.delete(oldId);
    this.payments.set(newId, payment);
    // Keep dependent payouts in sync — same payment, same id reference.
    for (const po of this.payouts.values()) {
      if (po.paymentId === oldId) po.paymentId = newId;
    }
  }

  /**
   * Re-key a quote to a wire-friendly id (used by the provider RPC handlers
   * to align internal quote ids with the numeric ids the network emits on
   * the wire). Mutates the stored quote's `id` and re-keys the map.
   */
  rekeyQuote(oldId: string, newId: string): void {
    if (oldId === newId) return;
    const quote = this.quotes.get(oldId);
    if (!quote) throw new Error(`unknown quote: ${oldId}`);
    if (this.quotes.has(newId)) return;
    quote.id = newId;
    this.quotes.delete(oldId);
    this.quotes.set(newId, quote);
  }

  private log(e: NetworkEvent) {
    this.events.push(e);
  }
}
