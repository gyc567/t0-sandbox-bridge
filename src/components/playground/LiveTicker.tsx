import { cn } from "@/lib/utils";

interface LiveTickerProps {
  /** Provider fee label ("5 bps", "10 bps", "indicative") — driven by active channel. */
  fee: string;
  /** Optional override for the USDT volume figure. */
  usdtVolume?: string;
  /** Optional override for active quote count. */
  activeQuotes?: number;
  /** Optional override for settled payments count. */
  settledPayments?: number;
}

/**
 * Sticky strip showing 4 live-feeling KPIs.
 *
 * Phase 2 (static): values are constants on the props with mono + tabular styling.
 * Phase 3+ will replace the static figures with continuous micro-fluctuation
 * (USDT volume ±0.05% random walk every 2-3s, active quotes ±1 every 4-6s,
 * settled payments +1 on payment events, fee crossfade on channel switch).
 */
export function LiveTicker({
  fee,
  usdtVolume = "$8,250,412.18",
  activeQuotes = 12,
  settledPayments = 247,
}: LiveTickerProps) {
  const segments: { label: string; value: React.ReactNode; tone?: "neutral" | "accent" }[] = [
    {
      label: "USDT 24h volume",
      value: <span className="tabular">{usdtVolume}</span>,
      tone: "accent",
    },
    {
      label: "Active quotes",
      value: <span className="tabular">{activeQuotes}</span>,
    },
    {
      label: "Settled payments",
      value: <span className="tabular">{settledPayments}</span>,
    },
    {
      label: "Provider fee",
      value: <span className="tabular">{fee}</span>,
    },
  ];

  return (
    <div
      className="sticky top-[60px] z-10 border-b border-hairline backdrop-blur"
      style={{ backgroundColor: "rgba(10, 14, 26, 0.55)" }}
    >
      <div className="mx-auto flex max-w-7xl items-stretch divide-x divide-[rgba(255,255,255,0.05)]">
        {segments.map((seg, i) => (
          <div key={i} className="flex flex-1 items-baseline gap-3 px-6 py-3">
            <span
              className="font-mono uppercase text-muted-canvas"
              style={{ fontSize: "10px", letterSpacing: "0.12em" }}
            >
              {seg.label}
            </span>
            <span
              className={cn(
                "font-mono text-foreground",
                seg.tone === "accent" && "text-accent-cyan",
              )}
              style={{ fontSize: "13px" }}
            >
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
