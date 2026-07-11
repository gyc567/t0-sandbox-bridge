// T-0 Network domain types (Payout Provider side).
// Kept minimal & aligned with docs.t-0.network sandbox REST shapes.
//
// Currency is re-exported from `currencies.ts` — that's the single source of
// truth for both runtime list and type-level union (see SUPPORTED_CURRENCIES
// + `isSupportedCurrency`). Keeping the re-export here means existing
// `import type { Currency } from "./types"` paths keep working.
import type { Currency as CurrencyFromList } from "./currencies";
export type Currency = CurrencyFromList;

export type VolumeBand = 1_000 | 5_000 | 10_000 | 25_000 | 250_000 | 1_000_000;

export interface Quote {
  id: string;
  currency: Currency;
  /**
   * USD amount the quote covers.
   *
   * Kept as `number` (not `VolumeBand`) because OFI queries any legal amount
   * against an external quote — `VolumeBand` is a publish-time input
   * constraint on the Provider side, not a runtime property of an accepted
   * quote. Earlier code cast through `as VolumeBand` which compiled but
   * erased information at the type level (see audit §6.1 A3).
   */
  band: number;
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
  | { type: "CreditUsageNotification"; counterparty: string; used: number; at: number; paymentId?: string; quoteId?: string; rate?: number; expiresAt?: number }
  | { type: "PaymentAccepted"; paymentId: string; at: number }
  | { type: "PayoutAccepted"; payoutId: string; at: number }
  | { type: "PayoutSuccess"; payoutId: string; at: number }
  | { type: "PaymentConfirmed"; paymentId: string; at: number };

// ── Pre-Settlement (audit §4–§7) ──────────────────────────────────────
//
// Shape-compatible with the Provider SDK's `tzero.v1.common.Blockchain` and
// `AppendLedgerEntriesRequest` types so we can swap in the real RPC layer
// without renaming. Kept inside this file rather than settlement.ts so
// UI components import from the existing single domain barrel.

export type Blockchain = "TRON" | "ETHEREUM" | "BSC";

export interface Settlement {
  txHash: string;
  blockchain: Blockchain;
  fromAddress: string;
  toAddress: string;
  usdAmount: number;
  intentRefs: readonly string[];
  submittedAt: number;
  confirmedAt?: number;
  status: "PENDING" | "CONFIRMED" | "EXPIRED";
}

export interface CreditState {
  available: number;
  reserved: number;
}

export interface LedgerEntry {
  txHash: string;
  account: "OFI_AVAILABLE" | "PROVIDER_AVAILABLE" | "OFI_RESERVED";
  delta: number;
  at: number;
  reason: "SETTLEMENT_CREDIT" | "RESERVATION" | "RELEASE" | "SETTLEMENT";
  note?: string;
}

export interface SettlementState {
  pending: readonly Settlement[];
  ledger: readonly LedgerEntry[];
  ofiCredit: CreditState;
  providerCredit: CreditState;
}
