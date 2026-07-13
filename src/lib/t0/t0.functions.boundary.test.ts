// Wiring guard for the TanStack Start server functions.
//
// After the role-boundary refactor, server functions that touch the
// network-protocol surface must route through SandboxNetwork (the
// orchestrator), not directly to PayoutProviderService. This file
// inspects the exported function references and their static wiring
// (via the source) to lock the contract.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("t0.functions server-fn wiring", () => {
  it("exposes the orchestrator-routed server functions", async () => {
    const fns = await import("./t0.functions");
    expect(typeof fns.requestPayoutFn).toBe("function");
    expect(typeof fns.completeManualAmlFn).toBe("function");
    expect(typeof fns.approvePaymentQuoteFn).toBe("function");
    expect(typeof fns.createPaymentIntentFn).toBe("function");
    expect(typeof fns.confirmFundsFn).toBe("function");
    // Provider-side ops still kept here (unchanged).
    expect(typeof fns.publishQuoteFn).toBe("function");
    expect(typeof fns.notifyUsdtFn).toBe("function");
    expect(typeof fns.notifyCreditFn).toBe("function");
    expect(typeof fns.snapshotFn).toBe("function");
    // OFI surface (unchanged).
    expect(typeof fns.ofiSnapshotFn).toBe("function");
    expect(typeof fns.ofiGetQuoteFn).toBe("function");
    expect(typeof fns.ofiCreatePaymentFn).toBe("function");
    expect(typeof fns.ofiCompleteManualAmlFn).toBe("function");
    expect(typeof fns.triggerManualAmlFn).toBe("function");
  });

  it("the source routes orchestrator-touched flows through sandboxNetwork", () => {
    const src = readFileSync(resolve(__dirname, "./t0.functions.ts"), "utf-8");
    // requestPayoutFn → sandboxNetwork.requestPayout (Network-driven)
    expect(src).toMatch(/export const requestPayoutFn[\s\S]*?sandboxNetwork\.requestPayout/);
    // completeManualAmlFn → sandboxNetwork.completeManualAml
    expect(src).toMatch(
      /export const completeManualAmlFn[\s\S]*?sandboxNetwork\.completeManualAml/,
    );
    // approvePaymentQuoteFn → sandboxNetwork.approvePaymentQuote
    expect(src).toMatch(
      /export const approvePaymentQuoteFn[\s\S]*?sandboxNetwork\.approvePaymentQuote/,
    );
    // createPaymentIntentFn → sandboxNetwork.createPaymentIntent
    expect(src).toMatch(
      /export const createPaymentIntentFn[\s\S]*?sandboxNetwork\.createPaymentIntent/,
    );
    // confirmFundsFn → sandboxNetwork.confirmFunds
    expect(src).toMatch(/export const confirmFundsFn[\s\S]*?sandboxNetwork\.confirmFunds/);
    // triggerManualAmlFn → sandboxNetwork.triggerManualAml
    expect(src).toMatch(/export const triggerManualAmlFn[\s\S]*?sandboxNetwork\.triggerManualAml/);
    // publishQuoteFn → providerService.publishQuote (Provider-side)
    expect(src).toMatch(/export const publishQuoteFn[\s\S]*?providerService\.publishQuote/);
  });

  it("does not expose a Provider-driven accept server function", async () => {
    const fns = await import("./t0.functions");
    // acceptPaymentFn was removed during the refactor: only the OFI
    // createPayment path remains as the protocol-correct accept seam.
    expect((fns as unknown as { acceptPaymentFn?: unknown }).acceptPaymentFn).toBeUndefined();
    expect((fns as unknown as { processPayoutFn?: unknown }).processPayoutFn).toBeUndefined();
  });
});
