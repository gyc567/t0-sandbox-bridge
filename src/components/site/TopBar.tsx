import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { ThemeToggle } from "./ThemeToggle";

/**
 * Site-wide top navigation bar.
 *
 * Sticky, glass surface, hairline bottom border. Left: logo mark + brand.
 * Center: primary nav. Right: glow CTA + pulsing LIVE dot.
 */
const NAV = [
  { to: "/", label: "Overview" },
  { to: "/sandbox", label: "Console" },
  { to: "/integration", label: "Integration" },
  { to: "/docs", label: "Docs" },
] as const;

export function TopBar() {
  const { location } = useRouterState();
  const pathname = location.pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-elevated backdrop-blur-xl">
      <div className="container container-7xl flex h-16 items-center justify-between gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <LogoMark />
          <div className="flex flex-col leading-none">
            <span
              className="font-mono text-foreground"
              style={{ fontSize: "13px", letterSpacing: "0.1em", fontWeight: 600 }}
            >
              BAXS
            </span>
            <span
              className="font-mono text-muted-canvas"
              style={{ fontSize: "9px", letterSpacing: "0.14em" }}
            >
              T-0 SANDBOX BRIDGE
            </span>
          </div>
        </Link>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-full px-3.5 py-1.5 font-mono transition-all duration-200",
                  active
                    ? "text-accent-cyan bg-[rgba(0,212,255,0.08)]"
                    : "text-secondary-canvas hover:text-foreground hover:bg-glass",
                )}
                style={{ fontSize: "11px", letterSpacing: "0.06em" }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <span className="status-dot" aria-hidden />
            <span
              className="font-mono text-accent-cyan"
              style={{ fontSize: "10px", letterSpacing: "0.14em" }}
            >
              LIVE
            </span>
          </div>
          <ThemeToggle />
          <Button asChild size="sm" className="btn-glow hidden sm:inline-flex">
            <Link to="/sandbox">Open Console</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Hexagonal logo mark with cyan glow. */
function LogoMark() {
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 32 32" className="h-8 w-8">
        <defs>
          <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#7c5cff" />
          </linearGradient>
        </defs>
        <path
          d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
          fill="none"
          stroke="url(#logo-grad)"
          strokeWidth="1.5"
          style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.5))" }}
        />
        <text
          x="16"
          y="20"
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="11"
          fontWeight="700"
          fill="url(#logo-grad)"
        >
          0
        </text>
      </svg>
    </span>
  );
}
