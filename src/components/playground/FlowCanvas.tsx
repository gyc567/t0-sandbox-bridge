import { cn } from "@/lib/utils";
import type { Channel } from "@/data/channels";
import {
  getFlow,
  type FlowStep,
  type NodeId,
  type PacketColor,
} from "@/data/flows";
import { GlowDot } from "@/components/playground/GlowDot";
import { RateLockBadge } from "@/components/playground/RateLockBadge";

interface FlowCanvasProps {
  activeChannel: Channel;
  /** Master scroll progress [0, 1]. Drives all packet animations. */
  progress: number;
  /** Called when a step/node is clicked to open its artifact. */
  onStepClick?: (stepId: string) => void;
  /** Called when a node card is clicked to inspect the latest step targeting it. */
  onNodeClick?: (nodeId: NodeId) => void;
}

/**
 * Node centers in SVG viewBox (0 0 1000 600) coordinates.
 * `preserveAspectRatio="none"` on the parent SVG means these scale
 * linearly with the container, so they line up with the absolute-
 * positioned node cards below.
 */
const NODE_CENTERS: Record<NodeId, { x: number; y: number }> = {
  ofi: { x: 110, y: 300 },
  network: { x: 425, y: 300 },
  pop: { x: 890, y: 300 },
};

/**
 * For Payment Intent, the "OFI" node is reinterpreted as the Beneficiary
 * and "POP" as the Pay-In Provider. The wiring stays the same; only labels
 * change.
 */
function nodeLabels(flowType: Channel["flowType"]) {
  if (flowType === "payment-intent") {
    return {
      ofi: "Beneficiary",
      ofiSubtitle: "Intent originator",
      pop: "Pay-In Provider",
      popSubtitle: "Fiat collector",
    };
  }
  return {
    ofi: "OFI",
    ofiSubtitle: "Originator",
    pop: "POP",
    popSubtitle: "Payout Provider",
  };
}

/**
 * Some steps traverse the bottom USDT transfer channel instead of
 * the main line. Detect them by id and reroute the packet y.
 */
function channelSteps(stepId: string): boolean {
  return (
    stepId === "usdt-settle" ||
    stepId === "end-user-pays" ||
    stepId === "settlement"
  );
}

/**
 * Static three-node topology + scroll-driven packet rendering.
 *
 * Phase 5 adds:
 *   - Flow-aware node labels (Payment Intent shows Beneficiary / Pay-In Provider)
 *   - RateLockBadge in Network Core during Payment Intent "rate-bound" step
 *   - Manual AML: the AML/Last Look packets now route through Network Core
 *     as defined by their source/target in flows.ts.
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
    !!rateBoundStep &&
    progress >= rateBoundStep.t - 0.02 &&
    progress < rateBoundStep.t + 0.08;

  // Packet colors per step.packetColor
  const colorMap: Record<PacketColor, { dot: string; glow: string }> = {
    cyan: { dot: "#00d4ff", glow: "rgba(0, 212, 255, 0.5)" },
    ochre: { dot: "#d4a017", glow: "rgba(212, 160, 23, 0.5)" },
    sage: { dot: "#7ec488", glow: "rgba(126, 196, 136, 0.5)" },
    slate: { dot: "#7e95b0", glow: "rgba(126, 149, 176, 0.5)" },
  };

  return (
    <div
      className="relative mx-auto w-full max-w-7xl"
      style={{ height: "min(640px, 70vh)", minHeight: "520px" }}
      aria-label="T-0 protocol topology"
    >
      {/* ─── SVG layer: connections + packets ─── */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <filter
            id="packet-blur"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <linearGradient id="usdt-channel-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(212, 160, 23, 0)" />
            <stop offset="50%" stopColor="rgba(212, 160, 23, 0.7)" />
            <stop offset="100%" stopColor="rgba(212, 160, 23, 0)" />
          </linearGradient>
        </defs>

        {/* OFI ↔ Network Core — two horizontal lines (top section) */}
        <line x1="190" y1="180" x2="350" y2="180" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <line x1="190" y1="230" x2="350" y2="230" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {/* Network Core ↔ POP — two horizontal lines */}
        <line x1="650" y1="180" x2="810" y2="180" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <line x1="650" y1="230" x2="810" y2="230" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

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
        <polygon points="345,180 353,180 349,184" fill="rgba(255,255,255,0.3)" />
        <polygon points="655,180 647,180 651,184" fill="rgba(255,255,255,0.3)" />

        {/* Packets (driven by scroll progress) */}
        {flow.steps.map((step) => {
          const source = NODE_CENTERS[step.source];
          const target = NODE_CENTERS[step.target];
          const colors = colorMap[step.packetColor];
          const alongChannel = channelSteps(step.id);
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
                sourceY={alongChannel ? 500 : source.y}
                targetX={target.x}
                targetY={alongChannel ? 500 : target.y}
                progress={progress}
                stepT={step.t}
                color={colors.dot}
                glowColor={colors.glow}
                trail={!alongChannel}
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
        className="absolute left-[2%] top-[15%] h-[70%] w-[18%]"
        lit={litNodes.has("ofi")}
        onClick={() => onNodeClick?.("ofi")}
      >
        <ModuleSlot label="Quote book" hexId="0xa1b2" />
        <ModuleSlot label="Payment init" hexId="0xb3c4" />
        <ModuleSlot label="USDT wallet" hexId="0xc5d6" accent="usdt" />
        <ModuleSlot label="Fiat rail" hexId="0xd7e8" muted />
      </NodeCard>

      {/* ─── Network Core ─── */}
      <NodeCard
        title="T-0 Network Core"
        subtitle={`flow · ${activeChannel.flowType}`}
        accentColor="cyan"
        hexId="M4IN.0"
        large
        className="absolute left-[22.5%] top-[5%] h-[88%] w-[40%]"
        lit={litNodes.has("network")}
        onClick={() => onNodeClick?.("network")}
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
        className="absolute left-[80%] top-[15%] h-[70%] w-[18%]"
        lit={litNodes.has("pop")}
        onClick={() => onNodeClick?.("pop")}
      >
        <ModuleSlot label="Quote Publish" hexId="0xP001" />
        <ModuleSlot label="ECDSA sign" hexId="0xP002" />
        <ModuleSlot label="PayOut RPC" hexId="0xP003" />
        <ModuleSlot label="Finalize" hexId="0xP004" />
      </NodeCard>

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

interface NodeCardProps {
  title: string;
  subtitle?: string;
  hexId?: string;
  large?: boolean;
  accentColor?: "neutral" | "cyan";
  className?: string;
  lit?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

function NodeCard({
  title,
  subtitle,
  hexId,
  large,
  accentColor = "neutral",
  className,
  lit,
  onClick,
  children,
}: NodeCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border backdrop-blur bg-glass transition-colors duration-700",
        large && "rounded-2xl",
        !lit && accentColor === "cyan" && "border-[rgba(0,212,255,0.18)]",
        !lit && accentColor === "neutral" && "border-hairline",
        lit && "border-[rgba(0,212,255,0.5)]",
        onClick && "cursor-pointer hover:bg-[rgba(255,255,255,0.06)]",
        className,
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={onClick ? `Inspect ${title}` : undefined}
      style={{
        boxShadow: lit
          ? "0 0 26px 0 rgba(0, 212, 255, 0.32), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)"
          : large
            ? "0 0 24px 0 rgba(0, 212, 255, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)"
            : "inset 0 1px 0 0 rgba(255, 255, 255, 0.03)",
        transition: "box-shadow 700ms cubic-bezier(0.16, 1, 0.3, 1), border-color 700ms ease-out",
      }}
    >
      <header
        className={cn(
          "border-b border-hairline",
          large ? "px-4 py-3" : "px-3 py-2",
        )}
      >
        <div className="flex items-center justify-between">
          <h3
            className={cn(
              "font-mono uppercase text-foreground",
              accentColor === "cyan" && "text-accent-cyan",
            )}
            style={{ fontSize: large ? "12px" : "11px", letterSpacing: "0.1em" }}
          >
            {title}
          </h3>
          {hexId && (
            <span
              className={cn(
                "font-mono tabular",
                lit ? "text-accent-cyan" : "text-muted-canvas heartbeat",
              )}
              style={{ fontSize: "9px", letterSpacing: "0.04em" }}
            >
              {hexId}
            </span>
          )}
        </div>
        {subtitle && (
          <p
            className="font-mono text-muted-canvas"
            style={{ fontSize: "10px", letterSpacing: "0.04em" }}
          >
            // {subtitle}
          </p>
        )}
      </header>
      <div
        className={cn(
          "relative flex flex-1 flex-col gap-1.5",
          large ? "px-4 py-3" : "px-3 py-2",
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface ModuleSlotProps {
  label: string;
  hexId?: string;
  accent?: "usdt" | "cyan";
  muted?: boolean;
  compact?: boolean;
}

function ModuleSlot({ label, hexId, accent, muted, compact }: ModuleSlotProps) {
  const heartbeatClass =
    accent === "usdt"
      ? "heartbeat-2"
      : accent === "cyan"
        ? "heartbeat-3"
        : "heartbeat";
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
