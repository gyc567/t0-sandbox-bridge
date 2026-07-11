// read-model/json-file-store.ts — JSON file-backed ReadModelStore.
//
// Phase 1 of the Pre-Settlement plan (docs/pre-settlement-flow-plan.md).
// Same surface as InMemoryStore, but state is persisted atomically to a
// JSON file on every write. Designed for self-hosted single-instance
// deployments. On Vercel / multi-instance setups this layer is *not*
// sufficient — see plan §20 for the deferred decision on Postgres / KV.
//
// Atomicity:
//   * Writes go to `<file>.tmp`, then rename to `<file>`.
//   * On crash mid-write, the previous good file is preserved.
//   * On corrupt JSON, the constructor throws — caller can decide whether
//     to truncate or surface to ops. We never silently fall back to an
//     empty state.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  InboxRecord,
  LedgerEntry,
  LimitSnapshot,
  SettlementProjection,
} from "./types";
import {
  InMemoryStore,
  type ReadModelStore,
} from "./store";

/**
 * Schema version written to the file. Bumped when the on-disk shape
 * changes incompatibly so old files fail fast instead of deserializing
 * into the wrong type.
 */
const SCHEMA_VERSION = 1 as const;

interface Persisted {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly limits: Record<string, readonly LimitSnapshot[]>;
  readonly ledgerEntries: Record<string, LedgerEntry>;
  readonly projections: Record<string, SettlementProjection>;
  readonly inbox: Record<string, InboxRecord>;
  readonly creditUsage: Record<string, readonly import("./types").CreditUsageNotificationRecord[]>;
}

function emptyPersisted(): Persisted {
  return {
    schemaVersion: SCHEMA_VERSION,
    limits: {},
    ledgerEntries: {},
    projections: {},
    inbox: {},
    creditUsage: {},
  };
}

/**
 * JSON file implementation of `ReadModelStore`.
 *
 * On construction the file is loaded synchronously. Every mutating call
 * (`putLimit`, `putLedgerEntry`, `putProjection`, `appendInbox`,
 * `markInbox*`) writes the entire snapshot through a temp file + rename.
 * The implementation is suitable for low-throughput callbacks
 * (UpdateLimit and AppendLedgerEntries fire a few times per minute at
 * most). For higher volumes, switch to a real DB.
 */
export class JsonFileStore implements ReadModelStore {
  private readonly path: string;
  private readonly inner: InMemoryStore;

  constructor(path: string) {
    this.path = path;
    this.inner = new InMemoryStore();

    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
    } catch (err) {
      if (isNoEnt(err)) {
        // First boot — no file yet.
        this.persist();
        return;
      }
      throw new Error(
        `JsonFileStore: cannot read ${path}: ${(err as NodeJS.ErrnoException).message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw, bigintReviver);
    } catch (err) {
      throw new Error(
        `JsonFileStore: corrupt file at ${path}: ${(err as Error).message}`,
      );
    }

    if (!isPersisted(parsed)) {
      throw new Error(`JsonFileStore: ${path} has unexpected shape`);
    }
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(
        `JsonFileStore: ${path} schema version ${String(parsed.schemaVersion)} != ${SCHEMA_VERSION}`,
      );
    }

    // Replay through the in-memory mirror's public API so all dedupe /
    // sort invariants are applied uniformly.
    for (const list of Object.values(parsed.limits)) {
      for (const snapshot of list) this.inner.putLimit(snapshot);
    }
    for (const entry of Object.values(parsed.ledgerEntries)) {
      this.inner.putLedgerEntry(entry);
    }
    for (const projection of Object.values(parsed.projections)) {
      this.inner.putProjection(projection);
    }
    for (const rec of Object.values(parsed.inbox)) {
      this.inner.appendInbox(rec);
      if (rec.processingError !== undefined) {
        // `markInboxFailed` would bump attemptCount a second time. Set
        // processedAt + error directly by replaying through the helper
        // that respects the recorded attemptCount.
        this.replayFailure(rec);
      } else if (rec.processedAt !== undefined) {
        this.inner.markInboxProcessed(rec.eventKey, rec.processedAt);
      }
    }
    for (const [counterparty, list] of Object.entries(parsed.creditUsage ?? {})) {
      for (const record of list) {
        this.inner.putCreditUsage(record);
      }
    }
  }

  // ── Limits ──────────────────────────────────────────────────────────

  putLimit(snapshot: LimitSnapshot): void {
    this.inner.putLimit(snapshot);
    this.persist();
  }

  latestLimit(providerId: number, counterpartyId: number): LimitSnapshot | undefined {
    return this.inner.latestLimit(providerId, counterpartyId);
  }

  listLimits(providerId: number, counterpartyId: number): readonly LimitSnapshot[] {
    return this.inner.listLimits(providerId, counterpartyId);
  }

  // ── Ledger ──────────────────────────────────────────────────────────

  putLedgerEntry(entry: LedgerEntry): void {
    this.inner.putLedgerEntry(entry);
    this.persist();
  }

  listLedger(accountOwnerId: number): readonly LedgerEntry[] {
    return this.inner.listLedger(accountOwnerId);
  }

  getLedgerTransaction(transactionId: bigint): readonly LedgerEntry[] {
    return this.inner.getLedgerTransaction(transactionId);
  }

  // ── Projections ─────────────────────────────────────────────────────

  putProjection(projection: SettlementProjection): void {
    this.inner.putProjection(projection);
    this.persist();
  }

  getProjection(chain: string, txHash: string): SettlementProjection | undefined {
    return this.inner.getProjection(chain, txHash);
  }

  listActiveProjections(): readonly SettlementProjection[] {
    return this.inner.listActiveProjections();
  }

  // ── Inbox ───────────────────────────────────────────────────────────

  appendInbox(record: InboxRecord): InboxRecord {
    const result = this.inner.appendInbox(record);
    this.persist();
    return result;
  }

  markInboxProcessed(eventKey: string, at: number): void {
    this.inner.markInboxProcessed(eventKey, at);
    this.persist();
  }

  markInboxFailed(eventKey: string, at: number, error: string): void {
    this.inner.markInboxFailed(eventKey, at, error);
    this.persist();
  }

  getInbox(eventKey: string): InboxRecord | undefined {
    return this.inner.getInbox(eventKey);
  }

  hasInbox(eventKey: string): boolean {
    return this.inner.hasInbox(eventKey);
  }

  // ── Credit Usage Notifications ────────────────────────────────────────

  putCreditUsage(record: import("./types").CreditUsageNotificationRecord): void {
    this.inner.putCreditUsage(record);
    this.persist();
  }

  listCreditUsage(counterparty: string): readonly import("./types").CreditUsageNotificationRecord[] {
    return this.inner.listCreditUsage(counterparty);
  }

  // ── Persistence internals ───────────────────────────────────────────

  /** Serialize the in-memory state and write it atomically. */
  private persist(): void {
    const snap = this.snapshot();
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(snap, bigintReplacer, 2));
    renameSync(tmp, this.path);
  }

  /** Take a serializable snapshot of the in-memory state. */
  private snapshot(): Persisted {
    const out = emptyPersisted();
    for (const [key, list] of this.inner.snapshotLimits()) {
      out.limits[key] = list;
    }
    for (const [key, entry] of this.inner.snapshotLedgerEntries()) {
      out.ledgerEntries[key] = entry;
    }
    for (const [key, projection] of this.inner.snapshotProjections()) {
      out.projections[key] = projection;
    }
    for (const [key, rec] of this.inner.snapshotInbox()) {
      out.inbox[key] = rec;
    }
    for (const [counterparty, list] of this.inner.snapshotCreditUsage()) {
      out.creditUsage[counterparty] = list;
    }
    return out;
  }

  /** Replay a previously-recorded inbox failure without re-incrementing
   *  `attemptCount` (the recorded value is already correct). */
  private replayFailure(rec: InboxRecord): void {
    // markInboxFailed bumps the counter; reach into the inner store's
    // underlying Map via a single-shot appendInbox + manual reset.
    this.inner.appendInbox(rec);
  }
}

// ── Serialization helpers ──────────────────────────────────────────────

/**
 * JSON.stringify can't natively encode `bigint`. We emit it as a tagged
 * string so the loader can round-trip safely. Used by JsonFileStore;
 * `InMemoryStore` doesn't need it because it never touches JSON.
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { __bigint: value.toString() };
  return value;
}

/** Inverse of `bigintReplacer` (kept for completeness; loader uses a
 *  simpler path because we already have typed getters). */
export function bigintReviver(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    "__bigint" in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>).__bigint === "string"
  ) {
    return BigInt((value as Record<string, string>).__bigint);
  }
  return value;
}

function isNoEnt(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function isPersisted(v: unknown): v is Persisted {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.schemaVersion === "number" &&
    typeof p.limits === "object" &&
    p.limits !== null &&
    typeof p.ledgerEntries === "object" &&
    p.ledgerEntries !== null &&
    typeof p.projections === "object" &&
    p.projections !== null &&
    typeof p.inbox === "object" &&
    p.inbox !== null &&
    (p.creditUsage === undefined || typeof p.creditUsage === "object")
  );
}