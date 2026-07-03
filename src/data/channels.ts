/**
 * T-0 Playground channels.
 *
 * 5 industry lenses that map to 3 underlying protocol flows.
 * Hover the channel dock → preview its flow on the canvas.
 * Click → switch the active flow.
 */

export type FlowType = "pay-out" | "manual-aml" | "payment-intent";

export type ChannelId = "cross-border" | "trading" | "fintech" | "payroll" | "marketplace";

export interface Channel {
  id: ChannelId;
  /** Short token shown in the dock (e.g. "Cross-Border"). */
  label: string;
  /** Single-word label for tight spaces. */
  shortLabel: string;
  /** Underlying T-0 flow when this channel is active. */
  flowType: FlowType;
  /** Description shown in the ChannelContextStrip below the canvas. */
  context: string;
  /** Single-line protocol summary: flow model + fee + chain + expected settlement time. */
  summary: string;
  /** Provider fee label: "5 bps", "10 bps", or "indicative". */
  fee: "5 bps" | "10 bps" | "indicative";
}

export const CHANNELS: readonly Channel[] = [
  {
    id: "cross-border",
    label: "Cross-Border",
    shortLabel: "X-Border",
    flowType: "pay-out",
    context: "Standard Pay-Out — rate-locked at CreatePayment, atomic USDT settlement.",
    summary: "Pay-Out Standard · 5 bps · USDT on Tron · ~25s settlement",
    fee: "5 bps",
  },
  {
    id: "trading",
    label: "Trading Desk",
    shortLabel: "Trading",
    flowType: "manual-aml",
    context: "Manual AML flow with Last Look quote refresh — compliance-aware, audit-ready.",
    summary: "Manual AML + Last Look · 10 bps · USDT on Ethereum · ~95s settlement",
    fee: "10 bps",
  },
  {
    id: "fintech",
    label: "Fintech",
    shortLabel: "Fintech",
    flowType: "payment-intent",
    context: "Payment Intent flow — indicative rate at quote, binding at ConfirmFundsReceived.",
    summary: "Payment Intent · indicative rate · binding on rail confirmation",
    fee: "indicative",
  },
  {
    id: "payroll",
    label: "Payroll",
    shortLabel: "Payroll",
    flowType: "pay-out",
    context: "Batch payouts across currencies with double-entry ledger reconciliation.",
    summary: "Batch Pay-Out · 5 bps · multi-currency · per-employee ledger entry",
    fee: "5 bps",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    shortLabel: "Market",
    flowType: "pay-out",
    context: "Multi-band liquidity publishing — 1K / 5K / 10K / 25K / 250K / 1M USD bands.",
    summary: "Multi-band Quote Publish · 5 bps · 6 standard bands · atomic-replace",
    fee: "5 bps",
  },
] as const;

export function getChannel(id: ChannelId): Channel {
  const c = CHANNELS.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown channel: ${id}`);
  return c;
}
