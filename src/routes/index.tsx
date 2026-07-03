import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Radio, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AmbientGrid } from "@/components/playground/AmbientGrid";
import { CHANNELS } from "@/data/channels";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BAXS · T-0 — Watch money move before it moves" },
      {
        name: "description",
        content:
          "Built by BAXS PAY LIMITED. A real-time settlement simulation sandbox. Visualize quote, settlement, payment, and payout flows on the T-0 Network.",
      },
      { property: "og:title", content: "BAXS · T-0 Sandbox Bridge" },
      {
        property: "og:description",
        content:
          "Built by BAXS PAY LIMITED. Watch money move before it moves — a real-time settlement simulation sandbox.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <SiteLayout>
      <div className="relative">
        {/* Ambient background scoped to the landing page only */}
        <AmbientGrid />

        {/* ─── HERO ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Perspective horizon grid */}
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
              {/* Left: copy */}
              <div className="space-y-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-glass px-3 py-1.5">
                  <span className="status-dot" aria-hidden />
                  <span className="eyebrow">BAXS · T-0 SANDBOX BRIDGE · INSTANT SETTLEMENT SIM</span>
                </div>

                <h1
                  className="text-display-mega font-semibold tracking-tight text-foreground"
                  style={{ lineHeight: 1, letterSpacing: "-0.03em" }}
                >
                  资金,在到达
                  <br />
                  之前先被<span className="text-accent-cyan">看见</span>。
                </h1>

                <p className="max-w-xl text-tagline text-muted-foreground">
                  Built by BAXS PAY LIMITED · T-0 is the sandbox where it runs.
                  在 T-0 Network 上,每一笔报价、结算、支付与放款的全链路都可观测、可回放、可验证。
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="btn-glow">
                    <Link to="/sandbox">
                      Open Sandbox
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link to="/docs">
                      <BookOpen className="w-4 h-4" />
                      Read the Docs
                    </Link>
                  </Button>
                </div>

                {/* mini stat row */}
                <div className="flex flex-wrap gap-x-8 gap-y-3 pt-4">
                  <Stat label="SETTLEMENT" value="~25s" />
                  <Stat label="PROVIDER FEE" value="5 bps" />
                  <Stat label="CHAIN" value="Tron · ETH · BSC" />
                </div>
              </div>

              {/* Right: auto-looping mini flow animation */}
              <div className="relative">
                <MiniFlowPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ─── CAPABILITIES ─────────────────────────────────────────── */}
        <section className="container container-7xl py-section">
          <SectionHeading
            eyebrow="CAPABILITIES"
            title="完整的资金流,一条链路"
            sub="从报价发布到放款确认,每个环节都可视、可测、可追溯。"
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <CapabilityCard
              icon={<Radio className="w-5 h-5" />}
              title="Publish Quote"
              desc="发布多币种、多档位的实时报价,锁定费率与额度带。"
              accent="cyan"
            />
            <CapabilityCard
              icon={<Zap className="w-5 h-5" />}
              title="Move Funds"
              desc="USDT 链上结算模拟,在途资金流可视化,状态实时更新。"
              accent="violet"
            />
            <CapabilityCard
              icon={<ShieldCheck className="w-5 h-5" />}
              title="Verify & Pay Out"
              desc="ECDSA secp256k1 签名验证,Keccak-256 哈希,放款原子确认。"
              accent="usdt"
            />
          </div>
        </section>

        {/* ─── CHANNEL MATRIX ───────────────────────────────────────── */}
        <section className="container container-7xl py-section">
          <SectionHeading
            eyebrow="CHANNELS"
            title="五种行业通道,三种协议流"
            sub="每个通道映射到底层的 Pay-Out / Manual-AML / Payment-Intent 协议流。"
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHANNELS.map((c) => (
              <Link
                key={c.id}
                to="/playground"
                className="group"
              >
                <Card className="card-hover h-full border-hairline bg-glass backdrop-blur-xl">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center justify-between">
                      <h3
                        className="font-mono uppercase text-foreground"
                        style={{ fontSize: "12px", letterSpacing: "0.1em" }}
                      >
                        {c.label}
                      </h3>
                      <span
                        className="font-mono text-accent-cyan"
                        style={{ fontSize: "11px" }}
                      >
                        {c.fee}
                      </span>
                    </div>
                    <p className="text-caption text-muted-foreground leading-relaxed">
                      {c.context}
                    </p>
                    <div className="flex items-center gap-1.5 pt-1 font-mono text-muted-canvas" style={{ fontSize: "10px", letterSpacing: "0.04em" }}>
                      <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                      {c.flowType}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── PROTOCOL SNIPPET ─────────────────────────────────────── */}
        <section className="container container-7xl py-section">
          <SectionHeading
            eyebrow="PROTOCOL"
            title="ECDSA 签名,可在线验证"
            sub="每个请求由 secp256k1 私钥签名,Keccak-256 哈希,头部携带公钥与时间戳。"
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.3fr] items-start">
            <div className="space-y-4">
              <Step n="01" title="Build payload" desc="body + 8-byte little-endian Unix timestamp" />
              <Step n="02" title="Hash" desc="Keccak-256(payload) → 32 bytes" />
              <Step n="03" title="Sign" desc="secp256k1 private key → 65 bytes (v + r + s)" />
              <Step n="04" title="Send" desc="X-Signature / X-Public-Key / X-Signature-Timestamp headers" />
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link to="/sandbox">
                  Try in API Tester
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
            <MonoSnippet />
          </div>
        </section>

        {/* ─── FINAL CTA ───────────────────────────────────────────── */}
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
                进入指挥中心
              </h2>
              <p className="mx-auto max-w-lg text-tagline text-muted-foreground">
                滚动驱动的实时回放,观察资金包如何在 OFI、Network Core、POP 三节点间流动。
              </p>
              <Button asChild size="lg" className="btn-glow">
                <Link to="/sandbox">
                  Open Sandbox
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="font-mono uppercase text-muted-canvas"
        style={{ fontSize: "10px", letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      <div className="font-mono text-foreground tabular" style={{ fontSize: "15px" }}>
        {value}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="space-y-3">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="text-display-md font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="max-w-2xl text-tagline text-muted-foreground">{sub}</p>
    </div>
  );
}

function CapabilityCard({
  icon,
  title,
  desc,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: "cyan" | "violet" | "usdt";
}) {
  const accentColor =
    accent === "cyan" ? "text-accent-cyan" : accent === "violet" ? "text-accent-violet" : "text-accent-usdt";
  const glow =
    accent === "cyan"
      ? "rgba(0,212,255,0.15)"
      : accent === "violet"
        ? "rgba(124,92,255,0.15)"
        : "rgba(245,182,20,0.15)";
  return (
    <Card className="card-hover border-hairline bg-glass backdrop-blur-xl">
      <CardContent className="space-y-4 p-6">
        <div
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-hairline"
          style={{ boxShadow: `0 0 20px ${glow}` }}
        >
          <span className={accentColor}>{icon}</span>
        </div>
        <h3
          className="font-mono uppercase text-foreground"
          style={{ fontSize: "13px", letterSpacing: "0.08em" }}
        >
          {title}
        </h3>
        <p className="text-caption text-muted-foreground leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4">
      <span
        className="font-mono text-accent-cyan shrink-0"
        style={{ fontSize: "12px", letterSpacing: "0.1em" }}
      >
        {n}
      </span>
      <div>
        <div className="font-mono text-foreground" style={{ fontSize: "13px" }}>
          {title}
        </div>
        <div className="font-mono text-muted-canvas" style={{ fontSize: "11px" }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

function MonoSnippet() {
  return (
    <div className="mono-block overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-2 font-mono text-muted-canvas" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
          sign-request.ts
        </span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono leading-relaxed" style={{ fontSize: "11.5px" }}>
        <code>
          <span className="text-muted-canvas">{"// 1. build payload"}</span>
          {"\n"}
          <span className="text-accent-violet">const</span> <span className="text-foreground">payload</span> = <span className="text-accent-cyan">body</span> + <span className="text-accent-usdt">timestamp</span>
          {"\n\n"}
          <span className="text-muted-canvas">{"// 2. keccak-256 hash"}</span>
          {"\n"}
          <span className="text-accent-violet">const</span> <span className="text-foreground">hash</span> = keccak256(<span className="text-foreground">payload</span>)
          {"\n\n"}
          <span className="text-muted-canvas">{"// 3. secp256k1 sign"}</span>
          {"\n"}
          <span className="text-accent-violet">const</span> <span className="text-foreground">sig</span> = sign(<span className="text-foreground">hash</span>, <span className="text-foreground">privateKey</span>)
          {"\n\n"}
          <span className="text-muted-canvas">{"// 4. headers"}</span>
          {"\n"}
          <span className="text-accent-cyan">X-Signature</span>: <span className="text-accent-usdt">0x</span>
          <span className="text-muted-canvas">{"{65 bytes hex}"}</span>
        </code>
      </pre>
    </div>
  );
}

/**
 * Auto-looping three-node mini animation for the hero.
 *
 * A self-contained, lightweight cycle (no scroll wiring) showing a glowing
 * packet traveling OFI → Network Core → POP, with a protocol bubble popping
 * on each hop. Respects prefers-reduced-motion (renders static).
 */
function MiniFlowPreview() {
  return (
    <div
      className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-[var(--radius-2xl)] border border-hairline bg-glass backdrop-blur-xl"
      style={{ boxShadow: "0 0 40px rgba(0,212,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04)" }}
    >
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="status-dot" aria-hidden />
          <span className="font-mono text-accent-cyan" style={{ fontSize: "10px", letterSpacing: "0.14em" }}>
            LIVE PLAYBACK
          </span>
        </div>
        <span className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>t = 12:18</span>
      </div>

      {/* topology */}
      <div className="relative h-[calc(100%-41px)]">
        <MiniTopology />
      </div>
    </div>
  );
}

function MiniTopology() {
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 400 280"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {/* connection lines */}
        <line x1="80" y1="140" x2="200" y2="140" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <line x1="200" y1="140" x2="320" y2="140" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

        {/* animated packet (cyan) traveling left→right, looped */}
        <circle r="5" fill="#00d4ff" style={{ filter: "drop-shadow(0 0 6px rgba(0,212,255,0.8))" }}>
          <animateMotion dur="4s" repeatCount="indefinite" path="M80,140 L200,140 L320,140" />
        </circle>

        {/* USDT channel */}
        <line
          x1="80"
          y1="220"
          x2="320"
          y2="220"
          stroke="rgba(245,182,20,0.4)"
          strokeWidth="1"
          strokeDasharray="4 4"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="3s" repeatCount="indefinite" />
        </line>
      </svg>

      {/* node labels */}
      <NodeTag label="OFI" sub="Originator" left="6%" />
      <NodeTag label="NETWORK CORE" sub="T-0" left="42%" highlight />
      <NodeTag label="POP" sub="Payout" left="78%" />

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          circle animateMotion, line animate { display: none; }
        }
      `}</style>
    </>
  );
}

function NodeTag({
  label,
  sub,
  left,
  highlight,
}: {
  label: string;
  sub: string;
  left: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="absolute top-[40%] -translate-y-1/2 -translate-x-1/2 text-center"
      style={{ left }}
    >
      <div
        className="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-lg border backdrop-blur"
        style={{
          borderColor: highlight ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.1)",
          background: highlight ? "rgba(0,212,255,0.06)" : "rgba(255,255,255,0.03)",
          boxShadow: highlight ? "0 0 16px rgba(0,212,255,0.15)" : "none",
        }}
      >
        <span className="status-dot" aria-hidden style={highlight ? {} : { background: "rgba(255,255,255,0.4)", boxShadow: "none" }} />
      </div>
      <div className="font-mono text-foreground" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div className="font-mono text-muted-canvas" style={{ fontSize: "8px" }}>
        {sub}
      </div>
    </div>
  );
}
