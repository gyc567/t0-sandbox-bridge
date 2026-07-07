// StatusDot — colored dot for payment/payout statuses.

import React from "react";

export interface StatusDotProps {
  status: string;
}

export function StatusDot({ status }: StatusDotProps) {
  const tone =
    status === "success" || status === "confirmed"
      ? { bg: "#34c759", glow: "rgba(52,199,89,0.5)" }
      : status === "failed"
        ? { bg: "#ff453a", glow: "rgba(255,69,58,0.5)" }
        : status === "accepted"
          ? { bg: "#00d4ff", glow: "rgba(0,212,255,0.5)" }
          : status === "rejected"
            ? { bg: "#ff9f0a", glow: "rgba(255,159,10,0.5)" }
            : { bg: "#a1a1a6", glow: "rgba(161,161,166,0.3)" };
  return (
    <span
      data-testid={`status-${status}`}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: tone.bg, boxShadow: `0 0 6px ${tone.glow}` }}
      aria-hidden
    />
  );
}