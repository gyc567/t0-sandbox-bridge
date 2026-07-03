import { Link } from "@tanstack/react-router";
import { FlowHeroDiagram } from "./FlowHeroDiagram";
import { CHAINS, STABLECOIN } from "@/data/integration/chains";
import { CURRENCIES } from "@/data/integration/currencies";

/**
 * Section 1 — Hero. Spec §1.1 + §1.3 condensed.
 * Left: title + 3 data points + 2 CTAs.
 * Right: BAXS ↔ T-0 live playback card.
 */
export function FlowHero() {
  const chainList = "Tron · ETH · BSC";
  const currencyCount = CURRENCIES.length;

  return (
    <section className="relative overflow-hidden">
      {/* Floor grid */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40vh] opacity-40" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,212,255,0.06), transparent), repeating-linear-gradient(90deg, transparent 0, transparent 79px, rgba(255,255,255,0.04) 79px, rgba(255,255,255,0.04) 80px)",
            maskImage: "linear-gradient(to top, black, transparent)",
            WebkitMaskImage: "linear-gradient(to top, black, transparent)",
            transform: "perspective(400px) rotateX(60deg)",
            transformOrigin: "bottom",
          }}
        />
      </div>

      <div className="container container-7xl relative py-20 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-glass px-3 py-1.5">
              <span className="status-dot" aria-hidden />
              <span className="eyebrow">BAXS × T-0 NETWORK · INSTITUTIONAL SETTLEMENT</span>
            </div>
            <h1
              className="text-display-mega font-semibold tracking-tight text-foreground"
              style={{ lineHeight: 1, letterSpacing: "-0.03em" }}
            >
              One protocol,
              <br />
              two <span className="text-accent-cyan">roles</span>.
            </h1>
            <p className="max-w-xl text-tagline text-muted-foreground">
              T-0 Network 是 Tether 战略支持的机构级 USDT 清结算网络。
              BAXS 在此扮演双重角色 —— 既是发起换币的 OFI，也是执行法币付款的 Provider。
              全部基于 Connect RPC，签名验证在公网上可独立完成。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/sandbox"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm cursor-pointer transition-transform focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.95] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 min-h-11 rounded-[var(--radius-pill)] px-7 btn-glow"
              >
                Open Sandbox Console
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              <Link
                to="/docs"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm cursor-pointer transition-transform focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.95] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground min-h-11 rounded-[var(--radius-pill)] px-7"
              >
                Read Integration Guide
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 pt-4">
              <div>
                <div
                  className="font-mono uppercase text-muted-canvas"
                  style={{ fontSize: "10px", letterSpacing: "0.14em" }}
                >
                  SETTLEMENT
                </div>
                <div
                  className="font-mono text-foreground tabular"
                  style={{ fontSize: "15px" }}
                >
                  ~25s
                </div>
              </div>
              <div>
                <div
                  className="font-mono uppercase text-muted-canvas"
                  style={{ fontSize: "10px", letterSpacing: "0.14em" }}
                >
                  CURRENCIES
                </div>
                <div
                  className="font-mono text-foreground tabular"
                  style={{ fontSize: "15px" }}
                >
                  {currencyCount} · CAD/USD/HKD/SGD
                </div>
              </div>
              <div>
                <div
                  className="font-mono uppercase text-muted-canvas"
                  style={{ fontSize: "10px", letterSpacing: "0.14em" }}
                >
                  STABLECOIN
                </div>
                <div
                  className="font-mono text-foreground tabular"
                  style={{ fontSize: "15px" }}
                >
                  {STABLECOIN.code} · {chainList}
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <FlowHeroDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
