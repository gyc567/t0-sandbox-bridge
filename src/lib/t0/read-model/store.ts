// read-model/store.ts — ReadModelStore interface + InMemoryStore.
//
// Phase 1 of the Pre-Settlement plan (docs/pre-settlement-flow-plan.md).
// ReadModelStore is the single read/write seam for the durable callback
// projection. Two implementations:
//   * InMemoryStore (here) — process-local; default for tests + dev.
//   * JsonFileStore (json-file-store.ts) — atomic write-through to disk.
//
// The interface is intentionally narrow. Higher-level semantics — dedupe,
// version ordering, "latest" pointer — live in CallbackInbox (inbox.ts),
// not here. The store is dumb storage.

import type {
  InboxRecord,
  LedgerEntry,
  LimitSnapshot,
  SettlementProjection,
} from "./types";

/**
 * Read/write contract for the durable read model.
 *
 * All methods are synchronous so callers can compose them inside the
 * `CallbackInbox` "transaction" boundary without depending on IO promises.
 * The JSON-file implementation enforces atomicity via fsync; the
 * InMemory implementation is naturally atomic.
 *
 * Errors thrown by any method are considered terminal — the caller
 * (typically `CallbackInbox`) is responsible for translating them into
 * `InboxRecord.processingError` so the inbox can retry.
 */
export interface ReadModelStore {
  // ── Limits ──────────────────────────────────────────────────────────

  /** Persist a single `LimitSnapshot`. Old versions are kept in history
   *  (the latest pointer is updated separately). */
  putLimit(snapshot: LimitSnapshot): void;

  /** Return the latest snapshot for a (providerId, counterpartyId) pair,
   *  or `undefined` if none has been recorded. */
  latestLimit(providerId: number, counterpartyId: number): LimitSnapshot | undefined;

  /** Return every recorded snapshot for the pair, oldest first. */
  listLimits(providerId: number, counterpartyId: number): readonly LimitSnapshot[];

  // ── Ledger ──────────────────────────────────────────────────────────

  /** Persist a single ledger entry. Idempotent on `transactionId` +
   *  `accountOwnerId` + `accountType` (re-applying the same entry must be
   *  a no-op). */
  putLedgerEntry(entry: LedgerEntry): void;

  /** Return all ledger entries for the given counterparty (entries whose
   *  `accountOwnerId` is the counterparty id). */
  listLedger(accountOwnerId: number): readonly LedgerEntry[];

  /** Find a single ledger entry by `transactionId`. */
  getLedgerTransaction(transactionId: bigint): readonly LedgerEntry[];

  // ── Projections (chain → accounting linkage) ────────────────────────

  /** Upsert a settlement projection keyed by `(chain, txHash)`. */
  putProjection(projection: SettlementProjection): void;

  /** Return the projection for a single (chain, txHash) pair. */
  getProjection(chain: string, txHash: string): SettlementProjection | undefined;

  /** Return all projections whose `chainStatus` is not in a terminal
   *  state (DETECTED / CONFIRMING / UNKNOWN). */
  listActiveProjections(): readonly SettlementProjection[];

  // ── Inbox (idempotency dedupe envelope) ─────────────────────────────

  /** Record that an inbound callback was received. Idempotent on
   *  `eventKey`: if the same key is appended again, returns the existing
   *  record and does not bump the counter. */
  appendInbox(record: InboxRecord): InboxRecord;

  /** Mark the record as successfully processed (sets `processedAt`). */
  markInboxProcessed(eventKey: string, at: number): void;

  /** Mark the record as failed; records the error message and bumps
   *  `attemptCount`. */
  markInboxFailed(eventKey: string, at: number, error: string): void;

  /** Returns the record if the event key has been seen. */
  getInbox(eventKey: string): InboxRecord | undefined;

  /** Whether the event key has been recorded (regardless of processed
   *  status). Used as the dedupe gate. */
  hasInbox(eventKey: string): boolean;

  // ── Credit Usage Notifications ──────────────────────────────────────

  /** Persist a Credit Usage Notification record. */
  putCreditUsage(record: import("./types").CreditUsageNotificationRecord): void;

  /** Return all credit usage notifications for a counterparty, newest first. */
  listCreditUsage(counterparty: string): readonly import("./types").CreditUsageNotificationRecord[];
}

// ── InMemoryStore ──────────────────────────────────────────────────────

/**
 * In-process implementation of `ReadModelStore`. State lives in plain
 * `Map`s and is lost on process restart. Suitable for tests, local dev,
 * and any single-instance deployment that does not need crash recovery.
 */
export class InMemoryStore implements ReadModelStore {
  /** Key: `${providerId}:${counterpartyId}`. Value: ordered list. */
  private readonly limits = new Map<string, LimitSnapshot[]>();
  /** Key: `${providerId}:${counterpartyId}` → latest version. */
  private readonly latest = new Map<string, LimitSnapshot>();

  /** Key: `${transactionId}:${accountOwnerId}:${accountType}`. */
  private readonly ledgerEntries = new Map<string, LedgerEntry>();
  /** Key: transactionId → all entries for that transaction. */
  private readonly ledgerByTx = new Map<string, LedgerEntry[]>();

  /** Key: `${chain}:${txHash}` → projection. */
  private readonly projections = new Map<string, SettlementProjection>();

  private readonly inbox = new Map<string, InboxRecord>();

  /** Key: counterparty → ordered list (newest first). */
  private readonly creditUsage = new Map<string, import("./types").CreditUsageNotificationRecord[]>();

  // ── Limits ──────────────────────────────────────────────────────────

  putLimit(snapshot: LimitSnapshot): void {
    const key = limitKey(snapshot.providerId, snapshot.counterpartyId);
    const history = this.limits.get(key) ?? [];
    // Append-only; dedupe on (providerId, counterpartyId, version).
    if (history.some((s) => s.version === snapshot.version)) return;
    history.push(snapshot);
    history.sort((x, y) => {
      if (x.version < y.version) return -1;
      if (x.version > y.version) return 1;
      return 0;
    });
    this.limits.set(key, history);

    const latestSoFar = this.latest.get(key);
    if (!latestSoFar || snapshot.version > latestSoFar.version) {
      this.latest.set(key, snapshot);
    }
  }

  latestLimit(providerId: number, counterpartyId: number): LimitSnapshot | undefined {
    return this.latest.get(limitKey(providerId, counterpartyId));
  }

  listLimits(providerId: number, counterpartyId: number): readonly LimitSnapshot[] {
    return this.limits.get(limitKey(providerId, counterpartyId)) ?? [];
  }

  // ── Ledger ──────────────────────────────────────────────────────────

  putLedgerEntry(entry: LedgerEntry): void {
    const txKey = String(entry.transactionId);
    const dedupeKey = `${txKey}:${entry.accountOwnerId}:${entry.accountType}`;
    if (this.ledgerEntries.has(dedupeKey)) return;
    this.ledgerEntries.set(dedupeKey, entry);

    const txEntries = this.ledgerByTx.get(txKey) ?? [];
    txEntries.push(entry);
    this.ledgerByTx.set(txKey, txEntries);
  }

  listLedger(accountOwnerId: number): readonly LedgerEntry[] {
    const out: LedgerEntry[] = [];
    for (const entry of this.ledgerEntries.values()) {
      if (entry.accountOwnerId === accountOwnerId) out.push(entry);
    }
    // Stable order by (transactionId, accountType) — matches T-0 network
    // append order and is friendly to UI pagination.
    out.sort((a, b) => {
      if (a.transactionId < b.transactionId) return -1;
      if (a.transactionId > b.transactionId) return 1;
      return a.accountType.localeCompare(b.accountType);
    });
    return out;
  }

  getLedgerTransaction(transactionId: bigint): readonly LedgerEntry[] {
    return this.ledgerByTx.get(String(transactionId)) ?? [];
  }

  // ── Projections ─────────────────────────────────────────────────────

  putProjection(projection: SettlementProjection): void {
    this.projections.set(projectionKey(projection.chain, projection.txHash), projection);
  }

  getProjection(chain: string, txHash: string): SettlementProjection | undefined {
    return this.projections.get(projectionKey(chain, txHash));
  }

  listActiveProjections(): readonly SettlementProjection[] {
    const out: SettlementProjection[] = [];
    for (const p of this.projections.values()) {
      if (!isTerminalChainStatus(p.chainStatus)) out.push(p);
    }
    // Sort by detectedAt ASC so the UI sees older entries first.
    out.sort((a, b) => a.detectedAt - b.detectedAt);
    return out;
  }

  // ── Inbox ───────────────────────────────────────────────────────────

  appendInbox(record: InboxRecord): InboxRecord {
    const existing = this.inbox.get(record.eventKey);
    if (existing) return existing;
    this.inbox.set(record.eventKey, record);
    return record;
  }

  markInboxProcessed(eventKey: string, at: number): void {
    const existing = this.inbox.get(eventKey);
    if (!existing) return;
    this.inbox.set(eventKey, { ...existing, processedAt: at, processingError: undefined });
  }

  markInboxFailed(eventKey: string, at: number, error: string): void {
    const existing = this.inbox.get(eventKey);
    if (!existing) return;
    this.inbox.set(eventKey, {
      ...existing,
      processedAt: at,
      processingError: error,
      attemptCount: existing.attemptCount + 1,
    });
  }

  getInbox(eventKey: string): InboxRecord | undefined {
    return this.inbox.get(eventKey);
  }

  hasInbox(eventKey: string): boolean {
    return this.inbox.has(eventKey);
  }

  // ── Credit Usage Notifications ────────────────────────────────────────

  putCreditUsage(record: import("./types").CreditUsageNotificationRecord): void {
    const list = this.creditUsage.get(record.counterparty) ?? [];
    list.unshift(record); // newest first
    this.creditUsage.set(record.counterparty, list);
  }

  listCreditUsage(counterparty: string): readonly import("./types").CreditUsageNotificationRecord[] {
    return this.creditUsage.get(counterparty) ?? [];
  }

  // ── Snapshot helpers (used by JsonFileStore to persist state) ───────

  /** Every limit snapshot grouped by `${providerId}:${counterpartyId}`,
   *  ordered by version ASC within each group. */
  snapshotLimits(): ReadonlyMap<string, readonly LimitSnapshot[]> {
    return new Map(this.limits);
  }

  /** Every recorded ledger entry indexed by dedupe key. */
  snapshotLedgerEntries(): ReadonlyMap<string, LedgerEntry> {
    return new Map(this.ledgerEntries);
  }

  /** Every transaction → its entries. */
  snapshotLedgerByTx(): ReadonlyMap<string, readonly LedgerEntry[]> {
    return new Map(this.ledgerByTx);
  }

  /** Every (chain, txHash) → projection. */
  snapshotProjections(): ReadonlyMap<string, SettlementProjection> {
    return new Map(this.projections);
  }

  /** Every inbox record indexed by eventKey. */
  snapshotInbox(): ReadonlyMap<string, InboxRecord> {
    return new Map(this.inbox);
  }

  /** Every credit usage notification keyed by counterparty. */
  snapshotCreditUsage(): ReadonlyMap<string, readonly import("./types").CreditUsageNotificationRecord[]> {
    return new Map(this.creditUsage);
  }
}

// ── Helpers (exported for inbox / projection / json-file-store) ────────

export function limitKey(providerId: number, counterpartyId: number): string {
  return `${providerId}:${counterpartyId}`;
}

export function projectionKey(chain: string, txHash: string): string {
  return `${chain}:${txHash}`;
}

export function limitEventKey(providerId: number, counterpartyId: number, version: bigint): string {
  return `limit:${providerId}:${counterpartyId}:${version.toString()}`;
}

export function ledgerEventKey(transactionId: bigint): string {
  return `tx:${transactionId.toString()}`;
}

// Used by `listActiveProjections` — declared separately so the Set
// literal's type can be inferred without a circular import.
function isTerminalChainStatus(s: SettlementProjection["chainStatus"]): boolean {
  return s === "CONFIRMED" || s === "REORGED" || s === "INVALID";
}