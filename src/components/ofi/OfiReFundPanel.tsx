// OfiReFundPanel — OFI-side read-only view of AML-rejected payments and their refund status.
// Tracks the full timeline: Created → AML Uploaded → Rejected → Refunded.

import React from "react";
import { PanelCard, StatusDot } from "@/components/console";
import type { Payment } from "@/lib/t0/types";

export interface OfiReFundPanelProps {
  /** Only status === "rejected" payments, e.g. from ofiListRejectedPaymentsFn. */
  payments: Payment[];
}

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

const REJECTED_REASON_LABEL: Record<string, string> = {
  aml_denied: "AML Denied",
  aml_not_needed: "AML Not Needed",
};

interface RejectedRowProps {
  payment: Payment;
}

function RejectedRow({ payment }: RejectedRowProps) {
  const isRefunded = payment.refundedAt != null;
  const refundDuration =
    isRefunded && payment.rejectedAt != null
      ? formatDuration((payment.refundedAt as number) - (payment.rejectedAt as number))
      : null;

  return (
    <div
      className="flex flex-col gap-1 border-b border-hairline py-3 last:border-0"
      data-testid={`refund-row-${payment.id}`}
    >
      {/* Header: ID + badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status="rejected" />
          <span className="font-mono tabular text-caption text-foreground truncate">
            {payment.id}
          </span>
        </div>
        <span
          className="font-mono text-caption shrink-0"
          style={{ color: isRefunded ? "#22c55e" : "#ff9f0a" }}
          data-testid={`refund-status-${payment.id}`}
        >
          {isRefunded ? "Refunded ✓" : "Awaiting Refund"}
        </span>
      </div>

      {/* Quote + Amount */}
      <div className="flex flex-wrap gap-2 pl-6">
        <span className="font-mono text-caption text-muted-foreground">
          Quote: {payment.quoteId.slice(0, 16)}…
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          {payment.currency} {payment.localAmount.toFixed(2)}
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          USD: ${payment.usdAmount.toLocaleString()}
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          BenRef: {payment.beneficiaryRef}
        </span>
      </div>

      {/* AML file */}
      <div className="flex flex-wrap gap-2 pl-6">
        <span className="font-mono text-caption text-muted-foreground">
          AML:{" "}
          {payment.amlFile
            ? `${payment.amlFile.filename} · uploaded ${formatTime(payment.amlFile.uploadedAt)}`
            : "—"}
        </span>
      </div>

      {/* Rejected + Refunded timeline */}
      <div className="flex flex-wrap gap-2 pl-6">
        <span className="font-mono text-caption text-muted-foreground">
          Rejected:{" "}
          {REJECTED_REASON_LABEL[payment.rejectedReason ?? ""] ?? payment.rejectedReason ?? "—"}
          {payment.rejectedAt != null ? ` @ ${formatTime(payment.rejectedAt)}` : ""}
        </span>
        {isRefunded && (
          <span className="font-mono text-caption" style={{ color: "#22c55e" }}>
            Refunded{ refundDuration ? ` (${refundDuration})` : "" }@
            {formatTime(payment.refundedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

export function OfiReFundPanel({ payments }: OfiReFundPanelProps) {
  const awaitingRefund = payments.filter((p) => p.refundedAt == null);
  const refunded = payments.filter((p) => p.refundedAt != null);
  const isEmpty = awaitingRefund.length === 0 && refunded.length === 0;

  return (
    <PanelCard step="04" title="ReFund">
      <div className="space-y-4">
        <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
          Tracks AML-rejected payments. Refunds are initiated by the Provider.
          Time from rejection to refund reflects Provider processing time.
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

        {!isEmpty && awaitingRefund.length > 0 && (
          <div data-testid="refund-awaiting-section">
            <h4
              className="font-mono text-muted-foreground mb-2"
              style={{ fontSize: "11px", color: "#ff9f0a" }}
            >
              Awaiting Refund ({awaitingRefund.length})
            </h4>
            <div>
              {awaitingRefund.map((p) => (
                <RejectedRow key={p.id} payment={p} />
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
                <RejectedRow key={p.id} payment={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </PanelCard>
  );
}
