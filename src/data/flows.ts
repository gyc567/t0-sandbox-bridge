/**
 * T-0 flow choreography.
 *
 * Each flow is a sequence of timed events (step events, on the 0-1 progress
 * scale shared with the playback timeline).
 *
 *   Progress 0   = start of cycle
 *   Progress 1   = fee charged, ready for next payment
 *   Step.t       = the progress threshold at which the event fires
 *
 * Phase 8 introduces 4 node IDs to match the real BAXS × T-0 onboarding:
 *   - ofi         → Originator / Beneficiary (depending on flow)
 *   - orchestrator → T-0 Network Orchestration (replaces the old "network")
 *   - pop         → Payout Provider / Pay-In Provider (depending on flow)
 *   - payin       → Pay-In Provider rail (active only in Payment Intent)
 */

import type { FlowType } from "./channels";

export type NodeId = "ofi" | "orchestrator" | "pop" | "payin";

export type PacketColor = "cyan" | "ochre" | "sage" | "slate";

export type ArtifactType =
  | "update-quote"
  | "get-quote"
  | "usdt-settle"
  | "update-limit"
  | "create-payment"
  | "payout-rpc"
  | "ecdsa-sign"
  | "finalize-payout"
  | "ledger-entry"
  | "ivms101-disclosure"
  | "aml-pending"
  | "last-look-approval"
  | "pay-in-receipt";

export interface FlowStep {
  /** Stable ID — used by markers, drawer, animation engine. */
  id: string;
  /** Human-readable label shown in the timeline scrubber. */
  label: string;
  /** Short label (≤12 chars) for compact display. */
  shortLabel: string;
  /** Progress threshold on [0, 1]. */
  t: number;
  /** Source node (where the packet originates). */
  source: NodeId;
  /** Target node (where the packet arrives). */
  target: NodeId;
  /** Packet color hint. */
  packetColor: PacketColor;
  /** Artifact type the drawer opens when this marker is clicked. */
  artifactType: ArtifactType;
  /** Whether the orchestrator lights up while this event is in-flight. */
  highlightNetwork: boolean;
  /** Optional override for the y-coordinate of the packet (for off-rail flows). */
  railY?: number;
}

export interface Flow {
  type: FlowType;
  /** Total cycle duration, displayed in the ticker. */
  totalLabel: string;
  /** Longer-form description for the bottom strip. */
  description: string;
  /** Sequence of step events. */
  steps: readonly FlowStep[];
}

const POP = "pop" as const;
const OFI = "ofi" as const;
const ORCH = "orchestrator" as const;
const PAYIN = "payin" as const;

export const FLOWS: Record<FlowType, Flow> = {
  /**
   * Pay-Out Standard: 12s canonical cycle.
   *
   *   POP publishes quote → OFI requests → USDT settles → UpdateLimit →
   *   CreatePayment → PayOut RPC → ECDSA sign → FinalizePayout →
   *   AppendLedgerEntries → Fee charged.
   */
  "pay-out": {
    type: "pay-out",
    totalLabel: "12:18",
    description: "Rate-locked at CreatePayment. Atomic USDT settlement on Tron.",
    steps: [
      {
        id: "update-quote",
        label: "UpdateQuote",
        shortLabel: "Pub Quote",
        t: 0.05,
        source: POP,
        target: OFI,
        packetColor: "cyan",
        artifactType: "update-quote",
        highlightNetwork: true,
      },
      {
        id: "get-quote",
        label: "GetQuote",
        shortLabel: "Get Quote",
        t: 0.13,
        source: OFI,
        target: POP,
        packetColor: "cyan",
        artifactType: "get-quote",
        highlightNetwork: true,
      },
      {
        id: "usdt-settle",
        label: "USDT settle",
        shortLabel: "USDT",
        t: 0.22,
        source: OFI,
        target: POP,
        packetColor: "ochre",
        artifactType: "usdt-settle",
        highlightNetwork: true,
      },
      {
        id: "update-limit",
        label: "UpdateLimit",
        shortLabel: "Limit",
        t: 0.35,
        source: ORCH,
        target: OFI,
        packetColor: "slate",
        artifactType: "update-limit",
        highlightNetwork: true,
      },
      {
        id: "create-payment",
        label: "CreatePayment",
        shortLabel: "Create",
        t: 0.5,
        source: OFI,
        target: ORCH,
        packetColor: "sage",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "payout-rpc",
        label: "PayOut RPC",
        shortLabel: "PayOut",
        t: 0.58,
        source: ORCH,
        target: POP,
        packetColor: "sage",
        artifactType: "payout-rpc",
        highlightNetwork: true,
      },
      {
        id: "ecdsa-sign",
        label: "ECDSA sign",
        shortLabel: "Sign",
        t: 0.68,
        source: POP,
        target: POP,
        packetColor: "cyan",
        artifactType: "ecdsa-sign",
        highlightNetwork: false,
      },
      {
        id: "finalize-payout",
        label: "FinalizePayout",
        shortLabel: "Finalize",
        t: 0.78,
        source: POP,
        target: ORCH,
        packetColor: "sage",
        artifactType: "finalize-payout",
        highlightNetwork: true,
      },
      {
        id: "ledger-entry",
        label: "AppendLedger",
        shortLabel: "Ledger",
        t: 0.88,
        source: ORCH,
        target: ORCH,
        packetColor: "slate",
        artifactType: "ledger-entry",
        highlightNetwork: true,
      },
      {
        id: "fee-charged",
        label: "Fee charged (5 bps)",
        shortLabel: "Fee",
        t: 0.96,
        source: ORCH,
        target: OFI,
        packetColor: "cyan",
        artifactType: "ledger-entry",
        highlightNetwork: false,
      },
    ],
  },

  /**
   * Manual AML: ~17s, adds a PENDING_REVIEW wait and Last Look quote refresh.
   * OFI ↔ Orchestrator in the AML/Last Look handoff (not OFI↔POP).
   */
  "manual-aml": {
    type: "manual-aml",
    totalLabel: "17:42",
    description: "Compliance-hold pause, then Last Look quote refresh between OFI and POP.",
    steps: [
      {
        id: "update-quote",
        label: "UpdateQuote",
        shortLabel: "Pub Quote",
        t: 0.04,
        source: POP,
        target: OFI,
        packetColor: "cyan",
        artifactType: "update-quote",
        highlightNetwork: true,
      },
      {
        id: "get-quote",
        label: "GetQuote",
        shortLabel: "Get Quote",
        t: 0.1,
        source: OFI,
        target: POP,
        packetColor: "cyan",
        artifactType: "get-quote",
        highlightNetwork: true,
      },
      {
        id: "usdt-settle",
        label: "USDT settle",
        shortLabel: "USDT",
        t: 0.16,
        source: OFI,
        target: POP,
        packetColor: "ochre",
        artifactType: "usdt-settle",
        highlightNetwork: true,
      },
      {
        id: "update-limit",
        label: "UpdateLimit",
        shortLabel: "Limit",
        t: 0.26,
        source: ORCH,
        target: OFI,
        packetColor: "slate",
        artifactType: "update-limit",
        highlightNetwork: true,
      },
      {
        id: "create-payment",
        label: "CreatePayment",
        shortLabel: "Create",
        t: 0.38,
        source: OFI,
        target: ORCH,
        packetColor: "sage",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "manual-aml-check",
        label: "ManualAmlCheck (PENDING_REVIEW)",
        shortLabel: "AML",
        t: 0.5,
        source: ORCH,
        target: ORCH,
        packetColor: "slate",
        artifactType: "aml-pending",
        highlightNetwork: true,
      },
      {
        id: "ivms-disclosure",
        label: "Travel Rule (IVMS101)",
        shortLabel: "IVMS101",
        t: 0.56,
        source: OFI,
        target: ORCH,
        packetColor: "slate",
        artifactType: "ivms101-disclosure",
        highlightNetwork: true,
      },
      {
        id: "last-look-approval",
        label: "ApprovePaymentQuotes (Last Look)",
        shortLabel: "Last Look",
        t: 0.66,
        source: ORCH,
        target: OFI,
        packetColor: "cyan",
        artifactType: "last-look-approval",
        highlightNetwork: true,
      },
      {
        id: "payout-rpc",
        label: "PayOut RPC",
        shortLabel: "PayOut",
        t: 0.74,
        source: ORCH,
        target: POP,
        packetColor: "sage",
        artifactType: "payout-rpc",
        highlightNetwork: true,
      },
      {
        id: "finalize-payout",
        label: "FinalizePayout",
        shortLabel: "Finalize",
        t: 0.84,
        source: POP,
        target: ORCH,
        packetColor: "sage",
        artifactType: "finalize-payout",
        highlightNetwork: true,
      },
      {
        id: "fee-charged",
        label: "Fee charged (10 bps)",
        shortLabel: "Fee",
        t: 0.96,
        source: ORCH,
        target: OFI,
        packetColor: "cyan",
        artifactType: "ledger-entry",
        highlightNetwork: false,
      },
    ],
  },

  /**
   * Payment Intent: rate is indicative until ConfirmFundsReceived.
   * Adds a Pay-In Provider rail for the off-network fiat leg.
   */
  "payment-intent": {
    type: "payment-intent",
    totalLabel: "21:05",
    description: "Beneficiary + Pay-In Provider. Indicative rate until rail confirmation.",
    steps: [
      {
        id: "update-quote",
        label: "UpdateQuote (Pay-In)",
        shortLabel: "Pub Intent",
        t: 0.05,
        source: POP,
        target: OFI,
        packetColor: "cyan",
        artifactType: "update-quote",
        highlightNetwork: true,
      },
      {
        id: "create-intent",
        label: "CreatePaymentIntent",
        shortLabel: "Intent",
        t: 0.16,
        source: OFI,
        target: ORCH,
        packetColor: "cyan",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "get-payment-details",
        label: "GetPaymentDetails",
        shortLabel: "Details",
        t: 0.26,
        source: ORCH,
        target: POP,
        packetColor: "cyan",
        artifactType: "get-quote",
        highlightNetwork: true,
      },
      {
        id: "end-user-pays",
        label: "End-user pays (off-network)",
        shortLabel: "FIAT pay",
        t: 0.45,
        source: PAYIN,
        target: POP,
        packetColor: "ochre",
        artifactType: "pay-in-receipt",
        highlightNetwork: false,
        railY: 460,
      },
      {
        id: "confirm-funds",
        label: "ConfirmFundsReceived",
        shortLabel: "Confirm",
        t: 0.62,
        source: POP,
        target: ORCH,
        packetColor: "sage",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "rate-bound",
        label: "Rate locked (binding)",
        shortLabel: "Lock",
        t: 0.72,
        source: ORCH,
        target: ORCH,
        packetColor: "cyan",
        artifactType: "update-quote",
        highlightNetwork: true,
      },
      {
        id: "settlement",
        label: "Blockchain settlement",
        shortLabel: "Settle",
        t: 0.86,
        source: ORCH,
        target: POP,
        packetColor: "ochre",
        artifactType: "usdt-settle",
        highlightNetwork: true,
      },
      {
        id: "fee-charged",
        label: "Intent fee",
        shortLabel: "Fee",
        t: 0.95,
        source: ORCH,
        target: OFI,
        packetColor: "cyan",
        artifactType: "ledger-entry",
        highlightNetwork: false,
      },
    ],
  },
};

export function getFlow(type: FlowType): Flow {
  return FLOWS[type];
}

/** Convenience: returns the index of the step whose t is the largest ≤ progress. */
export function activeStepIndex(flow: Flow, progress: number): number {
  let idx = -1;
  for (let i = 0; i < flow.steps.length; i++) {
    if (flow.steps[i].t <= progress) idx = i;
  }
  return idx;
}
