/**
 * T-0 flow choreography.
 *
 * Each flow is a sequence of timed events (step events, on the 0-1 progress
 * scale shared with the scroll-driven timeline).
 *
 *   Progress 0   = start of cycle
 *   Progress 1   = fee charged, ready for next payment
 *   Step.t       = the scroll-progress threshold at which the event fires
 */

import type { FlowType } from "./channels";

export type NodeId = "ofi" | "network" | "pop";

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
  | "ledger-entry";

export interface FlowStep {
  /** Stable ID — used by markers, drawer, animation engine. */
  id: string;
  /** Human-readable label shown in the timeline scrubber. */
  label: string;
  /** Short label (≤12 chars) for compact display. */
  shortLabel: string;
  /** Scroll-progress threshold on [0, 1]. */
  t: number;
  /** Source node (where the packet originates). */
  source: NodeId;
  /** Target node (where the packet arrives). */
  target: NodeId;
  /** Packet color hint. */
  packetColor: PacketColor;
  /** Artifact type the drawer opens when this marker is clicked. */
  artifactType: ArtifactType;
  /** Whether the network core lights up while this event is in-flight. */
  highlightNetwork: boolean;
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
const NET = "network" as const;

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
        source: NET,
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
        target: NET,
        packetColor: "sage",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "payout-rpc",
        label: "PayOut RPC",
        shortLabel: "PayOut",
        t: 0.58,
        source: NET,
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
        target: NET,
        packetColor: "sage",
        artifactType: "finalize-payout",
        highlightNetwork: true,
      },
      {
        id: "ledger-entry",
        label: "AppendLedger",
        shortLabel: "Ledger",
        t: 0.88,
        source: NET,
        target: NET,
        packetColor: "slate",
        artifactType: "ledger-entry",
        highlightNetwork: true,
      },
      {
        id: "fee-charged",
        label: "Fee charged (5 bps)",
        shortLabel: "Fee",
        t: 0.96,
        source: NET,
        target: OFI,
        packetColor: "cyan",
        artifactType: "ledger-entry",
        highlightNetwork: false,
      },
    ],
  },

  /**
   * Manual AML: ~17s, adds a PENDING_REVIEW wait and Last Look quote refresh.
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
        source: NET,
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
        target: NET,
        packetColor: "sage",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "manual-aml-check",
        label: "ManualAmlCheck",
        shortLabel: "AML",
        t: 0.5,
        source: POP,
        target: NET,
        packetColor: "slate",
        artifactType: "ecdsa-sign",
        highlightNetwork: true,
      },
      {
        id: "approve-quotes",
        label: "ApprovePaymentQuotes (Last Look)",
        shortLabel: "Last Look",
        t: 0.62,
        source: NET,
        target: OFI,
        packetColor: "cyan",
        artifactType: "update-quote",
        highlightNetwork: true,
      },
      {
        id: "payout-rpc",
        label: "PayOut RPC",
        shortLabel: "PayOut",
        t: 0.72,
        source: NET,
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
        target: NET,
        packetColor: "sage",
        artifactType: "finalize-payout",
        highlightNetwork: true,
      },
      {
        id: "fee-charged",
        label: "Fee charged (10 bps)",
        shortLabel: "Fee",
        t: 0.96,
        source: NET,
        target: OFI,
        packetColor: "cyan",
        artifactType: "ledger-entry",
        highlightNetwork: false,
      },
    ],
  },

  /**
   * Payment Intent: rate is indicative until ConfirmFundsReceived.
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
        target: NET,
        packetColor: "cyan",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "get-payment-details",
        label: "GetPaymentDetails",
        shortLabel: "Details",
        t: 0.26,
        source: NET,
        target: POP,
        packetColor: "cyan",
        artifactType: "get-quote",
        highlightNetwork: true,
      },
      {
        id: "end-user-pays",
        label: "End-user pays (off-network)",
        shortLabel: "FIAT pay",
        t: 0.5,
        source: OFI,
        target: POP,
        packetColor: "ochre",
        artifactType: "usdt-settle",
        highlightNetwork: false,
      },
      {
        id: "confirm-funds",
        label: "ConfirmFundsReceived",
        shortLabel: "Confirm",
        t: 0.66,
        source: POP,
        target: NET,
        packetColor: "sage",
        artifactType: "create-payment",
        highlightNetwork: true,
      },
      {
        id: "rate-bound",
        label: "Rate locked (binding)",
        shortLabel: "Lock",
        t: 0.74,
        source: NET,
        target: NET,
        packetColor: "cyan",
        artifactType: "update-quote",
        highlightNetwork: true,
      },
      {
        id: "settlement",
        label: "Blockchain settlement",
        shortLabel: "Settle",
        t: 0.86,
        source: NET,
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
        source: NET,
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
