// read-model/-store.test.ts — 100% coverage on read-model/store.ts.

import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryStore,
  ledgerEventKey,
  limitEventKey,
  limitKey,
  projectionKey,
  type ReadModelStore,
} from "./store";
import {
  DECIMAL_ZERO,
  type InboxRecord,
  type LedgerEntry,
  type LimitSnapshot,
  type SettlementProjection,
} from "./types";

function makeLimit(overrides: Partial<LimitSnapshot> = {}): LimitSnapshot {
  return {
    providerId: 1,
    counterpartyId: 2,
    version: 1n,
    payoutLimit: { unscaled: "1000", exponent: 0 },
    receivedAt: 1000,
    ...overrides,
  };
}

function makeLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    transactionId: 100n,
    accountOwnerId: 1,
    accountType: "BALANCE",
    credit: { unscaled: "100", exponent: 0 },
    context: { kind: "payout", paymentId: 99n },
    receivedAt: 1000,
    ...overrides,
  };
}

function makeProjection(overrides: Partial<SettlementProjection> = {}): SettlementProjection {
  return {
    id: "p_1",
    chain: "TRON",
    txHash: "0xabc",
    amount: { unscaled: "500", exponent: 0 },
    chainStatus: "DETECTED",
    accountingStatus: "NOT_APPLIED",
    detectedAt: 1000,
    lastEventAt: 1000,
    ...overrides,
  };
}

function makeInbox(overrides: Partial<InboxRecord> = {}): InboxRecord {
  return {
    eventKey: "evt_1",
    method: "UPDATE_LIMIT",
    payload: { foo: "bar" },
    receivedAt: 1000,
    attemptCount: 0,
    ...overrides,
  };
}

// ── Helpers (pure key functions) ───────────────────────────────────────

describe("limitKey / projectionKey / limitEventKey / ledgerEventKey", () => {
  it("builds deterministic composite keys", () => {
    expect(limitKey(1, 2)).toBe("1:2");
    expect(projectionKey("TRON", "0xabc")).toBe("TRON:0xabc");
    expect(limitEventKey(1, 2, 5n)).toBe("limit:1:2:5");
    expect(ledgerEventKey(42n)).toBe("tx:42");
  });
});

// ── Limits ─────────────────────────────────────────────────────────────

describe("InMemoryStore.putLimit / latestLimit / listLimits", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it("returns undefined when no limit has been recorded", () => {
    expect(store.latestLimit(1, 2)).toBeUndefined();
    expect(store.listLimits(1, 2)).toEqual([]);
  });

  it("records and reads back a limit, advancing the latest pointer", () => {
    store.putLimit(makeLimit({ version: 1n }));
    expect(store.latestLimit(1, 2)?.version).toBe(1n);
    expect(store.listLimits(1, 2)).toHaveLength(1);
  });

  it("orders history by version", () => {
    store.putLimit(makeLimit({ version: 3n }));
    store.putLimit(makeLimit({ version: 1n }));
    store.putLimit(makeLimit({ version: 2n }));
    const history = store.listLimits(1, 2);
    expect(history.map((h) => h.version)).toEqual([1n, 2n, 3n]);
    expect(store.latestLimit(1, 2)?.version).toBe(3n);
  });

  it("ignores duplicate (providerId, counterpartyId, version)", () => {
    store.putLimit(makeLimit({ version: 1n, payoutLimit: { unscaled: "100", exponent: 0 } }));
    store.putLimit(makeLimit({ version: 1n, payoutLimit: { unscaled: "999", exponent: 0 } }));
    expect(store.listLimits(1, 2)).toHaveLength(1);
    // Original payload is preserved (dedupe, not update).
    expect(store.latestLimit(1, 2)?.payoutLimit).toEqual({ unscaled: "100", exponent: 0 });
  });

  it("does not regress the latest pointer to a smaller version", () => {
    store.putLimit(makeLimit({ version: 5n, payoutLimit: { unscaled: "500", exponent: 0 } }));
    store.putLimit(makeLimit({ version: 3n, payoutLimit: { unscaled: "300", exponent: 0 } }));
    expect(store.latestLimit(1, 2)?.version).toBe(5n);
  });

  it("keeps counters separate per counterparty", () => {
    store.putLimit(makeLimit({ providerId: 1, counterpartyId: 2, version: 1n }));
    store.putLimit(makeLimit({ providerId: 1, counterpartyId: 3, version: 1n }));
    expect(store.latestLimit(1, 2)?.counterpartyId).toBe(2);
    expect(store.latestLimit(1, 3)?.counterpartyId).toBe(3);
    expect(store.listLimits(1, 2)).toHaveLength(1);
    expect(store.listLimits(1, 3)).toHaveLength(1);
  });
});

// ── Ledger ─────────────────────────────────────────────────────────────

describe("InMemoryStore.putLedgerEntry / listLedger / getLedgerTransaction", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it("returns empty arrays when no ledger entries exist", () => {
    expect(store.listLedger(1)).toEqual([]);
    expect(store.getLedgerTransaction(100n)).toEqual([]);
  });

  it("stores a single entry and reads it back", () => {
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 100n, accountOwnerId: 1 }));
    expect(store.listLedger(1)).toHaveLength(1);
    expect(store.getLedgerTransaction(100n)).toHaveLength(1);
  });

  it("dedupes on (transactionId, accountOwnerId, accountType)", () => {
    store.putLedgerEntry(makeLedgerEntry({ credit: { unscaled: "100", exponent: 0 } }));
    store.putLedgerEntry(makeLedgerEntry({ credit: { unscaled: "999", exponent: 0 } }));
    expect(store.listLedger(1)).toHaveLength(1);
    // Original amount preserved.
    expect(store.getLedgerTransaction(100n)[0].credit).toEqual({
      unscaled: "100",
      exponent: 0,
    });
  });

  it("keeps entries with different accountType separate", () => {
    store.putLedgerEntry(makeLedgerEntry({ accountType: "BALANCE" }));
    store.putLedgerEntry(makeLedgerEntry({ accountType: "PAY_IN" }));
    expect(store.getLedgerTransaction(100n)).toHaveLength(2);
  });

  it("filters listLedger by accountOwnerId", () => {
    store.putLedgerEntry(makeLedgerEntry({ accountOwnerId: 1 }));
    store.putLedgerEntry(makeLedgerEntry({ accountOwnerId: 2 }));
    store.putLedgerEntry(makeLedgerEntry({ accountOwnerId: 1, accountType: "PAY_IN" }));
    expect(store.listLedger(1)).toHaveLength(2);
    expect(store.listLedger(2)).toHaveLength(1);
  });

  it("sorts ledger entries by transactionId then accountType", () => {
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 1n, accountType: "PAY_IN" }));
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 2n, accountType: "BALANCE" }));
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 1n, accountType: "BALANCE" }));
    const sorted = store.listLedger(1);
    expect(sorted.map((e) => [String(e.transactionId), e.accountType])).toEqual([
      ["1", "BALANCE"],
      ["1", "PAY_IN"],
      ["2", "BALANCE"],
    ]);
  });
});

// ── Projections ────────────────────────────────────────────────────────

describe("InMemoryStore.putProjection / getProjection / listActiveProjections", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it("upserts by (chain, txHash)", () => {
    store.putProjection(makeProjection({ chainStatus: "DETECTED" }));
    expect(store.getProjection("TRON", "0xabc")?.chainStatus).toBe("DETECTED");
    store.putProjection(makeProjection({ chainStatus: "CONFIRMING" }));
    expect(store.getProjection("TRON", "0xabc")?.chainStatus).toBe("CONFIRMING");
  });

  it("returns undefined for missing projections", () => {
    expect(store.getProjection("ETH", "0xdead")).toBeUndefined();
  });

  it("listActiveProjections excludes terminal statuses", () => {
    store.putProjection(makeProjection({ id: "p1", txHash: "0xa", chainStatus: "DETECTED", detectedAt: 100 }));
    store.putProjection(makeProjection({ id: "p2", txHash: "0xb", chainStatus: "CONFIRMING", detectedAt: 200 }));
    store.putProjection(makeProjection({ id: "p3", txHash: "0xc", chainStatus: "CONFIRMED", detectedAt: 300 }));
    store.putProjection(makeProjection({ id: "p4", txHash: "0xd", chainStatus: "REORGED", detectedAt: 400 }));
    store.putProjection(makeProjection({ id: "p5", txHash: "0xe", chainStatus: "INVALID", detectedAt: 500 }));
    store.putProjection(makeProjection({ id: "p6", txHash: "0xf", chainStatus: "UNKNOWN", detectedAt: 600 }));
    const active = store.listActiveProjections();
    expect(active.map((p) => p.id)).toEqual(["p1", "p2", "p6"]);
  });

  it("listActiveProjections sorts by detectedAt ASC", () => {
    store.putProjection(makeProjection({ id: "p1", txHash: "0xa", detectedAt: 300 }));
    store.putProjection(makeProjection({ id: "p2", txHash: "0xb", detectedAt: 100 }));
    store.putProjection(makeProjection({ id: "p3", txHash: "0xc", detectedAt: 200 }));
    expect(store.listActiveProjections().map((p) => p.id)).toEqual(["p2", "p3", "p1"]);
  });
});

// ── Inbox ──────────────────────────────────────────────────────────────

describe("InMemoryStore inbox dedupe", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it("appends new records and returns them unchanged", () => {
    const rec = makeInbox({ eventKey: "evt_a" });
    const result = store.appendInbox(rec);
    expect(result).toBe(rec);
    expect(store.getInbox("evt_a")).toBe(rec);
    expect(store.hasInbox("evt_a")).toBe(true);
  });

  it("dedupes by eventKey — second append returns the existing record", () => {
    const first = makeInbox({ eventKey: "evt_a", attemptCount: 1 });
    store.appendInbox(first);
    const second = makeInbox({ eventKey: "evt_a", payload: { new: true } });
    const result = store.appendInbox(second);
    expect(result).toBe(first);
    expect(result.payload).toEqual({ foo: "bar" });
    expect(store.hasInbox("evt_a")).toBe(true);
  });

  it("returns undefined for unknown event keys", () => {
    expect(store.getInbox("missing")).toBeUndefined();
    expect(store.hasInbox("missing")).toBe(false);
  });

  it("marks processed and clears any prior error", () => {
    store.appendInbox(makeInbox({ eventKey: "evt_a" }));
    store.markInboxFailed("evt_a", 1100, "transient");
    store.markInboxProcessed("evt_a", 1200);
    const rec = store.getInbox("evt_a");
    expect(rec?.processedAt).toBe(1200);
    expect(rec?.processingError).toBeUndefined();
  });

  it("marks failed: sets error, processedAt, and bumps attemptCount", () => {
    store.appendInbox(makeInbox({ eventKey: "evt_a" }));
    store.markInboxFailed("evt_a", 1100, "boom");
    const rec = store.getInbox("evt_a");
    expect(rec?.processedAt).toBe(1100);
    expect(rec?.processingError).toBe("boom");
    expect(rec?.attemptCount).toBe(1);
    store.markInboxFailed("evt_a", 1200, "boom2");
    expect(store.getInbox("evt_a")?.attemptCount).toBe(2);
  });

  it("markInboxProcessed and markInboxFailed are no-ops on unknown keys", () => {
    expect(() => store.markInboxProcessed("missing", 0)).not.toThrow();
    expect(() => store.markInboxFailed("missing", 0, "x")).not.toThrow();
    expect(store.hasInbox("missing")).toBe(false);
  });
});

// ── Snapshot helpers (used by JsonFileStore) ──────────────────────────

describe("InMemoryStore snapshot helpers", () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it("snapshotLimits returns every limit keyed by counterparty", () => {
    store.putLimit(makeLimit({ providerId: 1, counterpartyId: 2, version: 1n }));
    store.putLimit(makeLimit({ providerId: 1, counterpartyId: 2, version: 2n }));
    store.putLimit(makeLimit({ providerId: 1, counterpartyId: 3, version: 1n }));
    const snap = store.snapshotLimits();
    expect(snap.size).toBe(2);
    expect(snap.get("1:2")?.map((s) => s.version)).toEqual([1n, 2n]);
    expect(snap.get("1:3")?.map((s) => s.version)).toEqual([1n]);
  });

  it("snapshotLedgerEntries indexes by dedupe key", () => {
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 1n, accountOwnerId: 1, accountType: "BALANCE" }));
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 1n, accountOwnerId: 1, accountType: "PAY_IN" }));
    const snap = store.snapshotLedgerEntries();
    expect(snap.size).toBe(2);
    expect(snap.get("1:1:BALANCE")?.transactionId).toBe(1n);
    expect(snap.get("1:1:PAY_IN")?.transactionId).toBe(1n);
  });

  it("snapshotLedgerByTx groups entries by transactionId", () => {
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 1n, accountOwnerId: 1, accountType: "BALANCE" }));
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 1n, accountOwnerId: 1, accountType: "PAY_IN" }));
    store.putLedgerEntry(makeLedgerEntry({ transactionId: 2n, accountOwnerId: 1, accountType: "BALANCE" }));
    const snap = store.snapshotLedgerByTx();
    expect(snap.size).toBe(2);
    expect(snap.get("1")?.length).toBe(2);
    expect(snap.get("2")?.length).toBe(1);
  });

  it("snapshotProjections returns every recorded projection", () => {
    store.putProjection(makeProjection({ id: "p1", txHash: "0xa" }));
    store.putProjection(makeProjection({ id: "p2", txHash: "0xb", chainStatus: "CONFIRMED" }));
    const snap = store.snapshotProjections();
    expect(snap.size).toBe(2);
    expect(snap.get("TRON:0xa")?.id).toBe("p1");
    expect(snap.get("TRON:0xb")?.id).toBe("p2");
  });

  it("snapshotInbox returns every inbox record", () => {
    store.appendInbox(makeInbox({ eventKey: "evt_1" }));
    store.appendInbox(makeInbox({ eventKey: "evt_2" }));
    const snap = store.snapshotInbox();
    expect(snap.size).toBe(2);
    expect(snap.get("evt_1")).toBeDefined();
    expect(snap.get("evt_2")).toBeDefined();
  });
});

// ── ReadModelStore interface smoke (assignability) ─────────────────────

describe("ReadModelStore interface", () => {
  it("InMemoryStore satisfies the contract", () => {
    const store: ReadModelStore = new InMemoryStore();
    // No runtime checks; this is a compile-time sanity step. Touch every
    // method so a future refactor that drops one fails CI.
    store.putLimit(makeLimit());
    store.latestLimit(1, 2);
    store.listLimits(1, 2);
    store.putLedgerEntry(makeLedgerEntry());
    store.listLedger(1);
    store.getLedgerTransaction(100n);
    store.putProjection(makeProjection());
    store.getProjection("TRON", "0xabc");
    store.listActiveProjections();
    store.appendInbox(makeInbox());
    store.markInboxProcessed("evt_a", 0);
    store.markInboxFailed("evt_a", 0, "x");
    store.getInbox("evt_a");
    store.hasInbox("evt_a");
    expect(DECIMAL_ZERO.unscaled).toBe("0");
  });
});