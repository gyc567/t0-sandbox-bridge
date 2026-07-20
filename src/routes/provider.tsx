import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import React, { useState, useCallback } from "react";
import {
  publishQuoteFn,
  notifyUsdtFn,
  notifyCreditFn,
  requestPayoutFn,
  snapshotFn,
  providerCounterpartiesFn,
  callbackInboxStateFn,
  providerLedgerFn,
  reviewAmlFileFn,
  downloadAmlFileFn,
  requestRefundFn,
} from "@/lib/t0/t0.functions";
import { ManualAmlPanel } from "@/components/provider/ManualAmlPanel";
import { ProviderReFundPanel } from "@/components/provider/ProviderReFundPanel";
// (auth removed — sandbox console is open access; no login required)
import type { Currency, Payment, Payout, Quote, VolumeBand } from "@/lib/t0/types";
import { base64ToBytes } from "@/lib/t0/aml-blob";
import type { NetworkEvent } from "@/lib/t0/types";
import type { LimitSnapshot, LedgerEntry } from "@/lib/t0/read-model/types";
import { SUPPORTED_CURRENCIES } from "@/lib/t0/currencies";
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
import { RefreshCw, Wallet, ScrollText, Layers, Send, CheckCircle2, Download } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { ProviderSidebarMenu } from "@/components/provider/ProviderSidebarMenu";

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
  // SSR loader so the console renders with data even before client hydration.
  loader: async () => snapshotFn(),
  component: ProviderPage,
});

const BANDS: VolumeBand[] = [1_000, 5_000, 10_000, 25_000, 250_000, 1_000_000];
const CURRENCIES: Currency[] = SUPPORTED_CURRENCIES.map((c) => c.code);

function ProviderPage() {
  const initial = Route.useLoaderData() as ProviderSnapshot;
  const [data, setData] = useState<ProviderSnapshot>(initial);
  const [loading, setLoading] = useState(false);

  const publishQuote = useServerFn(publishQuoteFn);
  const processPayout = useServerFn(requestPayoutFn);
  const notifyUsdt = useServerFn(notifyUsdtFn);
  const notifyCredit = useServerFn(notifyCreditFn);
  const snapshot = useServerFn(snapshotFn);
  const reviewAmlFile = useServerFn(reviewAmlFileFn);
  const downloadAmlFile = useServerFn(downloadAmlFileFn);

  // ── Phase 3: Provider read-model views ─────────────────────────────
  // Provider role is providerId 0 in this sandbox. Production would
  // resolve from auth.
  const PROVIDER_ID = 0;
  const counterpartiesReadModel = useServerFn(providerCounterpartiesFn);
  const inboxStateReadModel = useServerFn(callbackInboxStateFn);
  const ledgerReadModel = useServerFn(providerLedgerFn);

  type CounterpartyRow = { counterpartyId: number; latest: LimitSnapshot | null };
  const [counterparties, setCounterparties] = useState<CounterpartyRow[]>([]);
  const [inboxCounts, setInboxCounts] = useState<{
    processed: number;
    failed: number;
    pending: number;
    total: number;
  }>({
    processed: 0,
    failed: 0,
    pending: 0,
    total: 0,
  });
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState<number>(0);

  const refreshReadModels = useCallback(async () => {
    const cp = (await counterpartiesReadModel({ data: { providerId: PROVIDER_ID } })) as {
      counterparties: CounterpartyRow[];
    };
    setCounterparties(cp.counterparties);
    const inbox = (await inboxStateReadModel({})) as typeof inboxCounts;
    setInboxCounts(inbox);
    if (ledgerAccountFilter > 0) {
      const lg = (await ledgerReadModel({ data: { accountOwnerId: ledgerAccountFilter } })) as {
        entries: LedgerEntry[];
      };
      setLedgerEntries(lg.entries);
    } else {
      setLedgerEntries([]);
    }
  }, [counterpartiesReadModel, inboxStateReadModel, ledgerReadModel, ledgerAccountFilter]);

  React.useEffect(() => {
    void refreshReadModels();
  }, [refreshReadModels]);

  const refresh = useCallback(async () => {
    const s = await snapshot({});
    setData(s);
    await refreshReadModels();
  }, [snapshot, refreshReadModels]);

  const [currency, setCurrency] = useState<Currency>("EUR");
  const [band, setBand] = useState<VolumeBand>(1_000);
  const [rate, setRate] = useState(0.92);
  const [busy, setBusy] = useState(false);

  const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      const result = await fn();
      await refresh();
      return result;
    } catch (e) {
      console.error("[Provider]", e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const onExecutePayout = (paymentId: string) => run(() => processPayout({ data: { paymentId } }));

  const onReviewAml = async (
    paymentId: string,
    decision: "approve" | "reject",
    recipientCheckStatus: "approved" | "rejected",
    reason?: "aml_denied" | "aml_not_needed",
    recipientCheckNote?: string,
  ): Promise<void> => {
    await run(async () => {
      await reviewAmlFile({
        data: { paymentId, decision, reason, recipientCheckStatus, recipientCheckNote },
      });
    });
  };

  const onDownloadAmlFile = async (paymentId: string): Promise<void> => {
    await run(async () => {
      const result = await downloadAmlFile({ data: { paymentId } });
      const bytes = base64ToBytes(result.bytesBase64);
      const blob = new Blob([new Uint8Array(bytes)], { type: result.fileType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  const onRefundAml = async (paymentId: string): Promise<void> => {
    await run(async () => {
      await requestRefundFn({ data: { paymentId } });
    });
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
          </div>
        </header>

        <ProviderSidebarMenu
          quoteManagementContent={
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
                    <SelectContent
                      position="popper"
                      side="bottom"
                      sideOffset={4}
                      avoidCollisions={false}
                      className="z-[999]"
                    >
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
                  <Select
                    value={String(band)}
                    onValueChange={(v) => setBand(Number(v) as VolumeBand)}
                  >
                    <SelectTrigger className="w-36 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      side="bottom"
                      sideOffset={4}
                      avoidCollisions={false}
                      className="z-[999]"
                    >
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
          }
          paymentPreSettlementContent={
            <>
              <PanelCard step="02" title="Credit Usage Notifications (to Payout Provider)">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Notifications from the network regarding credit usage and settlement
                    confirmations for this provider. Includes settlement confirmations and payment
                    settlement details with quote context.
                  </p>
                  {data.events.filter(
                    (e): e is NetworkEvent & { type: "CreditUsageNotification" } =>
                      e.type === "CreditUsageNotification" && e.counterparty === "provider",
                  ).length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No credit usage notifications yet. Confirm a settlement or execute a payout to
                      trigger the flow.
                    </p>
                  ) : (
                    <List
                      items={data.events
                        .filter(
                          (e): e is NetworkEvent & { type: "CreditUsageNotification" } =>
                            e.type === "CreditUsageNotification" && e.counterparty === "provider",
                        )
                        .map((e) => ({
                          id: `${e.counterparty}-${e.at}`,
                          counterparty: e.counterparty,
                          used: e.used,
                          paymentId: e.paymentId,
                          quoteId: e.quoteId,
                          rate: e.rate,
                          expiresAt: e.expiresAt,
                          at: e.at,
                        }))}
                      emptyMessage="No credit usage notifications."
                      render={(item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-1 border-b border-hairline py-2 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <StatusDot status="received" />
                              <span className="font-mono tabular text-caption text-foreground truncate">
                                {item.paymentId
                                  ? `Payment ${item.paymentId.slice(0, 20)}…`
                                  : `Credit used: ${item.used.toLocaleString()}`}
                              </span>
                            </div>
                            <span className="font-mono text-caption text-muted-foreground shrink-0">
                              {new Date(item.at).toLocaleString()}
                            </span>
                          </div>
                          {item.quoteId && (
                            <div className="flex flex-wrap gap-2 pl-6">
                              <span className="font-mono text-caption text-muted-foreground">
                                Quote: {item.quoteId.slice(0, 16)}…
                              </span>
                              {item.rate !== undefined && (
                                <span className="font-mono text-caption text-muted-foreground">
                                  Rate: {item.rate.toFixed(4)}
                                </span>
                              )}
                              {item.expiresAt !== undefined && (
                                <span className="font-mono text-caption text-muted-foreground">
                                  Valid until: {new Date(item.expiresAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    />
                  )}
                </div>
              </PanelCard>
            </>
          }
          paymentContinuedContent={
            <>
              <PanelCard step="03" title="Payout Execution">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Payments accepted by the OFI that are ready for payout execution. Click "Execute
                    Payout" to trigger the Provider payout flow (Payout Accepted → Payout Success →
                    Payment Confirmed).
                  </p>
                  {data.payments.length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No payments yet. Wait for an OFI to create a payment against your published
                      quote.
                    </p>
                  ) : (
                    <List
                      items={data.payments}
                      emptyMessage="No payments."
                      render={(p) => {
                        const payout = data.payouts.find((po) => po.paymentId === p.id);
                        return (
                          <div
                            key={p.id}
                            className="flex flex-col gap-1 border-b border-hairline py-2 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <StatusDot status={p.status} />
                                <span className="font-mono tabular text-caption text-foreground truncate">
                                  {p.id} · {p.currency} {p.localAmount.toFixed(2)} ·{" "}
                                  {p.beneficiaryRef}
                                </span>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busy || p.status !== "accepted"}
                                  onClick={() => onExecutePayout(p.id)}
                                  data-testid={`payout-${p.id}`}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Execute Payout
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-6">
                              <span className="font-mono text-caption text-muted-foreground">
                                Quote: {p.quoteId.slice(0, 16)}…
                              </span>
                              <span className="font-mono text-caption text-muted-foreground">
                                USD: ${p.usdAmount.toLocaleString()}
                              </span>
                              {payout && (
                                <span
                                  className={`font-mono text-caption ${payout.status === "success" ? "text-accent-green" : payout.status === "failed" ? "text-[#ff453a]" : "text-muted-foreground"}`}
                                >
                                  Payout: {payout.status}
                                </span>
                              )}
                            </div>
                            {p.recipientInfo && (
                              <div className="ml-6 rounded border border-hairline p-2 space-y-1">
                                <p className="font-mono text-muted-foreground" style={{ fontSize: "10px" }}>
                                  Recipient info
                                </p>
                                {p.recipientInfo.fallback ? (
                                  <>
                                    <p className="font-mono text-caption">
                                      {p.recipientInfo.fallback.accountHolderName} · {p.recipientInfo.fallback.accountNumber}
                                    </p>
                                    {(p.recipientInfo.fallback.bankName || p.recipientInfo.fallback.bankCode) && (
                                      <p className="font-mono text-caption text-muted-foreground">
                                        {p.recipientInfo.fallback.bankName}
                                        {p.recipientInfo.fallback.bankName && p.recipientInfo.fallback.bankCode && " · "}
                                        {p.recipientInfo.fallback.bankCode}
                                      </p>
                                    )}
                                  </>
                                ) : p.recipientInfo.ivms101 ? (
                                  <p className="font-mono text-caption">
                                    IVMS101: {p.recipientInfo.ivms101.name.primary}
                                  </p>
                                ) : null}
                              </div>
                            )}
                            {!p.recipientInfo && (
                              <div className="ml-6">
                                <p className="font-mono text-muted-foreground" style={{ fontSize: "10px" }}>
                                  No recipient info (legacy payment)
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                  )}
                </div>
              </PanelCard>

              <PanelCard step="03b" title={`Payouts · ${data.payouts.length}`}>
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    All payouts executed by the Provider. Each payout is linked to a payment.
                  </p>
                  {data.payouts.length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No payouts yet. Execute a payout to see it here.
                    </p>
                  ) : (
                    <List
                      items={data.payouts}
                      emptyMessage="No payouts."
                      render={(po) => (
                        <div
                          key={po.id}
                          className="flex items-center justify-between gap-2 border-b border-hairline py-2 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusDot status={po.status} />
                            <span className="font-mono tabular text-caption text-foreground truncate">
                              {po.id} · Payment {po.paymentId.slice(0, 20)}…
                            </span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {po.reason && (
                              <span className="font-mono text-caption text-[#ff453a]">
                                {po.reason}
                              </span>
                            )}
                            <span className="font-mono text-caption text-muted-foreground">
                              {new Date(po.updatedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    />
                  )}
                </div>
              </PanelCard>

              <PanelCard step="04" title="Payout & Credit Notifications">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Event log for Payout Accepted, Payout Success, Payment Confirmed, and Credit
                    Usage Notification callbacks received from the network.
                  </p>
                  {data.events.filter((e) =>
                    [
                      "PayoutAccepted",
                      "PayoutSuccess",
                      "PaymentConfirmed",
                      "CreditUsageNotification",
                    ].includes(e.type),
                  ).length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No payout or credit notifications yet. Execute a payout to trigger the flow.
                    </p>
                  ) : (
                    <List
                      items={data.events
                        .filter((e) =>
                          [
                            "PayoutAccepted",
                            "PayoutSuccess",
                            "PaymentConfirmed",
                            "CreditUsageNotification",
                          ].includes(e.type),
                        )
                        .map((e) => ({
                          id: `${e.type}-${e.at}`,
                          type: e.type,
                          at: e.at,
                          detail:
                            e.type === "PayoutAccepted"
                              ? `Payout ${e.payoutId} accepted`
                              : e.type === "PayoutSuccess"
                                ? `Payout ${e.payoutId} succeeded`
                                : e.type === "PaymentConfirmed"
                                  ? `Payment ${e.paymentId} confirmed`
                                  : e.type === "CreditUsageNotification"
                                    ? `Credit used: ${e.used.toLocaleString()}`
                                    : e.type,
                        }))}
                      emptyMessage="No notifications."
                      render={(item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 border-b border-hairline py-2 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusDot
                              status={
                                item.type === "PayoutSuccess" || item.type === "PaymentConfirmed"
                                  ? "confirmed"
                                  : item.type === "PayoutAccepted"
                                    ? "pending"
                                    : "received"
                              }
                            />
                            <span className="font-mono tabular text-caption text-foreground truncate">
                              {item.detail}
                            </span>
                          </div>
                          <span className="font-mono text-caption text-muted-foreground shrink-0">
                            {new Date(item.at).toLocaleString()}
                          </span>
                        </div>
                      )}
                    />
                  )}
                </div>
              </PanelCard>
            </>
          }
          paymentManualAmlContent={
            <ManualAmlPanel
              payments={data.payments}
              busy={busy}
              onReviewAml={onReviewAml}
              onDownloadAml={onDownloadAmlFile}
            />
          }
          paymentRefundContent={
            <ProviderReFundPanel
              payments={data.payments.filter((p) => p.status === "rejected")}
              busy={busy}
              onRefundAml={onRefundAml}
            />
          }
        />

        <EventLogPanel events={data.events} />

        <p
          className="font-mono text-muted-canvas text-center"
          style={{ fontSize: "11px" }}
          data-testid="provider-role-footer"
        >
          Provider role · open-access sandbox
        </p>
      </div>
    </SiteLayout>
  );
}
