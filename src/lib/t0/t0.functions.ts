import { createServerFn } from "@tanstack/react-start";
import { providerService, sandboxNetwork, settlementRegistry, readModelStore, callbackInbox } from "./index";
import type { Currency, VolumeBand } from "./types";
import type { CreatePaymentInput } from "./network";
import type { Blockchain } from "./settlement";
import type { LimitSnapshot, LedgerEntry, SettlementProjection } from "./read-model/types";

// ── Provider-side (unchanged) ───────────────────────────────────────
export const publishQuoteFn = createServerFn({ method: "POST" })
  .validator((d: { currency: Currency; band: VolumeBand; rate: number; ttlMs?: number }) => d)
  .handler(async ({ data }) => providerService.publishQuote(data));

export const notifyUsdtFn = createServerFn({ method: "POST" })
  .validator((d: { txHash: string; usd: number }) => d)
  .handler(async ({ data }) => {
    providerService.notifyUsdtSettlement(data.txHash, data.usd);
    return { ok: true };
  });

export const notifyCreditFn = createServerFn({ method: "POST" })
  .validator((d: { counterparty: string; used: number }) => d)
  .handler(async ({ data }) => {
    providerService.notifyCreditUsage(data.counterparty, data.used);
    return { ok: true };
  });

// Snapshot is the Provider's read model (Provider-emitted events; the OFI
// route uses its own ofiSnapshotFn below).
export const snapshotFn = createServerFn({ method: "GET" }).handler(async () =>
  providerService.snapshot(),
);

// ── Network-driven flows (post role-boundary refactor) ──────────────
// The Network orchestrator now owns payout routing (Provider only reacts).
export const requestPayoutFn = createServerFn({ method: "POST" })
  .validator((d: { paymentId: string; fail?: boolean }) => d)
  .handler(async ({ data }) =>
    sandboxNetwork.requestPayout(data.paymentId, { fail: data.fail }),
  );

// Phase 8 — orchestrator-owned (Last Look / Manual AML / Payment Intent)
export const completeManualAmlFn = createServerFn({ method: "POST" })
  .validator((d: { paymentId: string; approved: boolean }) => d)
  .handler(async ({ data }) => sandboxNetwork.completeManualAml(data.paymentId, data.approved));

export const approvePaymentQuoteFn = createServerFn({ method: "POST" })
  .validator((d: { paymentId: string; quoteId: string }) => d)
  .handler(async ({ data }) =>
    sandboxNetwork.approvePaymentQuote(data.paymentId, data.quoteId),
  );

export const createPaymentIntentFn = createServerFn({ method: "POST" })
  .validator((d: { quoteId: string; beneficiaryRef: string }) => d)
  .handler(async ({ data }) => sandboxNetwork.createPaymentIntent(data));

export const confirmFundsFn = createServerFn({ method: "POST" })
  .validator((d: { paymentId: string }) => d)
  .handler(async ({ data }) => sandboxNetwork.confirmFunds(data.paymentId));

// ── OFI-side server functions ────────────────────────────────────────
export const ofiSnapshotFn = createServerFn({ method: "GET" }).handler(async () => ({
  payments: sandboxNetwork.listPayments(),
  payouts: providerService.snapshot().payouts,
  availableCurrencies: ["EUR", "GBP", "JPY", "BRL", "MXN", "PHP", "IDR", "VND"] as Currency[],
  settlementState: sandboxNetwork.getSettlementState(),
  events: providerService.snapshot().events,
}));

export const ofiGetQuoteFn = createServerFn({ method: "POST" })
  .validator((d: { usdAmount: number; currency: Currency }) => d)
  .handler(async ({ data }) => await sandboxNetwork.getQuote(data));

export const ofiCreatePaymentFn = createServerFn({ method: "POST" })
  .validator((d: CreatePaymentInput) => d)
  .handler(async ({ data }) => sandboxNetwork.createPayment(data));

export const ofiCompleteManualAmlFn = createServerFn({ method: "POST" })
  .validator((d: { paymentId: string; approved: boolean }) => d)
  .handler(async ({ data }) => sandboxNetwork.completeManualAml(data.paymentId, data.approved));

// ── §4–§7 — Pre-Settlement: USDT transfer + chain confirm + ledger ──

export const ofiSubmitSettlementFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      txHash?: string;
      blockchain: Blockchain;
      fromAddress: string;
      toAddress: string;
      usdAmount: number;
      intentRefs?: string[];
    }) => ({
      ...d,
      usdAmount: Number(d.usdAmount),
    }),
  )
  .handler(async ({ data }) => {
    const settlement = settlementRegistry.submitSettlement({
      blockchain: data.blockchain,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      usdAmount: data.usdAmount,
      ...(data.txHash !== undefined ? { txHash: data.txHash } : {}),
      ...(data.intentRefs !== undefined ? { intentRefs: data.intentRefs } : {}),
    });
    // Demo: auto-confirm the settlement immediately (simulates chain
    // confirmation). In production this would be an async callback from
    // the blockchain indexer.
    if (settlement.status === "PENDING") {
      providerService.receiveSettlementConfirmation(settlement.txHash);
    }
    return settlement;
  });

export const providerConfirmSettlementFn = createServerFn({ method: "POST" })
  .validator((d: { txHash: string }) => d)
  .handler(async ({ data }) => providerService.receiveSettlementConfirmation(data.txHash));

export const settlementStateFn = createServerFn({ method: "GET" }).handler(
  async () => sandboxNetwork.getSettlementState(),
);

// ── Phase 1: Read-model view fns (OFI Funding Workspace + Provider) ──
//
// These are thin reads off the durable read model (see plan §9.3). They
// do not mutate state — mutations go through the ProviderService RPC
// ingress, the OFI settlement submission fn, or the sandbox simulation
// endpoints.
//
// The handler bodies are extracted into named functions so unit tests
// can call them without spinning up the TanStack Start server-fn
// runtime (which requires an AsyncLocalStorage context).

/** OFI Funding Workspace: latest limit + active projections for a
 *  given counterparty. Returns `null` for the limit when the network
 *  has not yet informed us of one (i.e. capacity unknown). */
export function readOfiReadModel(input: { counterpartyId: number }): {
  latestLimit: LimitSnapshot | null;
  activeProjections: readonly SettlementProjection[];
} {
  const latest = sandboxNetwork.latestLimit(input.counterpartyId) ?? null;
  const active = readModelStore.listActiveProjections();
  return { latestLimit: latest, activeProjections: active };
}

export const ofiReadModelFn = createServerFn({ method: "GET" })
  .validator((d: { counterpartyId: number }) => d)
  .handler(async ({ data }) => readOfiReadModel(data) as {
    latestLimit: LimitSnapshot | null;
    activeProjections: SettlementProjection[];
  });

/** Provider view: history of all recorded UpdateLimit snapshots for a
 *  given counterparty, oldest first. */
export function readProviderLimitHistory(input: { counterpartyId: number; providerId?: number }): {
  history: readonly LimitSnapshot[];
} {
  const providerId = input.providerId ?? 0;
  return { history: readModelStore.listLimits(providerId, input.counterpartyId) };
}

export const providerLimitHistoryFn = createServerFn({ method: "GET" })
  .validator((d: { counterpartyId: number; providerId?: number }) => d)
  .handler(async ({ data }) => readProviderLimitHistory(data));

/** Provider view: latest limit for a (providerId, counterpartyId) pair. */
export function readProviderLatestLimit(input: { counterpartyId: number; providerId?: number }): {
  latest: LimitSnapshot | null;
} {
  const providerId = input.providerId ?? 0;
  return { latest: readModelStore.latestLimit(providerId, input.counterpartyId) ?? null };
}

export const providerLatestLimitFn = createServerFn({ method: "GET" })
  .validator((d: { counterpartyId: number; providerId?: number }) => d)
  .handler(async ({ data }) => readProviderLatestLimit(data));

/** Provider view: all recorded ledger entries for a given account
 *  owner id, oldest first. */
export function readProviderLedger(input: { accountOwnerId: number }): {
  entries: readonly LedgerEntry[];
} {
  return { entries: readModelStore.listLedger(input.accountOwnerId) };
}

export const providerLedgerFn = createServerFn({ method: "GET" })
  .validator((d: { accountOwnerId: number }) => d)
  .handler(async ({ data }) => readProviderLedger(data));

/** Provider view: every counterparty for which we have at least one
 *  recorded limit snapshot. The provider UI uses this to list
 *  counterparty balances. */
export function readProviderCounterparties(input: { providerId?: number }): {
  counterparties: readonly { counterpartyId: number; latest: LimitSnapshot | null }[];
} {
  const providerId = input.providerId ?? 0;
  const out: { counterpartyId: number; latest: LimitSnapshot | null }[] = [];
  // Scan the snapshot map for keys prefixed with `providerId:`. We
  // deliberately re-use the read-model's stored data so we don't need
  // a separate "list counterparties" index.
  for (const [key, list] of readModelStore.snapshotLimits()) {
    const sepIdx = key.indexOf(":");
    if (sepIdx < 0) continue;
    const pid = Number(key.slice(0, sepIdx));
    const cid = Number(key.slice(sepIdx + 1));
    if (pid !== providerId) continue;
    out.push({ counterpartyId: cid, latest: list.length > 0 ? list[list.length - 1]! : null });
  }
  out.sort((a, b) => a.counterpartyId - b.counterpartyId);
  return { counterparties: out };
}

export const providerCounterpartiesFn = createServerFn({ method: "GET" })
  .validator((d: { providerId?: number }) => d)
  .handler(async ({ data }) => readProviderCounterparties(data));

/** Diagnostic: count the inbox dedupe records by status. */
export function readCallbackInboxState(): {
  processed: number;
  failed: number;
  pending: number;
  total: number;
} {
  const inboxMap = callbackInbox.getStore().snapshotInbox();
  let processed = 0;
  let failed = 0;
  let pending = 0;
  for (const rec of inboxMap.values()) {
    if (rec.processedAt !== undefined && rec.processingError === undefined) processed++;
    else if (rec.processingError !== undefined) failed++;
    else pending++;
  }
  return { processed, failed, pending, total: inboxMap.size };
}

export const callbackInboxStateFn = createServerFn({ method: "GET" }).handler(
  async () => readCallbackInboxState(),
);

// ── Credit Usage Notifications ────────────────────────────────────────

export const readCreditUsageNotificationsFn = createServerFn({ method: "GET" })
  .validator((d: { counterparty?: string }) => d)
  .handler(async ({ data }) => {
    const counterparty = data.counterparty ?? "all";
    if (counterparty === "all") {
      const ofi = readModelStore.listCreditUsage("ofi");
      const provider = readModelStore.listCreditUsage("provider");
      return { notifications: [...ofi, ...provider] };
    }
    return { notifications: readModelStore.listCreditUsage(counterparty) };
  });
