import { CHANNELS, type ChannelId } from "@/data/channels";
import { cn } from "@/lib/utils";

interface ChannelBarProps {
  active: ChannelId;
  onChange: (id: ChannelId) => void;
  /**
   * Show a small green "auto-play" indicator on the active pill. Off
   * when the engine is paused or in scrubbing mode.
   */
  autoPlay?: boolean;
}

/**
 * 5-channel dock for the playground top bar.
 *
 * Active pill: cyan border + soft cyan glow + accent text.
 * Idle pill: hairline border + muted text.
 * Hover: halo + slight text brightening.
 *
 * The active state is purely visual for Phase 2 — channel change
 * updates the parent state (fee + flowType), which Phase 3 will
 * wire to the animation engine.
 */
export function ChannelBar({ active, onChange, autoPlay = false }: ChannelBarProps) {
  return (
    <nav className="flex items-center gap-1.5" aria-label="Protocol channels">
      {CHANNELS.map((channel) => {
        const isActive = channel.id === active;
        return (
          <button
            key={channel.id}
            type="button"
            onClick={() => onChange(channel.id)}
            aria-pressed={isActive}
            className={cn(
              "relative rounded-full border px-3 py-1 font-mono transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isActive
                ? "border-accent-cyan text-accent-cyan"
                : "border-hairline text-secondary-canvas hover:border-hairline-strong hover:text-foreground",
            )}
            style={{
              fontSize: "11px",
              letterSpacing: "0.04em",
              boxShadow: isActive
                ? "0 0 14px 2px rgba(0, 212, 255, 0.35), inset 0 0 0 1px rgba(0, 212, 255, 0.2)"
                : undefined,
              backgroundColor: isActive ? "rgba(0, 212, 255, 0.06)" : undefined,
            }}
          >
            {channel.label}
            {isActive && autoPlay && (
              <span
                aria-label="auto-playing"
                title="auto-playing"
                className="absolute -right-1 -top-1 inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: "#7ec488",
                  boxShadow: "0 0 6px 1px rgba(126, 196, 136, 0.85)",
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
