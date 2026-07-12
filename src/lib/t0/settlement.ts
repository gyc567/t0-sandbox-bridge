// settlement.ts — In-memory SettlementRegistry for the T-0 Pre-Settlement
// stage (audit §4–§7 of the payment flow).
//
// Single class that both the OFI view and the Provider view see. Holds:
//   - pending USDT submissions (OFI posted a txHash, chain not yet confirmed)
//   - settled txHash set (idempotency for confirmByChain)
//   - two credit ledgers (OFI / Provider) with available + reserved
//   - a flat ledger mirroring the Provider SDK's AppendLedgerEntriesRequest
//
// Contract mapping to the SDK (kept shape-compatible so we can swap in real
// RPC later without changing the consumer code):
//
//   submitSettlement  ←  payment_intent.provider.ConfirmSettlementRequest
//                       { blockchain, txHash, paymentIntentId[] }
//
//   confirmByChain    →  payment.AppendLedgerEntriesRequest.Transaction
//                       .ProviderSettlement { settlementId }    (one entry per side)

import {
  applyDelta,
  effectiveAvailable,
  hasSufficientCredit,
  type CreditDelta,
  type CreditState,
} from "./credit-policy";

export type Blockchain = "TRON" | "ETHEREUM" | "BSC";

export interface Settlement {
  readonly txHash: string;
  readonly blockchain: Blockchain;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly usdAmount: number;
  readonly intentRefs: readonly string[];
  readonly submittedAt: number;
  readonly confirmedAt?: number;
  readonly status: "PENDING" | "CONFIRMED" | "EXPIRED";
}

export type LedgerAccount =
  | "OFI_AVAILABLE"
  | "PROVIDER_AVAILABLE"
  | "OFI_RESERVED";

export type LedgerReason =
  | "SETTLEMENT_CREDIT"
  | "RESERVATION"
  | "RELEASE"
  | "SETTLEMENT";

export interface LedgerEntry {
  /** Server-side unique id — stable across the lifetime of one process.
   *  Used as the React `key` in the OFI console's ledger list. Two
   *  ledger entries produced by the same settlement (OFI_AVAILABLE +
   *  PROVIDER_AVAILABLE) share the same `txHash` and `at`, so they
   *  cannot be reconciled by those fields alone. */
  readonly id: string;
  readonly txHash: string;
  readonly account: LedgerAccount;
  readonly delta: number;
  readonly at: number;
  readonly reason: LedgerReason;
  /** Free-form note (settlement id, payment id, etc.). */
  readonly note?: string;
  /**
   * Source marker. Production callbacks write with `PRODUCTION_CALLBACK`;
   * the sandbox simulation path (`notifyUsdtSettlement`,
   * `receiveSettlementConfirmation`) writes with `SANDBOX_SIMULATION`.
   * The UI uses this to label sandbox-generated entries so operators
   * can never confuse simulated credits with real chain confirmations.
   * See plan §9.4 / audit #4.
   */
  readonly source: "PRODUCTION_CALLBACK" | "SANDBOX_SIMULATION";
}

export interface SettlementState {
  readonly pending: readonly Settlement[];
  readonly ledger: readonly LedgerEntry[];
  readonly ofiCredit: CreditState;
  readonly providerCredit: CreditState;
}

export interface SubmitSettlementInput {
  /** Caller-supplied txHash. If absent the registry auto-generates one. */
  readonly txHash?: string;
  readonly blockchain: Blockchain;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly usdAmount: number;
  /** Optional list of paymentIntentId[] this transfer settles. */
  readonly intentRefs?: readonly string[];
}

export interface SettlementRegistryOptions {
  /** Confirmation delay in ms. 0 = instant (tests, default). */
  readonly confirmDelayMs?: number;
  /** Pending TTL — PENDING settlements older than this are evicted as EXPIRED. */
  readonly pendingTtlMs?: number;
  readonly now?: () => number;
  /** Optional callback invoked when a settlement is confirmed, so the
   *  Provider service can emit CreditUsageNotification events. */
  onConfirm?: (txHash: string, usdAmount: number) => void;
}

const DEFAULT_CONFIRM_DELAY_MS = 0;
const DEFAULT_PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Wallet addresses used by the sandbox simulation. Real deployments
 *  would pull these from per-customer config. */
export const DEFAULT_OFI_WALLET = "TXw1OFI…sandbox";
export const DEFAULT_PROVIDER_WALLET = "TXw2Provider…sandbox";

export class SettlementRegistry {
  private readonly pending = new Map<string, Settlement>();
  private readonly confirmed = new Map<string, Settlement>();
  private readonly ledger: LedgerEntry[] = [];
  private ofiCredit: CreditState = { available: 0, reserved: 0 };
  private providerCredit: CreditState = { available: 0, reserved: 0 };
  private nextSettlementId = 1;
  /** Monotonic id source for ledger entries. Reset on restart (sandbox
   *  only — see CLAUDE.md note on persistence). */
  private nextLedgerId = 1;

  private readonly confirmDelayMs: number;
  private readonly pendingTtlMs: number;
  private readonly now: () => number;
  private readonly onConfirm?: (txHash: string, usdAmount: number) => void;

  constructor(opts: SettlementRegistryOptions = {}) {
    this.confirmDelayMs = opts.confirmDelayMs ?? DEFAULT_CONFIRM_DELAY_MS;
    this.pendingTtlMs = opts.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS;
    this.now = opts.now ?? Date.now;
    this.onConfirm = opts.onConfirm;
  }

  /** Restore state from a persisted snapshot (idempotent). */
  loadState(state: SettlementState & { nextSettlementId?: number; nextLedgerId?: number }): void {
    for (const s of state.pending) this.pending.set(s.txHash, s);
    for (const s of state.ledger) {
      // Rebuild ledger without duplicating entries. Backfill `id` if the
      // snapshot was written before LedgerEntry grew the field.
      const hasId = typeof (s as { id?: unknown }).id === "string";
      const entry = hasId ? s : ({ ...s, id: `ledger_${this.nextLedgerId++}` } as LedgerEntry);
      if (
        !this.ledger.some(
          (e) => e.txHash === entry.txHash && e.at === entry.at && e.reason === entry.reason,
        )
      ) {
        this.ledger.push(entry);
      }
    }
    this.ofiCredit = { ...state.ofiCredit };
    this.providerCredit = { ...state.providerCredit };
    if (state.nextSettlementId !== undefined) {
      this.nextSettlementId = state.nextSettlementId;
    }
    if (state.nextLedgerId !== undefined) {
      this.nextLedgerId = state.nextLedgerId;
    }
  }

  // ── §4 + §5 ─ OFI submits a USDT transfer on chain ─────────────

  /**
   * OFI-side entry. Records a settlement in PENDING until the chain
   * confirms it (instant if `confirmDelayMs === 0`, otherwise a
   * background check at expectedConfirmAt).
   *
   * Idempotent: if the same txHash is submitted twice the existing record
   * is returned unchanged.
   */
  submitSettlement(input: SubmitSettlementInput): Settlement {
    if (!Number.isFinite(input.usdAmount) || input.usdAmount <= 0) {
      throw new Error("submitSettlement: usdAmount must be a finite positive number");
    }
    this.evictExpired(this.now());

    const txHash = input.txHash ?? autoTxHash();
    const existing = this.pending.get(txHash) ?? this.confirmed.get(txHash);
    if (existing) return existing;

    const now = this.now();
    const settlement: Settlement = {
      txHash,
      blockchain: input.blockchain,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      usdAmount: input.usdAmount,
      intentRefs: input.intentRefs ? [...input.intentRefs] : [],
      submittedAt: now,
      status: "PENDING",
    };
    this.pending.set(txHash, settlement);
    return settlement;
  }

  // ── §5 + §7 ─ Network confirms the on-chain transfer ───────────

  /**
   * Provider (or Network simulation) tells the registry the chain has
   * included the tx. Triggers:
   *   - status: PENDING → CONFIRMED
   *   - ledger: SETTLEMENT_CREDIT entry on OFI_AVAILABLE + PROVIDER_AVAILABLE
   *   - both available balances += usdAmount
   *
   * Idempotent: a second call for the same txHash is a no-op (Network
   * retries won't double-credit).
   */
  confirmByChain(txHash: string): Settlement {
    if (typeof txHash !== "string" || txHash.length === 0) {
      throw new Error("confirmByChain: txHash is required");
    }
    this.evictExpired(this.now());

    const alreadyConfirmed = this.confirmed.get(txHash);
    if (alreadyConfirmed) return alreadyConfirmed;

    const settlement = this.pending.get(txHash);
    if (!settlement) {
      throw new Error(`confirmByChain: no PENDING settlement for txHash=${txHash}`);
    }
    if (settlement.status === "EXPIRED") {
      throw new Error(`confirmByChain: settlement ${txHash} has expired`);
    }

    const now = this.now();
    const confirmed: Settlement = {
      ...settlement,
      status: "CONFIRMED",
      confirmedAt: now,
    };
    this.pending.delete(txHash);
    this.confirmed.set(txHash, confirmed);

    // Update credit ledgers.
    this.ofiCredit = applyDelta(this.ofiCredit, { available: confirmed.usdAmount });
    this.providerCredit = applyDelta(this.providerCredit, { available: confirmed.usdAmount });

    // Mirror the Provider SDK's AppendLedgerEntries shape — both sides get
    // an entry keyed by the same settlementId.
    const settlementId = this.nextSettlementId++;
    this.appendLedger({
      txHash,
      account: "OFI_AVAILABLE",
      delta: confirmed.usdAmount,
      at: now,
      reason: "SETTLEMENT_CREDIT",
      note: `settlementId=${settlementId}`,
      source: "SANDBOX_SIMULATION",
    });
    this.appendLedger({
      txHash,
      account: "PROVIDER_AVAILABLE",
      delta: confirmed.usdAmount,
      at: now,
      reason: "SETTLEMENT_CREDIT",
      note: `settlementId=${settlementId}`,
      source: "SANDBOX_SIMULATION",
    });

    // Notify listener (Provider service emits CreditUsageNotification).
    this.onConfirm?.(txHash, confirmed.usdAmount);

    return confirmed;
  }

  // ── §8 entry ─ OFI reserves credit before CreatePayment ─────────

  /**
   * OFI reserves `amount` from available → reserved. Throws if not enough
   * available. Used by SandboxNetwork.createPayment as a gate.
   */
  reserveCredit(amount: number): CreditState {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("reserveCredit: amount must be a finite positive number");
    }
    if (effectiveAvailable(this.ofiCredit) < amount) {
      throw new Error(
        `reserveCredit: insufficient credit (have ${effectiveAvailable(this.ofiCredit)}, need ${amount})`,
      );
    }
    this.ofiCredit = applyDelta(this.ofiCredit, {
      available: -amount,
      reserved: amount,
    });
    this.appendLedger({
      txHash: "(reservation)",
      account: "OFI_RESERVED",
      delta: amount,
      at: this.now(),
      reason: "RESERVATION",
      source: "SANDBOX_SIMULATION",
    });
    return this.ofiCredit;
  }

  /**
   * Payout failed → release reserved back to available.
   */
  releaseCredit(amount: number): CreditState {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("releaseCredit: amount must be a finite positive number");
    }
    if (this.ofiCredit.reserved < amount) {
      throw new Error(
        `releaseCredit: insufficient reserved (have ${this.ofiCredit.reserved}, need ${amount})`,
      );
    }
    this.ofiCredit = applyDelta(this.ofiCredit, {
      available: amount,
      reserved: -amount,
    });
    this.appendLedger({
      txHash: "(release)",
      account: "OFI_AVAILABLE",
      delta: amount,
      at: this.now(),
      reason: "RELEASE",
      source: "SANDBOX_SIMULATION",
    });
    return this.ofiCredit;
  }

  /**
   * Payout succeeded → reserved converts to 0 (the money left the OFI).
   * Available does NOT change; this is the audit-grade distinction
   * between "spent" and "returned".
   */
  settleCredit(amount: number): CreditState {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("settleCredit: amount must be a finite positive number");
    }
    if (this.ofiCredit.reserved < amount) {
      throw new Error(
        `settleCredit: insufficient reserved (have ${this.ofiCredit.reserved}, need ${amount})`,
      );
    }
    this.ofiCredit = applyDelta(this.ofiCredit, { reserved: -amount });
    this.appendLedger({
      txHash: "(settle)",
      account: "OFI_RESERVED",
      delta: -amount,
      at: this.now(),
      reason: "SETTLEMENT",
      source: "SANDBOX_SIMULATION",
    });
    return this.ofiCredit;
  }

  // ── Read views ───────────────────────────────────────────────────

  getCredit(role: "ofi" | "provider"): CreditState {
    return role === "ofi" ? this.ofiCredit : this.providerCredit;
  }

  /** Provider-side view: list of settlements awaiting chain confirmation. */
  listPendingSettlements(): readonly Settlement[] {
    this.evictExpired(this.now());
    return [...this.pending.values()];
  }

  listConfirmedSettlements(): readonly Settlement[] {
    return [...this.confirmed.values()];
  }

  /** AppendLedgerEntries mirror — both OFI_AVAILABLE and PROVIDER_AVAILABLE
   *  entries share the same settlementId via the `note` field. */
  listLedger(): readonly LedgerEntry[] {
    return [...this.ledger];
  }

  snapshot(): SettlementState & { nextSettlementId: number; nextLedgerId: number } {
    this.evictExpired(this.now());
    return {
      pending: [...this.pending.values()],
      ledger: [...this.ledger],
      ofiCredit: this.ofiCredit,
      providerCredit: this.providerCredit,
      nextSettlementId: this.nextSettlementId,
      nextLedgerId: this.nextLedgerId,
    };
  }

  // ── Internals ────────────────────────────────────────────────────

  private appendLedger(entry: Omit<LedgerEntry, "id"> & { id?: string }): void {
    // Choke point for ledger writes — stamp a server-unique id here so
    // every entry (regardless of which internal caller produced it)
    // carries a stable React reconciliation key. The caller may pass an
    // id (e.g. when restoring from a snapshot) but typically it does not.
    const stamped: LedgerEntry =
      typeof entry.id === "string" && entry.id.length > 0
        ? (entry as LedgerEntry)
        : { ...entry, id: `ledger_${this.nextLedgerId++}` };
    this.ledger.push(stamped);
  }

  /**
   * Mark PENDING settlements older than pendingTtlMs as EXPIRED. Pure
   * bookkeeping — they were never credited, so there's nothing to
   * reverse.
   */
  private evictExpired(now: number): void {
    const cutoff = now - this.pendingTtlMs;
    for (const [txHash, s] of this.pending) {
      if (s.submittedAt <= cutoff && s.status === "PENDING") {
        this.pending.set(txHash, { ...s, status: "EXPIRED" });
      }
    }
  }
}

/** Auto-generate a fake txHash so the OFI demo button is one click. */
function autoTxHash(): string {
  return `0x${randomHex(16)}`;
}

/**
 * Generate `nBytes` random bytes as a hex string. Uses the Web Crypto API
 * (`globalThis.crypto.getRandomValues`) so this module is safe to bundle
 * into the client — `node:crypto` is server-only and crashes the page
 * when externalized. Web Crypto is available in Node 19+ and all
 * modern browsers.
 */
function randomHex(nBytes: number): string {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("randomHex: Web Crypto API unavailable in this runtime");
  }
  const arr = new Uint8Array(nBytes);
  globalThis.crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += arr[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** Re-export for callers that don't want to import credit-policy directly. */
export { effectiveAvailable, applyDelta, hasSufficientCredit };
export type { CreditDelta, CreditState };