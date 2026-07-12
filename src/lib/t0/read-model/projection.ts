// read-model/projection.ts — Pure projection helpers for the Pre-Settlement
// callback pipeline.
//
// Phase 1 of docs/pre-settlement-flow-plan.md. These functions translate
// between the T-0 Network's ConnectRPC proto shapes
// (`UpdateLimitRequest`, `AppendLedgerEntriesRequest`) and the read
// model domain types. They are pure: no IO, no clock injection, no side
// effects. The orchestrator (CallbackInbox / SandboxNetwork) decides
// when to call them and where to store the result.
//
// Why separate from CallbackInbox:
//   * Pure functions are trivial to unit-test (no fixtures, no clocks).
//   * The proto schema can change without touching the orchestration
//     logic, as long as these parsers are kept in sync.
//
// Why a separate `Decimal` representation:
//   * The proto `Decimal` uses bigint-or-number `unscaled` and `exponent`.
//     The read model mandates *string* `unscaled` (no float drift). The
//     parsers below always normalize to the read-model shape.

import type {
  UpdateLimitRequest_Limit as ProtoLimit,
} from "@t-0/provider-sdk";
import {
  DECIMAL_ZERO,
  isDecimal,
  toDecimal,
  type Decimal,
  type LedgerAccountType,
  type LedgerEntry,
  type LimitSnapshot,
  type SettlementProjection,
} from "./types";

/**
 * JSON.stringify can't natively encode `bigint`. We coerce to decimal
 * string so the snapshot survives a server-fn wire round-trip without
 * hitting `TypeError: Do not know how to serialize a BigInt`.
 */
function bigintSafeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

// ── UpdateLimit parsing ────────────────────────────────────────────────

/**
 * Parse one `UpdateLimitRequest.Limit` proto into a `LimitSnapshot`.
 * Throws when the proto is missing `payoutLimit` — that's the field the
 * UI gates on, so an UpdateLimit without one is malformed.
 *
 * The structural type `ProtoLimitShape` keeps this pure helper decoupled
 * from the full `Message<...>` envelope that the protobuf runtime
 * attaches. Tests pass plain objects without `$typeName` and it works.
 */
export function parseLimit(
  limit: ProtoLimitShape,
  receivedAt: number,
): LimitSnapshot {
  if (typeof limit.version !== "bigint") {
    throw new Error("parseLimit: limit.version must be a bigint");
  }
  if (typeof limit.counterpartId !== "number") {
    throw new Error("parseLimit: limit.counterpartId must be a number");
  }
  if (limit.payoutLimit === undefined) {
    throw new Error("parseLimit: limit.payoutLimit is required");
  }
  return {
    // The proto's `counterpartId` is "the Id of the counterparty provider".
    // We don't know the receiving provider's id at this layer — pass it
    // through undefined and let the caller (CallbackInbox) annotate.
    providerId: 0,
    counterpartyId: limit.counterpartId,
    version: limit.version,
    payoutLimit: parseDecimal(limit.payoutLimit, "payoutLimit"),
    creditLimit: parseOptionalDecimal(limit.creditLimit, "creditLimit"),
    creditUsage: parseOptionalDecimal(limit.creditUsage, "creditUsage"),
    reserve: parseOptionalDecimal(limit.reserve, "reserve"),
    receivedAt,
    rawPayload: bigintSafeStringify(limit),
  };
}

/** Parse an entire `UpdateLimitRequest` (with its `limits` array) into
 *  ready-to-store snapshots. */
export function parseUpdateLimitRequest(
  req: { limits: readonly ProtoLimitShape[] },
  receivedAt: number,
): readonly LimitSnapshot[] {
  const out: LimitSnapshot[] = [];
  for (const limit of req.limits) {
    out.push(parseLimit(limit, receivedAt));
  }
  return out;
}

/** Structural alias for the fields we read off a `UpdateLimitRequest.Limit`.
 *  Avoids binding this helper to the full `Message<...>` envelope. */
export type ProtoLimitShape = {
  version: bigint;
  counterpartId: number;
  payoutLimit?: unknown;
  creditLimit?: unknown;
  creditUsage?: unknown;
  reserve?: unknown;
};

// ── AppendLedgerEntries parsing ────────────────────────────────────────

/**
 * Parse one transaction's entries into a flat list of `LedgerEntry`s.
 * Each `LedgerEntry` carries the transaction id and the resolved
 * context (payout / providerSettlement / feeSettlement / piFundsReceived
 * / unknown).
 */
export function parseLedgerTransaction(
  tx: ProtoTransactionShape,
  receivedAt: number,
): readonly LedgerEntry[] {
  if (typeof tx.transactionId !== "bigint") {
    throw new Error("parseLedgerTransaction: transactionId must be a bigint");
  }
  const context = parseTransactionContext(tx);
  const out: LedgerEntry[] = [];
  for (const entry of tx.entries) {
    out.push(parseLedgerEntry(tx.transactionId, entry, context, receivedAt));
  }
  return out;
}

function parseLedgerEntry(
  transactionId: bigint,
  entry: ProtoLedgerEntryShape,
  context: LedgerEntry["context"],
  receivedAt: number,
): LedgerEntry {
  return {
    transactionId,
    accountOwnerId: entry.accountOwnerId,
    accountType: mapAccountType(entry.accountType),
    credit: parseOptionalDecimal(entry.credit, "credit"),
    debit: parseOptionalDecimal(entry.debit, "debit"),
    context,
    receivedAt,
    rawPayload: bigintSafeStringify(entry),
  };
}

type ProtoTransactionDetails = {
  case: string;
  value?: unknown;
};

export type ProtoTransactionShape = {
  transactionId: bigint;
  entries: readonly ProtoLedgerEntryShape[];
  transactionDetails: ProtoTransactionDetails;
};

export type ProtoLedgerEntryShape = {
  accountOwnerId: number;
  accountType: number;
  credit?: unknown;
  debit?: unknown;
};

function parseTransactionContext(
  tx: ProtoTransactionShape,
): LedgerEntry["context"] {
  const details = tx.transactionDetails;
  const v = details.value as Record<string, unknown> | undefined;
  switch (details.case) {
    case "payout":
      return { kind: "payout", paymentId: BigInt((v?.paymentId as number | bigint | string) ?? 0) };
    case "providerSettlement":
      return {
        kind: "providerSettlement",
        settlementId: BigInt((v?.settlementId as number | bigint | string) ?? 0),
      };
    case "feeSettlement":
      return {
        kind: "feeSettlement",
        feeSettlementId: BigInt((v?.feeSettlementId as number | bigint | string) ?? 0),
      };
    case "piFundsReceived":
      return {
        kind: "piFundsReceived",
        paymentIntentId: BigInt((v?.paymentIntentId as number | bigint | string) ?? 0),
      };
    default:
      return { kind: "unknown" };
  }
}

/** Parse the entire AppendLedgerEntriesRequest transactions list. */
export function parseAppendLedgerEntriesRequest(
  req: { transactions: readonly ProtoTransactionShape[] },
  receivedAt: number,
): readonly LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const tx of req.transactions) {
    out.push(...parseLedgerTransaction(tx, receivedAt));
  }
  return out;
}

/** Map the proto AccountType enum to our `LedgerAccountType` union.
 *  Unknown / UNSPECIFIED values become `"UNKNOWN"` so the UI can still
 *  display them with a fallback label. */
export function mapAccountType(t: number): LedgerAccountType {
  switch (t) {
    case 20:
      return "BALANCE";
    case 40:
      return "PAY_IN";
    case 50:
      return "PAY_OUT";
    case 60:
      return "FEE_EXPENSE";
    case 80:
      return "SETTLEMENT_IN";
    case 90:
      return "SETTLEMENT_OUT";
    case 100:
      return "PAYMENT_INTENT_IN";
    case 110:
      return "PAYMENT_INTENT_OUT";
    default:
      return "UNKNOWN";
  }
}

// ── Decimal parsing ────────────────────────────────────────────────────

/** Convert a proto Decimal (bigint/string/number unscaled) to a read-model
 *  Decimal (string unscaled). Returns `DECIMAL_ZERO` when the input is
 *  `undefined` or `null` (proto omits default values). */
export function parseDecimal(d: unknown, fieldName: string): Decimal {
  if (d === undefined || d === null) {
    return DECIMAL_ZERO;
  }
  if (isDecimal(d)) {
    // isDecimal accepts string, number, or bigint unscaled; always
    // normalize to string so downstream Decimal arithmetic stays in
    // string space (no float drift).
    return {
      unscaled: String(d.unscaled),
      exponent: d.exponent,
    };
  }
  throw new Error(`parseDecimal: malformed value for ${fieldName}`);
}

/** Same as parseDecimal but for optional fields. */
export function parseOptionalDecimal(d: unknown, fieldName: string): Decimal | undefined {
  if (d === undefined) return undefined;
  return parseDecimal(d, fieldName);
}

// ── Projection helpers ─────────────────────────────────────────────────

/**
 * Build a brand-new `SettlementProjection` from a fresh chain detection.
 * The caller passes the chain, txHash, and the decimal amount; status
 * fields default to the "just-detected" state.
 */
export function newProjection(input: {
  id: string;
  chain: string;
  txHash: string;
  amount: Decimal;
  fromProviderId?: number;
  toProviderId?: number;
  fromAddress?: string;
  toAddress?: string;
  detectedAt: number;
}): SettlementProjection {
  return {
    id: input.id,
    chain: input.chain,
    txHash: input.txHash,
    amount: input.amount,
    chainStatus: "DETECTED",
    accountingStatus: "NOT_APPLIED",
    fromProviderId: input.fromProviderId,
    toProviderId: input.toProviderId,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    detectedAt: input.detectedAt,
    lastEventAt: input.detectedAt,
  };
}

/**
 * Link a transaction + projection: surface the fact that the ledger
 * transaction id and/or limit version apply to this chain tx.
 * Pure: returns a new projection object.
 */
export function linkProjection(
  projection: SettlementProjection,
  link: {
    ledgerTransactionId?: bigint;
    limitVersion?: bigint;
    networkSettlementId?: bigint;
    at: number;
  },
): SettlementProjection {
  const next: SettlementProjection = {
    ...projection,
    lastEventAt: link.at,
    accountingStatus: upgradeAccounting(projection.accountingStatus),
  };
  return {
    ...next,
    ledgerTransactionId: link.ledgerTransactionId ?? projection.ledgerTransactionId,
    limitVersion: link.limitVersion ?? projection.limitVersion,
    networkSettlementId: link.networkSettlementId ?? projection.networkSettlementId,
  };
}

function upgradeAccounting(status: SettlementProjection["accountingStatus"]): SettlementProjection["accountingStatus"] {
  switch (status) {
    case "NOT_APPLIED":
      return "LIMIT_RECEIVED";
    case "LIMIT_RECEIVED":
    case "LEDGER_RECEIVED":
    case "RECONCILED":
    case "RECONCILIATION_REQUIRED":
      return status;
  }
}

/** Quick test helper — re-export `toDecimal` so callers don't need a
 *  second import path. */
export { toDecimal };