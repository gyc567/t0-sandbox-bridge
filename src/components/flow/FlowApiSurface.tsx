import { useState } from "react";
import { RPC_METHODS, type RpcMethod } from "@/data/integration/rpc-methods";

type ServiceFilter = "ALL" | RpcMethod["service"];

/**
 * Section 3 — RPC method catalog. 9 methods across 2 services.
 * Spec §3 + §4.
 */
export function FlowApiSurface() {
  const [filter, setFilter] = useState<ServiceFilter>("ALL");

  const filtered = filter === "ALL" ? RPC_METHODS : RPC_METHODS.filter((m) => m.service === filter);

  const counts = {
    ofi: RPC_METHODS.filter((m) => m.service === "NetworkService").length,
    provider: RPC_METHODS.filter((m) => m.service === "ProviderService").length,
  };

  return (
    <section className="container container-7xl py-section">
      <div className="space-y-3">
        <p className="eyebrow">API SURFACE</p>
        <h2 className="text-display-md font-semibold tracking-tight text-foreground">
          Connect RPC · {RPC_METHODS.length} 个方法
        </h2>
        <p className="max-w-2xl text-tagline text-muted-foreground">
          BAXS 调用 {counts.ofi} 个 NetworkService 方法作为 OFI，实现 {counts.provider} 个
          ProviderService 回调作为 Provider（其中 UpdateQuote 是 streaming 推送报价）。
          所有方法均支持 gRPC 和 REST/JSON 双编码。
        </p>
      </div>

      <div className="mt-8 flex items-center gap-2">
        <FilterPill
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
          label={`All · ${RPC_METHODS.length}`}
        />
        <FilterPill
          active={filter === "NetworkService"}
          onClick={() => setFilter("NetworkService")}
          label={`NetworkService · ${counts.ofi}`}
          accent="cyan"
        />
        <FilterPill
          active={filter === "ProviderService"}
          onClick={() => setFilter("ProviderService")}
          label={`ProviderService · ${counts.provider}`}
          accent="violet"
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <FlowApiMethodCard key={m.name} method={m} />
        ))}
      </div>
    </section>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  accent = "cyan",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  accent?: "cyan" | "violet";
}) {
  const activeBg = accent === "cyan" ? "rgba(0,212,255,0.08)" : "rgba(124,92,255,0.08)";
  const activeColor = accent === "cyan" ? "text-accent-cyan" : "text-accent-violet";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 font-mono transition-all duration-200 ${
        active
          ? `${activeColor} border-hairline`
          : "text-secondary-canvas border-hairline hover:text-foreground"
      }`}
      style={{
        fontSize: "11px",
        letterSpacing: "0.06em",
        background: active ? activeBg : "transparent",
      }}
    >
      {label}
    </button>
  );
}

function FlowApiMethodCard({ method }: { method: RpcMethod }) {
  const accentColor = method.accent === "cyan" ? "text-accent-cyan" : "text-accent-violet";
  const accentBg = method.accent === "cyan" ? "rgba(0,212,255,0.06)" : "rgba(124,92,255,0.06)";
  const accentBorder = method.accent === "cyan" ? "rgba(0,212,255,0.2)" : "rgba(124,92,255,0.2)";

  return (
    <article
      className="rounded-[var(--radius-lg)] border border-hairline bg-glass backdrop-blur-xl p-5 card-hover"
      style={{ borderColor: accentBorder, background: accentBg }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`font-mono uppercase ${accentColor}`}
          style={{ fontSize: "13px", letterSpacing: "0.06em" }}
        >
          {method.name}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-sm border border-hairline px-1.5 py-0.5 font-mono text-muted-canvas"
            style={{ fontSize: "9px", letterSpacing: "0.08em" }}
          >
            {method.mode}
          </span>
          <span
            className={`rounded-sm border px-1.5 py-0.5 font-mono ${accentColor}`}
            style={{
              fontSize: "9px",
              letterSpacing: "0.08em",
              borderColor: accentBorder,
            }}
          >
            {method.role}
          </span>
        </div>
      </div>
      <p className="mt-3 text-caption text-muted-foreground leading-relaxed">
        {method.description}
      </p>
      <div
        className="mt-4 flex items-center gap-3 font-mono text-muted-canvas"
        style={{ fontSize: "9px", letterSpacing: "0.08em" }}
      >
        <span>
          <span className="text-muted-foreground">IDX</span> {method.idempotency}
        </span>
        <span>·</span>
        <span>{method.service}</span>
      </div>
      {method.failureReasons && method.failureReasons.length > 0 && (
        <details className="mt-4 group">
          <summary
            className="cursor-pointer font-mono text-muted-canvas hover:text-foreground"
            style={{ fontSize: "10px", letterSpacing: "0.06em" }}
          >
            ▸ Failure reasons ({method.failureReasons.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {method.failureReasons.map((r) => (
              <li
                key={r.code}
                className="font-mono text-muted-foreground"
                style={{ fontSize: "10px" }}
              >
                <span className="text-muted-canvas">{r.code}</span> — {r.description}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
