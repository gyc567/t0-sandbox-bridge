import { createServerFn } from "@tanstack/react-start";
import { providerService } from "./index";
import type { Currency, VolumeBand } from "./types";

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
