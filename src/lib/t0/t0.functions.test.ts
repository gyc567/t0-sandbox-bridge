// t0.functions.test.ts — server-fn surface boundary tests.
//
// These tests verify that:
//   * The new read-model server fns (Phase 1+2+3) read from the shared
//     ReadModelStore singleton.
//   * The OFI/Provider view fns return the same shape the UI consumes.
//   * The boundary between the orchestrator (SandboxNetwork / shared
//     CallbackInbox) and the server-fn surface is sealed — a server fn
//     can never bypass the read model.
//
// We test the inner `read*` functions (the handler bodies) directly
// because invoking `createServerFn` requires a TanStack Start
// AsyncLocalStorage context that isn't available in unit tests.

import { describe, it, expect } from "vitest";
import { sharedStore, sharedCallbackInbox } from "./read-model/instance";
import type { LimitSnapshot, LedgerEntry, SettlementProjection } from "./read-model/types";
import {
  readOfiReadModel,
  readProviderLimitHistory,
  readProviderLatestLimit,
  readProviderLedger,
  readProviderCounterparties,
  readCallbackInboxState,
} from "./t0.functions";

const NOW = 1_700_000_000_000;

function makeLimit(overrides: Partial<LimitSnapshot> = {}): LimitSnapshot {
  return {
    providerId: 0,
    counterpartyId: 7,
    version: 1n,
    payoutLimit: { unscaled: "1000", exponent: 0 },
    creditLimit: { unscaled: "5000", exponent: 0 },
    creditUsage: { unscaled: "1000", exponent: 0 },
    reserve: { unscaled: "500", exponent: 0 },
    receivedAt: NOW,
    ...overrides,
  };
}

function makeLedger(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    transactionId: 1n,
    accountOwnerId: 7,
    accountType: "BALANCE",
    credit: { unscaled: "100", exponent: 0 },
    context: { kind: "payout", paymentId: 99n },
    receivedAt: NOW,
    ...overrides,
  };
}

function makeProjection(overrides: Partial<SettlementProjection> = {}): SettlementProjection {
  return {
    id: "p1",
    chain: "TRON",
    txHash: "0xabc",
    amount: { unscaled: "500", exponent: 0 },
    chainStatus: "DETECTED",
    accountingStatus: "NOT_APPLIED",
    detectedAt: NOW,
    lastEventAt: NOW,
    ...overrides,
  };
}

// ── readOfiReadModel ─────────────────────────────────────────────────────

describe("readOfiReadModel", () => {
  it("returns null latestLimit on an unknown counterparty", () => {
    const r = readOfiReadModel({ counterpartyId: 999999 });
    expect(r.latestLimit).toBeNull();
    expect(r.activeProjections).toEqual([]);
  });

  it("returns the latest limit when one is recorded for the counterparty", () => {
    sharedStore.putLimit(makeLimit({ counterpartyId: 701, version: 1n }));
    sharedStore.putLimit(
      makeLimit({
        counterpartyId: 701,
        version: 2n,
        payoutLimit: { unscaled: "2000", exponent: 0 },
      }),
    );
    const r = readOfiReadModel({ counterpartyId: 701 });
    expect(r.latestLimit?.version).toBe(2n);
    expect(r.latestLimit?.payoutLimit).toEqual({ unscaled: "2000", exponent: 0 });
  });

  it("returns only active projections (excludes terminal statuses)", () => {
    sharedStore.putProjection(makeProjection({ id: "p1", txHash: "0xa", chainStatus: "DETECTED" }));
    sharedStore.putProjection(
      makeProjection({ id: "p2", txHash: "0xb", chainStatus: "CONFIRMING" }),
    );
    sharedStore.putProjection(
      makeProjection({ id: "p3", txHash: "0xc", chainStatus: "CONFIRMED" }),
    );
    sharedStore.putProjection(makeProjection({ id: "p4", txHash: "0xd", chainStatus: "REORGED" }));
    sharedStore.putProjection(makeProjection({ id: "p5", txHash: "0xe", chainStatus: "INVALID" }));
    sharedStore.putProjection(makeProjection({ id: "p6", txHash: "0xf", chainStatus: "UNKNOWN" }));
    const r = readOfiReadModel({ counterpartyId: 702 });
    expect(r.activeProjections.map((p) => p.id)).toEqual(["p1", "p2", "p6"]);
  });

  it("returns projections sorted by detectedAt ASC", () => {
    sharedStore.putProjection(makeProjection({ id: "p1", txHash: "0xa", detectedAt: 300 }));
    sharedStore.putProjection(makeProjection({ id: "p2", txHash: "0xb", detectedAt: 100 }));
    const r = readOfiReadModel({ counterpartyId: 703 });
    expect(
      r.activeProjections.filter((p) => p.id === "p2" || p.id === "p1").map((p) => p.id),
    ).toEqual(["p2", "p1"]);
  });
});

// ── readProviderLatestLimit ──────────────────────────────────────────────

describe("readProviderLatestLimit", () => {
  it("returns null when no limit recorded", () => {
    const r = readProviderLatestLimit({ counterpartyId: 800 });
    expect(r.latest).toBeNull();
  });

  it("scopes by providerId", () => {
    sharedStore.putLimit(makeLimit({ providerId: 0, counterpartyId: 801, version: 1n }));
    sharedStore.putLimit(makeLimit({ providerId: 99, counterpartyId: 801, version: 2n }));
    const r = readProviderLatestLimit({ counterpartyId: 801, providerId: 0 });
    expect(r.latest?.providerId).toBe(0);
    expect(r.latest?.version).toBe(1n);
  });

  it("uses providerId 0 when not supplied", () => {
    sharedStore.putLimit(makeLimit({ providerId: 0, counterpartyId: 802, version: 1n }));
    const r = readProviderLatestLimit({ counterpartyId: 802 });
    expect(r.latest?.version).toBe(1n);
  });
});

// ── readProviderLimitHistory ─────────────────────────────────────────────

describe("readProviderLimitHistory", () => {
  it("returns empty array for unknown counterparty", () => {
    const r = readProviderLimitHistory({ counterpartyId: 900 });
    expect(r.history).toEqual([]);
  });

  it("returns every recorded version ordered ascending", () => {
    sharedStore.putLimit(makeLimit({ counterpartyId: 901, version: 3n }));
    sharedStore.putLimit(makeLimit({ counterpartyId: 901, version: 1n }));
    sharedStore.putLimit(makeLimit({ counterpartyId: 901, version: 2n }));
    const r = readProviderLimitHistory({ counterpartyId: 901 });
    expect(r.history.map((h) => h.version)).toEqual([1n, 2n, 3n]);
  });

  it("scopes by providerId", () => {
    sharedStore.putLimit(makeLimit({ providerId: 0, counterpartyId: 902, version: 1n }));
    sharedStore.putLimit(makeLimit({ providerId: 99, counterpartyId: 902, version: 2n }));
    const r = readProviderLimitHistory({ counterpartyId: 902, providerId: 0 });
    expect(r.history.map((h) => h.version)).toEqual([1n]);
  });
});

// ── readProviderLedger ───────────────────────────────────────────────────

describe("readProviderLedger", () => {
  it("returns empty array for unknown account owner", () => {
    const r = readProviderLedger({ accountOwnerId: 1000 });
    expect(r.entries).toEqual([]);
  });

  it("returns entries filtered by account owner id", () => {
    sharedStore.putLedgerEntry(makeLedger({ accountOwnerId: 1001, transactionId: 1n }));
    sharedStore.putLedgerEntry(makeLedger({ accountOwnerId: 1001, transactionId: 2n }));
    sharedStore.putLedgerEntry(makeLedger({ accountOwnerId: 1002, transactionId: 3n }));
    const r = readProviderLedger({ accountOwnerId: 1001 });
    expect(r.entries).toHaveLength(2);
    expect(r.entries.every((e) => e.accountOwnerId === 1001)).toBe(true);
  });

  it("sorts by transactionId ASC", () => {
    sharedStore.putLedgerEntry(makeLedger({ transactionId: 3n, accountOwnerId: 1003 }));
    sharedStore.putLedgerEntry(makeLedger({ transactionId: 1n, accountOwnerId: 1003 }));
    sharedStore.putLedgerEntry(makeLedger({ transactionId: 2n, accountOwnerId: 1003 }));
    const r = readProviderLedger({ accountOwnerId: 1003 });
    expect(r.entries.map((e) => e.transactionId)).toEqual([1n, 2n, 3n]);
  });
});

// ── readProviderCounterparties ───────────────────────────────────────────

describe("readProviderCounterparties", () => {
  it("returns empty list for an unused providerId", () => {
    const r = readProviderCounterparties({ providerId: 999999 });
    expect(r.counterparties).toEqual([]);
  });

  it("groups by counterparty id, scoped to providerId", () => {
    sharedStore.putLimit(makeLimit({ providerId: 2001, counterpartyId: 3001, version: 1n }));
    sharedStore.putLimit(makeLimit({ providerId: 2001, counterpartyId: 3002, version: 1n }));
    sharedStore.putLimit(makeLimit({ providerId: 2099, counterpartyId: 3003, version: 1n }));
    const r = readProviderCounterparties({ providerId: 2001 });
    expect(r.counterparties.map((c) => c.counterpartyId)).toEqual([3001, 3002]);
  });

  it("returns the latest snapshot for each counterparty", () => {
    sharedStore.putLimit(makeLimit({ providerId: 2002, counterpartyId: 4001, version: 1n }));
    sharedStore.putLimit(
      makeLimit({
        providerId: 2002,
        counterpartyId: 4001,
        version: 2n,
        payoutLimit: { unscaled: "2000", exponent: 0 },
      }),
    );
    const r = readProviderCounterparties({ providerId: 2002 });
    const cp = r.counterparties.find((c) => c.counterpartyId === 4001)!;
    expect(cp.latest?.version).toBe(2n);
    expect(cp.latest?.payoutLimit).toEqual({ unscaled: "2000", exponent: 0 });
  });
});

// ── readCallbackInboxState ──────────────────────────────────────────────

describe("readCallbackInboxState", () => {
  it("counts processed entries relative to a baseline", () => {
    const before = readCallbackInboxState();
    sharedCallbackInbox.handleUpdateLimit({
      limits: [
        {
          version: BigInt(Date.now()), // unique version to avoid dedupe
          counterpartId: 5001,
          payoutLimit: { unscaled: "1000", exponent: 0 },
        },
      ],
    });
    const after = readCallbackInboxState();
    expect(after.processed).toBe(before.processed + 1);
    expect(after.total).toBe(before.total + 1);
  });

  it("counts each inbox record as one item", () => {
    const before = readCallbackInboxState();
    const txBase = BigInt(Date.now());
    sharedCallbackInbox.handleAppendLedgerEntries({
      transactions: [
        {
          transactionId: txBase,
          entries: [
            { accountOwnerId: 5002, accountType: 20, credit: { unscaled: "100", exponent: 0 } },
          ],
          transactionDetails: { case: "undefined" },
        },
        {
          transactionId: txBase + 1n,
          entries: [
            { accountOwnerId: 5002, accountType: 20, credit: { unscaled: "200", exponent: 0 } },
          ],
          transactionDetails: { case: "undefined" },
        },
      ],
    });
    const after = readCallbackInboxState();
    expect(after.processed).toBe(before.processed + 2);
    expect(after.total).toBe(before.total + 2);
  });
});
