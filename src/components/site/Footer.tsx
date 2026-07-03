import { Link } from "@tanstack/react-router";

/**
 * Site-wide footer.
 *
 * Stack tags, status badge, and quick links — keeps the "real system"
 * feeling rather than marketing noise.
 */
export function Footer() {
  return (
    <footer className="border-t border-hairline bg-elevated">
      <div className="container container-7xl py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Brand + status */}
          <div className="space-y-3 max-w-sm">
            <div className="flex items-center gap-2">
              <span className="status-dot" aria-hidden />
              <span
                className="font-mono text-accent-cyan"
                style={{ fontSize: "11px", letterSpacing: "0.14em" }}
              >
                BAXS PAY LIMITED · MAINNET SIM · OPERATIONAL
              </span>
            </div>
            <p className="text-caption text-muted-foreground">
              BAXS PAY LIMITED · T-0 Sandbox Bridge — a provider sandbox for quote,
              settlement, payment, and payout flows. All data is simulated.
            </p>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 sm:grid-cols-3">
            <FooterCol
              title="Product"
              links={[
                { to: "/sandbox", label: "Console" },
                { to: "/docs", label: "Architecture" },
              ]}
            />
            <FooterCol
              title="Resources"
              links={[
                { to: "/docs", label: "Docs" },
                { to: "/docs", label: "Integration Guide" },
                { to: "/docs", label: "API Reference" },
              ]}
            />
            <FooterCol
              title="Stack"
              links={[
                { to: "/", label: "TanStack Start" },
                { to: "/", label: "Nitro · Vercel" },
                { to: "/", label: "T-0 Network" },
              ]}
            />
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p
            className="font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.08em" }}
          >
            © 2026 BAXS PAY LIMITED · T-0 SANDBOX BRIDGE · BUILT WITH TANSTACK START + NITRO
          </p>
          <p
            className="font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.08em" }}
          >
            ECDSA secp256k1 · Keccak-256 · USDT on Tron / Ethereum / BSC
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div className="space-y-2">
      <h4
        className="font-mono uppercase text-muted-canvas"
        style={{ fontSize: "10px", letterSpacing: "0.14em" }}
      >
        {title}
      </h4>
      <ul className="space-y-1.5">
        {links.map((l, i) => (
          <li key={i}>
            <Link
              to={l.to as "/"}
              className="text-caption text-secondary-canvas transition-colors hover:text-accent-cyan"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
