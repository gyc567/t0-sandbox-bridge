import { createServerFn } from "@tanstack/react-start";
import { providerService, sandboxNetwork } from "./index";
import type { Currency, VolumeBand } from "./types";
import type { CreatePaymentInput } from "./network";

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
  availableCurrencies: ["EUR", "GBP", "JPY", "BRL", "MXN", "PHP", "IDR", "VND"] as Currency[],
}));

export const ofiGetQuoteFn = createServerFn({ method: "POST" })
  .validator((d: { usdAmount: number; currency: Currency }) => d)
  .handler(async ({ data }) => sandboxNetwork.getQuote(data));

export const ofiCreatePaymentFn = createServerFn({ method: "POST" })
  .validator((d: CreatePaymentInput) => d)
  .handler(async ({ data }) => sandboxNetwork.createPayment(data));

export const ofiCompleteManualAmlFn = createServerFn({ method: "POST" })
  .validator((d: { paymentId: string; approved: boolean }) => d)
  .handler(async ({ data }) => sandboxNetwork.completeManualAml(data.paymentId, data.approved));
