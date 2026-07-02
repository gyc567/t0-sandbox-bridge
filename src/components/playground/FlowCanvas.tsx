import { cn } from "@/lib/utils";
import type { Channel } from "@/data/channels";

interface FlowCanvasProps {
  activeChannel: Channel;
}

/**
 * Static three-node topology rendering.
 *
 * Layout:
 *   OFI (left)  ─┬─►  Network Core (center, large)  ◄─┬─  POP (right)
 *                 └──── USDT transfer channel ────────┘  (dashed ochre)
 *
 * Each node has internal sub-modules with hex IDs that idle-flicker (heartbeat)
 * to suggest live state. The USDT channel at the bottom pulses with a soft
 * ochre animated dash offset.
 *
 * Phase 2: pure topology, no packet motion. Phase 3 wires packet trails to
 * the scroll-driven animation engine.
 */
export function FlowCanvas({ activeChannel }: FlowCanvasProps) {
  return (
    <div
      className="relative mx-auto w-full max-w-7xl"
      style={{ height: "min(640px, 70vh)", minHeight: "520px" }}
      aria-label="T-0 protocol topology"
    >
      {/* ─── Connection layer (SVG, behind nodes) ─── */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
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

        {/* USDT channel — bottom, ochre dashed */}
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

        {/* Tiny arrow markers (chevrons) on connection lines */}
        <polygon points="345,180 353,180 349,184" fill="rgba(255,255,255,0.3)" />
        <polygon points="655,180 647,180 651,184" fill="rgba(255,255,255,0.3)" />
      </svg>

      {/* ─── OFI Node (left third) ─── */}
      <NodeCard
        title="OFI"
        subtitle="Originator"
        accentColor="neutral"
        hexId="0x7a3f"
        className="absolute left-[2%] top-[15%] h-[70%] w-[18%]"
      >
        <ModuleSlot label="Quote book" hexId="0xa1b2" />
        <ModuleSlot label="Payment init" hexId="0xb3c4" />
        <ModuleSlot label="USDT wallet" hexId="0xc5d6" accent="usdt" />
        <ModuleSlot label="Fiat rail" hexId="0xd7e8" muted />
      </NodeCard>

      {/* ─── Network Core (center, larger) ─── */}
      <NodeCard
        title="T-0 Network Core"
        subtitle={`flow · ${activeChannel.flowType}`}
        accentColor="cyan"
        hexId="M4IN.0"
        large
        className="absolute left-[22.5%] top-[5%] h-[88%] w-[40%]"
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
      </NodeCard>

      {/* ─── POP Node (right third) ─── */}
      <NodeCard
        title="POP"
        subtitle="Payout Provider"
        accentColor="neutral"
        hexId="0x9b1c"
        className="absolute left-[80%] top-[15%] h-[70%] w-[18%]"
      >
        <ModuleSlot label="Quote Publish" hexId="0xP001" />
        <ModuleSlot label="ECDSA sign" hexId="0xP002" />
        <ModuleSlot label="PayOut RPC" hexId="0xP003" />
        <ModuleSlot label="Finalize" hexId="0xP004" />
      </NodeCard>

      {/* ─── Local keyframes for the heartbeat + USDT channel shimmer ─── */}
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
  children: React.ReactNode;
}

function NodeCard({ title, subtitle, hexId, large, accentColor = "neutral", className, children }: NodeCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-hairline backdrop-blur",
        "bg-glass",
        large && "rounded-2xl",
        accentColor === "cyan" && "border-[rgba(0,212,255,0.18)]",
        className,
      )}
      style={{
        boxShadow: large
          ? "0 0 24px 0 rgba(0, 212, 255, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.04)"
          : "inset 0 1px 0 0 rgba(255, 255, 255, 0.03)",
      }}
    >
      <header className={cn("border-b border-hairline", large ? "px-4 py-3" : "px-3 py-2")}>
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
              className="font-mono tabular text-muted-canvas heartbeat"
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
      <div className={cn("flex flex-1 flex-col gap-1.5", large ? "px-4 py-3" : "px-3 py-2")}>
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
