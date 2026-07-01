// T-0 Network domain types (Payout Provider side).
// Kept minimal & aligned with docs.t-0.network sandbox REST shapes.

export type Currency = "USD" | "EUR" | "GBP" | "CNH" | "MXN" | "BRL" | "NGN" | "INR";
export type VolumeBand = 1_000 | 5_000 | 10_000 | 25_000 | 250_000 | 1_000_000;

export interface Quote {
  id: string;
  currency: Currency;
  band: VolumeBand;
  rate: number; // local per USD
  expiresAt: number; // epoch ms
  createdAt: number;
}

export type PaymentStatus = "pending" | "accepted" | "rejected" | "confirmed";
export type PayoutStatus = "pending" | "accepted" | "success" | "failed";

export interface Payment {
  id: string;
  quoteId: string;
  currency: Currency;
  usdAmount: number;
  localAmount: number;
  beneficiaryRef: string;
  status: PaymentStatus;
  createdAt: number;
}

export interface Payout {
  id: string;
  paymentId: string;
  status: PayoutStatus;
  reason?: string;
  updatedAt: number;
}

export type NetworkEvent =
  | { type: "QuotePublished"; quoteId: string; at: number }
  | { type: "USDTTransactionNotification"; txHash: string; usd: number; at: number }
  | { type: "CreditUsageNotification"; counterparty: string; used: number; at: number }
  | { type: "PaymentAccepted"; paymentId: string; at: number }
  | { type: "PayoutAccepted"; payoutId: string; at: number }
  | { type: "PayoutSuccess"; payoutId: string; at: number }
  | { type: "PaymentConfirmed"; paymentId: string; at: number };
