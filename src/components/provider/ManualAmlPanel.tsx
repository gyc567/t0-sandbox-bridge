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
import { CheckCircle2, XCircle, ShieldOff, Download } from "lucide-react";
import type { Payment } from "@/lib/t0/types";

export type AmlDecision = "approve" | "reject";
export type AmlRejectReason = "aml_denied" | "aml_not_needed";

export interface ManualAmlPanelProps {
  payments: Payment[];
  busy: boolean;
  /** Provider decides Approve or Reject (Cancel AML routes through
   *  Reject with a confirm dialog). reason is required for reject decisions.
   *  recipientCheckStatus is always required: "approved" if OFI provided no
   *  recipientInfo (skip verification) or if Provider checked the box;
   *  "rejected" if Provider rejected the recipient info. */
  onReviewAml: (
    paymentId: string,
    decision: AmlDecision,
    recipientCheckStatus: "approved" | "rejected",
    reason?: AmlRejectReason,
    recipientCheckNote?: string,
  ) => Promise<void>;
  /** Download the AML file bytes from the server and trigger a browser
   *  save-as (blob URL + <a download>). */
  onDownloadAml: (paymentId: string) => Promise<void>;
  /** Refund a rejected payment — releases the reserved credit back to OFI. */
  onRefundAml: (paymentId: string) => Promise<void>;
}

interface PaymentRowProps {
  payment: Payment;
  busy: boolean;
  onReviewAml: (
    paymentId: string,
    decision: AmlDecision,
    recipientCheckStatus: "approved" | "rejected",
    reason?: AmlRejectReason,
    recipientCheckNote?: string,
  ) => Promise<void>;
  onDownloadAml: (paymentId: string) => Promise<void>;
}

interface RefundableRowProps {
  payment: Payment;
  busy: boolean;
  onRefundAml: (paymentId: string) => Promise<void>;
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
 *  recipient info + verification checkbox, then three decision buttons.
 *  Cancel AML has a confirm dialog. */
function PaymentRow({ payment, busy, onReviewAml, onDownloadAml }: PaymentRowProps) {
  const hasFile = !!payment.amlFile;
  const hasRecipientInfo = !!payment.recipientInfo;
  const [recipientVerified, setRecipientVerified] = useState(!hasRecipientInfo);

  const handleClick = (decision: AmlDecision | "cancel") => {
    const rcStatus: "approved" | "rejected" = recipientVerified ? "approved" : "rejected";
    if (decision === "cancel") {
      const ok = window.confirm(
        "Cancel AML for this payment? The payment will be marked as rejected and AML review will stop.",
      );
      if (!ok) return;
      void onReviewAml(payment.id, "reject", rcStatus, "aml_not_needed");
      return;
    }
    if (decision === "reject") {
      void onReviewAml(payment.id, decision, rcStatus, "aml_denied");
      return;
    }
    void onReviewAml(payment.id, decision, rcStatus);
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
          <>
            <span
              className="font-mono text-caption text-muted-foreground"
              data-testid={`aml-file-meta-${payment.id}`}
            >
              AML file (from OFI): {payment.amlFile!.filename} (
              {formatBytes(payment.amlFile!.fileSize)}) at{" "}
              {formatTime(payment.amlFile!.uploadedAt)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void onDownloadAml(payment.id)}
              data-testid={`aml-download-${payment.id}`}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </Button>
          </>
        ) : (
          <span
            className="font-mono text-caption text-[#ff9f0a]"
            data-testid={`aml-legacy-warning-${payment.id}`}
          >
            ⚠ Awaiting OFI upload (legacy pending_aml row — no AML file on record)
          </span>
        )}
      </div>

      {/* Recipient info section */}
      <div className="ml-6 rounded border border-hairline p-2 space-y-1">
        <p className="font-mono text-muted-foreground" style={{ fontSize: "10px" }}>
          Recipient info (pending manual review)
        </p>
        {hasRecipientInfo ? (
          <>
            {payment.recipientInfo!.fallback ? (
              <>
                <p className="font-mono text-caption">
                  {payment.recipientInfo!.fallback.accountHolderName} ·{" "}
                  {payment.recipientInfo!.fallback.accountNumber}
                </p>
                {(payment.recipientInfo!.fallback.bankName ||
                  payment.recipientInfo!.fallback.bankCode) && (
                  <p className="font-mono text-caption text-muted-foreground">
                    {payment.recipientInfo!.fallback.bankName}
                    {payment.recipientInfo!.fallback.bankName &&
                      payment.recipientInfo!.fallback.bankCode &&
                      " · "}
                    {payment.recipientInfo!.fallback.bankCode}
                  </p>
                )}
                <p className="font-mono text-caption text-muted-foreground">
                  Country: {payment.recipientInfo!.fallback.country}
                </p>
              </>
            ) : payment.recipientInfo!.ivms101 ? (
              <p className="font-mono text-caption">
                IVMS101: {payment.recipientInfo!.ivms101.name.primary}
                {payment.recipientInfo!.ivms101.nationality &&
                  ` · ${payment.recipientInfo!.ivms101.nationality}`}
              </p>
            ) : null}
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={recipientVerified}
                onChange={(e) => setRecipientVerified(e.target.checked)}
                disabled={busy}
                className="accent-accent-cyan"
                data-testid={`recipient-verify-${payment.id}`}
              />
              <span className="font-mono text-caption">Recipient info verified</span>
            </label>
          </>
        ) : (
          <p className="font-mono text-caption text-muted-foreground">
            No recipient info (manual verification skipped)
          </p>
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
          {payment.recipientCheckStatus === "rejected" && " · Recipient info rejected"}
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

/** Rejected but not yet refunded — shows Refund button. */
function RefundableRow({ payment, busy, onRefundAml }: RefundableRowProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`aml-refundable-row-${payment.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={payment.status} />
        <span className="font-mono tabular text-caption text-foreground truncate">
          {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
          {payment.beneficiaryRef}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="font-mono text-caption text-[#ff9f0a]"
          data-testid={`aml-rejected-reason-${payment.id}`}
        >
          Awaiting refund
        </span>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => void onRefundAml(payment.id)}
          data-testid={`aml-refund-${payment.id}`}
        >
          Refund
        </Button>
      </div>
    </div>
  );
}

/** Rejected and already refunded — read-only. */
function RefundedRow({ payment }: { payment: Payment }) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`aml-refunded-row-${payment.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={payment.status} />
        <span className="font-mono tabular text-caption text-foreground truncate">
          {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
          {payment.beneficiaryRef}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-accent-green">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="font-mono text-caption">
          ✓ Refunded at {formatTime(payment.refundedAt!)}
        </span>
      </div>
    </div>
  );
}

export function ManualAmlPanel({
  payments,
  busy,
  onReviewAml,
  onDownloadAml,
  onRefundAml,
}: ManualAmlPanelProps) {
  const pendingAmlPayments = payments.filter((p) => p.status === "pending_aml");
  const approvedPayments = payments.filter((p) => p.status === "accepted");
  const refundablePayments = payments.filter(
    (p) => p.status === "rejected" && p.refundedAt === undefined,
  );
  const refundedPayments = payments.filter(
    (p) => p.status === "rejected" && p.refundedAt !== undefined,
  );
  const isEmpty =
    pendingAmlPayments.length === 0 &&
    approvedPayments.length === 0 &&
    refundablePayments.length === 0 &&
    refundedPayments.length === 0;

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
                  onDownloadAml={onDownloadAml}
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

        {!isEmpty && refundablePayments.length > 0 && (
          <div data-testid="aml-refundable-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Awaiting Refund ({refundablePayments.length})
            </h4>
            <List
              items={refundablePayments}
              emptyMessage="No payments awaiting refund."
              render={(p) => (
                <RefundableRow
                  key={p.id}
                  payment={p}
                  busy={busy}
                  onRefundAml={onRefundAml}
                />
              )}
            />
          </div>
        )}

        {!isEmpty && refundedPayments.length > 0 && (
          <div data-testid="aml-refunded-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Refunded ({refundedPayments.length})
            </h4>
            <List
              items={refundedPayments}
              emptyMessage="No refunded payments."
              render={(p) => <RefundedRow key={p.id} payment={p} />}
            />
          </div>
        )}
      </div>
    </PanelCard>
  );
}
