import { RotateCcw } from "lucide-react";
import type { Flow } from "@/data/flows";
import { currentStepIndex } from "@/lib/playground/animation";

interface TimelineScrubberProps {
  flow: Flow;
  /** Master scroll progress [0, 1]. */
  progress: number;
  /** Reset handler — scrolls window to top. */
  onReset: () => void;
  /** Called when a step marker is clicked. */
  onMarkerClick?: (stepId: string) => void;
}

/** Parse a "12:18" timestamp label into total seconds. */
function parseTimeLabel(label: string): number {
  const [m = 0, s = 0] = label.split(":").map(Number);
  return m * 60 + s;
}

/** Format seconds as "0:42". */
function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Sticky bottom bar: reset button · progress track + step markers ·
 * current event label · time display.
 *
 * Active step markers grow + glow; current step gets a hover label
 * (shortLabel) below it. The cyan fill bar tracks scroll progress.
 */
export function TimelineScrubber({ flow, progress, onReset, onMarkerClick }: TimelineScrubberProps) {
  const totalSec = parseTimeLabel(flow.totalLabel);
  const currentSec = progress * totalSec;

  const currentIdx = currentStepIndex(progress, flow.steps);
  const currentStep = currentIdx >= 0 ? flow.steps[currentIdx] : null;

  return (
    <div
      className="sticky bottom-0 z-20 border-t border-hairline backdrop-blur"
      style={{ backgroundColor: "rgba(10, 14, 26, 0.78)" }}
    >
      <div className="flex h-[80px] items-center gap-5 px-6">
        {/* Reset */}
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset scroll playback"
          title="Reset"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-glass text-secondary-canvas transition-colors hover:border-hairline-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        {/* Progress + markers */}
        <div className="relative flex-1 self-stretch">
          {/* Current event label (top-left) */}
          <div
            className="absolute left-0 top-2 font-mono uppercase text-muted-canvas"
            style={{ fontSize: "9px", letterSpacing: "0.16em" }}
          >
            // {currentStep ? currentStep.label.toUpperCase() : "IDLE"}
          </div>

          {/* Track (centered vertically) */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
            <div
              className="h-px w-full"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
            />
            <div
              className="absolute left-0 top-0 h-px"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: "#00d4ff",
                boxShadow: "0 0 8px 1px rgba(0, 212, 255, 0.6)",
              }}
            />

            {/* Markers */}
            {flow.steps.map((step, i) => {
              const isActive = progress >= step.t;
              const isCurrent = i === currentIdx;
              return (
                <button
                  key={step.id}
                  type="button"
                  className="absolute -translate-x-1/2 -translate-y-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full"
                  style={{ left: `${step.t * 100}%`, top: "50%" }}
                  title={step.label}
                  onClick={() => onMarkerClick?.(step.id)}
                  aria-label={`Open artifact for ${step.label}`}
                >
                  <span
                    className="block rounded-full transition-all duration-300"
                    style={{
                      width: isCurrent ? 10 : 6,
                      height: isCurrent ? 10 : 6,
                      backgroundColor: isActive ? "#00d4ff" : "rgba(255, 255, 255, 0.28)",
                      boxShadow: isCurrent
                        ? "0 0 10px 3px rgba(0, 212, 255, 0.7)"
                        : "none",
                    }}
                  />
                  {isCurrent && (
                    <span
                      className="absolute left-1/2 top-3.5 -translate-x-1/2 whitespace-nowrap font-mono uppercase text-accent-cyan"
                      style={{ fontSize: "9px", letterSpacing: "0.16em" }}
                    >
                      {step.shortLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tick scale labels (bottom) */}
          <div
            className="absolute bottom-2 left-0 font-mono text-muted-canvas tabular"
            style={{ fontSize: "9px", letterSpacing: "0.04em" }}
          >
            0%
          </div>
          <div
            className="absolute bottom-2 right-0 font-mono text-muted-canvas tabular"
            style={{ fontSize: "9px", letterSpacing: "0.04em" }}
          >
            100%
          </div>
        </div>

        {/* Time display */}
        <div
          className="font-mono tabular text-foreground"
          style={{ fontSize: "11px", letterSpacing: "0.04em" }}
        >
          <span className="text-accent-cyan">time://</span>{" "}
          <span>{fmtTime(currentSec)}</span>
          <span className="text-muted-canvas"> / {fmtTime(totalSec)}</span>
        </div>
      </div>
    </div>
  );
}
