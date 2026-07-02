import { createFileRoute, Link } from "@tanstack/react-router";

interface HeroOverlayProps {
  /** Master scroll progress [0, 1]. Fades out between 0% and ~12%. */
  progress: number;
}

/**
 * Scroll-driven hero overlay.
 *
 *   progress 0   → opacity 1,    y 0
 *   progress 0.12 → opacity 0,    y -20px
 *
 * Centers a huge display-mega title over the canvas. Once the user
 * starts scrolling, it dissolves and lets the network topology speak.
 *
 * CTA buttons use the existing Button component (asChild Link pattern).
 */
export function HeroOverlay({ progress }: HeroOverlayProps) {
  const fadeStart = 0;
  const fadeEnd = 0.12;
  const ratio = Math.max(0, Math.min(1, (progress - fadeStart) / (fadeEnd - fadeStart)));
  const opacity = 1 - ratio;
  const translateY = -24 * ratio;

  if (opacity <= 0.02) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6"
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: "opacity 100ms linear",
      }}
    >
      {/* Radial glow behind the text */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 45% at 50% 50%, rgba(0, 212, 255, 0.12), transparent 70%)",
        }}
      />

      <div className="pointer-events-auto max-w-3xl text-center">
        <p
          className="font-mono text-accent-cyan"
          style={{ fontSize: "11px", letterSpacing: "0.2em" }}
        >
          // T-0 · PROTOCOL VISUALIZER
        </p>

        <h1
          className="text-display-mega mt-5"
          style={{ textShadow: "0 0 60px rgba(0, 212, 255, 0.25)" }}
        >
          Watch T-0 settle a real payment.
          <br />
          <span className="text-accent-cyan">Right now.</span>
        </h1>

        <p
          className="mx-auto mt-6 max-w-xl text-secondary-canvas"
          style={{ fontSize: "16px", lineHeight: 1.55 }}
        >
          Scroll to advance through live protocol steps. Inspect artifacts,
          switch channels, and see how OFI, Network Core, and POP nodes
          exchange quotes, USDT, signatures, and ledger entries.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/sandbox" className="contents">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-7 font-mono text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.97]"
              style={{ fontSize: "13px", letterSpacing: "0.02em" }}
            >
              Open Sandbox
            </button>
          </Link>
          <Link to="/docs" className="contents">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-full border border-hairline bg-glass px-7 font-mono text-foreground transition-colors hover:border-hairline-strong hover:bg-[rgba(255,255,255,0.06)] active:scale-[0.97]"
              style={{ fontSize: "13px", letterSpacing: "0.02em" }}
            >
              Read Docs
            </button>
          </Link>
        </div>

        <p
          className="mt-8 font-mono text-muted-canvas"
          style={{ fontSize: "10px", letterSpacing: "0.16em" }}
        >
          SCROLL TO ADVANCE · 5 CHANNELS · 3 FLOW VARIANTS
        </p>
      </div>
    </div>
  );
}
