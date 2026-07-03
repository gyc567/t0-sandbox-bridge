import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactType } from "@/data/flows";
import {
  buildCurlCommand,
  getArtifactTemplate,
  type LiveIds,
} from "@/data/artifacts";

interface ArtifactDrawerProps {
  type: ArtifactType;
  /** Relative timestamp label, e.g. "t-3.4s ago". */
  timestamp?: string;
  /** Real sandbox IDs from server calls — substitute into the template. */
  liveIds?: LiveIds;
  /** Called when the drawer should close. */
  onClose: () => void;
}

/**
 * Right-side detail drawer for protocol artifacts.
 *
 *   - 380px wide
 *   - glassy dark background with heavy backdrop blur
 *   - mono payload as key/value rows
 *   - "Copy as cURL" button at the bottom
 *   - closes via X button or Esc key
 *
 * Phase 8:
 *   - liveIds flows real payment_id/quote_id into the template
 *   - IVMS101 disclosure artifact gets a collapsible Travel-Rule panel
 */
export function ArtifactDrawer({ type, timestamp, liveIds, onClose }: ArtifactDrawerProps) {
  const template = getArtifactTemplate(type);
  const payload = template.build(liveIds);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleCopy() {
    const cmd = buildCurlCommand(type, liveIds);
    navigator.clipboard.writeText(cmd);
  }

  const isIvms = type === "ivms101-disclosure";

  return (
    <>
      {/* Backdrop scrim */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.25)" }}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-hairline backdrop-blur"
        style={{ backgroundColor: "rgba(10, 14, 26, 0.92)" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Artifact: ${template.title}`}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div>
            <p
              className="font-mono uppercase text-accent-cyan"
              style={{ fontSize: "10px", letterSpacing: "0.16em" }}
            >
              // ARTIFACT
            </p>
            <h2
              className="mt-0.5 font-semibold text-foreground"
              style={{ fontSize: "15px" }}
            >
              {template.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close artifact drawer"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-glass text-secondary-canvas transition-colors hover:border-hairline-strong hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Endpoint hint */}
        <div className="border-b border-hairline px-5 py-2">
          <p
            className="font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.04em" }}
          >
            {template.endpoint}
          </p>
          {timestamp && (
            <p
              className="mt-0.5 font-mono tabular text-success"
              style={{ fontSize: "10px" }}
            >
              {timestamp}
            </p>
          )}
        </div>

        {/* Payload rows */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* IVMS101 disclosure — collapsible Travel-Rule panel */}
          {isIvms && <IvmsDisclosurePanel payload={payload} />}

          <div className={cn("space-y-2", isIvms && "mt-3")}>
            {Object.entries(payload).map(([key, value]) => (
              <div
                key={key}
                className="rounded border border-hairline bg-glass px-3 py-2"
              >
                <div
                  className="font-mono uppercase text-muted-canvas"
                  style={{ fontSize: "9px", letterSpacing: "0.1em" }}
                >
                  {key}
                </div>
                <div
                  className="mt-0.5 break-all font-mono text-foreground tabular"
                  style={{ fontSize: "12px", lineHeight: 1.45 }}
                >
                  {formatValue(value)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <footer className="border-t border-hairline px-5 py-4">
          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-hairline bg-glass py-2 font-mono text-foreground transition-colors hover:border-hairline-strong hover:bg-[rgba(255,255,255,0.06)]"
            style={{ fontSize: "12px" }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy as cURL
          </button>
        </footer>
      </aside>
    </>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Collapsible Travel-Rule (IVMS101) summary. Shows originator +
 * beneficiary in a tight two-line panel; click to expand inline JSON.
 */
function IvmsDisclosurePanel({ payload }: { payload: Record<string, unknown> }) {
  const [open, setOpen] = useState(true);
  const originator = payload.originator as
    | { natural_person?: { name?: string; country?: string }; lei?: string }
    | undefined;
  const beneficiary = payload.beneficiary as
    | { natural_person?: { name?: string; country?: string } }
    | undefined;

  const oName = originator?.natural_person?.name ?? "—";
  const oCountry = originator?.natural_person?.country ?? "—";
  const oLei = originator?.lei;
  const bName = beneficiary?.natural_person?.name ?? "—";
  const bCountry = beneficiary?.natural_person?.country ?? "—";

  return (
    <div className="rounded border border-hairline bg-glass">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span
          className="font-mono uppercase text-accent-cyan"
          style={{ fontSize: "10px", letterSpacing: "0.16em" }}
        >
          ▼ Travel Rule (IVMS101)
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-canvas" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-canvas" />
        )}
      </button>
      {open && (
        <div className="border-t border-hairline px-3 py-2 text-foreground" style={{ fontSize: "11px" }}>
          <p className="font-mono">
            <span className="text-muted-canvas">originator  :</span>{" "}
            {oName}, {oCountry}
            {oLei ? `, LEI ${oLei}` : ""}
          </p>
          <p className="mt-1 font-mono">
            <span className="text-muted-canvas">beneficiary :</span>{" "}
            {bName}, {bCountry}
          </p>
        </div>
      )}
    </div>
  );
}