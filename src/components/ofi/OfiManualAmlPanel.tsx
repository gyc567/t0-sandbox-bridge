// OfiManualAmlPanel — OFI-side manual AML trigger UI.
// Mirrors the Provider-side ManualAmlPanel shape: pure presentational,
// receives `payments`/`busy`/`onTriggerAml` props only. Server-fn wiring
// stays in src/routes/ofi.tsx.

import { PanelCard, StatusDot, List } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import type { Payment } from "@/lib/t0/types";

export interface OfiManualAmlPanelProps {
  payments: Payment[];
  busy: boolean;
  onTriggerAml: (payment: Payment) => void;
}

const TERMINAL_STATUSES: ReadonlySet<Payment["status"]> = new Set([
  "confirmed",
  "rejected",
  "pending_aml",
]);

function isTriggerable(p: Payment): boolean {
  return !TERMINAL_STATUSES.has(p.status);
}

export function OfiManualAmlPanel({ payments, busy, onTriggerAml }: OfiManualAmlPanelProps) {
  const triggerable = payments.filter(isTriggerable);

  return (
    <PanelCard step="09a" title="Payment-Manual AML (OFI view)">
      <div className="space-y-4">
        <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
          Push a payment into manual AML review. The Provider then uploads an AML document and
          approves or rejects the payment. After approval, the Network sends a refreshed quote
          for OFI's "Last Look" approval below.
        </p>
        {triggerable.length === 0 ? (
          <p
            className="font-mono text-muted-foreground text-center py-8"
            style={{ fontSize: "11px" }}
          >
            No payments eligible for manual AML. Create a payment from Quote management.
          </p>
        ) : (
          <List
            items={triggerable}
            emptyMessage="No payments eligible for manual AML."
            render={(p) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 border-b border-hairline py-3 last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={p.status} />
                    <span className="font-mono tabular text-caption text-foreground truncate">
                      {p.id} · {p.currency} {p.localAmount.toFixed(2)} · {p.beneficiaryRef}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || p.status === "pending_aml"}
                    onClick={() => onTriggerAml(p)}
                    data-testid={`ofi-trigger-aml-${p.id}`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Trigger AML
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </PanelCard>
  );
}