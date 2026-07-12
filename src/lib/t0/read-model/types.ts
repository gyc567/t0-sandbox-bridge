// read-model/types.ts — Durable callback read-model domain types.
//
// Phase 1 of the Pre-Settlement plan (docs/pre-settlement-flow-plan.md).
// Single source of truth for:
//   - Decimal arithmetic (string-backed, no float drift)
//   - LimitSnapshot (T-0 UpdateLimit callback projection)
//   - LedgerEntry (T-0 AppendLedgerEntries callback projection)
//   - InboxRecord (idempotency dedupe envelope)
//   - SettlementProjection (UI-facing link between chain tx and accounting)
//
// Conventions:
//   * `unscaled` is always a base-10 integer encoded as a decimal string.
//     `decimalToNumber(d)` is a *display* helper, never used for accounting.
//   * All public exports are immutable interfaces; the store handles
//     versioning via `version` (limits) or `transactionId` (ledger).

// ── Decimal ────────────────────────────────────────────────────────────

export interface Decimal {
  /** Base-10 integer encoded as a string. Negative values are permitted
   *  (T-0 docs: payout_limit may be negative when credit is exceeded). */
  readonly unscaled: string;
  /** Power-of-10 shift. 0 means integer; -2 means ×10⁻² (e.g. cents). */
  readonly exponent: number;
}

/** Canonical zero. Useful as a default value rather than a fresh literal. */
export const DECIMAL_ZERO: Decimal = Object.freeze({
  unscaled: "0",
  exponent: 0,
});

/** Predicate — accepts any object with the right shape. */
export function isDecimal(v: unknown): v is Decimal {
  if (typeof v !== "object" || v === null) return false;
  const d = v as { unscaled?: unknown; exponent?: unknown };
  if (typeof d.exponent !== "number" || !Number.isInteger(d.exponent)) return false;
  // unscaled must parse to a base-10 integer; allow leading minus.
  // Accepts string, number, or bigint (proto Decimal serializes bigint
  // for values > Number.MAX_SAFE_INTEGER).
  if (typeof d.unscaled === "bigint") return true;
  if (typeof d.unscaled !== "string" && typeof d.unscaled !== "number") return false;
  const s = String(d.unscaled).trim();
  if (!/^-?\d+$/.test(s)) return false;
  return true;
}

/** Normalize a loose input (string | number) into a Decimal. Throws on
 *  non-integer or non-finite input. */
export function toDecimal(input: string | number | Decimal): Decimal {
  if (isDecimal(input)) return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error(`toDecimal: not a finite number (${input})`);
    }
    if (!Number.isInteger(input)) {
      throw new Error(`toDecimal: not an integer (${input}) — use a string for fractional values`);
    }
    return { unscaled: String(input), exponent: 0 };
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (!/^-?\d+$/.test(s)) {
      throw new Error(`toDecimal: not an integer string ("${input}")`);
    }
    return { unscaled: s, exponent: 0 };
  }
  throw new Error(`toDecimal: unsupported input type (${typeof input})`);
}

/** Display-friendly conversion. Lossy by design; do not feed back into
 *  arithmetic. */
export function decimalToNumber(d: Decimal): number {
  const unscaled = typeof d.unscaled === "bigint" ? Number(d.unscaled) : Number(d.unscaled);
  if (!Number.isFinite(unscaled)) {
    throw new Error(`decimalToNumber: not a finite number (${d.unscaled})`);
  }
  if (d.exponent === 0) return unscaled;
  return unscaled * 10 ** d.exponent;
}

/** Display-friendly string. Always emits a value with no scientific
 *  notation. */
export function decimalToString(d: Decimal): string {
  if (d.exponent === 0) return d.unscaled;
  const negative = d.unscaled.startsWith("-");
  const digits = negative ? d.unscaled.slice(1) : d.unscaled;
  if (d.exponent >= 0) {
    return (negative ? "-" : "") + digits + "0".repeat(d.exponent);
  }
  const shift = -d.exponent;
  if (digits.length <= shift) {
    const padded = digits.padStart(shift, "0");
    return (negative ? "-" : "") + "0." + padded;
  }
  const intPart = digits.slice(0, digits.length - shift);
  const fracPart = digits.slice(digits.length - shift);
  return (negative ? "-" : "") + intPart + "." + fracPart;
}

/** Compare two decimals. Returns negative if a < b, 0 if equal, positive
 *  if a > b. Aligns exponents by scaling the *higher*-exponent side up to
 *  match the lower exponent (the more precise side), then compares the
 *  resulting integer strings. */
export function decimalCompare(a: Decimal, b: Decimal): number {
  if (a.exponent === b.exponent) {
    return compareIntStrings(a.unscaled, b.unscaled);
  }
  if (a.exponent > b.exponent) {
    // a is less precise; scale it up to b's (smaller) exponent.
    const aScaled = scaleUp(a.unscaled, a.exponent - b.exponent);
    return compareIntStrings(aScaled, b.unscaled);
  }
  // b is less precise; scale it up to a's (smaller) exponent.
  const bScaled = scaleUp(b.unscaled, b.exponent - a.exponent);
  return compareIntStrings(a.unscaled, bScaled);
}

/** Returns a >= b (read-only comparison). */
export function decimalGte(a: Decimal, b: Decimal): boolean {
  return decimalCompare(a, b) >= 0;
}

/** Returns a + b. Aligns exponents by scaling the *higher*-exponent side
 *  up to match the lower exponent so we never lose precision. */
export function decimalAdd(a: Decimal, b: Decimal): Decimal {
  if (a.exponent === b.exponent) {
    return { unscaled: addIntStrings(a.unscaled, b.unscaled), exponent: a.exponent };
  }
  if (a.exponent > b.exponent) {
    return {
      unscaled: addIntStrings(scaleUp(a.unscaled, a.exponent - b.exponent), b.unscaled),
      exponent: b.exponent,
    };
  }
  return {
    unscaled: addIntStrings(a.unscaled, scaleUp(b.unscaled, b.exponent - a.exponent)),
    exponent: a.exponent,
  };
}

/** Returns a - b. Same alignment rules as decimalAdd. */
export function decimalSub(a: Decimal, b: Decimal): Decimal {
  if (a.exponent === b.exponent) {
    return { unscaled: subIntStrings(a.unscaled, b.unscaled), exponent: a.exponent };
  }
  if (a.exponent > b.exponent) {
    return {
      unscaled: subIntStrings(scaleUp(a.unscaled, a.exponent - b.exponent), b.unscaled),
      exponent: b.exponent,
    };
  }
  return {
    unscaled: subIntStrings(a.unscaled, scaleUp(b.unscaled, b.exponent - a.exponent)),
    exponent: a.exponent,
  };
}

// ── Decimal internals (string-only arithmetic) ─────────────────────────

function compareIntStrings(a: string, b: string): number {
  const aNeg = a.startsWith("-");
  const bNeg = b.startsWith("-");
  if (aNeg && !bNeg) return -1;
  if (!aNeg && bNeg) return 1;
  // Same sign — strip leading zeros after sign.
  const aDigits = stripLeadingZeros(aNeg ? a.slice(1) : a);
  const bDigits = stripLeadingZeros(bNeg ? b.slice(1) : b);
  if (aDigits.length !== bDigits.length) {
    const cmp = aDigits.length - bDigits.length;
    return aNeg ? -cmp : cmp;
  }
  if (aDigits === bDigits) return 0;
  const cmp = aDigits < bDigits ? -1 : 1;
  return aNeg ? -cmp : cmp;
}

function stripLeadingZeros(s: string): string {
  let i = 0;
  while (i < s.length - 1 && s[i] === "0") i++;
  return s.slice(i);
}

function scaleUp(s: string, by: number): string {
  return s + "0".repeat(by);
}

function addIntStrings(a: string, b: string): string {
  const aNeg = a.startsWith("-");
  const bNeg = b.startsWith("-");
  if (aNeg === bNeg) {
    const sum = addMagnitudes(aNeg ? a.slice(1) : a, bNeg ? b.slice(1) : b);
    return aNeg && sum !== "0" ? "-" + sum : sum;
  }
  // Different signs: subtract magnitudes.
  const aMag = aNeg ? a.slice(1) : a;
  const bMag = bNeg ? b.slice(1) : b;
  const cmp = compareIntStrings(aMag, bMag);
  if (cmp === 0) return "0";
  if (cmp > 0) {
    const diff = subMagnitudes(aMag, bMag);
    return aNeg ? "-" + diff : diff;
  }
  const diff = subMagnitudes(bMag, aMag);
  return bNeg ? "-" + diff : diff;
}

function subIntStrings(a: string, b: string): string {
  // a - b = a + (-b)
  const bNeg = b.startsWith("-");
  const negB = bNeg ? b.slice(1) : "-" + b;
  return addIntStrings(a, negB);
}

function addMagnitudes(a: string, b: string): string {
  // Pad shorter to the right (least-significant alignment).
  const len = Math.max(a.length, b.length);
  const aPad = a.padStart(len, "0");
  const bPad = b.padStart(len, "0");
  let carry = 0;
  let out = "";
  for (let i = len - 1; i >= 0; i--) {
    const sum = Number(aPad[i]) + Number(bPad[i]) + carry;
    carry = Math.floor(sum / 10);
    out = (sum % 10) + out;
  }
  if (carry > 0) out = carry + out;
  return stripLeadingZeros(out);
}

function subMagnitudes(a: string, b: string): string {
  // Assumes |a| >= |b|. Returns non-negative result.
  const len = Math.max(a.length, b.length);
  const aPad = a.padStart(len, "0");
  const bPad = b.padStart(len, "0");
  let borrow = 0;
  let out = "";
  for (let i = len - 1; i >= 0; i--) {
    let diff = Number(aPad[i]) - Number(bPad[i]) - borrow;
    if (diff < 0) {
      diff += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }
    out = diff + out;
  }
  return stripLeadingZeros(out);
}

// ── Domain types ───────────────────────────────────────────────────────

export interface LimitSnapshot {
  readonly providerId: number;
  readonly counterpartyId: number;
  readonly version: bigint;
  readonly payoutLimit: Decimal;
  readonly creditLimit?: Decimal;
  readonly creditUsage?: Decimal;
  readonly reserve?: Decimal;
  readonly receivedAt: number;
  /** Raw proto payload for audit/replay, serialised as JSON. Stored as a
   *  string so server-fn `ValidateSerializableMapped` accepts it; consumers
   *  that need the structured object should `JSON.parse(rawPayload)`. */
  readonly rawPayload?: string;
}

export type LedgerAccountType =
  | "BALANCE"
  | "PAY_IN"
  | "PAY_OUT"
  | "FEE_EXPENSE"
  | "SETTLEMENT_IN"
  | "SETTLEMENT_OUT"
  | "PAYMENT_INTENT_IN"
  | "PAYMENT_INTENT_OUT"
  | "UNKNOWN";

export interface LedgerEntry {
  readonly transactionId: bigint;
  readonly accountOwnerId: number;
  readonly accountType: LedgerAccountType;
  /** Positive amount credited to the account (one of debit/credit is set). */
  readonly credit?: Decimal;
  /** Positive amount debited from the account (one of debit/credit is set). */
  readonly debit?: Decimal;
  /** One-of discriminator carried on the original request. */
  readonly context:
    | { kind: "payout"; paymentId: bigint }
    | { kind: "providerSettlement"; settlementId: bigint }
    | { kind: "feeSettlement"; feeSettlementId: bigint }
    | { kind: "piFundsReceived"; paymentIntentId: bigint }
    | { kind: "unknown" };
  readonly receivedAt: number;
  /** Raw proto payload for audit/replay, serialised as JSON. See
   *  `LimitSnapshot.rawPayload` for the rationale on the string shape. */
  readonly rawPayload?: string;
}

export type InboxMethod = "UPDATE_LIMIT" | "APPEND_LEDGER_ENTRIES";

export interface InboxRecord {
  /** Stable dedupe key (providerId:counterpartyId:version for limits,
   *  `tx:<transactionId>` for ledger). */
  readonly eventKey: string;
  readonly method: InboxMethod;
  readonly payload: unknown;
  readonly receivedAt: number;
  readonly processedAt?: number;
  readonly processingError?: string;
  readonly attemptCount: number;
}

/** Per-transaction linkage between a chain txHash and the limit/ledger
 *  projections that justify it. The UI uses this to render the funding
 *  timeline ("Broadcast → Detected → Confirming → Capacity applied"). */
export type ChainStatus =
  | "UNKNOWN"
  | "DETECTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "REORGED"
  | "INVALID";

export type AccountingStatus =
  | "NOT_APPLIED"
  | "LIMIT_RECEIVED"
  | "LEDGER_RECEIVED"
  | "RECONCILED"
  | "RECONCILIATION_REQUIRED";

export interface SettlementProjection {
  readonly id: string;
  readonly chain: string;
  readonly txHash: string;
  readonly fromProviderId?: number;
  readonly toProviderId?: number;
  readonly fromAddress?: string;
  readonly toAddress?: string;
  readonly amount: Decimal;
  readonly chainStatus: ChainStatus;
  readonly accountingStatus: AccountingStatus;
  readonly networkSettlementId?: bigint;
  readonly ledgerTransactionId?: bigint;
  readonly limitVersion?: bigint;
  readonly detectedAt: number;
  readonly confirmedAt?: number;
  readonly lastEventAt: number;
}

/** Read-model view returned to the UI. Aggregates the latest known state
 *  for a single OFI/Provider counterparty relationship. */
export interface CreditUsageNotificationRecord {
  readonly counterparty: string;
  readonly used: number;
  readonly paymentId?: string;
  readonly quoteId?: string;
  readonly rate?: number;
  readonly expiresAt?: number;
  readonly recordedAt: number;
}

/** Read-model view returned to the UI. Aggregates the latest known state
 *  for a single OFI/Provider counterparty relationship. */
export interface CounterpartyReadModel {
  readonly providerId: number;
  readonly counterpartyId: number;
  readonly latestLimit?: LimitSnapshot;
  readonly limitHistory: readonly LimitSnapshot[];
  readonly ledger: readonly LedgerEntry[];
  readonly activeProjections: readonly SettlementProjection[];
}
