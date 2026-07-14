// Auto-trigger-AML orchestrator.
//
// Pure helper extracted from routes/ofi.tsx so we can unit-test the
// "after create-payment → trigger AML → return id for scroll hint"
// flow without spinning up a TanStack Start route harness.

import type { Payment } from "@/lib/t0/types";

/** Mirror of `SandboxNetwork.createPayment`'s discriminated-union return.
 *  Kept inline so this helper has zero coupling to the network module. */
export type CreatePaymentResult =
  | { success: { payment: Payment; created: boolean; payout: unknown } }
  | { failure: { reason: string } };

/** Run the create-payment → trigger-AML → return-id sequence.
 *
 *  Phase 7 follow-up: sandbox currently drives the payment all the way
 *  to `confirmed` synchronously, which leaves nothing for the OFI to
 *  upload. Re-triggering AML here normalizes the state to `pending_aml`
 *  so the OFI can upload the AML file from Payment-Manual AML.
 *
 *  Returns the new payment id when both server fns succeed; `null` if
 *  either step fails or the initial create-payment returns a failure
 *  shape (the caller should surface the error before redirecting). */
export async function autoTriggerAmlAfterCreate(
  result: CreatePaymentResult,
  deps: {
    triggerManualAml: (paymentId: string) => Promise<unknown>;
  },
): Promise<string | null> {
  if (!("success" in result)) return null;
  const paymentId = result.success.payment.id;
  try {
    await deps.triggerManualAml(paymentId);
    return paymentId;
  } catch {
    return null;
  }
}

/** Pure: pick the default tab for /ofi given the current URL. Encapsulated
 *  so unit tests don't have to mock window.location. */
export function pickOfiDefaultTab(
  searchParams: URLSearchParams | string,
): "quote-management" | "payment-manual-aml" {
  const params =
    typeof searchParams === "string" ? new URLSearchParams(searchParams) : searchParams;
  return params.get("aml-required") ? "payment-manual-aml" : "quote-management";
}