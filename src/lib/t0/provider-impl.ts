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
import { getCallbackInbox } from "./read-model/instance";

/**
 * Resolve the module-level CallbackInbox shared with `index.ts` (server
 * fns) and the read-model singleton. The RPC handlers read it on every
 * call so test overrides take effect immediately.
 */
function callbackInbox(): ReturnType<typeof getCallbackInbox> {
  return getCallbackInbox();
}

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
  req: UpdateLimitRequest,
  _ctx: HandlerContext,
  _network: SandboxNetwork,
): Promise<UpdateLimitResponse> {
  // Forward the payload to the CallbackInbox for durable, idempotent
  // storage. Parsing failures are caught here so the RPC still ACKs
  // — the inbox records the failure for later inspection.
  try {
    callbackInbox().handleUpdateLimit(req as unknown as { limits: readonly import("./read-model/projection").ProtoLimitShape[] });
  } catch {
    // Defensive: the inbox itself doesn't throw for well-formed proto
    // payloads. A throw here means a malformed payload or a bug;
    // either way, do not propagate to the network.
  }
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
  req: AppendLedgerEntriesRequest,
  _ctx: HandlerContext,
  _network: SandboxNetwork,
): Promise<AppendLedgerEntriesResponse> {
  // Forward the payload to the CallbackInbox for durable, idempotent
  // storage. See updateLimit for the defensive ACK policy.
  try {
    callbackInbox().handleAppendLedgerEntries(req as unknown as { transactions: readonly import("./read-model/projection").ProtoTransactionShape[] });
  } catch {
    // See updateLimit for rationale.
  }
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
