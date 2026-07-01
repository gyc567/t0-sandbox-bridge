import { useEffect, useState } from "react";

/**
 * UTC clock that ticks once per second.
 *
 * Format: `2026-07-02 13:24:51Z` — spatial separators between date / time / zone.
 * Mono font, tabular figures, dimmed secondary tone.
 *
 * Client-only: SSR renders a stable placeholder to avoid hydration mismatch.
 */
function formatUtc(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  );
}

export function LiveClock() {
  // SSR-safe initial value — re-render at hydration.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Placeholder before hydration: dimmed dashes.
  const text = now ? formatUtc(now) : "---- -- -- --:--:--Z";

  return (
    <span
      className="font-mono tabular text-secondary-canvas"
      style={{ fontSize: "11px", letterSpacing: "0.04em" }}
      aria-label="Coordinated universal time"
      aria-live="off"
    >
      {text}
    </span>
  );
}
