import { TEST_PHASES, E2E_SNIPPET, TEST_CASES, type TestCase } from "@/data/integration/test-cases";
import { CHAINS } from "@/data/integration/chains";

/**
 * Section 6 — Sandbox test plan. Spec §7.
 * 4 phases with P0/P1 counts + a representative vitest snippet.
 */
export function FlowSandboxPhases() {
  const casesByPhase = (id: string): readonly TestCase[] =>
    TEST_CASES.filter((c) => c.phase === id);

  return (
    <section className="container container-7xl py-section">
      <div className="space-y-3">
        <p className="eyebrow">SANDBOX TEST PLAN</p>
        <h2 className="text-display-md font-semibold tracking-tight text-foreground">
          4 phases · {TEST_CASES.length} test cases
        </h2>
        <p className="max-w-2xl text-tagline text-muted-foreground">
          End-to-end goal: complete USDT → {CHAINS.length > 0 ? "CAD/HKD/USD" : ""} swaps in
          under 3 minutes, all cases verified on api-sandbox.t-0.network.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TEST_PHASES.map((phase) => (
          <article
            key={phase.id}
            className="rounded-[var(--radius-lg)] border border-hairline bg-glass backdrop-blur-xl p-5 card-hover"
          >
            <div className="flex items-baseline justify-between">
              <div
                className="font-mono text-accent-cyan"
                style={{ fontSize: "11px", letterSpacing: "0.14em" }}
              >
                PHASE · {phase.id}
              </div>
              <div
                className="flex gap-1.5 font-mono"
                style={{ fontSize: "9px", letterSpacing: "0.06em" }}
              >
                <span className="rounded-sm bg-[rgba(0,212,255,0.12)] text-accent-cyan px-1.5 py-0.5">
                  P0 · {phase.counts.p0}
                </span>
                <span className="rounded-sm bg-[rgba(255,255,255,0.05)] text-muted-canvas px-1.5 py-0.5">
                  P1 · {phase.counts.p1}
                </span>
              </div>
            </div>
            <h3
              className="font-mono uppercase text-foreground mt-3"
              style={{ fontSize: "13px", letterSpacing: "0.06em" }}
            >
              {phase.title}
            </h3>
            <p className="text-muted-foreground mt-2" style={{ fontSize: "12px", lineHeight: 1.5 }}>
              {phase.description}
            </p>
            <div
              className="mt-4 pt-3 border-t border-hairline font-mono text-muted-canvas"
              style={{ fontSize: "10px", letterSpacing: "0.04em" }}
            >
              <div>
                <span className="text-accent-cyan">{phase.representative}</span>
                <span className="text-muted-foreground"> · representative</span>
              </div>
              <div className="mt-1">{phase.fixtureHint}</div>
            </div>
          </article>
        ))}
      </div>

      {/* P0 case strip */}
      <div className="mt-8 rounded-[var(--radius-lg)] border border-hairline bg-glass p-5">
        <div
          className="font-mono uppercase text-muted-canvas pb-3 flex items-center justify-between"
          style={{ fontSize: "10px", letterSpacing: "0.14em" }}
        >
          <span>P0 CRITICAL PATH</span>
          <span className="text-accent-cyan">
            {TEST_CASES.filter((c) => c.priority === "P0").length} cases
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {casesByPhase("E2E")
            .concat(casesByPhase("PRO"))
            .filter((c) => c.priority === "P0")
            .map((c) => (
              <div
                key={c.id}
                className="rounded border border-hairline bg-[rgba(255,255,255,0.02)] p-2.5"
              >
                <div
                  className="font-mono text-accent-cyan"
                  style={{ fontSize: "10px", letterSpacing: "0.08em" }}
                >
                  {c.id}
                </div>
                <div className="text-foreground mt-0.5" style={{ fontSize: "11px" }}>
                  {c.description}
                </div>
                <div className="font-mono text-muted-canvas mt-1" style={{ fontSize: "9px" }}>
                  → {c.expected}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* E2E snippet */}
      <div className="mt-8 mono-block overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          <span
            className="ml-2 font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.08em" }}
          >
            e2e-001.spec.ts · USDT → CAD (Interac)
          </span>
        </div>
        <pre
          className="overflow-x-auto p-4 font-mono leading-relaxed"
          style={{ fontSize: "11.5px" }}
        >
          <code>{E2E_SNIPPET}</code>
        </pre>
      </div>
    </section>
  );
}
