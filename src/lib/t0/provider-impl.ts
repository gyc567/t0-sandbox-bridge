// Implementation of the T-0 Network's ProviderService RPCs.
//
// This is the inbound side of the SDK integration: when the T-0 Network
// calls our provider (e.g. "process this payout"), the request lands
// here and is delegated through `SandboxNetwork` (the orchestrator).
// The orchestrator owns state-mutation semantics; this file is a pure
// translation layer (proto ↔ internal).
//
// Strict boundary: this file is the ONLY place that translates between
// proto types and our internal domain types. Business logic stays
// unaware of ConnectRPC and protobuf.

import {
  PayoutResponseSchema,
  PayoutResponse_AcceptedSchema,
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
import type { SandboxNetwork } from "./network";

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
  network: SandboxNetwork,
): Promise<PayoutResponse> {
  const paymentId = paymentIdFromProto(req.paymentId);
  try {
    const payout = await network.handleNetworkPayout(paymentId);
    void payout;
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
  network: SandboxNetwork,
): Promise<UpdatePaymentResponse> {
  const paymentId = paymentIdFromProto(req.paymentId);
  // We never want to throw from this RPC — the network interprets any
  // raised error as a payment failure. Each case is a no-op when the
  // referenced payment is unknown (idempotency rule).
  switch (req.result.case) {
    case "accepted":
      try {
        network.handleNetworkAccepted(paymentId, "");
      } catch {
        // Sandbox: a payment may exist without a backing quote. Idempotent.
      }
      break;
    case "manualAmlCheck":
      try {
        network.handleManualAmlCheck(paymentId);
      } catch {
        // Idempotent: unknown payment is a no-op here.
      }
      break;
    case "confirmed":
    case "failed":
    case undefined:
      // No state change required by the sandbox.
      break;
  }
  return create(UpdatePaymentResponseSchema, {});
}

/** RPC 3: UpdateLimit — the network informs us of a counterparty's credit limit. */
export async function updateLimit(
  _req: UpdateLimitRequest,
  _ctx: HandlerContext,
  _network: SandboxNetwork,
): Promise<UpdateLimitResponse> {
  // The sandbox doesn't track persistent credit limits — the real
  // implementation would persist `req.limits[]` and surface them to the
  // OFI console. For now, accept-and-acknowledge.
  return create(UpdateLimitResponseSchema, {});
}

/** RPC 4: ApprovePaymentQuote — the OFI approved a quoted payment. */
export async function approvePaymentQuote(
  req: ApprovePaymentQuoteRequest,
  _ctx: HandlerContext,
  network: SandboxNetwork,
): Promise<ApprovePaymentQuoteResponse> {
  const paymentId = paymentIdFromProto(req.paymentId);
  const quoteId = req.payOutQuoteId.toString();
  try {
    network.approvePaymentQuote(paymentId, quoteId);
    return create(ApprovePaymentQuoteResponseSchema, {
      result: { case: "accepted", value: create(ApprovePaymentQuoteResponse_AcceptedSchema, {}) },
    });
  } catch {
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
  _network: SandboxNetwork,
): Promise<AppendLedgerEntriesResponse> {
  // The sandbox doesn't persist a separate ledger — events are kept
  // in-process by the orchestrator. Real implementation would mirror
  // the entries into a durable store.
  return create(AppendLedgerEntriesResponseSchema, {});
}

/**
 * The complete ProviderService implementation. Pass this to
 * `createService(networkPublicKey, registerRoutes)` from the SDK:
 *
 *   registerRoutes(router => {
 *     router.service(ProviderService, {
 *       payOut: (req, ctx) => payOut(req, ctx, network),
 *       updatePayment: (req, ctx) => updatePayment(req, ctx, network),
 *       ...
 *     });
 *   });
 */
export function createProviderServiceImpl(network: SandboxNetwork) {
  return {
    payOut: (req: PayoutRequest, ctx: HandlerContext) => payOut(req, ctx, network),
    updatePayment: (req: UpdatePaymentRequest, ctx: HandlerContext) => updatePayment(req, ctx, network),
    updateLimit: (req: UpdateLimitRequest, ctx: HandlerContext) => updateLimit(req, ctx, network),
    approvePaymentQuote: (req: ApprovePaymentQuoteRequest, ctx: HandlerContext) => approvePaymentQuote(req, ctx, network),
    appendLedgerEntries: (req: AppendLedgerEntriesRequest, ctx: HandlerContext) => appendLedgerEntries(req, ctx, network),
  };
}
