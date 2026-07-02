import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AmbientGrid } from "@/components/playground/AmbientGrid";
import { ChannelBar } from "@/components/playground/ChannelBar";
import { ChannelContextStrip } from "@/components/playground/ChannelContextStrip";
import { FlowCanvas } from "@/components/playground/FlowCanvas";
import { HeroOverlay } from "@/components/playground/HeroOverlay";
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

/**
 * T-0 Command Center
 *
 * Phase 4 layout: hero overlay + channel context strip.
 *   [TopBar 60px sticky]
 *   [LiveTicker 56px sticky]
 *   [320vh scroll trigger]
 *     [sticky canvas pane]
 *       [HeroOverlay: 0-12%]
 *       [FlowCanvas: packets]
 *       [ChannelContextStrip: anchored bottom]
 *       [TimelineScrubber: bottom]
 *   [Footer section]
 */
function PlaygroundPage() {
  const [activeId, setActiveId] = useState<ChannelId>(CHANNELS[0].id);
  const activeChannel = getChannel(activeId);
  const flow = getFlow(activeChannel.flowType);

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
            <div className="relative flex h-full flex-col">
              {/* Hero overlay — scroll 0-12% */}
              <HeroOverlay progress={progress} />

              {/* Canvas area */}
              <div className="relative flex-1 min-h-0">
                <div className="h-full px-6 py-8">
                  <FlowCanvas
                    activeChannel={activeChannel}
                    progress={progress}
                  />
                </div>

                {/* Channel context strip anchored at canvas bottom */}
                <div className="absolute bottom-3 left-6 right-6">
                  <ChannelContextStrip channel={activeChannel} />
                </div>
              </div>

              {/* Timeline scrubber */}
              <TimelineScrubber
                flow={flow}
                progress={progress}
                onReset={handleReset}
              />
            </div>
          </div>
        </section>

        {/* Footer */}
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
            PHASE 4 · HERO OVERLAY + CONTEXT STRIP · VARIANTS + DRAWER NEXT
          </p>
        </section>
      </main>
    </div>
  );
}
