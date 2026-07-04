import { createServerFn } from "@tanstack/react-start";
import { providerService, sandboxNetwork } from "./index";
import type { Currency, VolumeBand } from "./types";
import type { CreatePaymentInput } from "./network";

export const publishQuoteFn = createServerFn({ method: "POST" })
  .inputValidator((d: { currency: Currency; band: VolumeBand; rate: number; ttlMs?: number }) => d)
  .handler(async ({ data }) => providerService.publishQuote(data));

export const notifyUsdtFn = createServerFn({ method: "POST" })
  .inputValidator((d: { txHash: string; usd: number }) => d)
  .handler(async ({ data }) => {
    providerService.notifyUsdtSettlement(data.txHash, data.usd);
    return { ok: true };
  });

export const notifyCreditFn = createServerFn({ method: "POST" })
  .inputValidator((d: { counterparty: string; used: number }) => d)
  .handler(async ({ data }) => {
    providerService.notifyCreditUsage(data.counterparty, data.used);
    return { ok: true };
  });

export const acceptPaymentFn = createServerFn({ method: "POST" })
  .inputValidator((d: { quoteId: string; beneficiaryRef: string }) => d)
  .handler(async ({ data }) => providerService.acceptPayment(data));

export const processPayoutFn = createServerFn({ method: "POST" })
  .inputValidator((d: { paymentId: string; fail?: boolean }) => d)
  .handler(async ({ data }) => providerService.processPayout(data.paymentId, { fail: data.fail }));

export const snapshotFn = createServerFn({ method: "GET" }).handler(async () =>
  providerService.snapshot(),
);

// Phase 8 — Manual AML / Last Look / Payment Intent
export const completeManualAmlFn = createServerFn({ method: "POST" })
  .inputValidator((d: { paymentId: string; approved: boolean }) => d)
  .handler(async ({ data }) => providerService.completeManualAml(data.paymentId, data.approved));

export const approvePaymentQuoteFn = createServerFn({ method: "POST" })
  .inputValidator((d: { paymentId: string; quoteId: string }) => d)
  .handler(async ({ data }) => providerService.approvePaymentQuote(data.paymentId, data.quoteId));

export const createPaymentIntentFn = createServerFn({ method: "POST" })
  .inputValidator((d: { quoteId: string; beneficiaryRef: string }) => d)
  .handler(async ({ data }) => providerService.createPaymentIntent(data));

export const confirmFundsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { paymentId: string }) => d)
  .handler(async ({ data }) => providerService.confirmFunds(data.paymentId));

// ── OFI-side server functions ───────────────────────────────────────────
export const ofiSnapshotFn = createServerFn({ method: "GET" }).handler(async () => ({
  payments: sandboxNetwork.listPayments(),
  availableCurrencies: ["EUR", "GBP", "JPY", "BRL", "MXN", "PHP", "IDR", "VND"] as Currency[],
}));

export const ofiGetQuoteFn = createServerFn({ method: "POST" })
  .inputValidator((d: { usdAmount: number; currency: Currency }) => d)
  .handler(async ({ data }) => sandboxNetwork.getQuote(data));

export const ofiCreatePaymentFn = createServerFn({ method: "POST" })
  .inputValidator((d: CreatePaymentInput) => d)
  .handler(async ({ data }) => sandboxNetwork.createPayment(data));

export const ofiCompleteManualAmlFn = createServerFn({ method: "POST" })
  .inputValidator((d: { paymentId: string; approved: boolean }) => d)
  .handler(async ({ data }) => sandboxNetwork.completeManualAml(data.paymentId, data.approved));
