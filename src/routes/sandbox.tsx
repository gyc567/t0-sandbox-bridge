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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <header className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-lead font-semibold">T-0 Payout Provider Sandbox</h1>
          <p className="text-caption text-muted-foreground">Mock mode — flows mirror docs.t-0.network REST contract.</p>
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

      <Card>
        <CardHeader>
          <CardTitle>1. Publish Quote</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(band)} onValueChange={(v) => setBand(Number(v) as VolumeBand)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANDS.map((b) => (
                  <SelectItem key={b} value={String(b)}>${b.toLocaleString()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" step="0.0001" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-28" />
            <Button size="sm" disabled={busy} onClick={() => run(() => publishQuote({ data: { currency, band, rate } }))}>
              Publish quote
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Inbound notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => notifyUsdt({ data: { txHash: `0x${Math.random().toString(16).slice(2, 10)}`, usd: band } }))}>
              Simulate USDT settlement
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => notifyCredit({ data: { counterparty: "ofi-demo", used: band } }))}>
              Simulate credit usage
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>3. Quotes ({data.quotes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <List items={data.quotes} render={(q) => (
              <div key={q.id} className="flex items-center justify-between text-caption border-b py-1">
                <span>{q.id} · {q.currency} · ${q.band.toLocaleString()} @ {q.rate}</span>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => acceptPayment({ data: { quoteId: q.id, beneficiaryRef: `BEN-${Date.now()}` } }))}>
                  Accept payment
                </Button>
              </div>
            )} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Payments ({data.payments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <List items={data.payments} render={(p) => (
              <div key={p.id} className="flex items-center justify-between text-caption border-b py-1">
                <span>{p.id} · {p.status} · {p.currency} {p.localAmount.toFixed(2)}</span>
                <span className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busy || p.status !== "accepted"} onClick={() => run(() => processPayout({ data: { paymentId: p.id } }))}>
                    Payout success
                  </Button>
                  <Button variant="destructive" size="sm" disabled={busy || p.status !== "accepted"} onClick={() => run(() => processPayout({ data: { paymentId: p.id, fail: true } }))}>
                    Payout fail
                  </Button>
                </span>
              </div>
            )} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>5. Payouts ({data.payouts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <List items={data.payouts} render={(p) => (
              <div key={p.id} className="text-caption border-b py-1">
                <Badge variant={p.status === "success" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge>
                {" "}{p.id}{p.reason ? ` (${p.reason})` : ""}
              </div>
            )} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event log ({data.events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto font-mono text-fine-print">
              {data.events.map((e, i) => <div key={i} className="border-b py-1 text-muted-foreground">{new Date(e.at).toISOString()} · {e.type}</div>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <APITester />
    </div>
  );
}

function List<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  if (items.length === 0) return <p className="text-caption text-muted-foreground">Empty</p>;
  return <div>{items.map(render)}</div>;
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
              className="font-mono text-caption"
            />
            <Button variant="outline" size="sm" onClick={handleGenerateKey}>Generate</Button>
          </div>
          <p className="text-fine-print text-muted-foreground">Test key - do not use in production</p>
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
            className="font-mono text-caption"
          />
        </div>

        <Button onClick={handleSign} disabled={loading}>
          {loading ? "Signing..." : "Sign Request"}
        </Button>

        {signature && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Headers</Label>
              <div className="bg-muted rounded p-2 font-mono text-caption space-y-1">
                {Object.entries(headers).map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground">{k}:</span> {v.slice(0, 40)}...</div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Keccak-256 Hash</Label>
              <div className="bg-muted rounded p-2 font-mono text-caption break-all">{hash}</div>
            </div>

            <div className="space-y-2">
              <Label>cURL Command</Label>
              <div className="flex gap-2">
                <Textarea value={curl} readOnly rows={4} className="font-mono text-caption" />
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