// Payout Provider service — single source of truth for the sandbox flow.
// High cohesion: owns quotes, payments, payouts, and event log.
// Low coupling: talks to the network only via T0Client.

import type { T0Client } from "./client";
import type {
  Currency,
  NetworkEvent,
  Payment,
  Payout,
  Quote,
  VolumeBand,
} from "./types";

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;

export interface PublishQuoteInput {
  currency: Currency;
  band: VolumeBand;
  rate: number;
  ttlMs?: number;
}

export interface IncomingPaymentInput {
  quoteId: string;
  beneficiaryRef: string;
}

export class PayoutProviderService {
  private quotes = new Map<string, Quote>();
  private payments = new Map<string, Payment>();
  private payouts = new Map<string, Payout>();
  private events: NetworkEvent[] = [];

  constructor(private readonly client: T0Client, private readonly now: () => number = Date.now) {}

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
  notifyUsdtSettlement(txHash: string, usd: number) {
    if (usd <= 0) throw new Error("usd must be > 0");
    this.log({ type: "USDTTransactionNotification", txHash, usd, at: this.now() });
  }

  // ── 6/7. Credit usage ─────────────────────────────────────────
  notifyCreditUsage(counterparty: string, used: number) {
    this.log({ type: "CreditUsageNotification", counterparty, used, at: this.now() });
  }

  // ── 8/9/10. Create Payment → Accepted ─────────────────────────
  async acceptPayment(input: IncomingPaymentInput): Promise<Payment> {
    const quote = this.quotes.get(input.quoteId);
    if (!quote) throw new Error("unknown quote");
    if (quote.expiresAt < this.now()) throw new Error("quote expired");

    const payment: Payment = {
      id: nextId("pm"),
      quoteId: quote.id,
      currency: quote.currency,
      usdAmount: quote.band,
      localAmount: quote.band * quote.rate,
      beneficiaryRef: input.beneficiaryRef,
      status: "accepted",
      createdAt: this.now(),
    };
    this.payments.set(payment.id, payment);
    await this.client.emit({ type: "PaymentAccepted", paymentId: payment.id, at: this.now() });
    this.log({ type: "PaymentAccepted", paymentId: payment.id, at: this.now() });
    return payment;
  }

  // ── 11-16. Payout lifecycle ───────────────────────────────────
  async processPayout(paymentId: string, opts: { fail?: boolean } = {}): Promise<Payout> {
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

  private log(e: NetworkEvent) {
    this.events.push(e);
  }
}
