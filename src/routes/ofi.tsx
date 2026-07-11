import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import React, { useState, useCallback } from "react";
import {
  ofiGetQuoteFn,
  ofiCreatePaymentFn,
  ofiCompleteManualAmlFn,
  ofiSnapshotFn,
} from "@/lib/t0/t0.functions";
import { logoutFn, getSessionFn } from "@/lib/auth/auth.functions";
import type { Currency, Payment } from "@/lib/t0/types";
import { getCurrencyLabel } from "@/lib/t0/currencies";
import { formatQuoteFailure } from "@/lib/t0/quote-message";
import { formatQuoteForDisplay, type QuoteDisplay } from "@/lib/t0/quote-display";
import type { CreatePaymentInput, GetQuoteResult } from "@/lib/t0/network";
import { PanelCard, StatusDot, List } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogOut, Wallet, Send, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { QuoteManagementTabs } from "@/components/ofi/QuoteManagementTabs";

type OfiSnapshot = {
  payments: Payment[];
  availableCurrencies: Currency[];
};

export const Route = createFileRoute("/ofi")({
  head: () => ({
    meta: [
      { title: "OFI Console — T-0 Sandbox Bridge" },
      {
        name: "description",
        content: "BAXS OFI console: get quotes, create payments, finalize payouts.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { session } = await getSessionFn();
    if (!session) throw redirect({ to: "/login", search: { redirect: "/ofi" } });
    if (session.role !== "ofi") throw redirect({ to: "/provider" });
    return { session };
  },
  // SSR loader so the console renders with data even before client hydration.
  loader: async () => ofiSnapshotFn(),
  component: OfiPage,
});

function OfiPage() {
  const ctx = Route.useRouteContext() as { session: { role: "ofi"; userId: string } };
  const initial = Route.useLoaderData() as OfiSnapshot;
  const [data, setData] = useState<OfiSnapshot>(initial);
  const router = useRouter();

  const getQuote = useServerFn(ofiGetQuoteFn);
  const createPayment = useServerFn(ofiCreatePaymentFn);
  const completeManualAml = useServerFn(ofiCompleteManualAmlFn);
  const snapshot = useServerFn(ofiSnapshotFn);
  const logout = useServerFn(logoutFn);

  const refresh = useCallback(async () => {
    const s = await snapshot({});
    setData(s);
  }, [snapshot]);

  const [currency, setCurrency] = useState<Currency>("EUR");
  const [usdAmount, setUsdAmount] = useState(1000);
  const [clientId, setClientId] = useState(() => `baxs_${Date.now()}`);
  const [beneficiaryRef, setBeneficiaryRef] = useState("BEN-DEMO-001");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteSummary, setQuoteSummary] = useState<GetQuoteResult | null>(null);
  const [quoteDisplay, setQuoteDisplay] = useState<QuoteDisplay | null>(null);
  const [paymentResult, setPaymentResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [errorActionHref, setErrorActionHref] = useState<string | null>(null);
  const [errorActionLabel, setErrorActionLabel] = useState<string | null>(null);
  const resetError = useCallback(() => {
    setError(null);
    setErrorTitle(null);
    setErrorDetail(null);
    setErrorActionHref(null);
    setErrorActionLabel(null);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    resetError();
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const onGetQuote = () =>
    run(async () => {
      const r = await getQuote({ data: { usdAmount, currency } });
      setQuoteSummary(r);
      if ("success" in r) {
        setQuoteId(r.success.quote.id);
        // Off-ramp pair display (Sell USDT → Buy <local>) with rate, payout,
        // settlement, and a static expiration readout. The raw JSON below
        // stays for support; this row is what operators actually read.
        setQuoteDisplay(formatQuoteForDisplay(r.success, Date.now()));
        resetError();
      } else {
        // Quote lookup failed — clear any prior id and surface a friendly
        // explanation. The raw JSON stays in `quote-summary` (useful for
        // support tickets); the friendly text takes the main error slot.
        setQuoteId(null);
        setQuoteDisplay(null);
        const msg = formatQuoteFailure(r.failure.reason);
        setErrorTitle(msg.title);
        setErrorDetail(msg.detail);
        setError(`${msg.title}. ${msg.detail}`);
        // For the most common demo case (no quote published yet) point
        // the operator straight at the Provider console.
        if (
          r.failure.reason === "REASON_NO_QUOTE_AVAILABLE" ||
          r.failure.reason === "REASON_LIMIT_EXCEEDED"
        ) {
          setErrorActionHref("/provider");
          setErrorActionLabel("Open Provider console to publish a quote");
        }
      }
    });

  const onCreatePayment = () =>
    run(async () => {
      if (!quoteId) {
        setError("Run Get Quote first.");
        return;
      }
      const input: CreatePaymentInput = {
        paymentClientId: clientId,
        quoteId,
        beneficiaryRef,
        usdAmount,
      };
      const r = await createPayment({ data: input });
      setPaymentResult(r);
      await refresh();
    });

  const onApprove = (p: Payment) =>
    run(async () => {
      await completeManualAml({ data: { paymentId: p.id, approved: true } });
      await refresh();
    });

  const onReject = (p: Payment) =>
    run(async () => {
      await completeManualAml({ data: { paymentId: p.id, approved: false } });
      await refresh();
    });

  const onLogout = async () => {
    await logout({});
    await router.invalidate();
    router.navigate({ to: "/login" });
  };

  const currencies: Currency[] = data.availableCurrencies;

  return (
    <SiteLayout>
      <div className="container container-7xl py-section space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
          <div className="space-y-2">
            <p className="eyebrow">CONSOLE · OFI ROLE</p>
            <h1 className="text-display-md font-semibold tracking-tight text-foreground">
              OFI Console
            </h1>
            <p className="font-mono text-muted-foreground" style={{ fontSize: "12px" }}>
              Get quotes → Create payments → Manual AML
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

        {error && (
          <div
            className="font-mono rounded border border-[#ff453a]/40 bg-[#ff453a]/10 p-3 space-y-1"
            style={{ fontSize: "12px" }}
            data-testid="ofi-error"
          >
            <p className="text-[#ff453a] font-semibold">{errorTitle ?? error}</p>
            {errorTitle && <p className="text-[#ff453a]/90">{errorDetail ?? error}</p>}
            {errorActionHref && (
              <p>
                <a href={errorActionHref} className="text-[#00d4ff] underline underline-offset-2">
                  {errorActionLabel ?? "Open Provider console"}
                </a>
              </p>
            )}
          </div>
        )}

        <QuoteManagementTabs>
          <PanelCard step="01" title="Get Quote">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                  USD amount
                </Label>
                <Input
                  type="number"
                  value={usdAmount}
                  onChange={(e) => setUsdAmount(Number(e.target.value))}
                  className="w-32 font-mono"
                />
              </div>
              <div>
                <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                  Target currency
                </Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger className="w-40 font-mono" data-testid="currency-trigger">
                    <SelectValue aria-label={currency}>
                      {`${currency} · ${getCurrencyLabel(currency)}`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c} value={c} data-testid={`currency-option-${c}`}>
                        {`${c} · ${getCurrencyLabel(c)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="btn-glow"
                disabled={busy}
                onClick={onGetQuote}
                data-testid="btn-quote"
              >
                <Wallet className="w-4 h-4" />
                Get Quote
              </Button>
            </div>
            {quoteSummary && (
              <div
                className="mono-block mt-4 space-y-3 border border-hairline rounded p-3"
                data-testid="quote-display"
              >
                {quoteDisplay && (
                  <div className="grid gap-3 md:grid-cols-3 font-mono text-caption">
                    {/* Pair + rate — the headline of the row. */}
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Pair
                      </p>
                      <p className="text-foreground font-semibold">{quoteDisplay.pair}</p>
                      <p className="text-muted-foreground">
                        Rate&nbsp;
                        <span className="tabular text-foreground">{quoteDisplay.rate}</span>
                      </p>
                    </div>
                    {/* Payout + settlement — what the OFI's customer actually receives. */}
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Payout · Settlement
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">{quoteDisplay.payout}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="tabular">{quoteDisplay.settlement}</span>
                      </p>
                    </div>
                    {/* Expiration — static read-out, no live timer (KISS). */}
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Expires in
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">{quoteDisplay.expiresInSeconds}s</span>
                        <span className="text-muted-foreground">
                          {" "}
                          (at {new Date(quoteDisplay.expiresAt).toISOString().slice(11, 19)} UTC)
                        </span>
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-muted-foreground font-mono" style={{ fontSize: "10px" }}>
                  Raw payload (support tickets):
                </p>
                <pre className="font-mono text-caption overflow-auto" data-testid="quote-summary">
                  {JSON.stringify(quoteSummary, null, 2)}
                </pre>
              </div>
            )}
          </PanelCard>
        </QuoteManagementTabs>

        <PanelCard step="02" title="Create Payment">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                paymentClientId (idempotency key)
              </Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="font-mono text-caption"
                data-testid="client-id"
              />
            </div>
            <div>
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                Beneficiary ref
              </Label>
              <Input
                value={beneficiaryRef}
                onChange={(e) => setBeneficiaryRef(e.target.value)}
                className="font-mono text-caption"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                quoteId
              </Label>
              <Input
                value={quoteId ?? ""}
                onChange={(e) => setQuoteId(e.target.value || null)}
                className="font-mono text-caption"
                placeholder="Run Get Quote first"
                data-testid="quote-id"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="btn-glow mt-4"
            disabled={busy || !quoteId}
            onClick={onCreatePayment}
            data-testid="btn-create"
          >
            <Send className="w-4 h-4" />
            Create Payment
          </Button>
          {paymentResult !== null && (
            <Textarea
              readOnly
              rows={5}
              className="mt-4 font-mono text-fine-print"
              value={JSON.stringify(paymentResult, null, 2)}
              data-testid="payment-result"
            />
          )}
        </PanelCard>

        <PanelCard step="03" title={`My Payments · ${data.payments.length}`}>
          <List
            items={data.payments}
            testId="payments-list"
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
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || p.status === "confirmed"}
                    onClick={() => onApprove(p)}
                    data-testid={`approve-${p.id}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy || p.status === "rejected"}
                    onClick={() => onReject(p)}
                    data-testid={`reject-${p.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
            )}
          />
        </PanelCard>

        <p className="font-mono text-muted-canvas text-center" style={{ fontSize: "11px" }}>
          Signed in as ofi user {ctx.session.userId}
        </p>
      </div>
    </SiteLayout>
  );
}
