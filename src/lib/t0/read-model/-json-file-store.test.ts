// read-model/-json-file-store.test.ts — 100% coverage on
// read-model/json-file-store.ts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonFileStore, bigintReviver } from "./json-file-store";
import type { InboxRecord, LedgerEntry, LimitSnapshot, SettlementProjection } from "./types";

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

function makeLedger(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
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

function makeTmpDir(): string {
  const dir = join(tmpdir(), `read-model-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

let dir: string;
let path: string;

beforeEach(() => {
  dir = makeTmpDir();
  path = join(dir, "store.json");
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

// ── Construction / empty state ─────────────────────────────────────────

describe("JsonFileStore construction", () => {
  it("creates an empty file when the path does not exist", () => {
    expect(existsSync(path)).toBe(false);
    const store = new JsonFileStore(path);
    expect(existsSync(path)).toBe(true);
    expect(store.latestLimit(1, 2)).toBeUndefined();
    expect(store.listLedger(1)).toEqual([]);
    expect(store.getProjection("TRON", "0xabc")).toBeUndefined();
    expect(store.hasInbox("anything")).toBe(false);
  });

  it("creates parent directories as needed", () => {
    const deepPath = join(dir, "a", "b", "c", "store.json");
    const store = new JsonFileStore(deepPath);
    expect(existsSync(deepPath)).toBe(true);
    store.putLimit(makeLimit());
    expect(store.latestLimit(1, 2)).toBeDefined();
  });

  it("throws on corrupt JSON", () => {
    writeFileSync(path, "{ this is not json");
    expect(() => new JsonFileStore(path)).toThrow(/corrupt/);
  });

  it("throws on unexpected shape (missing schemaVersion)", () => {
    writeFileSync(path, JSON.stringify({ limits: {} }));
    expect(() => new JsonFileStore(path)).toThrow(/unexpected shape/);
  });

  it("throws on schema version mismatch", () => {
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 999,
        limits: {},
        ledgerEntries: {},
        projections: {},
        inbox: {},
      }),
    );
    expect(() => new JsonFileStore(path)).toThrow(/schema version 999/);
  });

  it("replays all records on load", () => {
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        limits: {
          "1:2": [
            {
              providerId: 1,
              counterpartyId: 2,
              version: 5,
              payoutLimit: { unscaled: "500", exponent: 0 },
              receivedAt: 5000,
            },
          ],
        },
        ledgerEntries: {
          "10:1:BALANCE": {
            transactionId: 10,
            accountOwnerId: 1,
            accountType: "BALANCE",
            credit: { unscaled: "99", exponent: 0 },
            context: { kind: "payout", paymentId: 7 },
            receivedAt: 5000,
          },
        },
        projections: {
          "TRON:0xdead": {
            id: "p_z",
            chain: "TRON",
            txHash: "0xdead",
            amount: { unscaled: "200", exponent: 0 },
            chainStatus: "CONFIRMING",
            accountingStatus: "NOT_APPLIED",
            detectedAt: 5000,
            lastEventAt: 5000,
          },
        },
        inbox: {
          evt_old: {
            eventKey: "evt_old",
            method: "UPDATE_LIMIT",
            payload: { x: 1 },
            receivedAt: 5000,
            processedAt: 5500,
            attemptCount: 0,
          },
        },
      }),
    );
    const store = new JsonFileStore(path);
    expect(store.latestLimit(1, 2)?.payoutLimit).toEqual({ unscaled: "500", exponent: 0 });
    expect(store.listLedger(1)).toHaveLength(1);
    expect(store.getProjection("TRON", "0xdead")?.id).toBe("p_z");
    expect(store.getInbox("evt_old")?.processedAt).toBe(5500);
  });

  it("replays a previously-failed inbox record without re-incrementing attemptCount", () => {
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        limits: {},
        ledgerEntries: {},
        projections: {},
        inbox: {
          evt_x: {
            eventKey: "evt_x",
            method: "APPEND_LEDGER_ENTRIES",
            payload: {},
            receivedAt: 1000,
            processedAt: 1100,
            processingError: "boom",
            attemptCount: 2,
          },
        },
      }),
    );
    const store = new JsonFileStore(path);
    const rec = store.getInbox("evt_x");
    expect(rec?.processingError).toBe("boom");
    expect(rec?.attemptCount).toBe(2);
  });
});

// ── Mutating methods persist atomically ───────────────────────────────

describe("JsonFileStore mutating methods", () => {
  it("putLimit persists and reload", () => {
    const a = new JsonFileStore(path);
    a.putLimit(makeLimit({ version: 1n, payoutLimit: { unscaled: "100", exponent: 0 } }));
    a.putLimit(makeLimit({ version: 2n, payoutLimit: { unscaled: "200", exponent: 0 } }));
    const b = new JsonFileStore(path);
    expect(b.listLimits(1, 2).map((s) => s.version)).toEqual([1n, 2n]);
    expect(b.latestLimit(1, 2)?.payoutLimit).toEqual({ unscaled: "200", exponent: 0 });
  });

  it("putLedgerEntry persists and reload", () => {
    const a = new JsonFileStore(path);
    a.putLedgerEntry(makeLedger({ transactionId: 1n, accountOwnerId: 1, accountType: "BALANCE" }));
    a.putLedgerEntry(makeLedger({ transactionId: 1n, accountOwnerId: 1, accountType: "PAY_IN" }));
    const b = new JsonFileStore(path);
    expect(b.listLedger(1)).toHaveLength(2);
    expect(b.getLedgerTransaction(1n)).toHaveLength(2);
  });

  it("putProjection persists and reload", () => {
    const a = new JsonFileStore(path);
    a.putProjection(makeProjection({ chainStatus: "DETECTED" }));
    a.putProjection(makeProjection({ id: "p_2", txHash: "0xb", chainStatus: "CONFIRMING" }));
    const b = new JsonFileStore(path);
    expect(b.getProjection("TRON", "0xabc")?.chainStatus).toBe("DETECTED");
    expect(b.getProjection("TRON", "0xb")?.chainStatus).toBe("CONFIRMING");
  });

  it("appendInbox persists and reload", () => {
    const a = new JsonFileStore(path);
    a.appendInbox(makeInbox({ eventKey: "evt_a" }));
    a.markInboxProcessed("evt_a", 1100);
    a.appendInbox(makeInbox({ eventKey: "evt_b" }));
    a.markInboxFailed("evt_b", 1200, "boom");
    const b = new JsonFileStore(path);
    expect(b.getInbox("evt_a")?.processedAt).toBe(1100);
    expect(b.getInbox("evt_b")?.processingError).toBe("boom");
    expect(b.getInbox("evt_b")?.attemptCount).toBe(1);
  });

  it("every write produces a valid file (round-trip inspection)", () => {
    const a = new JsonFileStore(path);
    a.putLimit(makeLimit({ version: 7n }));
    const raw = readFileSync(path, "utf-8");
    // Use the same reviver the loader uses so bigints round-trip cleanly.
    const parsed = JSON.parse(raw, bigintReviver);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.limits["1:2"][0].version).toBe(7n);
  });

  it("writes go through .tmp + rename (atomic write)", () => {
    // We can't easily intercept the rename from outside, but we can
    // confirm the temp file is cleaned up after a successful write.
    const a = new JsonFileStore(path);
    a.putLimit(makeLimit());
    expect(existsSync(`${path}.tmp`)).toBe(false);
    expect(existsSync(path)).toBe(true);
  });
});

// ── Read-only methods do not trigger persistence ──────────────────────

describe("JsonFileStore read-only methods", () => {
  it("read methods do not bump file mtime / content", () => {
    const a = new JsonFileStore(path);
    a.putLimit(makeLimit());
    const before = readFileSync(path, "utf-8");
    a.latestLimit(1, 2);
    a.listLimits(1, 2);
    a.listLedger(1);
    a.getLedgerTransaction(1n);
    a.getProjection("TRON", "0xabc");
    a.listActiveProjections();
    a.getInbox("evt_1");
    a.hasInbox("evt_1");
    const after = readFileSync(path, "utf-8");
    expect(after).toBe(before);
  });
});
