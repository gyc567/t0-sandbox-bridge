import {
  AUTH_STEPS,
  AUTH_HEADERS,
  SIGN_REQUEST_SNIPPET,
  REPLAY_WINDOW_MS,
} from "@/data/integration/auth";

/**
 * Section 4 — ECDSA signing flow. Spec §2.
 * Left: 4 steps. Right: real TypeScript signRequest snippet + header table.
 */
export function FlowAuthFlow() {
  return (
    <section className="container container-7xl py-section">
      <div className="space-y-3">
        <p className="eyebrow">AUTHENTICATION</p>
        <h2 className="text-display-md font-semibold tracking-tight text-foreground">
          ECDSA signatures, independently verifiable
        </h2>
        <p className="max-w-2xl text-tagline text-muted-foreground">
          Every request is signed with a secp256k1 private key and Keccak-256 hashed, with a{" "}
          {REPLAY_WINDOW_MS / 1000}-second replay window. Public keys travel in HTTP headers — no
          pre-shared handshake required.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.3fr] items-start">
        {/* Left: 4 steps + headers table */}
        <div className="space-y-6">
          <div className="space-y-4">
            {AUTH_STEPS.map((s) => (
              <div key={s.index} className="flex items-start gap-4">
                <span
                  className="font-mono text-accent-cyan shrink-0"
                  style={{ fontSize: "12px", letterSpacing: "0.1em" }}
                >
                  {s.index}
                </span>
                <div>
                  <div className="font-mono text-foreground" style={{ fontSize: "13px" }}>
                    {s.title}
                  </div>
                  <div className="font-mono text-muted-canvas" style={{ fontSize: "11px" }}>
                    {s.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[var(--radius-lg)] border border-hairline bg-glass p-4">
            <div
              className="font-mono uppercase text-muted-canvas pb-2"
              style={{ fontSize: "10px", letterSpacing: "0.12em" }}
            >
              HTTP HEADERS
            </div>
            <table className="w-full">
              <tbody>
                {AUTH_HEADERS.map((h) => (
                  <tr key={h.name} className="align-top">
                    <td
                      className="font-mono text-accent-cyan pr-3 pb-2"
                      style={{ fontSize: "11px" }}
                    >
                      {h.name}
                    </td>
                    <td
                      className="font-mono text-muted-foreground pb-2"
                      style={{ fontSize: "11px" }}
                    >
                      <div>{h.format}</div>
                      <div className="text-muted-canvas" style={{ fontSize: "10px" }}>
                        {h.description}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: TypeScript code block */}
        <div className="mono-block overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span
              className="ml-2 font-mono text-muted-canvas"
              style={{ fontSize: "10px", letterSpacing: "0.08em" }}
            >
              sign-request.ts · @/lib/t0
            </span>
          </div>
          <pre
            className="overflow-x-auto p-4 font-mono leading-relaxed"
            style={{ fontSize: "11.5px" }}
          >
            <code>{colorizeSignSnippet(SIGN_REQUEST_SNIPPET)}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function colorizeSignSnippet(src: string) {
  // Minimal syntax coloring aligned with mono-block style.
  // Comments muted-canvas, strings accent-usdt, keywords accent-violet, headers accent-cyan.
  const lines = src.split("\n");
  return lines.map((line, i) => {
    let html = escapeHtml(line);
    html = html.replace(/(\/\/.*$)/g, '<span class="text-muted-canvas">$1</span>');
    html = html.replace(/\b(const|return)\b/g, '<span class="text-accent-violet">$1</span>');
    html = html.replace(/('X-[A-Za-z-]+')/g, '<span class="text-accent-cyan">$1</span>');
    html = html.replace(
      /('0x[^']*'|'[A-Za-z][A-Za-z0-9-]*')/g,
      '<span class="text-accent-usdt">$1</span>',
    );
    return (
      <span key={i}>
        <span dangerouslySetInnerHTML={{ __html: html }} />
        {"\n"}
      </span>
    );
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
