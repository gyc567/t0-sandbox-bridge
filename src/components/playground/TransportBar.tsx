import { Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybackMode, PlaybackSpeed } from "@/lib/playground/playback";

interface TransportBarProps {
  mode: PlaybackMode;
  speed: PlaybackSpeed;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSetSpeed: (s: PlaybackSpeed) => void;
}

/**
 * Auto-playback transport controls.
 *
 *   [▶ Play / ⏸ Pause]  [↻ Restart]   Speed: [0.5x | 1x | 2x]   · auto-loop enabled
 *
 * Visibility:
 *   - The bar is hidden entirely in "scrubbing" mode (user is driving).
 *   - The status text only shows when mode === "auto".
 *
 * Honors prefers-reduced-motion by exposing the same controls but never
 * auto-starting; reduced-motion is handled in usePlayback.
 */
export function TransportBar({
  mode,
  speed,
  onPlay,
  onPause,
  onRestart,
  onSetSpeed,
}: TransportBarProps) {
  if (mode === "scrubbing") return null;

  const isAuto = mode === "auto";
  const speeds: PlaybackSpeed[] = [0.5, 1, 2];

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Playback transport">
      {/* Play / Pause */}
      <button
        type="button"
        onClick={isAuto ? onPause : onPlay}
        aria-label={isAuto ? "Pause auto-playback" : "Resume auto-playback"}
        title={isAuto ? "Pause" : "Play"}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md border bg-glass transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isAuto
            ? "border-accent-cyan text-accent-cyan"
            : "border-hairline text-secondary-canvas hover:border-hairline-strong hover:text-foreground",
        )}
        style={{ boxShadow: isAuto ? "0 0 10px 0 rgba(0, 212, 255, 0.45)" : undefined }}
      >
        {isAuto ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      {/* Restart */}
      <button
        type="button"
        onClick={onRestart}
        aria-label="Restart auto-playback"
        title="Restart"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-glass text-secondary-canvas transition-colors hover:border-hairline-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>

      {/* Speed selector */}
      <div
        className="ml-1 flex items-center gap-1 rounded-md border border-hairline bg-glass p-0.5"
        role="radiogroup"
        aria-label="Playback speed"
      >
        {speeds.map((s) => {
          const active = s === speed;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSetSpeed(s)}
              className={cn(
                "rounded px-2 py-0.5 font-mono tabular transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                active
                  ? "bg-[rgba(0,212,255,0.12)] text-accent-cyan"
                  : "text-muted-canvas hover:text-foreground",
              )}
              style={{ fontSize: "10px", letterSpacing: "0.04em" }}
            >
              {s}x
            </button>
          );
        })}
      </div>

      {/* Status text — only when auto */}
      {isAuto && (
        <span
          className="ml-2 font-mono text-muted-canvas"
          style={{ fontSize: "10px", letterSpacing: "0.12em" }}
        >
          · auto-loop enabled
        </span>
      )}
    </div>
  );
}
