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
import { signRequest, generatePrivateKey, derivePublicKey, buildAuthHeaders, toCurl, snapshotToCSV, csvFilename } from "@/lib/t0";
import type { Currency, Payment, Payout, Quote, NetworkEvent, VolumeBand } from "@/lib/t0/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Copy, RefreshCw } from "lucide-react";

type Snapshot = { quotes: Quote[]; payments: Payment[]; payouts: Payout[]; events: NetworkEvent[] };

export const Route = createFileRoute("/sandbox")({
  head: () => ({ meta: [{ title: "T-0 Sandbox Console" }] }),
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
    try { await fn(); await refresh(); } finally { setBusy(false); }
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
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">T-0 Payout Provider Sandbox</h1>
          <p className="text-sm text-muted-foreground">Mock mode — flows mirror docs.t-0.network REST contract.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </header>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">1. Publish Quote</h2>
        <div className="flex flex-wrap gap-2">
          <select className="border rounded px-2 py-1" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="border rounded px-2 py-1" value={band} onChange={(e) => setBand(Number(e.target.value) as VolumeBand)}>
            {BANDS.map((b) => <option key={b} value={b}>${b.toLocaleString()}</option>)}
          </select>
          <input className="border rounded px-2 py-1 w-28" type="number" step="0.0001" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          <button disabled={busy} className="rounded bg-primary text-primary-foreground px-3 py-1 text-sm" onClick={() => run(() => publishQuote({ data: { currency, band, rate } }))}>Publish</button>
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">2. Inbound notifications</h2>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="text-sm border rounded px-3 py-1" onClick={() => run(() => notifyUsdt({ data: { txHash: `0x${Math.random().toString(16).slice(2, 10)}`, usd: band } }))}>Simulate USDT settlement</button>
          <button disabled={busy} className="text-sm border rounded px-3 py-1" onClick={() => run(() => notifyCredit({ data: { counterparty: "ofi-demo", used: band } }))}>Simulate credit usage</button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`3. Quotes (${data.quotes.length})`}>
          <List items={data.quotes} render={(q) => (
            <div key={q.id} className="flex items-center justify-between text-sm border-b py-1">
              <span>{q.id} · {q.currency} · ${q.band.toLocaleString()} @ {q.rate}</span>
              <button disabled={busy} className="text-xs border rounded px-2 py-0.5" onClick={() => run(() => acceptPayment({ data: { quoteId: q.id, beneficiaryRef: `BEN-${Date.now()}` } }))}>Accept payment</button>
            </div>
          )} />
        </Panel>

        <Panel title={`4. Payments (${data.payments.length})`}>
          <List items={data.payments} render={(p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b py-1">
              <span>{p.id} · {p.status} · {p.currency} {p.localAmount.toFixed(2)}</span>
              <span className="flex gap-2">
                <button disabled={busy || p.status !== "accepted"} className="text-xs border rounded px-2 py-0.5" onClick={() => run(() => processPayout({ data: { paymentId: p.id } }))}>Payout success</button>
                <button disabled={busy || p.status !== "accepted"} className="text-xs border rounded px-2 py-0.5" onClick={() => run(() => processPayout({ data: { paymentId: p.id, fail: true } }))}>Payout fail</button>
              </span>
            </div>
          )} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`5. Payouts (${data.payouts.length})`}>
          <List items={data.payouts} render={(p) => (
            <div key={p.id} className="text-sm border-b py-1">
              <Badge variant={p.status === "success" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge>
              {" "}{p.id}{p.reason ? ` (${p.reason})` : ""}
            </div>
          )} />
        </Panel>

        <Panel title={`Event log (${data.events.length})`}>
          <div className="max-h-48 overflow-auto font-mono text-xs">
            {data.events.map((e, i) => <div key={i} className="border-b py-1">{new Date(e.at).toISOString()} · {e.type}</div>)}
          </div>
        </Panel>
      </div>

      <APITester />
    </div>
  );
}

function List<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Empty</p>;
  return <div>{items.map(render)}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4 space-y-2">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function APITester() {
  const [privateKey, setPrivateKey] = useState(() => generatePrivateKey());
  const [body, setBody] = useState('{"action":"test"}');
  const [url, setUrl] = useState("https://api.t-0.network/v1/quote");
  const [curl, setCurl] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [hash, setHash] = useState("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);

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

  const handleCopyCurl = useCallback(() => {
    navigator.clipboard.writeText(curl);
  }, [curl]);

  const handleGenerateKey = useCallback(() => {
    setPrivateKey(generatePrivateKey());
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Tester</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="privateKey">Private Key (Test Only)</Label>
          <div className="flex gap-2">
            <Input
              id="privateKey"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={handleGenerateKey}>Generate</Button>
          </div>
          <p className="text-xs text-muted-foreground">Test key - do not use in production</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="url">URL</Label>
          <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">Request Body</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
        </div>

        <Button onClick={handleSign} disabled={loading}>
          {loading ? "Signing..." : "Sign Request"}
        </Button>

        {signature && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Headers</Label>
              <div className="bg-muted rounded p-2 font-mono text-xs space-y-1">
                {Object.entries(headers).map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground">{k}:</span> {v.slice(0, 40)}...</div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Keccak-256 Hash</Label>
              <div className="bg-muted rounded p-2 font-mono text-xs break-all">{hash}</div>
            </div>

            <div className="space-y-2">
              <Label>cURL Command</Label>
              <div className="flex gap-2">
                <Textarea value={curl} readOnly rows={4} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopyCurl}>
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
