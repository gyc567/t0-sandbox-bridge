import { cn } from "@/lib/utils";

interface NodeCardProps {
  title: string;
  subtitle?: string;
  hexId?: string;
  /** Larger padding + radius; intended for the central "core" node. */
  large?: boolean;
  accentColor?: "neutral" | "cyan";
  className?: string;
  lit?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * A bordered glassy card representing one of the 4 network nodes
 * (OFI, Orchestrator, POP, Pay-In). Lit state animates the border
 * and box-shadow to indicate activity.
 */
export function NodeCard({
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
        className={cn("relative flex flex-1 flex-col gap-1.5", large ? "px-4 py-3" : "px-3 py-2")}
      >
        {children}
      </div>
    </div>
  );
}
