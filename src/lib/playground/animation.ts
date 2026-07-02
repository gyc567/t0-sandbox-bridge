import { useEffect, useState, type RefObject } from "react";

/**
 * Returns [0, 1] representing how far through the trigger element
 * the user has scrolled.
 *
 * - 0 when the top of the element is at (or below) the top of the viewport
 * - 1 when the bottom of the element is at (or above) the bottom of the viewport
 *
 * Used by the playground to drive packet animations: scroll progress
 * crosses each step.t threshold, the corresponding packet flies from
 * source to target.
 *
 * Implemented with requestAnimationFrame for buttery updates under
 * 60fps; teardown cancels the rAF so no leaks.
 */
export function useScrollProgress(triggerRef: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;

    function tick() {
      const el = triggerRef.current;
      if (!el) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Total scrollable distance across the trigger minus one viewport
      const total = rect.height - vh;

      if (total <= 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // rect.top is negative once we've scrolled below the element's top edge.
      // We map that into [0, 1] progress.
      const scrolled = -rect.top;
      const p = Math.max(0, Math.min(1, scrolled / total));
      setProgress(p);

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [triggerRef]);

  return progress;
}

/**
 * Cubic ease-out — decelerates as it approaches 1.
 * Used to soften the arrival of each packet at its target.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export type StepStatus = "pending" | "flying" | "settled";

/**
 * Returns the lifecycle state of a step given the current master progress.
 *
 * - `pending` — packet is still at source, target unlit
 * - `flying`  — packet is in flight (in the WINDOW before its threshold)
 * - `settled` — packet has reached target, target is lit
 */
export function stepStatus(
  progress: number,
  stepT: number,
  window: number = 0.04,
): StepStatus {
  if (progress >= stepT) return "settled";
  if (progress >= stepT - window) return "flying";
  return "pending";
}

/**
 * Returns the eased fraction [0, 1] of how far the packet has travelled
 * from source to target. Returns null if the packet hasn't started yet.
 *
 * Caller can use null to skip rendering the packet entirely.
 */
export function packetFraction(
  progress: number,
  stepT: number,
  window: number = 0.04,
): number | null {
  if (progress >= stepT) return 1;
  if (progress < stepT - window) return null;
  const raw = (progress - (stepT - window)) / window;
  return Math.max(0, Math.min(1, easeOutCubic(raw)));
}

/**
 * Index of the most recently fired step (flying or settled).
 * Returns -1 if no step has fired yet.
 */
export function currentStepIndex(
  progress: number,
  steps: readonly { t: number }[],
  window: number = 0.04,
): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (progress >= steps[i].t - window) return i;
  }
  return -1;
}
