/**
 * usePlayback — rAF-driven progress engine for /playground.
 *
 * Replaces (or supplements) the scroll-driven useScrollProgress with an
 * auto-playing time-based clock. The playground is a self-running demo:
 * visitors land on /playground and see packets flying, nodes lighting up,
 * artifacts accumulating — without needing to scroll.
 *
 * Modes:
 *   - "auto"      — rAF advances progress linearly by elapsed * speed
 *   - "paused"    — clock frozen at current progress
 *   - "scrubbing" — user is actively scrolling (only if scrollElement given);
 *                   auto playback is suspended. Returns to "auto" after 5s
 *                   of scroll inactivity.
 *
 * Auto-loops when progress >= 1.
 *
 * Reduced-motion: when prefers-reduced-motion: reduce is set, the hook
 * stays in "paused" at progress 0 until the user explicitly plays.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type PlaybackMode = "auto" | "paused" | "scrubbing";
export type PlaybackSpeed = 0.5 | 1 | 2;

export interface UsePlaybackOptions {
  /** Total cycle duration in ms. progress=1 reached after this long. */
  durationMs: number;
  /**
   * Optional scroll element. If provided, scroll activity switches the
   * hook into "scrubbing" mode for 5s, then auto-resumes from auto-play.
   */
  scrollElement?: HTMLElement | null;
}

export interface UsePlaybackResult {
  /** Master progress in [0, 1]. */
  progress: number;
  /** Current playback mode. */
  mode: PlaybackMode;
  /** Current speed multiplier. */
  speed: PlaybackSpeed;
  /** Start auto-play. No-op if already in "auto". */
  play: () => void;
  /** Pause. Preserves current progress. */
  pause: () => void;
  /** Reset progress to 0 and start auto-play. */
  restart: () => void;
  /** Change speed multiplier (0.5x / 1x / 2x). */
  setSpeed: (s: PlaybackSpeed) => void;
  /** Jump to a specific progress in [0, 1]. Does NOT change mode. */
  seek: (p: number) => void;
}

/**
 * Match `(prefers-reduced-motion: reduce)`. True when user has requested
 * reduced motion at the OS level. SSR-safe: returns false on the server.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Clamp a number into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/**
 * Pure progress advance: given current progress, elapsed ms since last tick,
 * total duration, and speed, return new progress in [0, 1]. Returns 0 when
 * the cycle wraps (progress >= 1).
 *
 * Exported for unit testing without React.
 */
export function advanceProgress(
  current: number,
  deltaMs: number,
  durationMs: number,
  speed: PlaybackSpeed,
): number {
  if (durationMs <= 0) return 0;
  const raw = current + (deltaMs / durationMs) * speed;
  return raw >= 1 ? 0 : raw;
}

export function usePlayback(opts: UsePlaybackOptions): UsePlaybackResult {
  const { durationMs, scrollElement } = opts;

  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<PlaybackMode>(() =>
    prefersReducedMotion() ? "paused" : "auto",
  );
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);

  // Refs to mirror state for rAF closure without re-subscribing.
  const modeRef = useRef(mode);
  const speedRef = useRef(speed);
  const progressRef = useRef(progress);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const scrubTimerRef = useRef<number>(0);

  // Keep refs in sync with state.
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Scrub-mode toggling when scroll element provided.
  useEffect(() => {
    if (!scrollElement) return;

    function onScroll() {
      // User scroll detected → enter scrubbing, defer auto-resume.
      if (modeRef.current !== "scrubbing") {
        setMode("scrubbing");
      }
      window.clearTimeout(scrubTimerRef.current);
      scrubTimerRef.current = window.setTimeout(() => {
        // 5s of inactivity → return to auto (only if reduced-motion off).
        if (!prefersReducedMotion()) {
          setMode("auto");
        }
      }, 5000);
    }

    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      window.clearTimeout(scrubTimerRef.current);
    };
  }, [scrollElement]);

  // Main rAF loop. Advances progress when in "auto" mode.
  useEffect(() => {
    let cancelled = false;

    function tick(now: number) {
      if (cancelled) return;
      // First frame: just establish baseline (no dt).
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      if (modeRef.current === "auto" && durationMs > 0) {
        const next = advanceProgress(progressRef.current, dt, durationMs, speedRef.current);
        progressRef.current = next;
        setProgress(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    lastTickRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [durationMs]);

  const play = useCallback(() => {
    setMode(prefersReducedMotion() ? "paused" : "auto");
  }, []);

  const pause = useCallback(() => {
    setMode("paused");
  }, []);

  const restart = useCallback(() => {
    setProgress(0);
    progressRef.current = 0;
    setMode(prefersReducedMotion() ? "paused" : "auto");
  }, []);

  const setSpeed = useCallback((s: PlaybackSpeed) => {
    setSpeedState(s);
  }, []);

  const seek = useCallback((p: number) => {
    const clamped = clamp(p, 0, 1);
    progressRef.current = clamped;
    setProgress(clamped);
  }, []);

  return { progress, mode, speed, play, pause, restart, setSpeed, seek };
}
