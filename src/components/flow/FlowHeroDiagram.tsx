/**
 * Live playback card: BAXS (OFI + Provider badges) ↔ T-0 Network.
 * Pure SVG with SMIL animateMotion (SSR-safe, no JS hooks).
 */
export function FlowHeroDiagram() {
  return (
    <div
      className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-[var(--radius-2xl)] border border-hairline bg-glass backdrop-blur-xl"
      style={{
        boxShadow:
          "0 0 40px rgba(0,212,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="status-dot" aria-hidden />
          <span
            className="font-mono text-accent-cyan"
            style={{ fontSize: "10px", letterSpacing: "0.14em" }}
          >
            LIVE PLAYBACK
          </span>
        </div>
        <span
          className="font-mono text-muted-canvas"
          style={{ fontSize: "10px" }}
        >
          Connect RPC · gRPC / REST-JSON
        </span>
      </div>
      <div className="relative h-[calc(100%-41px)]">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 400 280"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <line
            x1="80"
            y1="140"
            x2="200"
            y2="140"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />
          <line
            x1="200"
            y1="140"
            x2="320"
            y2="140"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />
          <circle
            r="5"
            fill="#00d4ff"
            style={{ filter: "drop-shadow(0 0 6px rgba(0,212,255,0.8))" }}
          >
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              path="M80,140 L200,140 L320,140"
            />
          </circle>
          <line
            x1="80"
            y1="220"
            x2="320"
            y2="220"
            stroke="rgba(245,182,20,0.4)"
            strokeWidth="1"
            strokeDasharray="4 4"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-16"
              dur="3s"
              repeatCount="indefinite"
            />
          </line>
        </svg>

        {/* Left node: BAXS (dual role) */}
        <div
          className="absolute top-[40%] -translate-y-1/2 -translate-x-1/2 text-center"
          style={{ left: "20%" }}
        >
          <div
            className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-lg border backdrop-blur"
            style={{
              borderColor: "rgba(0,212,255,0.3)",
              background: "rgba(0,212,255,0.06)",
              boxShadow: "0 0 16px rgba(0,212,255,0.15)",
            }}
          >
            <span className="status-dot" aria-hidden />
          </div>
          <div
            className="font-mono text-foreground"
            style={{ fontSize: "10px", letterSpacing: "0.08em" }}
          >
            BAXS
          </div>
          <div
            className="mt-0.5 flex justify-center gap-1"
            aria-label="BAXS plays both OFI and Provider"
          >
            <span
              className="rounded-sm border border-accent-cyan/40 px-1 font-mono text-accent-cyan"
              style={{ fontSize: "7px", letterSpacing: "0.1em" }}
            >
              OFI
            </span>
            <span
              className="rounded-sm border border-accent-violet/40 px-1 font-mono text-accent-violet"
              style={{ fontSize: "7px", letterSpacing: "0.1em" }}
            >
              PROVIDER
            </span>
          </div>
        </div>

        {/* Center: T-0 Network */}
        <div
          className="absolute top-[40%] -translate-y-1/2 -translate-x-1/2 text-center"
          style={{ left: "50%" }}
        >
          <div
            className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-lg border backdrop-blur"
            style={{
              borderColor: "rgba(124,92,255,0.3)",
              background: "rgba(124,92,255,0.06)",
              boxShadow: "0 0 16px rgba(124,92,255,0.15)",
            }}
          >
            <span className="status-dot" aria-hidden />
          </div>
          <div
            className="font-mono text-foreground"
            style={{ fontSize: "10px", letterSpacing: "0.08em" }}
          >
            T-0 NETWORK
          </div>
          <div
            className="font-mono text-muted-canvas"
            style={{ fontSize: "8px" }}
          >
            Orchestrator
          </div>
        </div>

        {/* Right: counterparty bank */}
        <div
          className="absolute top-[40%] -translate-y-1/2 -translate-x-1/2 text-center"
          style={{ left: "80%" }}
        >
          <div
            className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-lg border backdrop-blur"
            style={{
              borderColor: "rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.03)",
              boxShadow: "none",
            }}
          >
            <span
              className="status-dot"
              aria-hidden
              style={{
                background: "rgba(255,255,255,0.4)",
                boxShadow: "none",
              }}
            />
          </div>
          <div
            className="font-mono text-foreground"
            style={{ fontSize: "10px", letterSpacing: "0.08em" }}
          >
            BANK RAIL
          </div>
          <div
            className="font-mono text-muted-canvas"
            style={{ fontSize: "8px" }}
          >
            Local fiat
          </div>
        </div>

        <style>{`
          @media (prefers-reduced-motion: reduce) {
            circle animateMotion, line animate { display: none; }
          }
        `}</style>
      </div>
    </div>
  );
}
