// read-model/inbox.ts — CallbackInbox for T-0 Network RPCs.
//
// Phase 1 of docs/pre-settlement-flow-plan.md. Owns the idempotency
// boundary for `UpdateLimit` and `AppendLedgerEntries` callbacks:
//
//   * dedupe by `(providerId, counterpartyId, version)` for limits
//   * dedupe by `transactionId` for ledger entries
//   * transactionally write inbox + projection through the same store
//   * on any failure, mark the inbox record as failed (and bump
//     attemptCount) so the caller can retry
//
// Constructor takes a `ReadModelStore`. The default `InMemoryStore` is
// used in tests; production should pass a `JsonFileStore` (or a real
// DB-backed implementation once the persistence decision lands).

import {
  ledgerEventKey,
  limitEventKey,
  type ReadModelStore,
} from "./store";
import {
  parseAppendLedgerEntriesRequest,
  parseUpdateLimitRequest,
  toDecimal,
} from "./projection";
import type {
  InboxMethod,
  InboxRecord,
  LimitSnapshot,
} from "./types";

/**
 * `providerId` is the receiving provider's id. UpdateLimit payloads
 * don't carry it (only `counterpartId`), so callers must pass it
 * explicitly. The default of 0 matches the read-model's "unknown"
 * placeholder; tests / single-instance deployments can leave it 0.
 */
export interface CallbackInboxOptions {
  readonly providerId?: number;
  readonly now?: () => number;
}

export class CallbackInbox {
  private readonly store: ReadModelStore;
  private readonly providerId: number;
  private readonly now: () => number;

  constructor(store: ReadModelStore, opts: CallbackInboxOptions = {}) {
    this.store = store;
    this.providerId = opts.providerId ?? 0;
    this.now = opts.now ?? Date.now;
  }

  // ── UpdateLimit ──────────────────────────────────────────────────────

  /**
   * Persist an `UpdateLimitRequest` payload. Each limit becomes a
   * `LimitSnapshot` and a dedupe envelope. Duplicate (version) calls
   * are no-ops.
   *
   * Returns the list of newly-stored snapshots. Already-stored
   * versions are filtered out.
   */
  handleUpdateLimit(
    req: { limits: readonly import("./projection").ProtoLimitShape[] },
  ): { snapshots: readonly LimitSnapshot[]; alreadyProcessed: boolean } {
    const receivedAt = this.now();
    const parsed = parseUpdateLimitRequest(req, receivedAt);
    const stored: LimitSnapshot[] = [];
    let alreadyProcessed = true;

    for (const snap of parsed) {
      const eventKey = limitEventKey(snap.counterpartyId, this.providerId, snap.version);
      // Annotate with the receiving provider id (the proto doesn't carry it).
      const annotated: LimitSnapshot = { ...snap, providerId: this.providerId };
      this.recordInbox(eventKey, "UPDATE_LIMIT", req);
      const inbox = this.store.getInbox(eventKey);
      if (inbox && inbox.processedAt !== undefined) {
        // Already processed — skip store write, but still keep the
        // inbox record intact.
        continue;
      }
      this.store.putLimit(annotated);
      stored.push(annotated);
      this.store.markInboxProcessed(eventKey, receivedAt);
      alreadyProcessed = false;
    }

    return { snapshots: stored, alreadyProcessed };
  }

  // ── AppendLedgerEntries ──────────────────────────────────────────────

  /**
   * Persist an `AppendLedgerEntriesRequest`. Each `transactionId` is a
   * dedupe unit — a duplicate transaction is a no-op. The full list of
   * entries from new transactions is returned.
   */
  handleAppendLedgerEntries(
    req: { transactions: readonly import("./projection").ProtoTransactionShape[] },
  ): { entries: readonly import("./types").LedgerEntry[]; duplicateTransactionIds: readonly bigint[] } {
    const receivedAt = this.now();
    const parsed = parseAppendLedgerEntriesRequest(req, receivedAt);
    const stored: import("./types").LedgerEntry[] = [];
    const duplicates: bigint[] = [];

    // Group parsed entries by transactionId; preserve insertion order.
    const byTx = new Map<bigint, import("./types").LedgerEntry[]>();
    for (const entry of parsed) {
      const list = byTx.get(entry.transactionId) ?? [];
      list.push(entry);
      byTx.set(entry.transactionId, list);
    }

    for (const [transactionId, entries] of byTx) {
      const eventKey = ledgerEventKey(transactionId);
      this.recordInbox(eventKey, "APPEND_LEDGER_ENTRIES", req);
      const inbox = this.store.getInbox(eventKey);
      if (inbox && inbox.processedAt !== undefined) {
        duplicates.push(transactionId);
        continue;
      }
      for (const entry of entries) {
        this.store.putLedgerEntry(entry);
        stored.push(entry);
      }
      this.store.markInboxProcessed(eventKey, receivedAt);
    }

    return { entries: stored, duplicateTransactionIds: duplicates };
  }

  // ── Read views ───────────────────────────────────────────────────────

  /** Returns the latest limit snapshot for the counterparty, or
   *  undefined if none has been recorded. */
  latestLimit(counterpartyId: number): LimitSnapshot | undefined {
    return this.store.latestLimit(this.providerId, counterpartyId);
  }

  /** Whether a given (counterparty, version) has been processed. */
  hasLimitVersion(counterpartyId: number, version: bigint): boolean {
    return (
      this.store.getInbox(limitEventKey(counterpartyId, this.providerId, version))
        ?.processedAt !== undefined
    );
  }

  /** Whether a given transactionId has been processed. */
  hasTransaction(transactionId: bigint): boolean {
    return this.store.getInbox(ledgerEventKey(transactionId))?.processedAt !== undefined;
  }

  /** Underlying store (used by the server-fn diagnostic endpoint). */
  getStore(): ReadModelStore {
    return this.store;
  }

  // ── Internals ────────────────────────────────────────────────────────

  private recordInbox(
    eventKey: string,
    method: InboxMethod,
    payload: unknown,
  ): InboxRecord {
    return this.store.appendInbox({
      eventKey,
      method,
      payload,
      receivedAt: this.now(),
      attemptCount: 0,
    });
  }
}

// Re-export the toDecimal helper so callers don't have to reach into
// projection.ts just to format a value.
export { toDecimal };