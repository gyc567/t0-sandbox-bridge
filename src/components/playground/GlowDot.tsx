import { packetFraction } from "@/lib/playground/animation";

interface GlowDotProps {
  /** Source node center (SVG viewBox coordinates, typically 0 0 1000 600). */
  sourceX: number;
  sourceY: number;
  /** Target node center. */
  targetX: number;
  targetY: number;
  /** Master scroll progress [0, 1]. */
  progress: number;
  /** Step progress threshold [0, 1]. */
  stepT: number;
  /** Animation window in progress units (default 0.04). */
  window?: number;
  /** Solid dot color. */
  color: string;
  /** Outer halo color. */
  glowColor: string;
  /** Whether to render a thin trail line behind the dot while in-flight. */
  trail?: boolean;
}

/**
 * Animated packet dot that traverses the canvas as scroll crosses its
 * step threshold. Renders nothing before the threshold is reached.
 *
 * Visual state:
 *   - in-flight: large outer halo + smaller solid dot + fading trail line
 *   - settled:   small halo + solid dot + thin "arrival" ring (no trail)
 *
 * Filter "url(#packet-blur)" must be defined in the parent SVG's <defs>.
 */
export function GlowDot({
  sourceX,
  sourceY,
  targetX,
  targetY,
  progress,
  stepT,
  window = 0.04,
  color,
  glowColor,
  trail = true,
}: GlowDotProps) {
  const pct = packetFraction(progress, stepT, window);
  if (pct === null) return null;

  const x = sourceX + (targetX - sourceX) * pct;
  const y = sourceY + (targetY - sourceY) * pct;
  const isSettled = pct === 1;

  return (
    <g>
      {trail && pct > 0 && pct < 1 && (
        <line
          x1={sourceX}
          y1={sourceY}
          x2={x}
          y2={y}
          stroke={color}
          strokeWidth="1"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />
      )}
      {!isSettled && (
        <circle cx={x} cy={y} r={9} fill={glowColor} opacity="0.55" filter="url(#packet-blur)" />
      )}
      <circle cx={x} cy={y} r={isSettled ? 3.5 : 4.5} fill={color} />
      {isSettled && (
        <circle
          cx={x}
          cy={y}
          r={9}
          fill="none"
          stroke={color}
          strokeOpacity="0.55"
          strokeWidth="1"
        />
      )}
    </g>
  );
}
