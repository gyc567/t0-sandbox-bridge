// ManualAmlPanel — Provider-side AML review queue UI.
//
// Three-way provider decision per payment (Phase 7 rewrite):
//   pending_aml + amlFile  →  Approve | Reject | Cancel AML
//   pending_aml + no file  →  legacy row, three buttons still available
//   accepted / rejected    →  read-only history chips
//
// The OFI is responsible for uploading the AML file; the Provider only
// decides what to do with it. Cancel AML = "I don't need AML" —
// semantically equivalent to Reject but kept as a distinct intent so
// the audit trail can distinguish them later.

import React, { useState } from "react";
import { PanelCard, StatusDot, List } from "@/components/console";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ShieldOff } from "lucide-react";
import type { Payment } from "@/lib/t0/types";

export type AmlDecision = "approve" | "reject";

export interface ManualAmlPanelProps {
  payments: Payment[];
  busy: boolean;
  /** Provider decides Approve or Reject (Cancel AML routes through
   *  Reject with a confirm dialog). */
  onReviewAml: (paymentId: string, decision: AmlDecision) => Promise<void>;
}

interface PaymentRowProps {
  payment: Payment;
  busy: boolean;
  onReviewAml: (paymentId: string, decision: AmlDecision) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

/** Pending review row: shows OFI-uploaded file (or legacy warning) +
 *  three decision buttons. Cancel AML has a confirm dialog. */
function PaymentRow({ payment, busy, onReviewAml }: PaymentRowProps) {
  const hasFile = !!payment.amlFile;

  const handleClick = (decision: AmlDecision | "cancel") => {
    if (decision === "cancel") {
      const ok = window.confirm(
        "Cancel AML for this payment? The payment will be marked as rejected and AML review will stop.",
      );
      if (!ok) return;
      void onReviewAml(payment.id, "reject");
      return;
    }
    void onReviewAml(payment.id, decision);
  };

  return (
    <div
      className="flex flex-col gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`aml-pending-row-${payment.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status="pending_aml" />
          <span className="font-mono tabular text-caption text-foreground truncate">
            {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
            {payment.beneficiaryRef}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        <span className="font-mono text-caption text-muted-foreground">
          Quote: {payment.quoteId.slice(0, 16)}…
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          USD: ${payment.usdAmount.toLocaleString()}
        </span>
      </div>

      {/* AML file metadata (uploaded by OFI) or legacy warning */}
      <div className="flex flex-wrap items-center gap-2 pl-6 pt-1">
        {hasFile ? (
          <span
            className="font-mono text-caption text-muted-foreground"
            data-testid={`aml-file-meta-${payment.id}`}
          >
            AML file (from OFI): {payment.amlFile!.filename} (
            {formatBytes(payment.amlFile!.fileSize)}) at{" "}
            {formatTime(payment.amlFile!.uploadedAt)}
          </span>
        ) : (
          <span
            className="font-mono text-caption text-[#ff9f0a]"
            data-testid={`aml-legacy-warning-${payment.id}`}
          >
            ⚠ Awaiting OFI upload (legacy pending_aml row — no AML file on record)
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pl-6 pt-1">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => handleClick("approve")}
          data-testid={`aml-approve-${payment.id}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => handleClick("reject")}
          data-testid={`aml-reject-${payment.id}`}
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => handleClick("cancel")}
          data-testid={`aml-cancel-${payment.id}`}
        >
          <ShieldOff className="w-3.5 h-3.5" />
          Cancel AML
        </Button>
      </div>
    </div>
  );
}

/** Read-only chip for settled AML states. No file input, no button. */
function ReadOnlyRow({ payment }: { payment: Payment }) {
  return (
    <div
      className="flex flex-col gap-1 border-b border-hairline py-2 last:border-0"
      data-testid={`aml-readonly-${payment.status}-${payment.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={payment.status} />
          <span className="font-mono tabular text-caption text-foreground truncate">
            {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
            {payment.beneficiaryRef}
          </span>
        </div>
        <span
          className="font-mono text-caption shrink-0"
          style={{
            color: payment.status === "rejected" ? "#ff9f0a" : undefined,
          }}
        >
          {payment.status === "rejected" ? "Rejected" : "Approved · Last Look cleared"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        <span className="font-mono text-caption text-muted-foreground">
          Quote: {payment.quoteId.slice(0, 16)}…
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          USD: ${payment.usdAmount.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function ManualAmlPanel({ payments, busy, onReviewAml }: ManualAmlPanelProps) {
  const pendingAmlPayments = payments.filter((p) => p.status === "pending_aml");
  const approvedPayments = payments.filter((p) => p.status === "accepted");
  const rejectedPayments = payments.filter((p) => p.status === "rejected");
  const isEmpty =
    pendingAmlPayments.length === 0 &&
    approvedPayments.length === 0 &&
    rejectedPayments.length === 0;

  return (
    <PanelCard step="04" title="Payment-Manual AML (Provider view)">
      <div className="space-y-4">
        <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
          The OFI uploads the AML document. Review the file and choose
          Approve (advance to Last Look), Reject (file content flagged), or
          Cancel AML (skip AML review entirely).
        </p>

        {isEmpty && (
          <p
            className="font-mono text-muted-foreground text-center py-8"
            style={{ fontSize: "11px" }}
            data-testid="aml-empty"
          >
            No payments pending AML review.
          </p>
        )}

        {!isEmpty && pendingAmlPayments.length > 0 && (
          <div data-testid="aml-active-queue">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Awaiting your review ({pendingAmlPayments.length})
            </h4>
            <List
              items={pendingAmlPayments}
              emptyMessage="No payments pending AML review."
              render={(p) => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  busy={busy}
                  onReviewAml={onReviewAml}
                />
              )}
            />
          </div>
        )}

        {!isEmpty && approvedPayments.length > 0 && (
          <div data-testid="aml-approved-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Approved · Last Look cleared ({approvedPayments.length})
            </h4>
            <List
              items={approvedPayments}
              emptyMessage="No approved payments."
              render={(p) => <ReadOnlyRow key={p.id} payment={p} />}
            />
          </div>
        )}

        {!isEmpty && rejectedPayments.length > 0 && (
          <div data-testid="aml-rejected-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Rejected ({rejectedPayments.length})
            </h4>
            <List
              items={rejectedPayments}
              emptyMessage="No rejected payments."
              render={(p) => <ReadOnlyRow key={p.id} payment={p} />}
            />
          </div>
        )}
      </div>
    </PanelCard>
  );
}
