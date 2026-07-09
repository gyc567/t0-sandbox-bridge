// OFIService — the OFI-facing facade the route/UI calls.
// Internally delegates to SandboxNetwork (the orchestration Facade).
// Single responsibility: hide provider/network details from the route layer.

import { SandboxNetwork, type CreatePaymentInput, type GetQuoteResult } from "./network";
import type { Payment } from "./types";
import { SUPPORTED_CURRENCIES, type Currency } from "./currencies";

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

export class OFIService {
  constructor(private readonly network: SandboxNetwork, private readonly now: () => number = Date.now) {}

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
}

// Re-export to keep imports tidy at the call site.
export type { CreatePaymentInput, GetQuoteResult } from "./network";
