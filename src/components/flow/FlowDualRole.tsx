import { ROLES } from "@/data/integration/roles";
import { IDEMPOTENCY_LEVELS } from "@/data/integration/idempotency";

const ICON_BG: Record<string, string> = {
  OFI: "rgba(0,212,255,0.15)",
  Provider: "rgba(124,92,255,0.15)",
};

const ICON_COLOR: Record<string, string> = {
  OFI: "var(--accent-cyan, #00d4ff)",
  Provider: "var(--accent-violet, #7c5cff)",
};

/**
 * Section 2 — Three capability cards: OFI · Provider · Idempotent.
 * Spec §1.1 + §6.
 */
export function FlowDualRole() {
  return (
    <section className="container container-7xl py-section">
      <div className="space-y-3">
        <p className="eyebrow">DUAL ROLE</p>
        <h2 className="text-display-md font-semibold tracking-tight text-foreground">
          BAXS plays two roles on T-0
        </h2>
        <p className="max-w-2xl text-tagline text-muted-foreground">
          As OFI it initiates token swap requests; as Provider it receives and executes fiat payment
          instructions. Both roles are coupled to the same signing identity, with idempotency
          guarantees ensuring repeated requests never produce side effects.
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {ROLES.map((role) => (
          <article
            key={role.id}
            className="rounded-[var(--radius-lg)] border text-card-foreground card-hover border-hairline bg-glass backdrop-blur-xl"
          >
            <div className="space-y-4 p-6">
              <div
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-hairline"
                style={{ boxShadow: `0 0 20px ${ICON_BG[role.id]}` }}
              >
                <RoleIcon role={role.id} />
              </div>
              <h3
                className="font-mono uppercase text-foreground"
                style={{ fontSize: "13px", letterSpacing: "0.08em" }}
              >
                As {role.abbreviation}
              </h3>
              <p className="text-caption text-muted-foreground leading-relaxed">
                {role.baxsPosition}
              </p>
              <div
                className="flex flex-wrap gap-1 pt-1 font-mono text-muted-canvas"
                style={{ fontSize: "9px", letterSpacing: "0.06em" }}
              >
                {role.methods.map((m) => (
                  <span key={m} className="rounded-sm border border-hairline px-1.5 py-0.5">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}

        {/* Idempotency card — third tile */}
        <article className="rounded-[var(--radius-lg)] border text-card-foreground card-hover border-hairline bg-glass backdrop-blur-xl">
          <div className="space-y-4 p-6">
            <div
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-hairline"
              style={{ boxShadow: "0 0 20px rgba(245,182,20,0.15)" }}
            >
              <ShieldCheckIcon />
            </div>
            <h3
              className="font-mono uppercase text-foreground"
              style={{ fontSize: "13px", letterSpacing: "0.08em" }}
            >
              Idempotent Receiver
            </h3>
            <p className="text-caption text-muted-foreground leading-relaxed">
              The network uses at-least-once delivery + idempotent receivers = exactly-once
              processing. All state-mutating BAXS server methods must deduplicate by business
              identifier.
            </p>
            <div
              className="flex flex-wrap gap-1 pt-1 font-mono text-muted-canvas"
              style={{ fontSize: "9px", letterSpacing: "0.06em" }}
            >
              {IDEMPOTENCY_LEVELS.map((l) => (
                <span key={l.level} className="rounded-sm border border-hairline px-1.5 py-0.5">
                  {l.level}
                </span>
              ))}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function RoleIcon({ role }: { role: "OFI" | "Provider" }) {
  const color = ICON_COLOR[role];
  if (role === "OFI") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
        aria-hidden
      >
        <path d="M16.247 7.761a6 6 0 0 1 0 8.478" />
        <path d="M19.075 4.933a10 10 0 0 1 0 14.134" />
        <path d="M4.925 19.067a10 10 0 0 1 0-14.134" />
        <path d="M7.753 16.239a6 6 0 0 1 0-8.478" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden
    >
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f5b614"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
