import { createFileRoute, Link } from "@tanstack/react-router";
import { AmbientGrid } from "@/components/playground/AmbientGrid";
import { LiveClock } from "@/components/playground/LiveClock";
import { Button } from "@/components/ui/button";

import playgroundCss from "../playground.css?url";

export const Route = createFileRoute("/playground")({
  head: () => ({
    meta: [
      { title: "T-0 Command Center" },
      { name: "description", content: "Live visualization of T-0 Network onboarding and protocol flows." },
      { property: "og:title", content: "T-0 Command Center" },
      { property: "og:description", content: "Live visualization of T-0 Network onboarding and protocol flows." },
    ],
    links: [{ rel: "stylesheet", href: playgroundCss }],
  }),
  component: PlaygroundPage,
});

/**
 * Phase 1 skeleton.
 *
 * - Dark canvas (scoped via .playground + playground.css)
 * - AmbientGrid: dot pattern + drifting particles + cyan/ochre glows
 * - Top bar: T-0 // COMMAND CENTER · LIVE indicator · UTC clock
 * - Center: "T-0 NETWORK CORE" placeholder for Phase 2
 */
function PlaygroundPage() {
  return (
    <div className="playground min-h-screen">
      <AmbientGrid />

      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-hairline px-6 backdrop-blur"
        style={{ backgroundColor: "rgba(10, 14, 26, 0.6)" }}
      >
        <div className="flex items-center gap-4">
          <span
            className="font-mono text-muted-canvas"
            style={{ fontSize: "12px", letterSpacing: "0.16em" }}
          >
            T-0 // COMMAND CENTER
          </span>
          <div className="flex items-center gap-2">
            <span className="status-dot" aria-hidden />
            <span
              className="font-mono text-accent-cyan"
              style={{ fontSize: "11px", letterSpacing: "0.12em" }}
            >
              LIVE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Channel dock placeholder — wired in Phase 2 */}
          <nav aria-label="Channels" className="flex items-center gap-1">
            {["Cross-Border", "Trading", "Fintech", "Payroll", "Market"].map((label, i) => (
              <span
                key={label}
                className="rounded-full border border-hairline px-3 py-1 font-mono text-secondary-canvas"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.04em",
                  opacity: 0.55,
                  borderColor: i === 0 ? "rgba(0, 212, 255, 0.6)" : undefined,
                  color: i === 0 ? "#00d4ff" : undefined,
                }}
              >
                {label}
              </span>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <LiveClock />
        </div>
      </header>

      {/* Main canvas — Phase 2+ will replace this with FlowCanvas */}
      <main className="relative flex min-h-[calc(100vh-60px)] flex-col items-center justify-center px-6 py-12">
        <div className="text-center">
          <p
            className="font-mono text-muted-canvas"
            style={{ fontSize: "11px", letterSpacing: "0.16em" }}
          >
            // INITIALIZING NETWORK TOPOLOGY
          </p>

          <h1 className="text-display-mega mt-6">
            <span className="text-foreground">T-0 </span>
            <span className="text-accent-cyan">·</span>
            <span className="text-foreground"> Network Core</span>
          </h1>

          <p
            className="mt-6 max-w-xl mx-auto text-secondary-canvas"
            style={{ fontSize: "15px", lineHeight: 1.6 }}
          >
            Live wireframe of the T-0 protocol — three nodes (OFI / Network / POP)
            with continuous message passing, scroll-driven timing, and click-to-inspect
            artifact payloads.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/" className="contents">
              <Button variant="outline" size="sm">← Home</Button>
            </Link>
            <Link to="/sandbox" className="contents">
              <Button size="sm">Open Sandbox</Button>
            </Link>
            <Link to="/docs" className="contents">
              <Button variant="outline" size="sm">Read Docs</Button>
            </Link>
          </div>

          <p
            className="mt-12 font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.12em" }}
          >
            PHASE 1 SKELETON · FLOW CANVAS ARRIVING IN PHASE 2
          </p>
        </div>
      </main>
    </div>
  );
}
