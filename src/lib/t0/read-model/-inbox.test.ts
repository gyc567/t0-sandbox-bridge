// read-model/-inbox.test.ts — 100% coverage on read-model/inbox.ts

import { describe, it, expect, beforeEach } from "vitest";
import { CallbackInbox } from "./inbox";
import { InMemoryStore } from "./store";
import { ledgerEventKey, limitEventKey } from "./store";

const NOW = 1_700_000_000_000;

type LimitFields = {
  version: bigint;
  counterpartId: number;
  payoutLimit: { unscaled: string; exponent: number };
  creditLimit?: { unscaled: string; exponent: number };
  creditUsage?: { unscaled: string; exponent: number };
  reserve?: { unscaled: string; exponent: number };
};

type LedgerEntryFields = {
  accountOwnerId: number;
  accountType: number;
  credit?: { unscaled: string; exponent: number };
  debit?: { unscaled: string; exponent: number };
};

type TransactionFields = {
  transactionId: bigint;
  entries: readonly LedgerEntryFields[];
  transactionDetails: {
    case: string;
    value?: unknown;
  };
};

function newInbox(providerId = 0): { inbox: CallbackInbox; store: InMemoryStore } {
  const store = new InMemoryStore();
  return { inbox: new CallbackInbox(store, { providerId, now: () => NOW }), store };
}

function makeLimit(overrides: Partial<LimitFields> = {}): LimitFields {
  return {
    version: 1n,
    counterpartId: 23,
    payoutLimit: { unscaled: "1000", exponent: 0 },
    creditLimit: { unscaled: "5000", exponent: 0 },
    creditUsage: { unscaled: "1000", exponent: 0 },
    reserve: { unscaled: "500", exponent: 0 },
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<TransactionFields> = {}): TransactionFields {
  return {
    transactionId: 1n,
    entries: [
      {
        accountOwnerId: 1,
        accountType: 20, // BALANCE
        credit: { unscaled: "100", exponent: 0 },
      },
    ],
    transactionDetails: { case: "undefined" },
    ...overrides,
  };
}

// ── UpdateLimit handling ───────────────────────────────────────────────

describe("CallbackInbox.handleUpdateLimit", () => {
  it("stores the snapshot and returns it", () => {
    const { inbox, store } = newInbox(7);
    const { snapshots, alreadyProcessed } = inbox.handleUpdateLimit({
      limits: [makeLimit()],
    });
    expect(snapshots).toHaveLength(1);
    expect(alreadyProcessed).toBe(false);
    expect(store.latestLimit(7, 23)?.payoutLimit).toEqual({ unscaled: "1000", exponent: 0 });
  });

  it("annotates the snapshot with the receiving providerId", () => {
    const { inbox, store } = newInbox(42);
    inbox.handleUpdateLimit({ limits: [makeLimit()] });
    expect(store.latestLimit(42, 23)?.providerId).toBe(42);
  });

  it("records an inbox entry for the dedupe key", () => {
    const { inbox, store } = newInbox();
    inbox.handleUpdateLimit({ limits: [makeLimit({ version: 5n })] });
    const rec = store.getInbox(limitEventKey(23, 0, 5n));
    expect(rec?.method).toBe("UPDATE_LIMIT");
    expect(rec?.processedAt).toBe(NOW);
  });

  it("is idempotent on duplicate (counterparty, version)", () => {
    const { inbox, store } = newInbox();
    inbox.handleUpdateLimit({
      limits: [makeLimit({ version: 1n, payoutLimit: { unscaled: "100", exponent: 0 } })],
    });
    const second = inbox.handleUpdateLimit({
      limits: [makeLimit({ version: 1n, payoutLimit: { unscaled: "999", exponent: 0 } })],
    });
    expect(second.snapshots).toHaveLength(0);
    expect(second.alreadyProcessed).toBe(true);
    // Original amount preserved.
    expect(store.latestLimit(0, 23)?.payoutLimit).toEqual({ unscaled: "100", exponent: 0 });
  });

  it("processes out-of-order versions (older then newer) without regressing latest", () => {
    const { inbox, store } = newInbox();
    inbox.handleUpdateLimit({ limits: [makeLimit({ version: 5n })] });
    inbox.handleUpdateLimit({ limits: [makeLimit({ version: 1n })] });
    expect(store.latestLimit(0, 23)?.version).toBe(5n);
  });

  it("handles multiple counterparties in one request", () => {
    const { inbox, store } = newInbox();
    inbox.handleUpdateLimit({
      limits: [
        makeLimit({ counterpartId: 1, version: 1n }),
        makeLimit({ counterpartId: 2, version: 1n }),
      ],
    });
    expect(store.latestLimit(0, 1)?.counterpartyId).toBe(1);
    expect(store.latestLimit(0, 2)?.counterpartyId).toBe(2);
  });

  it("handles a request with zero limits", () => {
    const { inbox } = newInbox();
    const { snapshots, alreadyProcessed } = inbox.handleUpdateLimit({ limits: [] });
    expect(snapshots).toHaveLength(0);
    expect(alreadyProcessed).toBe(true);
  });
});

// ── AppendLedgerEntries handling ───────────────────────────────────────

describe("CallbackInbox.handleAppendLedgerEntries", () => {
  it("stores entries and returns them", () => {
    const { inbox, store } = newInbox();
    const { entries, duplicateTransactionIds } = inbox.handleAppendLedgerEntries({
      transactions: [makeTransaction()],
    });
    expect(entries).toHaveLength(1);
    expect(duplicateTransactionIds).toEqual([]);
    expect(store.getLedgerTransaction(1n)).toHaveLength(1);
  });

  it("is idempotent on duplicate transactionId", () => {
    const { inbox, store } = newInbox();
    inbox.handleAppendLedgerEntries({ transactions: [makeTransaction()] });
    const second = inbox.handleAppendLedgerEntries({
      transactions: [
        makeTransaction({
          entries: [
            { accountOwnerId: 1, accountType: 20, credit: { unscaled: "999", exponent: 0 } },
          ],
        }),
      ],
    });
    expect(second.entries).toHaveLength(0);
    expect(second.duplicateTransactionIds).toEqual([1n]);
    // Original entry preserved.
    expect(store.getLedgerTransaction(1n)[0]?.credit).toEqual({ unscaled: "100", exponent: 0 });
  });

  it("handles multiple transactions in one request", () => {
    const { inbox, store } = newInbox();
    inbox.handleAppendLedgerEntries({
      transactions: [
        makeTransaction({ transactionId: 1n }),
        makeTransaction({ transactionId: 2n }),
      ],
    });
    expect(store.getLedgerTransaction(1n)).toHaveLength(1);
    expect(store.getLedgerTransaction(2n)).toHaveLength(1);
  });

  it("records an inbox entry per transaction", () => {
    const { inbox, store } = newInbox();
    inbox.handleAppendLedgerEntries({
      transactions: [
        makeTransaction({ transactionId: 1n }),
        makeTransaction({ transactionId: 2n }),
      ],
    });
    expect(store.getInbox(ledgerEventKey(1n))?.processedAt).toBe(NOW);
    expect(store.getInbox(ledgerEventKey(2n))?.processedAt).toBe(NOW);
  });

  it("processes transactions in arbitrary order", () => {
    const { inbox, store } = newInbox();
    inbox.handleAppendLedgerEntries({ transactions: [makeTransaction({ transactionId: 2n })] });
    inbox.handleAppendLedgerEntries({ transactions: [makeTransaction({ transactionId: 1n })] });
    expect(store.getLedgerTransaction(1n)).toHaveLength(1);
    expect(store.getLedgerTransaction(2n)).toHaveLength(1);
  });

  it("handles a request with zero transactions", () => {
    const { inbox } = newInbox();
    const { entries, duplicateTransactionIds } = inbox.handleAppendLedgerEntries({
      transactions: [],
    });
    expect(entries).toEqual([]);
    expect(duplicateTransactionIds).toEqual([]);
  });

  it("stores every entry from a multi-entry transaction", () => {
    const { inbox, store } = newInbox();
    inbox.handleAppendLedgerEntries({
      transactions: [
        makeTransaction({
          transactionId: 1n,
          entries: [
            { accountOwnerId: 1, accountType: 20, credit: { unscaled: "1", exponent: 0 } },
            { accountOwnerId: 1, accountType: 40, debit: { unscaled: "1", exponent: 0 } },
          ],
        }),
      ],
    });
    expect(store.getLedgerTransaction(1n)).toHaveLength(2);
  });
});

// ── Read views ─────────────────────────────────────────────────────────

describe("CallbackInbox read views", () => {
  it("latestLimit returns the latest snapshot for the receiving provider", () => {
    const { inbox } = newInbox(7);
    inbox.handleUpdateLimit({ limits: [makeLimit({ version: 1n })] });
    expect(inbox.latestLimit(23)?.providerId).toBe(7);
  });

  it("latestLimit returns undefined for unknown counterparties", () => {
    const { inbox } = newInbox();
    expect(inbox.latestLimit(99)).toBeUndefined();
  });

  it("hasLimitVersion reflects the inbox processedAt state", () => {
    const { inbox } = newInbox();
    expect(inbox.hasLimitVersion(23, 1n)).toBe(false);
    inbox.handleUpdateLimit({ limits: [makeLimit({ version: 1n })] });
    expect(inbox.hasLimitVersion(23, 1n)).toBe(true);
  });

  it("hasTransaction reflects the inbox processedAt state", () => {
    const { inbox } = newInbox();
    expect(inbox.hasTransaction(1n)).toBe(false);
    inbox.handleAppendLedgerEntries({ transactions: [makeTransaction({ transactionId: 1n })] });
    expect(inbox.hasTransaction(1n)).toBe(true);
  });
});
