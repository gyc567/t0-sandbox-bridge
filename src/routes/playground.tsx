import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AmbientGrid } from "@/components/playground/AmbientGrid";
import { ChannelBar } from "@/components/playground/ChannelBar";
import { FlowCanvas } from "@/components/playground/FlowCanvas";
import { LiveClock } from "@/components/playground/LiveClock";
import { LiveTicker } from "@/components/playground/LiveTicker";
import { CHANNELS, type ChannelId, getChannel } from "@/data/channels";
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

/**
 * T-0 Command Center
 *
 * Phase 2 layout:
 *   [Top bar 60px sticky]            — LOGO · LIVE · ChannelBar · LiveClock
 *   [LiveTicker ~52px sticky]         — 4 KPI segments
 *   [FlowCanvas ~640px]               — three-node topology (Phase 3 adds animation)
 *   [ChannelContext strip ~80px]      — current channel context
 *   [Bottom: deep-dive card grid]     — Bento support sections (Phase 7)
 */
function PlaygroundPage() {
  const [activeId, setActiveId] = useState<ChannelId>(CHANNELS[0].id);
  const activeChannel = getChannel(activeId);

  return (
    <div className="playground min-h-screen">
      <AmbientGrid />

      {/* ─── Top bar ─── */}
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

      {/* ─── Live ticker ─── */}
      <LiveTicker fee={activeChannel.fee} />

      {/* ─── Flow canvas ─── */}
      <main className="relative px-6 pb-16 pt-12">
        <FlowCanvas activeChannel={activeChannel} />

        {/* Channel context strip */}
        <div className="mx-auto mt-8 max-w-7xl">
          <div
            className="flex flex-col gap-1 rounded-lg border border-hairline bg-glass px-5 py-3"
            style={{ borderLeft: "3px solid rgba(0, 212, 255, 0.6)" }}
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
            <p className="font-mono text-secondary-canvas" style={{ fontSize: "12px" }}>
              {activeChannel.context}
            </p>
            <p
              className="font-mono tabular text-muted-canvas"
              style={{ fontSize: "10px", letterSpacing: "0.04em" }}
            >
              {activeChannel.summary}
            </p>
          </div>
        </div>

        {/* Phase 2 footer CTA */}
        <div className="mx-auto mt-12 flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-hairline pt-8">
          <div>
            <p
              className="font-mono uppercase text-muted-canvas"
              style={{ fontSize: "10px", letterSpacing: "0.16em" }}
            >
              // ENDS IN VIEW
            </p>
            <h2
              className="mt-2 font-semibold text-foreground"
              style={{ fontSize: "20px", letterSpacing: "-0.01em" }}
            >
              Run this flow against real sandbox endpoints.
            </h2>
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
          PHASE 2 · STATIC TOPOLOGY · ANIMATION ENGINE ARRIVING IN PHASE 3
        </p>
      </main>
    </div>
  );
}
