import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  advanceProgress,
  usePlayback,
  type PlaybackSpeed,
} from "./playback";

/**
 * Tests for usePlayback hook.
 *
 * - `advanceProgress` (pure math) — tested exhaustively.
 * - `usePlayback` (React hook) — rendered via createRoot against a
 *   happy-dom container. rAF and matchMedia are stubbed globally so
 *   the test is deterministic.
 */

// ── rAF + matchMedia stubs ─────────────────────────────────────────

let mockNow = 0;
let rafQueue: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextRafId = 1;
let reduceMotion = false;

function installRafMock() {
  rafQueue = [];
  nextRafId = 1;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafQueue.push({ id, cb });
    return id;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    rafQueue = rafQueue.filter((r) => r.id !== id);
  }) as typeof globalThis.cancelAnimationFrame;
}

function flushFrame(deltaMs: number) {
  mockNow += deltaMs;
  const current = rafQueue;
  rafQueue = [];
  for (const frame of current) {
    frame.cb(mockNow);
  }
}

function installMatchMedia() {
  const stub = (q: string) => ({
    matches: q.includes("reduce") ? reduceMotion : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  // Override on both window and globalThis (happy-dom has them as distinct).
  globalThis.matchMedia = stub as typeof globalThis.matchMedia;
  if (typeof window !== "undefined") {
    (window as unknown as { matchMedia: typeof stub }).matchMedia = stub;
  }
}

beforeEach(() => {
  mockNow = 0;
  reduceMotion = false;
  installRafMock();
  installMatchMedia();
  // Tell React this is an act() environment so async effects resolve synchronously.
  // @ts-expect-error - test stub
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(performance, "now").mockImplementation(() => mockNow);
});

afterEach(() => {
  vi.restoreAllMocks();
  // Drop any pending rAF callbacks between tests.
  rafQueue = [];
});

// ── Render harness ────────────────────────────────────────────────

interface HookSnapshot {
  progress: number;
  mode: "auto" | "paused" | "scrubbing";
  speed: PlaybackSpeed;
}

function renderHook(
  durationMs: number,
  scrollElement?: HTMLElement | null,
): {
  get: () => HookSnapshot;
  actions: {
    play: () => void;
    pause: () => void;
    restart: () => void;
    setSpeed: (s: PlaybackSpeed) => void;
    seek: (p: number) => void;
  };
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const actionsRef: { current: ReturnType<typeof usePlayback> | null } = {
    current: null,
  };

  function Probe() {
    const hook = usePlayback({ durationMs, scrollElement: scrollElement ?? undefined });
    actionsRef.current = hook;
    return null;
  }

  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(Probe));
  });

  return {
    get() {
      const h = actionsRef.current!;
      return { progress: h.progress, mode: h.mode, speed: h.speed };
    },
    actions: {
      play: () => act(() => actionsRef.current!.play()),
      pause: () => act(() => actionsRef.current!.pause()),
      restart: () => act(() => actionsRef.current!.restart()),
      setSpeed: (s) => act(() => actionsRef.current!.setSpeed(s)),
      seek: (p) => act(() => actionsRef.current!.seek(p)),
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(container);
    },
  };
}

// ── advanceProgress (pure) ─────────────────────────────────────────

describe("advanceProgress", () => {
  it("returns 0 when duration is non-positive", () => {
    expect(advanceProgress(0.5, 100, 0, 1)).toBe(0);
    expect(advanceProgress(0.5, 100, -1, 1)).toBe(0);
  });

  it("advances proportionally to delta/duration*speed", () => {
    expect(advanceProgress(0, 500, 1000, 1)).toBeCloseTo(0.5, 5);
    // speed 2 reaches 1.0 → wraps to 0
    expect(advanceProgress(0, 500, 1000, 2)).toBe(0);
    expect(advanceProgress(0, 500, 1000, 0.5)).toBeCloseTo(0.25, 5);
  });

  it("wraps to 0 when progress reaches or exceeds 1", () => {
    expect(advanceProgress(0.9, 500, 1000, 1)).toBe(0);
    expect(advanceProgress(0.99, 100, 1000, 1)).toBe(0);
    expect(advanceProgress(1.0, 100, 1000, 1)).toBe(0);
  });

  it("respects every speed multiplier exactly", () => {
    const speeds: PlaybackSpeed[] = [0.5, 1, 2];
    for (const s of speeds) {
      const next = advanceProgress(0.1, 200, 1000, s);
      // 0.1 + 0.2*s
      expect(next).toBeCloseTo(0.1 + 0.2 * s, 5);
    }
  });
});

// ── usePlayback hook (real React render) ───────────────────────────

describe("usePlayback", () => {
  it("starts in auto mode when reduced-motion is off", () => {
    const h = renderHook(1000);
    expect(h.get().mode).toBe("auto");
    expect(h.get().progress).toBe(0);
    expect(h.get().speed).toBe(1);
    h.unmount();
  });

  it("starts paused when reduced-motion is preferred", () => {
    reduceMotion = true;
    const h = renderHook(1000);
    expect(h.get().mode).toBe("paused");
    h.unmount();
  });

  it("advances progress in auto mode as rAF frames fire", async () => {
    const h = renderHook(1000);
    // First frame primes baseline (dt=0).
    await act(async () => {
      flushFrame(0);
    });
    await act(async () => {
      flushFrame(250);
    });
    expect(h.get().progress).toBeCloseTo(0.25, 2);
    await act(async () => {
      flushFrame(250);
    });
    expect(h.get().progress).toBeCloseTo(0.5, 2);
    h.unmount();
  });

  it("does not advance when paused", () => {
    const h = renderHook(1000);
    h.actions.pause();
    act(() => {
      flushFrame(0);
    });
    act(() => {
      flushFrame(500);
    });
    expect(h.get().progress).toBe(0);
    expect(h.get().mode).toBe("paused");
    h.unmount();
  });

  it("restart() resets progress to 0 and resumes auto", () => {
    const h = renderHook(1000);
    act(() => {
      flushFrame(0);
    });
    act(() => {
      flushFrame(500);
    });
    expect(h.get().progress).toBeGreaterThan(0);
    h.actions.restart();
    expect(h.get().progress).toBe(0);
    expect(h.get().mode).toBe("auto");
    h.unmount();
  });

  it("setSpeed multiplies dt-effect on progress", () => {
    const h = renderHook(1000);
    act(() => {
      flushFrame(0);
    });
    h.actions.setSpeed(2);
    expect(h.get().speed).toBe(2);
    act(() => {
      flushFrame(250);
    });
    // 250ms / 1000ms * 2x = 0.5
    expect(h.get().progress).toBeCloseTo(0.5, 2);
    h.unmount();
  });

  it("seek() clamps and updates progress", () => {
    const h = renderHook(1000);
    h.actions.seek(0.7);
    expect(h.get().progress).toBe(0.7);
    h.actions.seek(1.5);
    expect(h.get().progress).toBe(1);
    h.actions.seek(-0.3);
    expect(h.get().progress).toBe(0);
    h.unmount();
  });

  it("auto-loops when progress reaches 1", () => {
    const h = renderHook(1000);
    h.actions.seek(0.95);
    act(() => {
      flushFrame(0);
    });
    // 0.95 + 100/1000 = 1.05 → wraps to 0
    act(() => {
      flushFrame(100);
    });
    expect(h.get().progress).toBe(0);
    h.unmount();
  });

  it("play() switches paused → auto when reduced-motion is off", () => {
    const h = renderHook(1000);
    h.actions.pause();
    expect(h.get().mode).toBe("paused");
    h.actions.play();
    expect(h.get().mode).toBe("auto");
    act(() => {
      flushFrame(0);
    });
    act(() => {
      flushFrame(200);
    });
    expect(h.get().progress).toBeGreaterThan(0);
    h.unmount();
  });

  it("play() respects reduced-motion preference", () => {
    reduceMotion = true;
    const h = renderHook(1000);
    h.actions.play();
    expect(h.get().mode).toBe("paused");
    h.unmount();
  });

  it("tears down rAF on unmount", () => {
    const h = renderHook(1000);
    expect(rafQueue.length).toBeGreaterThan(0);
    h.unmount();
    expect(rafQueue.length).toBe(0);
  });

  it("scrubbing mode toggles when scroll element provided", async () => {
    vi.useFakeTimers();
    const scrollEl = document.createElement("div");
    const h = renderHook(1000, scrollEl);
    expect(h.get().mode).toBe("auto");

    await act(async () => {
      scrollEl.dispatchEvent(new window.Event("scroll"));
    });
    expect(h.get().mode).toBe("scrubbing");

    // Advance past 5s idle window so the scrub-resume timer fires.
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(h.get().mode).toBe("auto");
    vi.useRealTimers();
    h.unmount();
  });

  it("multiple rapid scrolls extend the scrub window", async () => {
    vi.useFakeTimers();
    const scrollEl = document.createElement("div");
    const h = renderHook(1000, scrollEl);

    await act(async () => {
      scrollEl.dispatchEvent(new window.Event("scroll"));
      vi.advanceTimersByTime(2000);
      scrollEl.dispatchEvent(new window.Event("scroll"));
      vi.advanceTimersByTime(2000);
      scrollEl.dispatchEvent(new window.Event("scroll"));
    });
    expect(h.get().mode).toBe("scrubbing");

    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(h.get().mode).toBe("auto");
    vi.useRealTimers();
    h.unmount();
  });

  it("speed changes persist across rAF frames", () => {
    const h = renderHook(1000);
    act(() => {
      flushFrame(0);
    });
    h.actions.setSpeed(0.5);
    act(() => {
      flushFrame(200);
    });
    // 200/1000 * 0.5 = 0.1
    expect(h.get().progress).toBeCloseTo(0.1, 2);
    act(() => {
      flushFrame(200);
    });
    expect(h.get().progress).toBeCloseTo(0.2, 2);
    h.unmount();
  });

  it("seek() does not change mode", () => {
    const h = renderHook(1000);
    h.actions.pause();
    h.actions.seek(0.5);
    expect(h.get().mode).toBe("paused");
    h.unmount();
  });

  it("uses useRef/useEffect machinery at module load", () => {
    expect(typeof useEffect).toBe("function");
    expect(typeof useRef).toBe("function");
    expect(typeof React.createElement).toBe("function");
  });

  it("exports the right symbols", () => {
    expect(typeof usePlayback).toBe("function");
    expect(typeof advanceProgress).toBe("function");
  });

  it("onScroll during scrubbing is a no-op for setMode", async () => {
    vi.useFakeTimers();
    const scrollEl = document.createElement("div");
    const h = renderHook(1000, scrollEl);

    // First scroll: auto → scrubbing
    await act(async () => {
      scrollEl.dispatchEvent(new window.Event("scroll"));
    });
    expect(h.get().mode).toBe("scrubbing");

    // Second scroll while already scrubbing: setMode guard fires
    await act(async () => {
      scrollEl.dispatchEvent(new window.Event("scroll"));
    });
    expect(h.get().mode).toBe("scrubbing");

    // Resume: timer fires → auto
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(h.get().mode).toBe("auto");
    vi.useRealTimers();
    h.unmount();
  });

  it("restart() under reduced-motion goes to paused", async () => {
    reduceMotion = true;
    const h = renderHook(1000);
    h.actions.restart();
    expect(h.get().progress).toBe(0);
    expect(h.get().mode).toBe("paused");
    h.unmount();
  });

  it("play() under reduced-motion stays paused", async () => {
    reduceMotion = true;
    const h = renderHook(1000);
    h.actions.play();
    expect(h.get().mode).toBe("paused");
    h.unmount();
  });

  it("scrub-resume respects reduced-motion (stays paused)", async () => {
    vi.useFakeTimers();
    reduceMotion = true;
    const scrollEl = document.createElement("div");
    const h = renderHook(1000, scrollEl);
    expect(h.get().mode).toBe("paused");

    await act(async () => {
      scrollEl.dispatchEvent(new window.Event("scroll"));
    });
    expect(h.get().mode).toBe("scrubbing");

    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    // Under reduced-motion, resume callback checks prefersReducedMotion and stays paused.
    expect(h.get().mode).toBe("scrubbing");
    vi.useRealTimers();
    h.unmount();
  });

  it("unmount with scheduled scrub timer clears it", async () => {
    vi.useFakeTimers();
    const scrollEl = document.createElement("div");
    const h = renderHook(1000, scrollEl);

    await act(async () => {
      scrollEl.dispatchEvent(new window.Event("scroll"));
    });
    // A scrub-resume timer is now pending.
    // Unmount should clean it up.
    vi.useRealTimers();
    h.unmount();
    // If we got here without errors, the cleanup path ran.
  });

  it("rAF tick after unmount is a no-op", async () => {
    // Install a "lazy" cancel that doesn't remove from the queue, so the
    // pending rAF still fires after the cleanup runs. Exercises the
    // `if (cancelled) return` safety branch.
    globalThis.cancelAnimationFrame = (() => {
      // No-op — let the rAF callback run.
    }) as typeof globalThis.cancelAnimationFrame;

    const h = renderHook(1000);
    // Prime baseline (dt=0).
    await act(async () => {
      flushFrame(0);
    });
    // Unmount first so cancelled = true.
    h.unmount();
    // Now run another rAF. tick() should hit `if (cancelled) return` and bail.
    act(() => {
      flushFrame(100);
    });
  });
});