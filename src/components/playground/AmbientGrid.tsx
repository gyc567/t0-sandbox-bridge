import { useMemo } from "react";

/**
 * Ambient background for /playground.
 *
 * Fixed-position layer rendered behind everything else. Three pieces:
 *   1. Deep base color (handled by .playground scope in playground.css)
 *   2. SVG dot pattern overlay — fullscreen, low-alpha
 *   3. Drifting particles — 28 small dots slowly wandering via CSS animation
 *
 * Honors prefers-reduced-motion by hiding the drift layer.
 */
export function AmbientGrid() {
  // Generate stable particle positions once so they don't re-render.
  const particles = useMemo(() => {
    const out: { x: number; y: number; size: number; dur: number; delay: number; o: number }[] = [];
    // deterministic PRNG for SSR/hydration parity
    let seed = 0x5ace_c0de;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 28; i++) {
      out.push({
        x: rand() * 100,
        y: rand() * 100,
        size: 1 + rand() * 2,
        dur: 12 + rand() * 18,
        delay: rand() * 8,
        o: 0.25 + rand() * 0.45,
      });
    }
    return out;
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Top cyan radial glow */}
      <div
        className="absolute inset-x-0 top-0 h-[60vh]"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0, 212, 255, 0.08), transparent 60%)",
        }}
      />

      {/* Bottom ochre glow (USDT channel hint) */}
      <div
        className="absolute inset-x-0 bottom-0 h-[40vh]"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 50% 100%, rgba(212, 160, 23, 0.05), transparent 65%)",
        }}
      />

      {/* Dot pattern — fullscreen SVG */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="playground-dots"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.05)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#playground-dots)" />
      </svg>

      {/* Drifting particles */}
      <div className="ambient-particles">
        {particles.map((p, i) => (
          <span
            key={i}
            className="ambient-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.o,
              animationDuration: `${p.dur}s`,
              animationDelay: `${-p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Local styles for the particles — pure CSS, no new deps */}
      <style>{`
        .ambient-particles { position: absolute; inset: 0; }
        .ambient-particle {
          position: absolute;
          border-radius: 9999px;
          background-color: rgba(0, 212, 255, 0.6);
          filter: blur(4px);
          animation-name: ambient-drift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }
        @keyframes ambient-drift {
          0%   { transform: translate(0, 0); }
          25%  { transform: translate(40px, -20px); }
          50%  { transform: translate(10px, 30px); }
          75%  { transform: translate(-30px, 10px); }
          100% { transform: translate(0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ambient-particle { animation: none !important; opacity: 0.4 !important; }
        }
      `}</style>
    </div>
  );
}
