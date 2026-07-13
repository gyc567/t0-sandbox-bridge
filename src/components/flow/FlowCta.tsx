import { Link } from "@tanstack/react-router";

/**
 * Section 7 — CTA banner pointing to sandbox and docs.
 */
export function FlowCta() {
  return (
    <section className="container container-7xl py-section">
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-hairline bg-glass backdrop-blur-xl px-8 py-16 text-center">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 50% 0%, rgba(0,212,255,0.12), transparent 70%)",
          }}
        />
        <div className="relative space-y-5">
          <h2 className="text-display-md font-semibold tracking-tight text-foreground">
            进入 T-0 接入沙盒
          </h2>
          <p className="mx-auto max-w-lg text-tagline text-muted-foreground">
            在 Sandbox Console 中发送签名请求，观察 ECDSA 头如何在每个 RPC 上 被组装、验证、记录。
          </p>
          <div className="flex flex-wrap justify-center gap-3">
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
        </div>
      </div>
    </section>
  );
}
