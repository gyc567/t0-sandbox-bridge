// read-model/-projection.test.ts — 100% coverage on read-model/projection.ts

import { describe, it, expect } from "vitest";
import {
  linkProjection,
  mapAccountType,
  newProjection,
  parseAppendLedgerEntriesRequest,
  parseDecimal,
  parseLedgerTransaction,
  parseLimit,
  parseOptionalDecimal,
  parseUpdateLimitRequest,
  toDecimal,
  type ProtoTransactionShape,
} from "./projection";
import {
  DECIMAL_ZERO,
  isDecimal,
  type Decimal,
  type LedgerEntry,
  type LimitSnapshot,
} from "./types";

const NOW = 1_700_000_000_000;

// ── Decimal parsing ────────────────────────────────────────────────────

describe("parseDecimal", () => {
  it("returns DECIMAL_ZERO for null/undefined", () => {
    expect(parseDecimal(undefined, "x")).toBe(DECIMAL_ZERO);
    expect(parseDecimal(null, "x")).toBe(DECIMAL_ZERO);
  });

  it("accepts a well-formed Decimal", () => {
    expect(parseDecimal({ unscaled: "100", exponent: -2 }, "x")).toEqual({
      unscaled: "100",
      exponent: -2,
    });
  });

  it("normalizes numeric unscaled to string", () => {
    const out = parseDecimal({ unscaled: 100, exponent: 0 }, "x");
    expect(typeof out.unscaled).toBe("string");
    expect(out.unscaled).toBe("100");
  });

  it("preserves negative unscaled", () => {
    expect(parseDecimal({ unscaled: "-50", exponent: -2 }, "x")).toEqual({
      unscaled: "-50",
      exponent: -2,
    });
  });

  it("throws on malformed Decimal (non-integer string)", () => {
    expect(() => parseDecimal({ unscaled: "abc", exponent: 0 }, "x")).toThrow(/malformed/);
    expect(() => parseDecimal({ unscaled: "1.5", exponent: 0 }, "x")).toThrow(/malformed/);
    expect(() => parseDecimal({ unscaled: true, exponent: 0 }, "x")).toThrow(/malformed/);
  });

  it("throws on missing exponent", () => {
    expect(() => parseDecimal({ unscaled: "1" }, "x")).toThrow(/malformed/);
  });
});

describe("parseOptionalDecimal", () => {
  it("returns undefined for undefined", () => {
    expect(parseOptionalDecimal(undefined, "x")).toBeUndefined();
  });

  it("delegates to parseDecimal for non-undefined", () => {
    expect(parseOptionalDecimal({ unscaled: "5", exponent: 0 }, "x")).toEqual({
      unscaled: "5",
      exponent: 0,
    });
  });

  it("parses proto's default-zero Decimal (unscaled=0, exponent=0)", () => {
    // The proto wire format actually sends `{unscaled: 0, exponent: 0}`
    // for unset Decimal fields (the default-initialized message), not
    // `null` or `undefined`. The parser must accept this without
    // misclassifying it as a real value.
    const out = parseOptionalDecimal({ unscaled: 0, exponent: 0 }, "x");
    expect(out).toEqual({ unscaled: "0", exponent: 0 });
  });
});

// ── parseLimit ─────────────────────────────────────────────────────────

describe("parseLimit", () => {
  it("parses a complete UpdateLimitRequest_Limit", () => {
    const limit = {
      version: 7n,
      counterpartId: 23,
      payoutLimit: { unscaled: "1000", exponent: 0 },
      creditLimit: { unscaled: "5000", exponent: 0 },
      creditUsage: { unscaled: "1000", exponent: 0 },
      reserve: { unscaled: "500", exponent: 0 },
    };
    const snap = parseLimit(limit, NOW);
    expect(snap).toMatchObject({
      providerId: 0,
      counterpartyId: 23,
      version: 7n,
      payoutLimit: { unscaled: "1000", exponent: 0 },
      receivedAt: NOW,
      rawPayload: JSON.stringify(limit, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    });
    expect(snap.creditLimit).toEqual({ unscaled: "5000", exponent: 0 });
    expect(snap.creditUsage).toEqual({ unscaled: "1000", exponent: 0 });
    expect(snap.reserve).toEqual({ unscaled: "500", exponent: 0 });
  });

  it("treats missing optional fields as undefined", () => {
    const limit = {
      version: 1n,
      counterpartId: 1,
      payoutLimit: { unscaled: "100", exponent: 0 },
    };
    const snap = parseLimit(limit, NOW);
    expect(snap.creditLimit).toBeUndefined();
    expect(snap.creditUsage).toBeUndefined();
    expect(snap.reserve).toBeUndefined();
  });

  it("throws when version is missing", () => {
    expect(() =>
      parseLimit(
        { counterpartId: 1, payoutLimit: { unscaled: "1", exponent: 0 } } as unknown as Parameters<
          typeof parseLimit
        >[0],
        NOW,
      ),
    ).toThrow(/version/);
  });

  it("throws when counterpartId is missing", () => {
    expect(() =>
      parseLimit(
        { version: 1n, payoutLimit: { unscaled: "1", exponent: 0 } } as unknown as Parameters<
          typeof parseLimit
        >[0],
        NOW,
      ),
    ).toThrow(/counterpartId/);
  });

  it("throws when payoutLimit is missing", () => {
    expect(() => parseLimit({ version: 1n, counterpartId: 1 }, NOW)).toThrow(/payoutLimit/);
  });
});

describe("parseUpdateLimitRequest", () => {
  it("parses multiple limits", () => {
    const req = {
      limits: [
        {
          version: 1n,
          counterpartId: 1,
          payoutLimit: { unscaled: "10", exponent: 0 },
        },
        {
          version: 2n,
          counterpartId: 1,
          payoutLimit: { unscaled: "20", exponent: 0 },
        },
      ],
    };
    const snaps = parseUpdateLimitRequest(req, NOW);
    expect(snaps).toHaveLength(2);
    expect(snaps[0]?.version).toBe(1n);
    expect(snaps[1]?.version).toBe(2n);
  });

  it("returns empty list when limits is empty", () => {
    expect(parseUpdateLimitRequest({ limits: [] }, NOW)).toEqual([]);
  });
});

// ── mapAccountType ─────────────────────────────────────────────────────

describe("mapAccountType", () => {
  it("maps each known enum value", () => {
    expect(mapAccountType(20)).toBe("BALANCE");
    expect(mapAccountType(40)).toBe("PAY_IN");
    expect(mapAccountType(50)).toBe("PAY_OUT");
    expect(mapAccountType(60)).toBe("FEE_EXPENSE");
    expect(mapAccountType(80)).toBe("SETTLEMENT_IN");
    expect(mapAccountType(90)).toBe("SETTLEMENT_OUT");
    expect(mapAccountType(100)).toBe("PAYMENT_INTENT_IN");
    expect(mapAccountType(110)).toBe("PAYMENT_INTENT_OUT");
  });

  it("returns UNKNOWN for unspecified or future enum values", () => {
    expect(mapAccountType(0)).toBe("UNKNOWN");
    expect(mapAccountType(200)).toBe("UNKNOWN");
    expect(mapAccountType(-1)).toBe("UNKNOWN");
  });
});

// ── parseLedgerTransaction / parseAppendLedgerEntriesRequest ───────────

describe("parseLedgerTransaction", () => {
  it("parses a payout transaction with one credit entry", () => {
    const tx = {
      transactionId: 42n,
      entries: [
        {
          accountOwnerId: 1,
          accountType: 20, // BALANCE
          credit: { unscaled: "100", exponent: 0 },
        },
      ],
      transactionDetails: { case: "payout", value: { paymentId: 99n } },
    };
    const out = parseLedgerTransaction(tx, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      transactionId: 42n,
      accountOwnerId: 1,
      accountType: "BALANCE",
      credit: { unscaled: "100", exponent: 0 },
      debit: undefined,
      context: { kind: "payout", paymentId: 99n },
      receivedAt: NOW,
    });
  });

  it("parses providerSettlement context", () => {
    const tx = {
      transactionId: 1n,
      entries: [{ accountOwnerId: 2, accountType: 80, credit: { unscaled: "5", exponent: 0 } }],
      transactionDetails: {
        case: "providerSettlement",
        value: { settlementId: 5n },
      },
    };
    const out = parseLedgerTransaction(tx, NOW);
    expect(out[0]?.context).toEqual({ kind: "providerSettlement", settlementId: 5n });
    expect(out[0]?.accountType).toBe("SETTLEMENT_IN");
  });

  it("parses feeSettlement context", () => {
    const tx = {
      transactionId: 1n,
      entries: [{ accountOwnerId: 1, accountType: 60, debit: { unscaled: "1", exponent: 0 } }],
      transactionDetails: {
        case: "feeSettlement",
        value: { feeSettlementId: 7n },
      },
    };
    const out = parseLedgerTransaction(tx, NOW);
    expect(out[0]?.context).toEqual({ kind: "feeSettlement", feeSettlementId: 7n });
    expect(out[0]?.debit).toEqual({ unscaled: "1", exponent: 0 });
  });

  it("parses piFundsReceived context", () => {
    const tx = {
      transactionId: 1n,
      entries: [{ accountOwnerId: 1, accountType: 100, credit: { unscaled: "50", exponent: 0 } }],
      transactionDetails: {
        case: "piFundsReceived",
        value: {
          paymentIntentId: 11n,
          payInProviderId: 2,
          beneficiaryProviderId: 3,
        },
      },
    };
    const out = parseLedgerTransaction(tx, NOW);
    expect(out[0]?.context).toEqual({ kind: "piFundsReceived", paymentIntentId: 11n });
  });

  it("handles missing transactionDetails (unknown context)", () => {
    const tx = {
      transactionId: 1n,
      entries: [{ accountOwnerId: 1, accountType: 20, credit: { unscaled: "1", exponent: 0 } }],
      transactionDetails: { case: "undefined" },
    } as unknown as ProtoTransactionShape;
    const out = parseLedgerTransaction(tx, NOW);
    expect(out[0]?.context).toEqual({ kind: "unknown" });
  });

  it("maps unknown AccountType to UNKNOWN", () => {
    const tx = {
      transactionId: 1n,
      entries: [{ accountOwnerId: 1, accountType: 999, credit: { unscaled: "1", exponent: 0 } }],
      transactionDetails: { case: "undefined" },
    } as unknown as ProtoTransactionShape;
    const out = parseLedgerTransaction(tx, NOW);
    expect(out[0]?.accountType).toBe("UNKNOWN");
  });

  it("throws when transactionId is not a bigint", () => {
    expect(() =>
      parseLedgerTransaction(
        {
          transactionId: 1,
          entries: [],
          transactionDetails: { case: undefined },
        } as unknown as ProtoTransactionShape,
        NOW,
      ),
    ).toThrow(/transactionId/);
  });
});

describe("parseAppendLedgerEntriesRequest", () => {
  it("flattens multiple transactions and entries", () => {
    const req = {
      transactions: [
        {
          transactionId: 1n,
          entries: [{ accountOwnerId: 1, accountType: 20, credit: { unscaled: "1", exponent: 0 } }],
          transactionDetails: { case: "undefined" },
        },
        {
          transactionId: 2n,
          entries: [
            { accountOwnerId: 2, accountType: 40, credit: { unscaled: "2", exponent: 0 } },
            { accountOwnerId: 2, accountType: 50, debit: { unscaled: "2", exponent: 0 } },
          ],
          transactionDetails: { case: "undefined" },
        },
      ],
    } as unknown as Parameters<typeof parseAppendLedgerEntriesRequest>[0];
    const out = parseAppendLedgerEntriesRequest(req, NOW);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.transactionId.toString())).toEqual(["1", "2", "2"]);
  });

  it("returns empty list for empty transactions", () => {
    expect(parseAppendLedgerEntriesRequest({ transactions: [] }, NOW)).toEqual([]);
  });
});

// ── Projection helpers ─────────────────────────────────────────────────

describe("newProjection", () => {
  it("creates a projection with DETECTED / NOT_APPLIED defaults", () => {
    const p = newProjection({
      id: "p1",
      chain: "TRON",
      txHash: "0xabc",
      amount: { unscaled: "500", exponent: 0 },
      detectedAt: NOW,
    });
    expect(p).toMatchObject({
      id: "p1",
      chain: "TRON",
      txHash: "0xabc",
      amount: { unscaled: "500", exponent: 0 },
      chainStatus: "DETECTED",
      accountingStatus: "NOT_APPLIED",
      detectedAt: NOW,
      lastEventAt: NOW,
    });
    expect(p.fromProviderId).toBeUndefined();
    expect(p.fromAddress).toBeUndefined();
  });

  it("carries through optional counterparty metadata", () => {
    const p = newProjection({
      id: "p2",
      chain: "ETH",
      txHash: "0xdead",
      amount: { unscaled: "100", exponent: 0 },
      detectedAt: NOW,
      fromProviderId: 1,
      toProviderId: 2,
      fromAddress: "0xfrom",
      toAddress: "0xto",
    });
    expect(p.fromProviderId).toBe(1);
    expect(p.toProviderId).toBe(2);
    expect(p.fromAddress).toBe("0xfrom");
    expect(p.toAddress).toBe("0xto");
  });
});

describe("linkProjection", () => {
  const base = newProjection({
    id: "p1",
    chain: "TRON",
    txHash: "0xabc",
    amount: { unscaled: "500", exponent: 0 },
    detectedAt: NOW,
  });

  it("records ledger transaction id and advances status to LIMIT_RECEIVED", () => {
    const linked = linkProjection(base, { ledgerTransactionId: 100n, at: NOW + 100 });
    expect(linked.ledgerTransactionId).toBe(100n);
    expect(linked.accountingStatus).toBe("LIMIT_RECEIVED");
    expect(linked.lastEventAt).toBe(NOW + 100);
  });

  it("keeps previous ledgerTransactionId when not re-supplied", () => {
    const first = linkProjection(base, { ledgerTransactionId: 100n, at: NOW + 100 });
    const second = linkProjection(first, { limitVersion: 7n, at: NOW + 200 });
    expect(second.ledgerTransactionId).toBe(100n);
    expect(second.limitVersion).toBe(7n);
    expect(second.accountingStatus).toBe("LIMIT_RECEIVED");
  });

  it("records limitVersion without changing accounting status when already LIMIT_RECEIVED", () => {
    const first = linkProjection(base, { ledgerTransactionId: 1n, at: NOW + 100 });
    const second = linkProjection(first, { limitVersion: 7n, at: NOW + 200 });
    expect(second.accountingStatus).toBe("LIMIT_RECEIVED");
    expect(second.limitVersion).toBe(7n);
  });

  it("returns a new object (immutability)", () => {
    const linked = linkProjection(base, { ledgerTransactionId: 1n, at: NOW + 100 });
    expect(linked).not.toBe(base);
    expect(base.ledgerTransactionId).toBeUndefined();
  });
});

// ── Re-exported toDecimal / isDecimal sanity ───────────────────────────

describe("projection re-exports", () => {
  it("re-exports toDecimal", () => {
    expect(toDecimal("7")).toEqual({ unscaled: "7", exponent: 0 });
  });
});
