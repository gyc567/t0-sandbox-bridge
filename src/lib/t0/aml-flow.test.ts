// aml-flow.test.ts — unit tests for the post-create-payment AML
// auto-trigger orchestrator (Phase 7 follow-up).

import { describe, it, expect, vi } from "vitest";
import {
  autoTriggerAmlAfterCreate,
  pickOfiDefaultTab,
  type CreatePaymentResult,
} from "./aml-flow";
import type { Payment } from "./types";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pm_test_001",
    quoteId: "qt_test_001",
    currency: "EUR",
    usdAmount: 1000,
    localAmount: 920,
    beneficiaryRef: "BEN-001",
    status: "pending",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeSuccessResult(overrides: Partial<Payment> = {}): CreatePaymentResult {
  return {
    success: {
      payment: makePayment(overrides),
      created: true,
      payout: { id: "po_x", paymentId: "pm_x", status: "success" },
    },
  };
}

describe("autoTriggerAmlAfterCreate", () => {
  it("calls triggerManualAml(paymentId) and returns the id on success", async () => {
    const triggerManualAml = vi.fn(async () => undefined);
    const r = makeSuccessResult({ id: "pm_xyz" });
    const out = await autoTriggerAmlAfterCreate(r, { triggerManualAml });
    expect(out).toBe("pm_xyz");
    expect(triggerManualAml).toHaveBeenCalledTimes(1);
    expect(triggerManualAml).toHaveBeenCalledWith("pm_xyz");
  });

  it("returns null when create-payment returned a failure result", async () => {
    const triggerManualAml = vi.fn(async () => undefined);
    const r: CreatePaymentResult = { failure: { reason: "REASON_NO_QUOTE_AVAILABLE" } };
    const out = await autoTriggerAmlAfterCreate(r, { triggerManualAml });
    expect(out).toBeNull();
    expect(triggerManualAml).not.toHaveBeenCalled();
  });

  it("returns null when triggerManualAml throws (does not propagate)", async () => {
    const triggerManualAml = vi.fn(async () => {
      throw new Error("network exploded");
    });
    const r = makeSuccessResult({ id: "pm_x" });
    const out = await autoTriggerAmlAfterCreate(r, { triggerManualAml });
    expect(out).toBeNull();
    expect(triggerManualAml).toHaveBeenCalledWith("pm_x");
  });

  it("passes the id to triggerManualAml exactly once (no double-trigger)", async () => {
    const triggerManualAml = vi.fn(async () => undefined);
    const r = makeSuccessResult({ id: "pm_once" });
    await autoTriggerAmlAfterCreate(r, { triggerManualAml });
    expect(triggerManualAml).toHaveBeenCalledTimes(1);
  });
});

describe("pickOfiDefaultTab", () => {
  it("returns 'payment-manual-aml' when ?aml-required= is set", () => {
    expect(pickOfiDefaultTab("?aml-required=pm_xyz")).toBe("payment-manual-aml");
    expect(pickOfiDefaultTab(new URLSearchParams("aml-required=pm_xyz"))).toBe(
      "payment-manual-aml",
    );
  });

  it("returns 'quote-management' when ?aml-required= is absent", () => {
    expect(pickOfiDefaultTab("")).toBe("quote-management");
    expect(pickOfiDefaultTab(new URLSearchParams(""))).toBe("quote-management");
  });

  it("ignores other query params (only aml-required triggers the AML tab)", () => {
    expect(pickOfiDefaultTab("?foo=bar")).toBe("quote-management");
    expect(pickOfiDefaultTab("?aml-required=&foo=bar")).toBe("quote-management");
  });

  it("treats aml-required with empty value as absent", () => {
    expect(pickOfiDefaultTab("?aml-required=")).toBe("quote-management");
  });
});