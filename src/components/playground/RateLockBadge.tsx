import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

interface RateLockBadgeProps {
  /** Whether the rate-lock freeze-frame is visible. */
  active: boolean;
}

/**
 * Freeze-frame badge for Payment Intent's "Rate locked (binding)" step.
 *
 * Appears in the center of the Network Core when active, pulsing softly.
 * Visual message: "rate is no longer indicative; it just became binding".
 */
export function RateLockBadge({ active }: RateLockBadgeProps) {
  if (!active) return null;

  return (
    <div
      className={cn(
        "rate-lock-pulse absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2",
        "flex flex-col items-center gap-2 rounded-lg border border-accent-cyan px-4 py-3 backdrop-blur",
      )}
      style={{
        backgroundColor: "rgba(10, 14, 26, 0.85)",
        boxShadow: "0 0 28px 4px rgba(0, 212, 255, 0.35)",
      }}
    >
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-accent-cyan" />
        <span
          className="font-mono uppercase text-accent-cyan"
          style={{ fontSize: "10px", letterSpacing: "0.14em" }}
        >
          Rate locked
        </span>
      </div>
      <span className="font-mono tabular text-secondary-canvas" style={{ fontSize: "11px" }}>
        Binding at ConfirmFundsReceived
      </span>

      <style>{`
        .rate-lock-pulse {
          animation: rate-lock-pulse 1.6s ease-in-out infinite;
        }
        @keyframes rate-lock-pulse {
          0%, 100% { box-shadow: 0 0 28px 4px rgba(0, 212, 255, 0.35); }
          50%      { box-shadow: 0 0 40px 8px rgba(0, 212, 255, 0.55); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rate-lock-pulse { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
