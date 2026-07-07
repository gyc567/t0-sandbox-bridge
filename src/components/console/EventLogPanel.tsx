// EventLogPanel — scrolling list of network events.

import React from "react";
import { PanelCard } from "./PanelCard";
import type { NetworkEvent } from "@/lib/t0/types";

export interface EventLogPanelProps {
  events: NetworkEvent[];
  step?: string;
  title?: string;
  testId?: string;
}

export function EventLogPanel({
  events,
  step = "06",
  title,
  testId = "event-log",
}: EventLogPanelProps) {
  const heading = title ?? `Event Log · ${events.length}`;
  return (
    <PanelCard step={step} title={heading}>
      <div
        className="max-h-64 overflow-auto font-mono text-fine-print space-y-0.5"
        data-testid={testId}
      >
        {events.length === 0 ? (
          <p className="text-muted-foreground">No events yet.</p>
        ) : (
          events.map((e, i) => (
            <div key={i} className="flex gap-2 py-1">
              <span className="text-muted-canvas shrink-0">
                {new Date(e.at).toISOString().slice(11, 19)}
              </span>
              <span className="text-accent-cyan">{e.type}</span>
            </div>
          ))
        )}
      </div>
    </PanelCard>
  );
}