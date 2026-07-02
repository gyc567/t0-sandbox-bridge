import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AmbientGrid } from "@/components/playground/AmbientGrid";
import { ArtifactDrawer } from "@/components/playground/ArtifactDrawer";
import { BentoFooter } from "@/components/playground/BentoFooter";
import { ChannelBar } from "@/components/playground/ChannelBar";
import { ChannelContextStrip } from "@/components/playground/ChannelContextStrip";
import { FlowCanvas } from "@/components/playground/FlowCanvas";
import { HeroOverlay } from "@/components/playground/HeroOverlay";
import { LiveClock } from "@/components/playground/LiveClock";
import { LiveTicker } from "@/components/playground/LiveTicker";
import { TimelineScrubber } from "@/components/playground/TimelineScrubber";
import { CHANNELS, type ChannelId, getChannel } from "@/data/channels";
import { getFlow, type ArtifactType } from "@/data/flows";
import {
  publishQuoteFn,
  acceptPaymentFn,
  processPayoutFn,
} from "@/lib/t0/t0.functions";
import { useScrollProgress } from "@/lib/playground/animation";
import type { NodeId } from "@/data/flows";

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
 * Phase 7: real sandbox wiring + Bento footer.
 */
function PlaygroundPage() {
  const [activeId, setActiveId] = useState<ChannelId>(CHANNELS[0].id);
  const activeChannel = getChannel(activeId);
  const flow = getFlow(activeChannel.flowType);

  const [selectedArtifact, setSelectedArtifact] = useState<{
    type: ArtifactType;
    stepId: string;
  } | null>(null);

  const [liveIds, setLiveIds] = useState<{ paymentId?: string; quoteId?: string }>({});

  const publishQuote = useServerFn(publishQuoteFn);
  const acceptPayment = useServerFn(acceptPaymentFn);
  const processPayout = useServerFn(processPayoutFn);

  const triggerRef = useRef<HTMLElement>(null);
  const progress = useScrollProgress(triggerRef);

  function handleReset() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStepClick(stepId: string) {
    const step = flow.steps.find((s) => s.id === stepId);
    if (step) {
      setSelectedArtifact({ type: step.artifactType, stepId });
    }
  }

  function handleNodeClick(nodeId: NodeId) {
    const latest = [...flow.steps]
      .filter((s) => s.target === nodeId && progress >= s.t)
      .sort((a, b) => b.t - a.t)[0];
    if (latest) {
      setSelectedArtifact({ type: latest.artifactType, stepId: latest.id });
    }
  }

  function handleCloseArtifact() {
    setSelectedArtifact(null);
  }

  // Fire real sandbox calls when Pay-Out steps cross their thresholds.
  // We track which step IDs we've already fired so they don't re-trigger.
  const firedRef = useRef<Set<string>>(new Set());

  if (activeChannel.flowType === "pay-out") {
    const steps = flow.steps;

    // UpdateQuote → publishQuote
    const updateQuote = steps.find((s) => s.id === "update-quote");
    if (updateQuote && progress >= updateQuote.t && !firedRef.current.has("update-quote")) {
      firedRef.current.add("update-quote");
      publishQuote({ data: { currency: "EUR", band: 1_000, rate: 0.92 } })
        .then((q) => {
          if (q && typeof q === "object" && "id" in q) {
            setLiveIds((prev) => ({ ...prev, quoteId: String((q as { id: string }).id) }));
          }
        })
        .catch(() => {
          // Fail silently in the visualizer — the mock artifact is still shown.
        });
    }

    // CreatePayment → acceptPayment (uses the last published quote id if available)
    const createPayment = steps.find((s) => s.id === "create-payment");
    if (createPayment && progress >= createPayment.t && !firedRef.current.has("create-payment")) {
      firedRef.current.add("create-payment");
      if (liveIds.quoteId) {
        acceptPayment({
          data: { quoteId: liveIds.quoteId, beneficiaryRef: `BEN-${Date.now()}` },
        })
          .then((p) => {
            if (p && typeof p === "object" && "id" in p) {
              setLiveIds((prev) => ({ ...prev, paymentId: String((p as { id: string }).id) }));
            }
          })
          .catch(() => {});
      }
    }

    // FinalizePayout → processPayout success
    const finalize = steps.find((s) => s.id === "finalize-payout");
    if (finalize && progress >= finalize.t && !firedRef.current.has("finalize-payout")) {
      firedRef.current.add("finalize-payout");
      if (liveIds.paymentId) {
        processPayout({ data: { paymentId: liveIds.paymentId } }).catch(() => {});
      }
    }
  }

  const selectedStep = selectedArtifact
    ? flow.steps.find((s) => s.id === selectedArtifact.stepId)
    : null;

  return (
    <div className="playground">
      <AmbientGrid />

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
              <HeroOverlay progress={progress} />

              <div className="relative flex-1 min-h-0">
                <div className="h-full px-6 py-8">
                  <FlowCanvas
                    activeChannel={activeChannel}
                    progress={progress}
                    onStepClick={handleStepClick}
                    onNodeClick={handleNodeClick}
                  />
                </div>

                <div className="absolute bottom-3 left-6 right-6">
                  <ChannelContextStrip channel={activeChannel} />
                </div>
              </div>

              <TimelineScrubber
                flow={flow}
                progress={progress}
                onReset={handleReset}
                onMarkerClick={handleStepClick}
              />
            </div>
          </div>
        </section>

        {selectedArtifact && (
          <ArtifactDrawer
            type={selectedArtifact.type}
            timestamp={
              selectedStep
                ? `t-${((1 - selectedStep.t) * 100).toFixed(1)}% in cycle`
                : undefined
            }
            onClose={handleCloseArtifact}
          />
        )}

        <BentoFooter />
      </main>
    </div>
  );
}
