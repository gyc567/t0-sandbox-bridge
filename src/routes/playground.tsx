import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AmbientGrid } from "@/components/playground/AmbientGrid";
import { ChannelBar } from "@/components/playground/ChannelBar";
import { FlowCanvas } from "@/components/playground/FlowCanvas";
import { LiveClock } from "@/components/playground/LiveClock";
import { LiveTicker } from "@/components/playground/LiveTicker";
import { TimelineScrubber } from "@/components/playground/TimelineScrubber";
import { CHANNELS, type ChannelId, getChannel } from "@/data/channels";
import { getFlow } from "@/data/flows";
import { useScrollProgress } from "@/lib/playground/animation";
import { Button } from "@/components/ui/button";

import playgroundCss from "../playground.css?url";

export const Route = createFileRoute("/playground")({
  head: () => ({
    meta: [
      { title: "T-0 Command Center" },
      {
        name: "description",
        content: "Live visualization of T-0 Network onboarding and protocol flows.",
      },
      { property: "og:title", content: "T-0 Command Center" },
      {
        property: "og:description",
        content: "Live visualization of T-0 Network onboarding and protocol flows.",
      },
    ],
    links: [{ rel: "stylesheet", href: playgroundCss }],
  }),
  component: PlaygroundPage,
});

const TOP_BAR_HEIGHT = 60;
const TICKER_HEIGHT = 56;
const SCRUBBER_HEIGHT = 80;

/**
 * T-0 Command Center
 *
 * Phase 3 layout: scroll-driven experience.
 *   [TopBar 60px sticky]                              — LOGO · LIVE · Channels · Clock
 *   [LiveTicker 56px sticky]                          — 4 KPI segments
 *   ─────── scroll-driven section starts ───────
 *   [320vh tall container, child is sticky for 100vh]  — FlowCanvas (scroll-driven packets)
 *   ─────── scroll-driven section ends ───────
 *   [Footer section, appears after scroll completes]    — Bento support (Phase 7)
 *
 * While the user scrolls through the container, the FlowCanvas stays
 * pinned and `progress` (0 → 1) drives packet animations on the canvas.
 * TimelineScrubber renders the same progress as a horizontal track with
 * step markers.
 */
function PlaygroundPage() {
  const [activeId, setActiveId] = useState<ChannelId>(CHANNELS[0].id);
  const activeChannel = getChannel(activeId);
  const flow = getFlow(activeChannel.flowType);

  // Trigger element is the section the user actually scrolls through.
  // Anything past its bottom returns progress = 1 (all packets settled).
  const triggerRef = useRef<HTMLElement>(null);
  const progress = useScrollProgress(triggerRef);

  function handleReset() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="playground">
      <AmbientGrid />

      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-hairline px-6 backdrop-blur"
        style={{ backgroundColor: "rgba(10, 14, 26, 0.7)" }}
      >
        <div className="flex items-center gap-5">
          <span
            className="font-mono text-muted-canvas"
            style={{ fontSize: "12px", letterSpacing: "0.16em" }}
          >
            T-0 // COMMAND CENTER
          </span>
          <div className="flex items-center gap-2">
            <span className="status-dot" aria-hidden />
            <span
              className="font-mono text-accent-cyan"
              style={{ fontSize: "11px", letterSpacing: "0.12em" }}
            >
              LIVE
            </span>
          </div>
        </div>

        <ChannelBar active={activeId} onChange={setActiveId} />

        <div className="flex items-center gap-4">
          <LiveClock />
        </div>
      </header>

      {/* Live ticker */}
      <LiveTicker fee={activeChannel.fee} />

      <main>
        {/* Scroll experience — 320vh tall. Inner sticky pane holds the
            canvas + scrubber for the duration of the scroll. */}
        <section
          ref={triggerRef}
          style={{ height: "320vh" }}
          aria-label="Protocol playback"
        >
          <div
            className="sticky overflow-hidden"
            style={{
              top: TOP_BAR_HEIGHT + TICKER_HEIGHT,
              height: `calc(100vh - ${TOP_BAR_HEIGHT + TICKER_HEIGHT}px)`,
            }}
          >
            <div className="flex h-full flex-col">
              {/* Canvas area (scroll-driven content) */}
              <div className="relative flex-1 min-h-0">
                <div className="h-full px-6 py-8">
                  <FlowCanvas
                    activeChannel={activeChannel}
                    progress={progress}
                  />
                </div>

                {/* Channel context strip — overlays the canvas bottom area */}
                <div className="absolute bottom-3 left-6 right-6">
                  <div
                    className="flex flex-col gap-1 rounded-lg border border-hairline bg-elevated px-5 py-3 backdrop-blur"
                    style={{
                      borderLeft: "3px solid rgba(0, 212, 255, 0.6)",
                      backgroundColor: "rgba(10, 14, 26, 0.75)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="font-mono uppercase text-accent-cyan"
                        style={{ fontSize: "10px", letterSpacing: "0.16em" }}
                      >
                        // CHANNEL · {activeChannel.label.toUpperCase()}
                      </span>
                      <span
                        className="font-mono text-muted-canvas"
                        style={{ fontSize: "10px", letterSpacing: "0.04em" }}
                      >
                        flow · {activeChannel.flowType}
                      </span>
                    </div>
                    <p
                      className="font-mono text-secondary-canvas"
                      style={{ fontSize: "12px" }}
                    >
                      {activeChannel.context}
                    </p>
                  </div>
                </div>
              </div>

              {/* Timeline scrubber — sticky bottom of the experience */}
              <TimelineScrubber
                flow={flow}
                progress={progress}
                onReset={handleReset}
                style={{ height: SCRUBBER_HEIGHT }}
              />
            </div>
          </div>
        </section>

        {/* Below-the-fold footer section */}
        <section className="border-t border-hairline px-6 py-12">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
            <div>
              <p
                className="font-mono uppercase text-muted-canvas"
                style={{ fontSize: "10px", letterSpacing: "0.16em" }}
              >
                // RUN IT YOURSELF
              </p>
              <h2
                className="mt-2 font-semibold text-foreground"
                style={{ fontSize: "20px", letterSpacing: "-0.01em" }}
              >
                Run this flow against real sandbox endpoints.
              </h2>
              <p
                className="mt-1 max-w-md text-secondary-canvas"
                style={{ fontSize: "13px", lineHeight: 1.5 }}
              >
                The T-0 sandbox mirrors production gRPC + REST contracts. Press
                reset, scroll, and inspect artifacts — then run the same flow
                against live endpoints in /sandbox.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/" className="contents">
                <Button variant="outline" size="sm">
                  ← Home
                </Button>
              </Link>
              <Link to="/sandbox" className="contents">
                <Button size="sm">Open Sandbox</Button>
              </Link>
              <Link to="/docs" className="contents">
                <Button variant="outline" size="sm">
                  Read Docs
                </Button>
              </Link>
            </div>
          </div>

          <p
            className="mx-auto mt-8 max-w-7xl text-center font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.12em" }}
          >
            PHASE 3 · SCROLL-DRIVEN ANIMATION · HERO OVERLAY + VARIANTS ARRIVING NEXT
          </p>
        </section>
      </main>
    </div>
  );
}
