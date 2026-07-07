import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import React, { useState, useCallback } from "react";
import {
  publishQuoteFn,
  notifyUsdtFn,
  notifyCreditFn,
  acceptPaymentFn,
  processPayoutFn,
  snapshotFn,
} from "@/lib/t0/t0.functions";
import { logoutFn, getSessionFn } from "@/lib/auth/auth.functions";
import type { Currency, Payment, Payout, Quote, VolumeBand } from "@/lib/t0/types";
import type { NetworkEvent } from "@/lib/t0/types";
import { PanelCard, StatusDot, List, EventLogPanel } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogOut, RefreshCw } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";

type ProviderSnapshot = {
  quotes: Quote[];
  payments: Payment[];
  payouts: Payout[];
  events: NetworkEvent[];
};

export const Route = createFileRoute("/provider")({
  head: () => ({
    meta: [
      { title: "Provider Console — T-0 Sandbox Bridge" },
      {
        name: "description",
        content: "BAXS Provider console: publish quotes, simulate settlement, process payouts.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { session } = await getSessionFn();
    if (!session) throw redirect({ to: "/login", search: { redirect: "/provider" } });
    if (session.role !== "provider") throw redirect({ to: "/ofi" });
    return { session };
  },
  // SSR loader so the console renders with data even before client hydration.
  loader: async () => snapshotFn(),
  component: ProviderPage,
});

const BANDS: VolumeBand[] = [1_000, 5_000, 10_000, 25_000, 250_000, 1_000_000];
const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "CNH", "MXN", "BRL", "NGN", "INR"];

function ProviderPage() {
  const ctx = Route.useRouteContext() as { session: { role: "provider"; userId: string } };
  const initial = Route.useLoaderData() as ProviderSnapshot;
  const [data, setData] = useState<ProviderSnapshot>(initial);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const publishQuote = useServerFn(publishQuoteFn);
  const acceptPayment = useServerFn(acceptPaymentFn);
  const processPayout = useServerFn(processPayoutFn);
  const notifyUsdt = useServerFn(notifyUsdtFn);
  const notifyCredit = useServerFn(notifyCreditFn);
  const snapshot = useServerFn(snapshotFn);
  const logout = useServerFn(logoutFn);

  const refresh = useCallback(async () => {
    const s = await snapshot({});
    setData(s);
  }, [snapshot]);

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

  const onLogout = async () => {
    await logout({});
    await router.invalidate();
    router.navigate({ to: "/login" });
  };

  return (
    <SiteLayout>
      <div className="container container-7xl py-section space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
          <div className="space-y-2">
            <p className="eyebrow">CONSOLE · PROVIDER ROLE</p>
            <h1 className="text-display-md font-semibold tracking-tight text-foreground">
              Provider Console
            </h1>
            <p className="font-mono text-muted-foreground" style={{ fontSize: "12px" }}>
              Publish quotes · Accept payments · Execute payouts
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} data-testid="logout">
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </header>

        <PanelCard step="01" title="Publish Quote">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                Currency
              </Label>
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
            </div>
            <div>
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                Band
              </Label>
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
            </div>
            <div>
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                Rate
              </Label>
              <Input
                type="number"
                step="0.0001"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-28 font-mono"
              />
            </div>
            <Button
              size="sm"
              className="btn-glow"
              disabled={busy}
              onClick={() => run(() => publishQuote({ data: { currency, band, rate } }))}
              data-testid="publish-quote"
            >
              Publish quote
            </Button>
          </div>
        </PanelCard>

        <PanelCard step="02" title="Inbound Notifications">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() =>
                  notifyUsdt({
                    data: {
                      txHash: `0x${Math.random().toString(16).slice(2, 10)}`,
                      usd: band,
                    },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelCard step="03" title={`Quotes · ${data.quotes.length}`}>
            <List
              items={data.quotes}
              testId="provider-quotes"
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
                    data-testid={`accept-${q.id}`}
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
              testId="provider-payments"
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
                      data-testid={`pay-${p.id}`}
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
                      data-testid={`fail-${p.id}`}
                    >
                      Fail
                    </Button>
                  </span>
                </div>
              )}
            />
          </PanelCard>
        </div>

        <PanelCard step="05" title={`Payouts · ${data.payouts.length}`}>
          <List
            items={data.payouts}
            testId="provider-payouts"
            render={(p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 border-b border-hairline py-2 last:border-0"
              >
                <StatusDot status={p.status} />
                <span className="font-mono tabular text-caption text-foreground">{p.id}</span>
                {p.reason && (
                  <span className="font-mono text-caption text-muted-foreground">({p.reason})</span>
                )}
              </div>
            )}
          />
        </PanelCard>

        <EventLogPanel events={data.events} />

        <p className="font-mono text-muted-canvas text-center" style={{ fontSize: "11px" }}>
          Signed in as provider {ctx.session.userId}
        </p>
      </div>
    </SiteLayout>
  );
}
