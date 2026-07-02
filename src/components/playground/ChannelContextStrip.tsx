import { cn } from "@/lib/utils";
import type { Channel } from "@/data/channels";

interface ChannelContextStripProps {
  channel: Channel;
  className?: string;
}

/**
 * Compact info card describing the currently selected channel.
 * Shown anchored at the bottom of the FlowCanvas area.
 *
 * Phase 4 extracts it from the monolithic playground.tsx layout so
 * Phase 5+ can optionally animate its content (crossfade) when the
 * channel changes.
 */
export function ChannelContextStrip({ channel, className }: ChannelContextStripProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-hairline px-5 py-3 backdrop-blur",
        className,
      )}
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
          // CHANNEL · {channel.label.toUpperCase()}
        </span>
        <span
          className="font-mono text-muted-canvas"
          style={{ fontSize: "10px", letterSpacing: "0.04em" }}
        >
          flow · {channel.flowType}
        </span>
      </div>

      <p
        className="font-mono text-secondary-canvas"
        style={{ fontSize: "12px", lineHeight: 1.5 }}
      >
        {channel.context}
      </p>

      <p
        className="font-mono tabular text-muted-canvas"
        style={{ fontSize: "10px", letterSpacing: "0.04em" }}
      >
        {channel.summary}
      </p>
    </div>
  );
}
