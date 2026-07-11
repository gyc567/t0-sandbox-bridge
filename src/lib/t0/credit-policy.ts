// credit-policy.ts — pure helpers for the SettlementRegistry.
//
// Kept in its own module so every line can be unit-tested without standing
// up the registry. All math is integer (USDT is 1-decimal enough for demo);
// callers convert from Decimal if needed.

import { decimalGte, type Decimal } from "./read-model/types";

export interface CreditState {
  /** USDT the counterparty can immediately spend on a payment. */
  readonly available: number;
  /**
   * USDT the OFI has reserved for an in-flight `CreatePayment`. Decreases
   * `available` (see effectiveAvailable) until the payment settles.
   */
  readonly reserved: number;
}

export interface CreditDelta {
  /** Optional signed amount to add to `available`. */
  readonly available?: number;
  /** Optional signed amount to add to `reserved`. */
  readonly reserved?: number;
}

/** Money the OFI can really spend right now: available − reserved. */
export function effectiveAvailable(state: CreditState): number {
  return state.available - state.reserved;
}

/**
 * Apply a signed delta to a CreditState, returning a NEW state (immutable).
 *
 * Throws on negative balances — the registry is the only legitimate writer
 * and is responsible for keeping the ledger consistent. Throwing here turns
 * bookkeeping bugs into loud test failures rather than silent corruption.
 */
export function applyDelta(state: CreditState, delta: CreditDelta): CreditState {
  const next: CreditState = {
    available: state.available + (delta.available ?? 0),
    reserved: state.reserved + (delta.reserved ?? 0),
  };
  if (next.available < 0 || next.reserved < 0) {
    throw new Error(
      `credit-policy: negative balance after delta — ` +
        `available ${state.available}→${next.available}, ` +
        `reserved ${state.reserved}→${next.reserved}`,
    );
  }
  return next;
}

/** True when the OFI can cover `amount` right now (accounting for reservations). */
export function hasSufficientCredit(state: CreditState, amount: number): boolean {
  return effectiveAvailable(state) >= amount;
}

/**
 * True when the network-authoritative `payoutLimit` (a Decimal value
 * delivered by T-0's UpdateLimit callback) can cover the requested
 * `settlementAmount`.
 *
 * Use this from `createPayment` and the OFI Funding Workspace gate
 * rather than `hasSufficientCredit`, since the network's payout_limit
 * is the only authoritative source (see plan §1.2 and audit #2 / #3).
 */
export function hasPayoutCapacity(payoutLimit: Decimal, required: Decimal): boolean {
  return decimalGte(payoutLimit, required);
}