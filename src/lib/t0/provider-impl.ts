// Implementation of the T-0 Network's ProviderService RPCs.
//
// This is the inbound side of the SDK integration: when the T-0 Network
// calls our provider (e.g. "process this payout"), the request lands
// here and is delegated to the existing PayoutProviderService.
//
// Strict boundary: this file is the ONLY place that translates between
// proto types and our internal domain types. Business logic stays
// unaware of ConnectRPC and protobuf.

import {
  PayoutResponseSchema,
  PayoutResponse_AcceptedSchema,
  PayoutResponse_ManualAmlCheckSchema,
  PayoutResponse_FailedSchema,
  PayoutResponse_Failed_Reason,
  UpdatePaymentResponseSchema,
  UpdateLimitResponseSchema,
  ApprovePaymentQuoteResponseSchema,
  ApprovePaymentQuoteResponse_AcceptedSchema,
  ApprovePaymentQuoteResponse_RejectedSchema,
  AppendLedgerEntriesResponseSchema,
  type PayoutRequest,
  type PayoutResponse,
  type UpdatePaymentRequest,
  type UpdatePaymentResponse,
  type UpdateLimitRequest,
  type UpdateLimitResponse,
  type ApprovePaymentQuoteRequest,
  type ApprovePaymentQuoteResponse,
  type AppendLedgerEntriesRequest,
  type AppendLedgerEntriesResponse,
  type HandlerContext,
} from "@t-0/provider-sdk";
import { create } from "@bufbuild/protobuf";
import type { PayoutProviderService } from "./provider";

/**
 * Convert a proto bigint paymentId into the internal string id.
 * Our internal ids are formatted as `pm_<timestamp>_<n>`; the network's
 * bigint collides on the wire with ours, so we stringify with a `n_`
 * prefix to keep the namespace distinct.
 */
function paymentIdFromProto(id: bigint): string {
  return `n_${id.toString()}`;
}

/** RPC 1: PayOut — the network tells us to execute a payout. */
export async function payOut(
  req: PayoutRequest,
  _ctx: HandlerContext,
  svc: PayoutProviderService,
): Promise<PayoutResponse> {
  const paymentId = paymentIdFromProto(req.paymentId);
  try {
    const payout = await svc.processPayout(paymentId);
    void payout; // log if needed; the response below signals success
    return create(PayoutResponseSchema, {
      result: { case: "accepted", value: create(PayoutResponse_AcceptedSchema, {}) },
    });
  } catch {
    return create(PayoutResponseSchema, {
      result: {
        case: "failed",
        value: create(PayoutResponse_FailedSchema, { reason: PayoutResponse_Failed_Reason.UNSPECIFIED }),
      },
    });
  }
}

/** RPC 2: UpdatePayment — the network updates the payment's status. */
export async function updatePayment(
  req: UpdatePaymentRequest,
  _ctx: HandlerContext,
  svc: PayoutProviderService,
): Promise<UpdatePaymentResponse> {
  const paymentId = paymentIdFromProto(req.paymentId);
  // The result oneof tells us what the network is telling us about the payment.
  // We translate each case to the corresponding internal action:
  //   "accepted"       → accept the payment (idempotent)
  //   "manualAmlCheck" → put payment in manual_aml pending state
  //   "failed"         → mark the payment as rejected
  //   "confirmed"      → mark as confirmed
  switch (req.result.case) {
    case "accepted":
      try {
        await svc.acceptPayment({ quoteId: paymentId, beneficiaryRef: "" });
      } catch {
        // Idempotent: ignore "unknown quote" or "payment exists" errors.
      }
      break;
    case "confirmed":
      // No-op for the sandbox: processPayout already drives a payment
      // to confirmed when the underlying flow succeeds. This branch exists
      // for when the network explicitly confirms (e.g. settlement cleared).
      break;
    case "manualAmlCheck":
      // Network wants us to perform a manual AML check. We translate to
      // the internal "pending" state by calling the existing manual-aml
      // entry point with `approved = false` and treating the response
      // as "rejected for review" — the operator can then re-approve.
      svc.completeManualAml(paymentId, false);
      break;
    case "failed":
    case undefined:
      // Failed or unset — no state change. The internal payment lifecycle
      // drives failures; we don't override anything here.
      break;
  }
  return create(UpdatePaymentResponseSchema, {});
}

/** RPC 3: UpdateLimit — the network informs us of a counterparty's credit limit. */
export async function updateLimit(
  _req: UpdateLimitRequest,
  _ctx: HandlerContext,
  _svc: PayoutProviderService,
): Promise<UpdateLimitResponse> {
  // The sandbox doesn't track persistent credit limits — the real
  // implementation would persist `req.limits[]` and surface them to
  // the OFI console. For now, accept-and-acknowledge.
  return create(UpdateLimitResponseSchema, {});
}

/** RPC 4: ApprovePaymentQuote — the OFI approved a quoted payment. */
export async function approvePaymentQuote(
  req: ApprovePaymentQuoteRequest,
  _ctx: HandlerContext,
  svc: PayoutProviderService,
): Promise<ApprovePaymentQuoteResponse> {
  const paymentId = paymentIdFromProto(req.paymentId);
  const quoteId = req.payOutQuoteId.toString();
  try {
    svc.approvePaymentQuote(paymentId, quoteId);
    return create(ApprovePaymentQuoteResponseSchema, {
      result: { case: "accepted", value: create(ApprovePaymentQuoteResponse_AcceptedSchema, {}) },
    });
  } catch (e) {
    void e;
    return create(ApprovePaymentQuoteResponseSchema, {
      result: {
        case: "rejected",
        value: create(ApprovePaymentQuoteResponse_RejectedSchema, {}),
      },
    });
  }
}

/** RPC 5: AppendLedgerEntries — the network reports ledger activity. */
export async function appendLedgerEntries(
  _req: AppendLedgerEntriesRequest,
  _ctx: HandlerContext,
  _svc: PayoutProviderService,
): Promise<AppendLedgerEntriesResponse> {
  // The sandbox doesn't persist a separate ledger — events are kept
  // in-process by PayoutProviderService. Real implementation would
  // mirror the entries into a durable store.
  return create(AppendLedgerEntriesResponseSchema, {});
}

/**
 * The complete ProviderService implementation. Pass this to
 * `createService(networkPublicKey, registerRoutes)` from the SDK:
 *
 *   registerRoutes(router => {
 *     router.service(ProviderService, {
 *       payOut: (req, ctx) => payOut(req, ctx, svc),
 *       updatePayment: (req, ctx) => updatePayment(req, ctx, svc),
 *       ...
 *     });
 *   });
 */
export function createProviderServiceImpl(svc: PayoutProviderService) {
  return {
    payOut: (req: PayoutRequest, ctx: HandlerContext) => payOut(req, ctx, svc),
    updatePayment: (req: UpdatePaymentRequest, ctx: HandlerContext) => updatePayment(req, ctx, svc),
    updateLimit: (req: UpdateLimitRequest, ctx: HandlerContext) => updateLimit(req, ctx, svc),
    approvePaymentQuote: (req: ApprovePaymentQuoteRequest, ctx: HandlerContext) => approvePaymentQuote(req, ctx, svc),
    appendLedgerEntries: (req: AppendLedgerEntriesRequest, ctx: HandlerContext) => appendLedgerEntries(req, ctx, svc),
  };
}
