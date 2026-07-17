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

export type PaymentStatus = "pending" | "accepted" | "rejected" | "confirmed" | "pending_aml";
export type PayoutStatus = "pending" | "accepted" | "success" | "failed";

/** Metadata about an AML document uploaded by the OFI. Stored on the
 *  Payment so the Provider can review the same file. Optional for
 *  backwards compatibility with legacy pending_aml rows. */
export interface AmlFileMeta {
  filename: string;
  fileSize: number;
  fileType: string;
  uploadedAt: number;
}

/** Raw bytes of an AML document uploaded by the OFI. Stored separately
 *  from `AmlFileMeta` so the metadata-only snapshot stays lean. */
export interface AmlFileBlob {
  bytes: Uint8Array;
}

export interface Payment {
  id: string;
  quoteId: string;
  currency: Currency;
  usdAmount: number;
  localAmount: number;
  beneficiaryRef: string;
  status: PaymentStatus;
  createdAt: number;
  /** Set when the OFI uploads an AML document for this payment. */
  amlFile?: AmlFileMeta;
  /** Why the AML was rejected. Set by completeManualAml(rejected=true). */
  rejectedReason?: "aml_denied" | "aml_not_needed";
  /** Timestamp when Provider rejected the AML. Set by completeManualAml(false). */
  rejectedAt?: number | null;
  /** Timestamp when Provider refunded this rejected payment.
   *  Null/undefined = rejected but not yet refunded. */
  refundedAt?: number | null;
  /** OFI-provided local-currency recipient information for the payout.
   *  Used by Provider to perform beneficiary verification (IVMS101 / Travel Rule).
   *  Optional: legacy payments may not have this field. */
  recipientInfo?: RecipientInfo;
  /** Provider's manual review decision on the recipient information.
   *  Set when the Provider approves/rejects in ManualAmlPanel.
   *  undefined = not yet reviewed. */
  recipientCheckStatus?: "approved" | "rejected";
  /** Rejection note when recipientCheckStatus === "rejected". */
  recipientCheckNote?: string;
}

// ── Recipient Info (IVMS101 / Travel Rule) ─────────────────────────────────
// Aligned with docs.t-0.network/docs/integration-guidance/api-reference/payment_intent_pay_in_provider/
// and docs.t-0.network/docs/integration-guidance/api-reference/ivms_ivms101/
// KISS: use a fallback simple structure for sandbox demo. IVMS101 full
// support can be added later without breaking the interface.

/** Recipient information supplied by OFI at Create Payment time.
 *  One of ivms101 (preferred) or fallback (simple) must be provided when present. */
export interface RecipientInfo {
  ivms101?: Ivms101BeneficialOwner;
  fallback?: RecipientAccount;
}

/** IVMS101 Beneficial Owner — subset of the full IVMS101 Travel Rule schema.
 *  Only fields needed for sandbox demo are included; extensible. */
export interface Ivms101BeneficialOwner {
  name: Ivms101Name;
  birthDate?: string; // ISO 8601 date
  nationality?: string; // ISO 3166-1 alpha-2
  address?: Ivms101Address;
  nationalId?: {
    identifier: string;
    country?: string; // ISO 3166-1 alpha-2
    type?: string;
  };
}

export interface Ivms101Name {
  primary: string;
  secondary?: string;
  identifierType?: string; // e.g. "LEGL" for legal persons
}

export interface Ivms101Address {
  street?: string;
  building?: string;
  postcode?: string;
  city?: string;
  country: string; // ISO 3166-1 alpha-2
}

/** Fallback recipient account — used when OFI cannot provide full IVMS101.
 *  Contains the minimum information needed for a sandbox beneficiary check. */
export interface RecipientAccount {
  accountHolderName: string;
  accountNumber: string;
  bankCode?: string; // e.g. IBAN, SWIFT/BIC
  bankName?: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface Payout {
  id: string;
  paymentId: string;
  status: PayoutStatus;
  fee?: number; // Network fee in USD (0.05% of usdAmount)
  reason?: string;
  updatedAt: number;
}

export type NetworkEvent =
  | { type: "QuotePublished"; quoteId: string; at: number }
  | { type: "USDTTransactionNotification"; txHash: string; usd: number; at: number }
  | {
      type: "CreditUsageNotification";
      counterparty: string;
      used: number;
      at: number;
      paymentId?: string;
      quoteId?: string;
      rate?: number;
      expiresAt?: number;
    }
  | { type: "PaymentAccepted"; paymentId: string; at: number }
  | { type: "PayoutAccepted"; payoutId: string; at: number }
  | { type: "PayoutSuccess"; payoutId: string; at: number }
  | { type: "PaymentConfirmed"; paymentId: string; at: number }
  | { type: "QuoteConfirmation"; paymentId: string; quoteId: string; approved: boolean; at: number }
  | {
      type: "OfiAmlEvent";
      paymentId: string;
      quoteId: string;
      action: "approved" | "rejected";
      at: number;
    }
  | {
      type: "AmlFileUploaded";
      paymentId: string;
      filename: string;
      fileSize: number;
      at: number;
    };

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
