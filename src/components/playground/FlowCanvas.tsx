import { cn } from "@/lib/utils";
import type { Channel } from "@/data/channels";
import { getFlow, type FlowStep, type NodeId, type PacketColor } from "@/data/flows";
import { GlowDot } from "@/components/playground/GlowDot";
import { RateLockBadge } from "@/components/playground/RateLockBadge";
import { NodeCard } from "@/components/playground/NodeCard";

interface FlowCanvasProps {
  activeChannel: Channel;
  /** Master progress [0, 1]. Drives all packet animations. */
  progress: number;
  /** Called when a step/node is clicked to open its artifact. */
  onStepClick?: (stepId: string) => void;
  /** Called when a node card is clicked to inspect the latest step targeting it. */
  onNodeClick?: (nodeId: NodeId) => void;
}

/**
 * 4-node topology centers in SVG viewBox (0 0 1200 600).
 *
 *   ofi(120) → orchestrator(470) → pop(870); payin(1080) hangs off the right
 *
 *   Y=300   main rail (OFI ↔ Orchestrator ↔ POP)
 *   Y=460   pay-in rail (only active for Payment Intent flow)
 *   Y=520   USDT transfer channel (ochre dashed)
 *
 * `preserveAspectRatio="none"` on the parent SVG means these scale
 * linearly with the container, so they line up with the absolute-
 * positioned node cards below.
 */
const NODE_CENTERS: Record<NodeId, { x: number; y: number }> = {
  ofi: { x: 120, y: 300 },
  orchestrator: { x: 470, y: 300 },
  pop: { x: 870, y: 300 },
  payin: { x: 1080, y: 460 },
};

/**
 * For Payment Intent, OFI is the Beneficiary and POP/PayIn are the rail
 * endpoints. Wiring stays the same; only labels change.
 */
function nodeLabels(flowType: Channel["flowType"]) {
  if (flowType === "payment-intent") {
    return {
      ofi: "Beneficiary",
      ofiSubtitle: "Intent originator",
      pop: "Pay-In Provider",
      popSubtitle: "Fiat collector",
      payin: "Pay-In Wallet",
      payinSubtitle: "End-user funds source",
    };
  }
  return {
    ofi: "OFI",
    ofiSubtitle: "Originator",
    pop: "POP",
    popSubtitle: "Payout Provider",
    payin: "Pay-In Provider",
    payinSubtitle: "Off-network rail",
  };
}

/**
 * Steps that traverse the bottom USDT transfer channel (Y=520). The
 * pay-in rail uses Y=460 only when its source/target is the pay-in node.
 */
function channelY(step: FlowStep): number | undefined {
  if (step.railY !== undefined) return step.railY;
  if (step.id === "usdt-settle" || step.id === "end-user-pays" || step.id === "settlement") {
    return 520;
  }
  return undefined;
}

/**
 * Static four-node topology + scroll-driven packet rendering.
 *
 * Phase 8:
 *   - 4 nodes with explicit y-coords (main rail y=300, pay-in y=460)
 *   - Manual AML inserts a Travel-Rule (IVMS101) step + an AML hold
 *   - Payment Intent activates the Pay-In Provider node + pay-in rail
 *   - RateLockBadge stays in Network Orchestrator during "rate-bound"
 */
export function FlowCanvas({ activeChannel, progress, onStepClick, onNodeClick }: FlowCanvasProps) {
  const flow = getFlow(activeChannel.flowType);
  const labels = nodeLabels(activeChannel.flowType);

  // Compute lit nodes from progress (set semantics — node stays lit once lit).
  const litNodes = new Set<NodeId>();
  for (const step of flow.steps) {
    if (progress >= step.t) {
      litNodes.add(step.target);
    }
  }

  // Rate-lock freeze-frame for Payment Intent.
  const rateBoundStep = flow.steps.find((s) => s.id === "rate-bound");
  const rateLockActive =
    !!rateBoundStep && progress >= rateBoundStep.t - 0.02 && progress < rateBoundStep.t + 0.08;

  // Packet colors per step.packetColor
  const colorMap: Record<PacketColor, { dot: string; glow: string }> = {
    cyan: { dot: "#00d4ff", glow: "rgba(0, 212, 255, 0.5)" },
    ochre: { dot: "#d4a017", glow: "rgba(212, 160, 23, 0.5)" },
    sage: { dot: "#7ec488", glow: "rgba(126, 196, 136, 0.5)" },
    slate: { dot: "#7e95b0", glow: "rgba(126, 149, 176, 0.5)" },
  };

  const showPayin = activeChannel.flowType === "payment-intent";

  return (
    <div
      className="relative mx-auto w-full max-w-7xl"
      style={{ height: "min(640px, 70vh)", minHeight: "520px" }}
      aria-label="T-0 protocol topology"
    >
      {/* ─── SVG layer: connections + packets ─── */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1200 600"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <filter id="packet-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <linearGradient id="usdt-channel-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(212, 160, 23, 0)" />
            <stop offset="50%" stopColor="rgba(212, 160, 23, 0.7)" />
            <stop offset="100%" stopColor="rgba(212, 160, 23, 0)" />
          </linearGradient>
        </defs>

        {/* OFI ↔ Orchestrator — two horizontal lines (top section) */}
        <line x1="200" y1="180" x2="390" y2="180" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <line x1="200" y1="230" x2="390" y2="230" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {/* Orchestrator ↔ POP — two horizontal lines */}
        <line x1="700" y1="180" x2="790" y2="180" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <line x1="700" y1="230" x2="790" y2="230" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {/* Pay-In ↔ POP — angled line down to y=460 (only when Pay-In active) */}
        {showPayin && (
          <>
            <line
              x1="990"
              y1="300"
              x2="1010"
              y2="440"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <line
              x1="990"
              y1="330"
              x2="1010"
              y2="470"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
          </>
        )}

        {/* USDT channel — bottom, ochre dashed (shimmer via CSS) */}
        <line
          x1="100"
          y1="500"
          x2="900"
          y2="500"
          stroke="rgba(212, 160, 23, 0.55)"
          strokeWidth="1.5"
          strokeDasharray="6 6"
          className="usdt-channel-dash"
        />
        <text
          x="500"
          y="525"
          textAnchor="middle"
          fill="rgba(212, 160, 23, 0.7)"
          fontFamily="JetBrains Mono, ui-monospace, monospace"
          fontSize="10"
          letterSpacing="0.08em"
        >
          USDT transfer channel · Tron / Ethereum / BSC
        </text>

        {/* Chevron markers */}
        <polygon points="385,180 393,180 389,184" fill="rgba(255,255,255,0.3)" />
        <polygon points="695,180 687,180 691,184" fill="rgba(255,255,255,0.3)" />
        {showPayin && <polygon points="1003,425 1003,433 999,429" fill="rgba(255,255,255,0.3)" />}

        {/* Packets (driven by playback progress) */}
        {flow.steps.map((step) => {
          const source = NODE_CENTERS[step.source];
          const target = NODE_CENTERS[step.target];
          const colors = colorMap[step.packetColor];
          const y = channelY(step);
          return (
            <g
              key={step.id}
              className="packet-group cursor-pointer"
              onClick={() => onStepClick?.(step.id)}
              role="button"
              aria-label={`Open artifact for ${step.label}`}
            >
              <GlowDot
                sourceX={source.x}
                sourceY={y ?? source.y}
                targetX={target.x}
                targetY={y ?? target.y}
                progress={progress}
                stepT={step.t}
                color={colors.dot}
                glowColor={colors.glow}
                trail={y === undefined}
              />
            </g>
          );
        })}
      </svg>

      {/* ─── OFI node ─── */}
      <NodeCard
        title={labels.ofi}
        subtitle={labels.ofiSubtitle}
        accentColor="neutral"
        hexId="0x7a3f"
        className="absolute left-[1%] top-[15%] h-[70%] w-[14%]"
        lit={litNodes.has("ofi")}
        onClick={() => onNodeClick?.("ofi")}
      >
        <ModuleSlot label="Quote book" hexId="0xa1b2" />
        <ModuleSlot label="Payment init" hexId="0xb3c4" />
        <ModuleSlot label="USDT wallet" hexId="0xc5d6" accent="usdt" />
        <ModuleSlot label="Fiat rail" hexId="0xd7e8" muted />
      </NodeCard>

      {/* ─── Orchestrator node (T-0 core services) ─── */}
      <NodeCard
        title="T-0 Network Orchestration"
        subtitle={`flow · ${activeChannel.flowType}`}
        accentColor="cyan"
        hexId="M4IN.0"
        large
        className="absolute left-[17%] top-[5%] h-[88%] w-[36%]"
        lit={litNodes.has("orchestrator")}
        onClick={() => onNodeClick?.("orchestrator")}
      >
        <div className="grid grid-cols-2 gap-1.5">
          <ModuleSlot label="Quote Aggregator" hexId="0xN001" compact />
          <ModuleSlot label="Ledger Engine" hexId="0xN002" compact />
          <ModuleSlot label="Credit Manager" hexId="0xN003" compact />
          <ModuleSlot label="Webhook Router" hexId="0xN004" compact />
        </div>
        <ModuleSlot
          label="Settlement Watch · USDT chain detector"
          hexId="0xN005"
          accent="usdt"
          compact
        />
        <ModuleSlot
          label={`Fee router · ${activeChannel.fee}`}
          hexId="0xN006"
          accent="cyan"
          compact
        />

        {/* Rate-lock freeze-frame for Payment Intent */}
        <RateLockBadge active={rateLockActive} />
      </NodeCard>

      {/* ─── POP node ─── */}
      <NodeCard
        title={labels.pop}
        subtitle={labels.popSubtitle}
        accentColor="neutral"
        hexId="0x9b1c"
        className="absolute left-[55%] top-[15%] h-[70%] w-[14%]"
        lit={litNodes.has("pop")}
        onClick={() => onNodeClick?.("pop")}
      >
        <ModuleSlot label="Quote Publish" hexId="0xP001" />
        <ModuleSlot label="ECDSA sign" hexId="0xP002" />
        <ModuleSlot label="PayOut RPC" hexId="0xP003" />
        <ModuleSlot label="Finalize" hexId="0xP004" />
      </NodeCard>

      {/* ─── Pay-In node (only active for Payment Intent) ─── */}
      {showPayin && (
        <NodeCard
          title={labels.payin}
          subtitle={labels.payinSubtitle}
          accentColor="neutral"
          hexId="0xc4f2"
          className="absolute left-[72%] top-[55%] h-[42%] w-[14%]"
          lit={litNodes.has("payin")}
          onClick={() => onNodeClick?.("payin")}
        >
          <ModuleSlot label="End-user wallet" hexId="0xPi01" compact />
          <ModuleSlot label="Off-network rail" hexId="0xPi02" muted compact />
          <ModuleSlot label="FIAT → stablecoin" hexId="0xPi03" accent="usdt" compact />
        </NodeCard>
      )}

      {/* ─── Local keyframes ─── */}
      <style>{`
        .heartbeat {
          animation: playground-heartbeat 3.6s ease-in-out infinite;
        }
        .heartbeat-2 {
          animation: playground-heartbeat 4.2s ease-in-out infinite;
          animation-delay: -1.4s;
        }
        .heartbeat-3 {
          animation: playground-heartbeat 3.2s ease-in-out infinite;
          animation-delay: -2.1s;
        }
        @keyframes playground-heartbeat {
          0%, 100% { opacity: 0.7; }
          50%      { opacity: 0.32; }
        }
        .usdt-channel-dash {
          animation: usdt-shimmer 6s linear infinite;
        }
        @keyframes usdt-shimmer {
          0%   { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -24; }
        }
        @media (prefers-reduced-motion: reduce) {
          .heartbeat, .heartbeat-2, .heartbeat-3, .usdt-channel-dash {
            animation: none !important;
          }
          .heartbeat, .heartbeat-2, .heartbeat-3 { opacity: 0.55 !important; }
          .packet-group { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

interface ModuleSlotProps {
  label: string;
  hexId?: string;
  accent?: "usdt" | "cyan";
  muted?: boolean;
  compact?: boolean;
}

function ModuleSlot({ label, hexId, accent, muted, compact }: ModuleSlotProps) {
  const heartbeatClass =
    accent === "usdt" ? "heartbeat-2" : accent === "cyan" ? "heartbeat-3" : "heartbeat";
  return (
    <div
      className={cn(
        "rounded border px-2 py-1.5",
        muted
          ? "border-hairline bg-glass opacity-60"
          : accent === "usdt"
            ? "border-[rgba(212,160,23,0.35)] bg-[rgba(212,160,23,0.04)]"
            : accent === "cyan"
              ? "border-[rgba(0,212,255,0.28)] bg-[rgba(0,212,255,0.05)]"
              : "border-hairline bg-glass",
      )}
    >
      <div
        className="font-mono text-foreground"
        style={{ fontSize: compact ? "9.5px" : "10px", letterSpacing: "0.02em" }}
      >
        {label}
      </div>
      {hexId && (
        <div
          className={cn("font-mono tabular text-muted-canvas", heartbeatClass)}
          style={{ fontSize: "8px", letterSpacing: "0.04em", marginTop: "2px" }}
        >
          {hexId}
        </div>
      )}
    </div>
  );
}
