import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import React, { useState, useCallback } from "react";
import {
  acceptPaymentFn,
  notifyCreditFn,
  notifyUsdtFn,
  processPayoutFn,
  publishQuoteFn,
  snapshotFn,
} from "@/lib/t0/t0.functions";
import {
  signRequest,
  generatePrivateKey,
  derivePublicKey,
  buildAuthHeaders,
  toCurl,
  snapshotToCSV,
  csvFilename,
} from "@/lib/t0";
import type { Currency, Payment, Payout, Quote, NetworkEvent, VolumeBand } from "@/lib/t0/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Copy, RefreshCw, KeyRound, Terminal } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { cn } from "@/lib/utils";

type Snapshot = { quotes: Quote[]; payments: Payment[]; payouts: Payout[]; events: NetworkEvent[] };

export const Route = createFileRoute("/sandbox")({
  head: () => ({
    meta: [
      { title: "Console — T-0 Sandbox Bridge" },
      {
        name: "description",
        content:
          "Interactive T-0 provider console: publish quotes, simulate settlement, process payouts.",
      },
    ],
  }),
  loader: async () => snapshotFn(),
  component: SandboxPage,
});

const BANDS: VolumeBand[] = [1_000, 5_000, 10_000, 25_000, 250_000, 1_000_000];
const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "CNH", "MXN", "BRL", "NGN", "INR"];

function SandboxPage() {
  const data = Route.useLoaderData() as Snapshot;
  const router = useRouter();
  const refresh = () => router.invalidate();

  const publishQuote = useServerFn(publishQuoteFn);
  const acceptPayment = useServerFn(acceptPaymentFn);
  const processPayout = useServerFn(processPayoutFn);
  const notifyUsdt = useServerFn(notifyUsdtFn);
  const notifyCredit = useServerFn(notifyCreditFn);

  const [currency, setCurrency] = useState<Currency>("EUR");
  const [band, setBand] = useState<VolumeBand>(1_000);
  const [rate, setRate] = useState(0.92);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleExportCSV = useCallback(() => {
    const csv = snapshotToCSV(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename();
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <SiteLayout>
      <div className="container container-7xl py-section space-y-6">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
          <div className="space-y-2">
            <p className="eyebrow">CONSOLE · MOCK MODE</p>
            <h1 className="text-display-md font-semibold tracking-tight text-foreground">
              Payout Provider Sandbox
            </h1>
            <p className="font-mono text-muted-foreground" style={{ fontSize: "12px" }}>
              flows mirror docs.t-0.network REST contract
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={cn("w-4 h-4", busy && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        {/* Step 1: Publish quote */}
        <PanelCard step="01" title="Publish Quote">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="w-32 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(band)} onValueChange={(v) => setBand(Number(v) as VolumeBand)}>
              <SelectTrigger className="w-36 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANDS.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    ${b.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.0001"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-28 font-mono"
            />
            <Button
              size="sm"
              className="btn-glow"
              disabled={busy}
              onClick={() => run(() => publishQuote({ data: { currency, band, rate } }))}
            >
              Publish quote
            </Button>
          </div>
        </PanelCard>

        {/* Step 2: Inbound notifications */}
        <PanelCard step="02" title="Inbound Notifications">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() =>
                  notifyUsdt({
                    data: { txHash: `0x${Math.random().toString(16).slice(2, 10)}`, usd: band },
                  }),
                )
              }
            >
              Simulate USDT settlement
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() => notifyCredit({ data: { counterparty: "ofi-demo", used: band } }))
              }
            >
              Simulate credit usage
            </Button>
          </div>
        </PanelCard>

        {/* Steps 3 & 4 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelCard step="03" title={`Quotes · ${data.quotes.length}`}>
            <List
              items={data.quotes}
              render={(q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-2 border-b border-hairline py-2 last:border-0"
                >
                  <span className="font-mono tabular text-caption text-foreground">
                    {q.id} · {q.currency} · ${q.band.toLocaleString()}{" "}
                    <span className="text-accent-cyan">@ {q.rate}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        acceptPayment({
                          data: { quoteId: q.id, beneficiaryRef: `BEN-${Date.now()}` },
                        }),
                      )
                    }
                  >
                    Accept
                  </Button>
                </div>
              )}
            />
          </PanelCard>

          <PanelCard step="04" title={`Payments · ${data.payments.length}`}>
            <List
              items={data.payments}
              render={(p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 border-b border-hairline py-2 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={p.status} />
                    <span className="font-mono tabular text-caption text-foreground truncate">
                      {p.id} · {p.currency} {p.localAmount.toFixed(2)}
                    </span>
                  </div>
                  <span className="flex gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || p.status !== "accepted"}
                      onClick={() => run(() => processPayout({ data: { paymentId: p.id } }))}
                    >
                      Pay
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy || p.status !== "accepted"}
                      onClick={() =>
                        run(() => processPayout({ data: { paymentId: p.id, fail: true } }))
                      }
                    >
                      Fail
                    </Button>
                  </span>
                </div>
              )}
            />
          </PanelCard>
        </div>

        {/* Steps 5 & 6 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelCard step="05" title={`Payouts · ${data.payouts.length}`}>
            <List
              items={data.payouts}
              render={(p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 border-b border-hairline py-2 last:border-0"
                >
                  <StatusDot status={p.status} />
                  <span className="font-mono tabular text-caption text-foreground">{p.id}</span>
                  {p.reason && (
                    <span className="font-mono text-caption text-muted-foreground">
                      ({p.reason})
                    </span>
                  )}
                </div>
              )}
            />
          </PanelCard>

          <PanelCard step="06" title={`Event Log · ${data.events.length}`}>
            <div className="max-h-64 overflow-auto font-mono text-fine-print space-y-0.5">
              {data.events.length === 0 ? (
                <p className="text-muted-foreground">No events yet.</p>
              ) : (
                data.events.map((e, i) => (
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
        </div>

        {/* API tester */}
        <APITester />
      </div>
    </SiteLayout>
  );
}

// ─── Panel card wrapper (glass, numbered) ─────────────────────────────

function PanelCard({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-hairline bg-glass backdrop-blur-xl">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-hairline">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-accent-cyan"
            style={{ fontSize: "11px", letterSpacing: "0.1em" }}
          >
            {step}
          </span>
          <CardTitle
            className="font-mono uppercase text-foreground"
            style={{ fontSize: "12px", letterSpacing: "0.08em" }}
          >
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

// ─── Status indicator ─────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const tone =
    status === "success" || status === "confirmed"
      ? { bg: "#34c759", glow: "rgba(52,199,89,0.5)" }
      : status === "failed"
        ? { bg: "#ff453a", glow: "rgba(255,69,58,0.5)" }
        : status === "accepted"
          ? { bg: "#00d4ff", glow: "rgba(0,212,255,0.5)" }
          : { bg: "#a1a1a6", glow: "rgba(161,161,166,0.3)" };
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: tone.bg, boxShadow: `0 0 6px ${tone.glow}` }}
      aria-hidden
    />
  );
}

// ─── List helper ──────────────────────────────────────────────────────

function List<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  if (items.length === 0)
    return (
      <p className="font-mono text-muted-foreground" style={{ fontSize: "12px" }}>
        Empty
      </p>
    );
  return <div>{items.map(render)}</div>;
}

// ─── API tester ───────────────────────────────────────────────────────

function APITester() {
  const [privateKey, setPrivateKey] = useState(() => generatePrivateKey());
  const [body, setBody] = useState('{"action":"test"}');
  const [url, setUrl] = useState("https://api.t-0.network/v1/quote");
  const [curl, setCurl] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [hash, setHash] = useState("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleSign = useCallback(async () => {
    setLoading(true);
    try {
      const result = await signRequest(body, privateKey);
      const curlCmd = toCurl(url, body, result);
      setCurl(curlCmd);
      setHeaders(buildAuthHeaders(result));
      setHash(result.hash);
      setSignature(result.signature);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [body, privateKey, url]);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  }, []);

  const handleGenerateKey = useCallback(() => {
    setPrivateKey(generatePrivateKey());
  }, []);

  return (
    <Card className="border-hairline bg-glass backdrop-blur-xl">
      <CardHeader className="border-b border-hairline">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent-cyan" />
          <CardTitle
            className="font-mono uppercase text-foreground"
            style={{ fontSize: "12px", letterSpacing: "0.08em" }}
          >
            API Tester
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-2">
          <Label
            htmlFor="privateKey"
            className="font-mono text-muted-foreground"
            style={{ fontSize: "11px" }}
          >
            <KeyRound className="inline w-3 h-3 mr-1" />
            Private Key (Test Only)
          </Label>
          <div className="flex gap-2">
            <Input
              id="privateKey"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="font-mono text-caption"
            />
            <Button variant="outline" size="sm" onClick={handleGenerateKey}>
              Generate
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <div className="space-y-2">
            <Label
              htmlFor="url"
              className="font-mono text-muted-foreground"
              style={{ fontSize: "11px" }}
            >
              URL
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-caption"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="pubkey"
              className="font-mono text-muted-foreground"
              style={{ fontSize: "11px" }}
            >
              Public Key
            </Label>
            <Input
              id="pubkey"
              value={derivePublicKey(privateKey)}
              readOnly
              className="font-mono text-caption text-muted-foreground"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="body"
            className="font-mono text-muted-foreground"
            style={{ fontSize: "11px" }}
          >
            Request Body
          </Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="font-mono text-caption"
          />
        </div>

        <Button onClick={handleSign} disabled={loading} className="btn-glow">
          {loading ? "Signing…" : "Sign Request"}
        </Button>

        {signature && (
          <div className="space-y-4 border-t border-hairline pt-4">
            <div className="space-y-2">
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                Headers
              </Label>
              <div className="mono-block p-3 font-mono text-caption space-y-1">
                {Object.entries(headers).map(([k, v]) => (
                  <div key={k} className="break-all">
                    <span className="text-accent-cyan">{k}:</span>{" "}
                    <span className="text-foreground">
                      {v.slice(0, 48)}
                      {v.length > 48 ? "…" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                  Keccak-256 Hash
                </Label>
                <div
                  className="mono-block cursor-pointer p-3 font-mono text-fine-print break-all transition-colors hover:border-accent-cyan"
                  onClick={() => copy(hash, "hash")}
                >
                  {copied === "hash" ? <span className="text-success">✓ copied</span> : hash}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                  Signature
                </Label>
                <div
                  className="mono-block cursor-pointer p-3 font-mono text-fine-print break-all transition-colors hover:border-accent-cyan"
                  onClick={() => copy(signature, "sig")}
                >
                  {copied === "sig" ? (
                    <span className="text-success">✓ copied</span>
                  ) : (
                    signature.slice(0, 66) + "…"
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                cURL Command
              </Label>
              <div className="flex gap-2">
                <Textarea value={curl} readOnly rows={4} className="font-mono text-fine-print" />
                <Button variant="outline" size="icon" onClick={() => copy(curl, "curl")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
