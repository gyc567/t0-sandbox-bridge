import { IDEMPOTENCY_RULES, IDEMPOTENCY_LEVELS } from "@/data/integration/idempotency";

/**
 * Section 5 — Idempotency. Spec §6.
 * Three rules as quote blocks + 2 levels table.
 */
export function FlowIdempotency() {
  return (
    <section className="container container-7xl py-section">
      <div className="space-y-3">
        <p className="eyebrow">IDEMPOTENCY</p>
        <h2 className="text-display-md font-semibold tracking-tight text-foreground">
          Repeated requests are not errors
        </h2>
        <p className="max-w-2xl text-tagline text-muted-foreground">
          The network uses at-least-once delivery + idempotent receivers = exactly-once
          processing. BAXS as Provider must obey these three core rules.
        </p>
      </div>

      <div className="mt-10 space-y-4">
        {IDEMPOTENCY_RULES.map((rule) => (
          <article
            key={rule.index}
            className="rounded-[var(--radius-lg)] border border-hairline bg-glass p-6"
          >
            <div className="flex items-start gap-4">
              <span
                className="font-mono text-accent-cyan shrink-0"
                style={{ fontSize: "12px", letterSpacing: "0.1em" }}
              >
                {rule.index}
              </span>
              <div className="flex-1 space-y-3">
                <h3
                  className="font-mono uppercase text-foreground"
                  style={{ fontSize: "13px", letterSpacing: "0.08em" }}
                >
                  {rule.title}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div
                    className="border-l-2 pl-3"
                    style={{ borderColor: "rgba(245, 95, 86, 0.5)" }}
                  >
                    <div
                      className="font-mono uppercase text-muted-canvas pb-1"
                      style={{ fontSize: "9px", letterSpacing: "0.14em" }}
                    >
                      WRONG
                    </div>
                    <div className="text-muted-foreground" style={{ fontSize: "12px" }}>
                      {rule.wrong}
                    </div>
                  </div>
                  <div
                    className="border-l-2 pl-3"
                    style={{ borderColor: "rgba(0, 212, 255, 0.6)" }}
                  >
                    <div
                      className="font-mono uppercase text-accent-cyan pb-1"
                      style={{ fontSize: "9px", letterSpacing: "0.14em" }}
                    >
                      RIGHT
                    </div>
                    <div className="text-foreground" style={{ fontSize: "12px" }}>
                      {rule.right}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-10 rounded-[var(--radius-lg)] border border-hairline bg-glass p-6">
        <div
          className="font-mono uppercase text-muted-canvas pb-3"
          style={{ fontSize: "10px", letterSpacing: "0.14em" }}
        >
          LEVELS · SPEC §6
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {IDEMPOTENCY_LEVELS.map((lvl) => (
            <div key={lvl.level} className="space-y-1">
              <div
                className="font-mono text-accent-cyan"
                style={{ fontSize: "12px", letterSpacing: "0.08em" }}
              >
                {lvl.level}
              </div>
              <div className="text-foreground" style={{ fontSize: "13px" }}>
                {lvl.description}
              </div>
              <div className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>
                {lvl.examples}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
