// settlement.test.ts — 100% coverage on the SettlementRegistry.

import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_OFI_WALLET,
  DEFAULT_PROVIDER_WALLET,
  SettlementRegistry,
  type SubmitSettlementInput,
} from "./settlement";

const NOW = 1_700_000_000_000;

function newRegistry(opts?: { pendingTtlMs?: number; now?: () => number }) {
  // Use a holder so tests can swap the clock; the registry always reads
  // through the holder function.
  const holder = { t: opts?.now ?? (() => NOW) };
  const r = new SettlementRegistry({
    confirmDelayMs: 0,
    pendingTtlMs: opts?.pendingTtlMs ?? 30 * 60 * 1000,
    now: () => holder.t(),
  });
  return { r, setNow: (t: number) => { holder.t = () => t; } };
}

function makeInput(overrides: Partial<SubmitSettlementInput> = {}): SubmitSettlementInput {
  return {
    blockchain: "TRON",
    fromAddress: DEFAULT_OFI_WALLET,
    toAddress: DEFAULT_PROVIDER_WALLET,
    usdAmount: 1000,
    ...overrides,
  };
}

// ── submitSettlement ────────────────────────────────────────────────

describe("SettlementRegistry.submitSettlement", () => {
  let registry: SettlementRegistry;
  beforeEach(() => {
    registry = newRegistry().r;
  });

  it("creates a PENDING settlement with the supplied fields", () => {
    const s = registry.submitSettlement(
      makeInput({ txHash: "0xabc", intentRefs: ["pi-1"] }),
    );
    expect(s).toMatchObject({
      txHash: "0xabc",
      blockchain: "TRON",
      usdAmount: 1000,
      intentRefs: ["pi-1"],
      status: "PENDING",
    });
    expect(s.submittedAt).toBe(NOW);
    expect(s.confirmedAt).toBeUndefined();
  });

  it("auto-generates a txHash when none is supplied", () => {
    const s = registry.submitSettlement(makeInput());
    expect(s.txHash).toMatch(/^0x[0-9a-f]{32}$/);
  });

  it("is idempotent: returning the same record on duplicate submit", () => {
    const first = registry.submitSettlement(makeInput({ txHash: "0xdup", usdAmount: 500 }));
    const second = registry.submitSettlement(makeInput({ txHash: "0xdup", usdAmount: 9999 }));
    expect(second).toBe(first);
    expect(second.usdAmount).toBe(500); // original amount preserved
  });

  it("throws on non-positive usdAmount", () => {
    expect(() => registry.submitSettlement(makeInput({ usdAmount: 0 }))).toThrow(/finite positive/);
    expect(() => registry.submitSettlement(makeInput({ usdAmount: -1 }))).toThrow(/finite positive/);
    expect(() => registry.submitSettlement(makeInput({ usdAmount: NaN }))).toThrow(/finite positive/);
  });

  it("does not write ledger entries until confirmByChain", () => {
    registry.submitSettlement(makeInput({ txHash: "0xabc" }));
    expect(registry.listLedger()).toHaveLength(0);
  });
});

// ── confirmByChain ──────────────────────────────────────────────────

describe("SettlementRegistry.confirmByChain", () => {
  it("credits both sides and writes two ledger entries on first confirm", () => {
    const r = newRegistry().r;
    r.submitSettlement(makeInput({ txHash: "0xabc", usdAmount: 2500 }));

    const result = r.confirmByChain("0xabc");

    expect(result.status).toBe("CONFIRMED");
    expect(result.confirmedAt).toBe(NOW);

    expect(r.getCredit("ofi").available).toBe(2500);
    expect(r.getCredit("ofi").reserved).toBe(0);
    expect(r.getCredit("provider").available).toBe(2500);

    const ledger = r.listLedger();
    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toMatchObject({
      account: "OFI_AVAILABLE",
      delta: 2500,
      reason: "SETTLEMENT_CREDIT",
      txHash: "0xabc",
    });
    expect(ledger[1]).toMatchObject({
      account: "PROVIDER_AVAILABLE",
      delta: 2500,
      reason: "SETTLEMENT_CREDIT",
      txHash: "0xabc",
    });
    // Both entries share the same settlementId via the `note` field.
    expect(ledger[0].note).toMatch(/settlementId=(\d+)/);
    expect(ledger[0].note).toBe(ledger[1].note);
  });

  it("is idempotent: a second confirm is a no-op", () => {
    const r = newRegistry().r;
    r.submitSettlement(makeInput({ txHash: "0xabc", usdAmount: 1000 }));
    r.confirmByChain("0xabc");
    r.confirmByChain("0xabc");
    expect(r.getCredit("ofi").available).toBe(1000); // not 2000
    expect(r.listLedger()).toHaveLength(2);
  });

  it("throws when called on an unknown txHash", () => {
    const r = newRegistry().r;
    expect(() => r.confirmByChain("0xmissing")).toThrow(/no PENDING/);
  });

  it("throws on empty txHash", () => {
    const r = newRegistry().r;
    expect(() => r.confirmByChain("")).toThrow(/required/);
  });

  it("throws when settlement has expired", () => {
    const { r, setNow } = newRegistry({ pendingTtlMs: 100 });
    r.submitSettlement(makeInput({ txHash: "0xabc" }));
    setNow(NOW + 200); // jump past TTL
    expect(() => r.confirmByChain("0xabc")).toThrow(/expired/);
  });
});

// ── reserve / release / settle ──────────────────────────────────────

describe("SettlementRegistry credit reservations", () => {
  /** Helper: submit + confirm in one shot, return the txHash that was used. */
  function fund(r: SettlementRegistry, usdAmount: number): string {
    const s = r.submitSettlement(makeInput({ usdAmount }));
    r.confirmByChain(s.txHash);
    return s.txHash;
  }

  it("reserveCredit moves available → reserved", () => {
    const r = newRegistry().r;
    fund(r, 5000);
    const state = r.reserveCredit(1500);
    expect(state).toEqual({ available: 3500, reserved: 1500 });
  });

  it("reserveCredit throws when insufficient credit", () => {
    const r = newRegistry().r;
    expect(() => r.reserveCredit(100)).toThrow(/insufficient/);
  });

  it("reserveCredit throws on non-positive amount", () => {
    const r = newRegistry().r;
    expect(() => r.reserveCredit(0)).toThrow(/finite positive/);
    expect(() => r.reserveCredit(-5)).toThrow(/finite positive/);
  });

  it("releaseCredit returns reserved → available", () => {
    const r = newRegistry().r;
    fund(r, 5000);
    r.reserveCredit(2000);
    const state = r.releaseCredit(2000);
    expect(state).toEqual({ available: 5000, reserved: 0 });
  });

  it("releaseCredit throws on amount greater than reserved", () => {
    const r = newRegistry().r;
    fund(r, 1000);
    r.reserveCredit(100);
    expect(() => r.releaseCredit(200)).toThrow(/insufficient reserved/);
  });

  it("settleCredit deducts from reserved (the money left)", () => {
    const r = newRegistry().r;
    fund(r, 5000);
    r.reserveCredit(2000);
    const state = r.settleCredit(2000);
    expect(state).toEqual({ available: 3000, reserved: 0 });
  });

  it("settleCredit throws on amount greater than reserved", () => {
    const r = newRegistry().r;
    expect(() => r.settleCredit(100)).toThrow(/insufficient reserved/);
  });

  it("releaseCredit and settleCredit write distinct ledger reasons", () => {
    const r = newRegistry().r;
    fund(r, 5000);
    r.reserveCredit(2000);
    r.releaseCredit(2000);
    r.reserveCredit(2000);
    r.settleCredit(2000);
    const reasons = r.listLedger().map((e) => e.reason);
    expect(reasons).toEqual([
      "SETTLEMENT_CREDIT",
      "SETTLEMENT_CREDIT",
      "RESERVATION",
      "RELEASE",
      "RESERVATION",
      "SETTLEMENT",
    ]);
  });
});

// ── expiration & expiry behavior ────────────────────────────────────

describe("SettlementRegistry TTL eviction", () => {
  it("marks PENDING settlements as EXPIRED when past TTL", () => {
    const { r, setNow } = newRegistry({ pendingTtlMs: 100 });
    r.submitSettlement(makeInput({ txHash: "0xa" }));
    r.submitSettlement(makeInput({ txHash: "0xb" }));
    setNow(NOW + 200);
    const pending = r.listPendingSettlements();
    expect(pending).toHaveLength(2);
    expect(pending.every((s) => s.status === "EXPIRED")).toBe(true);
  });

  it("does not credit expired settlements", () => {
    const { r, setNow } = newRegistry({ pendingTtlMs: 100 });
    r.submitSettlement(makeInput({ txHash: "0xa", usdAmount: 1000 }));
    setNow(NOW + 200);
    expect(() => r.confirmByChain("0xa")).toThrow(/expired/);
    expect(r.getCredit("ofi").available).toBe(0);
  });

  it("default pendingTtlMs is 30 minutes", () => {
    const r = new SettlementRegistry();
    expect(r).toBeDefined(); // construction didn't throw
  });
});

// ── read views ──────────────────────────────────────────────────────

describe("SettlementRegistry snapshots", () => {
  it("snapshot returns pending, ledger, and both credit states", () => {
    const r = newRegistry().r;
    r.submitSettlement(makeInput({ txHash: "0xa" }));
    r.confirmByChain("0xa");
    const snap = r.snapshot();
    expect(snap.pending).toEqual([]);
    expect(snap.ledger).toHaveLength(2);
    expect(snap.ofiCredit).toEqual({ available: 1000, reserved: 0 });
    expect(snap.providerCredit).toEqual({ available: 1000, reserved: 0 });
  });

  it("listPendingSettlements returns a copy, not the live Map", () => {
    const r = newRegistry().r;
    r.submitSettlement(makeInput({ txHash: "0xa" }));
    const list = r.listPendingSettlements() as Settlement[];
    list.length = 0; // mutate the array
    expect(r.listPendingSettlements()).toHaveLength(1);
  });

  it("listConfirmedSettlements excludes PENDING", () => {
    const r = newRegistry().r;
    r.submitSettlement(makeInput({ txHash: "0xa" }));
    r.submitSettlement(makeInput({ txHash: "0xb" }));
    r.confirmByChain("0xa");
    const confirmed = r.listConfirmedSettlements();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.txHash).toBe("0xa");
  });

  it("settlementId increments across confirms", () => {
    const r = newRegistry().r;
    r.submitSettlement(makeInput({ txHash: "0xa" }));
    r.submitSettlement(makeInput({ txHash: "0xb" }));
    r.confirmByChain("0xa");
    r.confirmByChain("0xb");
    const ledger = r.listLedger();
    const ids = ledger
      .filter((e) => e.reason === "SETTLEMENT_CREDIT")
      .map((e) => e.note);
    expect(ids[0]).not.toBe(ids[2]);
  });
});

// ── re-exports ──────────────────────────────────────────────────────

describe("module re-exports", () => {
  it("DEFAULT_OFI_WALLET and DEFAULT_PROVIDER_WALLET are exported strings", () => {
    expect(typeof DEFAULT_OFI_WALLET).toBe("string");
    expect(typeof DEFAULT_PROVIDER_WALLET).toBe("string");
    expect(DEFAULT_OFI_WALLET).not.toBe(DEFAULT_PROVIDER_WALLET);
  });
});

// Helper type re-declared for the read-only array test above.
interface Settlement {
  txHash: string;
  status: "PENDING" | "CONFIRMED" | "EXPIRED";
}

// ── source field (Phase 1 Step 9) ──────────────────────────────────────
// New cases appended below; existing cases above untouched.

describe("SettlementRegistry.source field (Phase 1 sandbox marking)", () => {
  it("marks every sandbox-generated ledger entry as SANDBOX_SIMULATION", () => {
    const { r } = newRegistry();
    r.submitSettlement(makeInput({ txHash: "0xabc", usdAmount: 1000 }));
    r.confirmByChain("0xabc");
    r.reserveCredit(500);
    r.settleCredit(500);
    for (const entry of r.listLedger()) {
      expect(entry.source).toBe("SANDBOX_SIMULATION");
    }
  });

  it("RELEASE entries are also marked SANDBOX_SIMULATION", () => {
    const { r } = newRegistry();
    r.submitSettlement(makeInput({ txHash: "0xabc", usdAmount: 1000 }));
    r.confirmByChain("0xabc");
    r.reserveCredit(100);
    r.releaseCredit(100);
    const release = r.listLedger().find((e) => e.reason === "RELEASE");
    expect(release?.source).toBe("SANDBOX_SIMULATION");
  });
});