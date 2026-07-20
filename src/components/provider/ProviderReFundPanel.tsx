// ProviderReFundPanel — Provider-side ReFund management view.
//
// Dedicated tab for tracking AML-rejected payments and triggering refunds.
// Separated from ManualAmlPanel so each panel has a single responsibility.

import React from "react";
import { PanelCard, StatusDot } from "@/components/console";
import { Button } from "@/components/ui/button";
import type { Payment } from "@/lib/t0/types";

export interface ProviderReFundPanelProps {
  /** All payments from snapshotFn, filtered to status === "rejected" by the caller. */
  payments: Payment[];
  busy: boolean;
  onRefundAml: (paymentId: string) => Promise<void>;
}

const REJECTED_REASON_LABEL: Record<string, string> = {
  aml_denied: "AML Denied",
  aml_not_needed: "AML Not Needed",
};

function formatTime(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 0) return "—";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface AwaitingRowProps {
  payment: Payment;
  busy: boolean;
  onRefundAml: (paymentId: string) => Promise<void>;
}

function AwaitingRow({ payment, busy, onRefundAml }: AwaitingRowProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`refund-awaiting-row-${payment.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status="rejected" />
        <span className="font-mono tabular text-caption text-foreground truncate">
          {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
          {payment.beneficiaryRef}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <span
          className="font-mono text-caption text-[#ff9f0a]"
          data-testid={`refund-rejected-reason-${payment.id}`}
        >
          {REJECTED_REASON_LABEL[payment.rejectedReason ?? ""] ?? payment.rejectedReason ?? "—"}
          {payment.rejectedAt != null ? ` @ ${formatTime(payment.rejectedAt)}` : ""}
        </span>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => void onRefundAml(payment.id)}
          data-testid={`refund-btn-${payment.id}`}
        >
          Refund
        </Button>
      </div>
    </div>
  );
}

interface RefundedRowProps {
  payment: Payment;
}

function RefundedRow({ payment }: RefundedRowProps) {
  const refundDuration =
    payment.rejectedAt != null && payment.refundedAt != null
      ? formatDuration(payment.refundedAt - payment.rejectedAt)
      : null;

  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`refund-refunded-row-${payment.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status="confirmed" />
        <span className="font-mono tabular text-caption text-foreground truncate">
          {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
          {payment.beneficiaryRef}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0 text-accent-green">
        <span
          className="font-mono text-caption text-accent-green"
          data-testid={`refund-amount-${payment.id}`}
        >
          ${payment.usdAmount.toLocaleString()} refunded
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          {refundDuration ? `${refundDuration} · ` : ""}
          {formatTime(payment.refundedAt)}
        </span>
      </div>
    </div>
  );
}

export function ProviderReFundPanel({ payments, busy, onRefundAml }: ProviderReFundPanelProps) {
  const awaiting = payments.filter((p) => p.status === "rejected" && p.refundedAt === undefined);
  const refunded = payments.filter((p) => p.status === "rejected" && p.refundedAt != null);
  const isEmpty = awaiting.length === 0 && refunded.length === 0;

  return (
    <PanelCard step="05" title="ReFund">
      <div className="space-y-4">
        <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
          AML-rejected payments. Click Refund to release the reserved USDT back to the OFI.
        </p>

        {isEmpty && (
          <p
            className="font-mono text-muted-foreground text-center py-8"
            style={{ fontSize: "11px" }}
            data-testid="refund-empty"
          >
            No rejected payments.
          </p>
        )}

        {!isEmpty && awaiting.length > 0 && (
          <div data-testid="refund-awaiting-section">
            <h4
              className="font-mono text-muted-foreground mb-2"
              style={{ fontSize: "11px", color: "#ff9f0a" }}
            >
              Awaiting Refund ({awaiting.length})
            </h4>
            <div>
              {awaiting.map((p) => (
                <AwaitingRow key={p.id} payment={p} busy={busy} onRefundAml={onRefundAml} />
              ))}
            </div>
          </div>
        )}

        {!isEmpty && refunded.length > 0 && (
          <div data-testid="refund-refunded-section">
            <h4
              className="font-mono text-muted-foreground mb-2"
              style={{ fontSize: "11px", color: "#22c55e" }}
            >
              Refunded ({refunded.length})
            </h4>
            <div>
              {refunded.map((p) => (
                <RefundedRow key={p.id} payment={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </PanelCard>
  );
}
