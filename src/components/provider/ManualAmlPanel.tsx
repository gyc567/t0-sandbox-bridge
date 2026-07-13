// ManualAmlPanel — Provider-side AML file upload + review UI.
// Displays pending_aml payments with file upload and review actions.

import React, { useState, useRef } from "react";
import { PanelCard, StatusDot, List } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileCheck, AlertCircle } from "lucide-react";
import type { Payment } from "@/lib/t0/types";

export interface ManualAmlPanelProps {
  payments: Payment[];
  busy: boolean;
  onUploadAndReview: (paymentId: string, file: File) => Promise<void>;
}

interface PaymentRowProps {
  payment: Payment;
  busy: boolean;
  onUploadAndReview: (paymentId: string, file: File) => Promise<void>;
}

function PaymentRow({ payment, busy, onUploadAndReview }: PaymentRowProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select an AML file first");
      return;
    }
    setError(null);
    try {
      await onUploadAndReview(payment.id, selectedFile);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-hairline py-3 last:border-0">
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
            data-testid={`aml-file-input-${payment.id}`}
          />
        </div>
        <Button
          size="sm"
          disabled={busy || !selectedFile}
          onClick={handleUpload}
          data-testid={`aml-upload-${payment.id}`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload & Review
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
        <div className="flex items-center gap-2 pl-6 text-[#ff453a]">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="font-mono text-caption">{error}</span>
        </div>
      )}
    </div>
  );
}

export function ManualAmlPanel({ payments, busy, onUploadAndReview }: ManualAmlPanelProps) {
  const pendingAmlPayments = payments.filter((p) => p.status === "pending_aml");

  return (
    <PanelCard step="04" title="Payment-Manual AML (Provider view)">
      <div className="space-y-4">
        <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
          Payments awaiting manual AML review. Upload an AML document for each payment, then click
          "Upload & Review" to submit. Approved payments proceed to the Network for quote
          confirmation (Last Look).
        </p>
        {pendingAmlPayments.length === 0 ? (
          <p
            className="font-mono text-muted-foreground text-center py-8"
            style={{ fontSize: "11px" }}
          >
            No payments pending AML review. Trigger AML from the OFI console or wait for
            network-driven manual AML checks.
          </p>
        ) : (
          <List
            items={pendingAmlPayments}
            emptyMessage="No payments pending AML review."
            render={(p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                busy={busy}
                onUploadAndReview={onUploadAndReview}
              />
            )}
          />
        )}
      </div>
    </PanelCard>
  );
}
