import { ArrowUpRight, Boxes, Code2, FileText, Wallet } from "lucide-react";

/**
 * Bento-style footer for the playground.
 *
 * Four cards in an asymmetric grid:
 *   1. Quick Start     (tall left)
 *   2. SDKs            (top middle)
 *   3. Pricing         (top right)
 *   4. FAQ             (bottom middle + right, spans 2 cols)
 *
 * Keeps the dark glass aesthetic and mono labels.
 */
export function BentoFooter() {
  return (
    <section className="border-t border-hairline px-6 py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-baseline justify-between">
          <p
            className="font-mono uppercase text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.16em" }}
          >
            // NEXT STEPS
          </p>
          <p
            className="font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.04em" }}
          >
            production: api.t-0.network · sandbox: api-sandbox.t-0.network
          </p>
        </div>

        <div className="grid auto-rows-[140px] grid-cols-1 gap-4 md:grid-cols-3">
          {/* Quick Start — tall left */}
          <div
            className="group relative row-span-2 flex flex-col justify-between rounded-2xl border border-hairline bg-glass p-5 transition-colors hover:border-hairline-strong hover:bg-[rgba(255,255,255,0.06)]"
          >
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-glass text-accent-cyan">
                <Wallet className="h-4 w-4" />
              </div>
              <h3
                className="mt-4 font-semibold text-foreground"
                style={{ fontSize: "17px" }}
              >
                Quick Start
              </h3>
              <p
                className="mt-2 text-secondary-canvas"
                style={{ fontSize: "13px", lineHeight: 1.5 }}
              >
                Run your first quote → settlement → payout cycle in the sandbox.
                No KYB required.
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-accent-cyan group-hover:underline" style={{ fontSize: "11px" }}>
              <span>Open /sandbox</span>
              <ArrowUpRight className="h-3 w-3" />
            </div>
          </div>

          {/* SDKs */}
          <div className="group flex flex-col justify-between rounded-2xl border border-hairline bg-glass p-5 transition-colors hover:border-hairline-strong hover:bg-[rgba(255,255,255,0.06)]">
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-glass text-secondary-canvas">
                <Code2 className="h-4 w-4" />
              </div>
              <h3
                className="mt-3 font-semibold text-foreground"
                style={{ fontSize: "15px" }}
              >
                SDKs
              </h3>
              <p
                className="mt-1 text-secondary-canvas"
                style={{ fontSize: "12px", lineHeight: 1.45 }}
              >
                Go · TypeScript · Python · Java · C#
              </p>
            </div>
            <div className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>
              Request signing included
            </div>
          </div>

          {/* Pricing */}
          <div className="group flex flex-col justify-between rounded-2xl border border-hairline bg-glass p-5 transition-colors hover:border-hairline-strong hover:bg-[rgba(255,255,255,0.06)]">
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-glass text-secondary-canvas">
                <Boxes className="h-4 w-4" />
              </div>
              <h3
                className="mt-3 font-semibold text-foreground"
                style={{ fontSize: "15px" }}
              >
                Pricing
              </h3>
              <p
                className="mt-1 text-secondary-canvas"
                style={{ fontSize: "12px", lineHeight: 1.45 }}
              >
                Standard Pay-Out: 5 bps. Manual AML + Last Look: 10 bps.
              </p>
            </div>
            <div className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>
              Volume bands: 1K · 5K · 10K · 25K · 250K · 1M
            </div>
          </div>

          {/* FAQ */}
          <div className="group md:col-span-2 flex items-center justify-between rounded-2xl border border-hairline bg-glass p-5 transition-colors hover:border-hairline-strong hover:bg-[rgba(255,255,255,0.06)]">
            <div className="max-w-lg">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-glass text-secondary-canvas">
                <FileText className="h-4 w-4" />
              </div>
              <h3
                className="mt-3 font-semibold text-foreground"
                style={{ fontSize: "15px" }}
              >
                FAQ & Integration Guide
              </h3>
              <p
                className="mt-1 text-secondary-canvas"
                style={{ fontSize: "12px", lineHeight: 1.45 }}
              >
                KYB, key generation, idempotency rules, settlement procedures,
                and webhook signatures.
              </p>
            </div>
            <div className="hidden items-center gap-2 font-mono text-accent-cyan group-hover:underline md:flex" style={{ fontSize: "11px" }}>
              <span>Read /docs</span>
              <ArrowUpRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>

      <p
        className="mx-auto mt-10 max-w-7xl text-center font-mono text-muted-canvas"
        style={{ fontSize: "10px", letterSpacing: "0.12em" }}
      >
        PHASE 7 · SANDBOX WIRING + BENTO FOOTER · READY FOR DEPLOY
      </p>
    </section>
  );
}
