// OFIService — the OFI-facing facade the route/UI calls.
// Internally delegates to SandboxNetwork (the orchestration Facade).
// Single responsibility: hide provider/network details from the route layer.

import { SandboxNetwork, type CreatePaymentInput, type GetQuoteResult } from "./network";
import type { Payment, Settlement, SettlementState } from "./types";
import { SUPPORTED_CURRENCIES, type Currency } from "./currencies";
import type { Blockchain, SubmitSettlementInput } from "./settlement";

export interface OfiSnapshot {
  payments: Payment[];
  /** Currencies the OFI can request a quote for. Always returns the full
   *  supported list (the dropdown must show all corridors the network accepts,
   *  not just those with a live quote — quotes are provider-published on demand). */
  availableCurrencies: Currency[];
}

export interface GetQuoteInput {
  usdAmount: number;
  currency: Currency;
}

export interface SubmitSettlementViewInput {
  txHash?: string;
  blockchain: Blockchain;
  fromAddress: string;
  toAddress: string;
  usdAmount: number;
  intentRefs?: readonly string[];
}

/**
 * OFIService is the OFI-side thin layer. It does NOT own state; everything
 * lives on `SandboxNetwork` (which in turn holds the SettlementRegistry).
 * Keeping OFIService stateless is what lets the registry be a single
 * source of truth for both views.
 */
export class OFIService {
  constructor(
    private readonly network: SandboxNetwork,
    private readonly now: () => number = Date.now,
  ) {}

  getQuote(input: GetQuoteInput): Promise<GetQuoteResult> {
    return this.network.getQuote({
      usdAmount: input.usdAmount,
      currency: input.currency,
      now: this.now(),
    });
  }

  getQuoteById(quoteId: string): GetQuoteResult {
    return this.network.getQuoteById(quoteId, this.now());
  }

  async createPayment(input: CreatePaymentInput) {
    return this.network.createPayment(input, this.now());
  }

  listPayments(): Payment[] {
    return this.network.listPayments();
  }

  completeManualAml(paymentId: string, approved: boolean): Payment {
    return this.network.completeManualAml(paymentId, approved);
  }

  snapshot(): OfiSnapshot {
    const payments = this.listPayments();
    // Return the full supported list in canonical order. The route renders
    // this directly in the currency dropdown; quoting may still fail with
    // REASON_NO_QUOTE_AVAILABLE if the provider hasn't published for that
    // corridor, which is the correct error path.
    const availableCurrencies = SUPPORTED_CURRENCIES.map((c) => c.code);
    return { payments, availableCurrencies };
  }

  // ── §4 + §5 — OFI submits USDT settlement ──────────────────────

  /**
   * OFI initiates a USDT transfer on chain. Returns the PENDING settlement
   * the registry stored. Idempotent on txHash.
   */
  submitUsdtSettlement(input: SubmitSettlementViewInput): Settlement {
    const payload: SubmitSettlementInput = {
      blockchain: input.blockchain,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      usdAmount: input.usdAmount,
      ...(input.txHash !== undefined ? { txHash: input.txHash } : {}),
      ...(input.intentRefs !== undefined ? { intentRefs: input.intentRefs } : {}),
    };
    return this.network.submitUsdtSettlement(payload);
  }

  /**
   * OFI's read view — same registry snapshot the Provider sees, but
   * OFI-side helpers around it.
   */
  getSettlementState(): SettlementState {
    return this.network.getSettlementState();
  }
}

// Re-export to keep imports tidy at the call site.
export type { CreatePaymentInput, GetQuoteResult } from "./network";
