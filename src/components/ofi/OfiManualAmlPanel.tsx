// OfiManualAmlPanel — OFI-side manual AML flow (Phase 7 rewrite).
//
// OFI responsibilities:
//   1. Trigger AML on a pending payment (status: pending → pending_aml).
//   2. Upload the AML document for the payment to review.
//   3. Show "awaiting Provider" state once the file is uploaded.
//
// Three row states are rendered:
//   - status: 'pending'                  → "Trigger AML" button
//   - status: 'pending_aml' + !amlFile   → file input + "Upload & Submit"
//   - status: 'pending_aml' + amlFile    → "✓ file.pdf uploaded" + waiting hint
//   - status: 'accepted'/'rejected'/...  → hidden

import React, { useState, useRef } from "react";
import { PanelCard, StatusDot, List } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Upload, FileCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Payment } from "@/lib/t0/types";

export interface OfiManualAmlPanelProps {
  payments: Payment[];
  busy: boolean;
  onTriggerAml: (payment: Payment) => void;
  /** OFI uploads the AML document. Returns when the network has
   *  recorded the file metadata. Throws on invalid file. */
  onUploadAmlFile: (paymentId: string, file: File) => Promise<void>;
}

/** Pure: classify a payment into one of the three row states. Exposed
 *  for tests; component delegates here so the classification logic is
 *  testable without a DOM. */
export type OfiAmlRowState =
  | { kind: "trigger" } // status pending — show "Trigger AML"
  | { kind: "upload" } // status pending_aml + no file — show file input
  | { kind: "waiting" } // status pending_aml + file uploaded — show waiting
  | { kind: "rejected" } // status rejected — Provider rejected AML
  | { kind: "hidden" }; // terminal/irrelevant

export function classifyOfiRow(p: Payment): OfiAmlRowState {
  if (p.status === "pending") return { kind: "trigger" };
  if (p.status === "pending_aml" && !p.amlFile) return { kind: "upload" };
  if (p.status === "pending_aml" && p.amlFile) return { kind: "waiting" };
  if (p.status === "rejected") return { kind: "rejected" };
  return { kind: "hidden" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

interface TriggerRowProps {
  payment: Payment;
  busy: boolean;
  onTriggerAml: (payment: Payment) => void;
}

function TriggerRow({ payment, busy, onTriggerAml }: TriggerRowProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`ofi-aml-row-${payment.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={payment.status} />
        <span className="font-mono tabular text-caption text-foreground truncate">
          {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
          {payment.beneficiaryRef}
        </span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => onTriggerAml(payment)}
        data-testid={`ofi-trigger-aml-${payment.id}`}
      >
        <Shield className="w-3.5 h-3.5" />
        Trigger AML
      </Button>
    </div>
  );
}

interface UploadRowProps {
  payment: Payment;
  busy: boolean;
  onUploadAmlFile: (paymentId: string, file: File) => Promise<void>;
}

/** Pure: given a row's current selectedFile + the upload callback, decide
 *  what error state to set. Mirrors the handler in UploadRow so the
 *  no-file guard is testable without a DOM. */
export async function runOfiUpload(args: {
  paymentId: string;
  selectedFile: File | null;
  onUploadAmlFile: (paymentId: string, file: File) => Promise<void>;
}): Promise<{ error: string | null }> {
  if (!args.selectedFile) {
    return { error: "Please select an AML file first" };
  }
  try {
    await args.onUploadAmlFile(args.paymentId, args.selectedFile);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

function UploadRow({ payment, busy, onUploadAmlFile }: UploadRowProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
    setError(null);
  };

  const handleUpload = async () => {
    const { error: nextError } = await runOfiUpload({
      paymentId: payment.id,
      selectedFile,
      onUploadAmlFile,
    });
    setError(nextError);
    if (!nextError) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div
      className="flex flex-col gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`ofi-upload-row-${payment.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={payment.status} />
          <span className="font-mono tabular text-caption text-foreground truncate">
            {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
            {payment.beneficiaryRef}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 pl-6 pt-1">
        <div className="flex-1 min-w-[200px]">
          <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
            AML Document
          </Label>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/jpg"
            onChange={handleFileChange}
            disabled={busy}
            className="font-mono text-caption"
            data-testid={`ofi-aml-file-input-${payment.id}`}
          />
        </div>
        <Button
          size="sm"
          disabled={busy || !selectedFile}
          onClick={handleUpload}
          data-testid={`ofi-aml-upload-${payment.id}`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload & Submit
        </Button>
      </div>
      {selectedFile && (
        <div className="flex items-center gap-2 pl-6">
          <FileCheck className="w-3.5 h-3.5 text-accent-green" />
          <span className="font-mono text-caption text-muted-foreground">
            {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
          </span>
        </div>
      )}
      {error && (
        <div
          className="flex items-center gap-2 pl-6 text-[#ff453a]"
          data-testid={`ofi-aml-error-${payment.id}`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="font-mono text-caption">{error}</span>
        </div>
      )}
    </div>
  );
}

function WaitingRow({ payment }: { payment: Payment }) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`ofi-waiting-row-${payment.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={payment.status} />
        <span className="font-mono tabular text-caption text-foreground truncate">
          {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
          {payment.beneficiaryRef}
        </span>
      </div>
      <div
        className="flex items-center gap-2 shrink-0 text-accent-green"
        data-testid={`ofi-uploaded-meta-${payment.id}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="font-mono text-caption">
          {payment.amlFile!.filename} ({formatBytes(payment.amlFile!.fileSize)}) uploaded
          at {formatTime(payment.amlFile!.uploadedAt)} — awaiting Provider review
        </span>
      </div>
    </div>
  );
}

function RejectedRow({ payment }: { payment: Payment }) {
  const reasonLabel = payment.rejectedReason === "aml_not_needed"
    ? "AML not needed"
    : payment.rejectedReason === "aml_denied"
      ? "AML denied"
      : "AML rejected";
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-hairline py-3 last:border-0"
      data-testid={`ofi-rejected-row-${payment.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={payment.status} />
        <span className="font-mono tabular text-caption text-foreground truncate">
          {payment.id} · {payment.currency} {payment.localAmount.toFixed(2)} ·{" "}
          {payment.beneficiaryRef}
        </span>
      </div>
      <div
        className="flex items-center gap-2 shrink-0 text-[#ff453a]"
        data-testid={`ofi-rejected-meta-${payment.id}`}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="font-mono text-caption">
          {reasonLabel}
          {payment.refundedAt
            ? ` · refunded at ${formatTime(payment.refundedAt)}`
            : " · awaiting refund"}
        </span>
      </div>
    </div>
  );
}

export function OfiManualAmlPanel({
  payments,
  busy,
  onTriggerAml,
  onUploadAmlFile,
}: OfiManualAmlPanelProps) {
  // Render rows in the four buckets; empty buckets are hidden.
  const triggerRows: Payment[] = [];
  const uploadRows: Payment[] = [];
  const waitingRows: Payment[] = [];
  const rejectedRows: Payment[] = [];
  for (const p of payments) {
    const state = classifyOfiRow(p);
    if (state.kind === "trigger") triggerRows.push(p);
    else if (state.kind === "upload") uploadRows.push(p);
    else if (state.kind === "waiting") waitingRows.push(p);
    else if (state.kind === "rejected") rejectedRows.push(p);
    // hidden → not rendered
  }

  const isEmpty = triggerRows.length === 0 && uploadRows.length === 0 && waitingRows.length === 0 && rejectedRows.length === 0;

  return (
    <PanelCard step="09a" title="Payment-Manual AML (OFI view)">
      <div className="space-y-4">
        <p
          className="font-mono text-accent-cyan"
          style={{ fontSize: "11px" }}
          data-testid="ofi-aml-banner"
        >
          Sandbox is configured to require AML for all payments. After
          creating a payment, trigger AML and upload the AML document
          before the Provider can approve or reject.
        </p>

        {isEmpty && (
          <p
            className="font-mono text-muted-foreground text-center py-8"
            style={{ fontSize: "11px" }}
          >
            No payments eligible for manual AML. Create a payment from
            Quote management first.
          </p>
        )}

        {!isEmpty && waitingRows.length > 0 && (
          <div data-testid="ofi-waiting-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Awaiting Provider review ({waitingRows.length})
            </h4>
            <List
              items={waitingRows}
              emptyMessage="No payments awaiting Provider review."
              render={(p) => <WaitingRow key={p.id} payment={p} />}
            />
          </div>
        )}

        {!isEmpty && rejectedRows.length > 0 && (
          <div data-testid="ofi-rejected-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              AML Rejected ({rejectedRows.length})
            </h4>
            <List
              items={rejectedRows}
              emptyMessage="No rejected payments."
              render={(p) => <RejectedRow key={p.id} payment={p} />}
            />
          </div>
        )}

        {!isEmpty && uploadRows.length > 0 && (
          <div data-testid="ofi-upload-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Awaiting your AML file upload ({uploadRows.length})
            </h4>
            <List
              items={uploadRows}
              emptyMessage="No payments awaiting upload."
              render={(p) => (
                <UploadRow
                  key={p.id}
                  payment={p}
                  busy={busy}
                  onUploadAmlFile={onUploadAmlFile}
                />
              )}
            />
          </div>
        )}

        {!isEmpty && triggerRows.length > 0 && (
          <div data-testid="ofi-trigger-section">
            <h4 className="font-mono text-muted-foreground mb-2" style={{ fontSize: "11px" }}>
              Trigger AML queue ({triggerRows.length})
            </h4>
            <List
              items={triggerRows}
              emptyMessage="No payments eligible for manual AML."
              render={(p) => (
                <TriggerRow
                  key={p.id}
                  payment={p}
                  busy={busy}
                  onTriggerAml={onTriggerAml}
                />
              )}
            />
          </div>
        )}
      </div>
    </PanelCard>
  );
}