import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import React, { useState, useCallback } from "react";
import {
  ofiGetQuoteFn,
  ofiCreatePaymentFn,
  ofiCompleteManualAmlFn,
  ofiSnapshotFn,
  ofiReadModelFn,
  ofiSubmitSettlementFn,
  ofiApprovePaymentQuoteFn,
  triggerManualAmlFn,
  ofiUploadAmlFileFn,
} from "@/lib/t0/t0.functions";
import type { Currency, Payment, Payout } from "@/lib/t0/types";
import type { NetworkEvent } from "@/lib/t0/types";
import type { SettlementState } from "@/lib/t0/settlement";
import { getCurrencyLabel } from "@/lib/t0/currencies";
import { formatQuoteFailure } from "@/lib/t0/quote-message";
import { formatQuoteForDisplay, type QuoteDisplay } from "@/lib/t0/quote-display";
import type { CreatePaymentInput, GetQuoteResult } from "@/lib/t0/network";
import { PanelCard, StatusDot, List } from "@/components/console";
import { OfiManualAmlPanel } from "@/components/ofi/OfiManualAmlPanel";
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
import {
  Wallet,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  PiggyBank,
  Activity,
  Shield,
  FileCheck,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { OfiSidebarMenu } from "@/components/ofi/OfiSidebarMenu";

type OfiSnapshot = {
  payments: Payment[];
  payouts: Payout[];
  availableCurrencies: Currency[];
  settlementState: SettlementState;
  events: NetworkEvent[];
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
  // SSR loader so the console renders with data even before client hydration.
  loader: async () => ofiSnapshotFn(),
  component: OfiPage,
});

function OfiPage() {
  const initial = Route.useLoaderData() as OfiSnapshot;
  const [data, setData] = useState<OfiSnapshot>(initial);
  const router = useRouter();

  // If the URL carries `?aml-required=<pm_id>` (e.g. after creating a
  // payment), land on the Payment-Manual AML tab so the OFI sees the
  // upload row immediately. Recomputed on every render so URL changes
  // (via `router.navigate` after Create Payment) take effect without
  // a full reload. The `key` on <OfiSidebarMenu> forces a remount
  // when the tab changes, which is how Radix Tabs picks up the new
  // defaultValue without race conditions.
  const initialDefaultTab: "quote-management" | "payment-manual-aml" =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("aml-required")
      ? "payment-manual-aml"
      : "quote-management";

  const getQuote = useServerFn(ofiGetQuoteFn);
  const createPayment = useServerFn(ofiCreatePaymentFn);
  const completeManualAml = useServerFn(ofiCompleteManualAmlFn);
  const triggerManualAml = useServerFn(triggerManualAmlFn);
  const snapshot = useServerFn(ofiSnapshotFn);
  const readModel = useServerFn(ofiReadModelFn);
  const submitSettlement = useServerFn(ofiSubmitSettlementFn);
  const approvePaymentQuote = useServerFn(ofiApprovePaymentQuoteFn);
  const uploadAmlFile = useServerFn(ofiUploadAmlFileFn);

  // ── Phase 2: Funding Workspace state ────────────────────────────
  // The funding panel reads the durable read model. We use a fixed
  // counterparty id (1) for the sandbox — production deployments
  // resolve this from authenticated session.
  const COUNTERPARTY_ID = 1;
  const [readModelData, setReadModelData] = useState<{
    latestLimit: {
      providerId: number;
      counterpartyId: number;
      version: bigint;
      payoutLimit: { unscaled: string; exponent: number };
      creditLimit?: { unscaled: string; exponent: number };
      creditUsage?: { unscaled: string; exponent: number };
      reserve?: { unscaled: string; exponent: number };
      receivedAt: number;
    } | null;
    activeProjections: Array<{
      id: string;
      chain: string;
      txHash: string;
      amount: { unscaled: string; exponent: number };
      chainStatus: string;
      accountingStatus: string;
      detectedAt: number;
      lastEventAt: number;
    }>;
  } | null>(null);

  const refreshReadModel = useCallback(async () => {
    const r = (await readModel({ data: { counterpartyId: COUNTERPARTY_ID } })) as {
      latestLimit: {
        providerId: number;
        counterpartyId: number;
        version: bigint;
        payoutLimit: { unscaled: string; exponent: number };
        creditLimit?: { unscaled: string; exponent: number };
        creditUsage?: { unscaled: string; exponent: number };
        reserve?: { unscaled: string; exponent: number };
        receivedAt: number;
      } | null;
      activeProjections: Array<{
        id: string;
        chain: string;
        txHash: string;
        amount: { unscaled: string; exponent: number };
        chainStatus: string;
        accountingStatus: string;
        detectedAt: number;
        lastEventAt: number;
      }>;
    };
    // Serialize BigInt to string for JSON safety.
    setReadModelData({
      latestLimit: r.latestLimit
        ? {
            ...r.latestLimit,
            version: r.latestLimit.version.toString() as unknown as bigint,
          }
        : null,
      activeProjections: r.activeProjections.map((p) => ({
        id: p.id,
        chain: p.chain,
        txHash: p.txHash,
        amount: p.amount,
        chainStatus: p.chainStatus,
        accountingStatus: p.accountingStatus,
        detectedAt: p.detectedAt,
        lastEventAt: p.lastEventAt,
      })),
    });
  }, [readModel]);

  // Auto-load read model on mount.
  React.useEffect(() => {
    void refreshReadModel();
  }, [refreshReadModel]);

  // ── Phase 7 AML scroll-hint ─────────────────────────────────────────
  // When the user lands on /ofi?aml-required=<paymentId> (e.g. after
  // creating a payment), auto-scroll to the matching row and briefly
  // highlight it. The row may be in any of the three sub-sections
  // (trigger / upload / waiting), so probe each known testid.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("aml-required");
    if (!target) return;

    const tryScroll = () => {
      // Prefer the upload row, then the trigger button, then the waiting
      // row. Whichever renders first wins.
      const candidates = [
        `ofi-upload-row-${target}`,
        `ofi-trigger-aml-${target}`,
        `ofi-waiting-row-${target}`,
      ];
      let el: HTMLElement | null = null;
      for (const sel of candidates) {
        el = document.querySelector(`[data-testid="${sel}"]`) as HTMLElement | null;
        if (el) break;
      }
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-accent-cyan");
        setTimeout(() => {
          el!.classList.remove("ring-2", "ring-accent-cyan");
        }, 1500);
        return true;
      }
      return false;
    };
    if (tryScroll()) return;
    // Retry a few times in case the panel hasn't rendered yet (network
    // refresh + state transition is async).
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (tryScroll() || attempts > 20) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [data.payments, router]);

  const [txHashDraft, setTxHashDraft] = useState("");
  const [fundingAmount, setFundingAmount] = useState(5000);
  const [fundingChain, setFundingChain] = useState<"TRON" | "ETHEREUM" | "BSC">("TRON");
  const onFund = () =>
    run(async () => {
      const result = await submitSettlement({
        data: {
          blockchain: fundingChain,
          fromAddress: "TXw1OFI…sandbox",
          toAddress: "TXw2Provider…sandbox",
          usdAmount: fundingAmount,
          ...(txHashDraft ? { txHash: txHashDraft } : {}),
        },
      });
      // After submitting, the sandbox registry tracks it; refresh the
      // read model so the active projections list updates.
      await refreshReadModel();
      await refresh();
      return result;
    });

  const refresh = useCallback(async () => {
    const s = (await snapshot({})) as OfiSnapshot;
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
      // Phase 7 follow-up: every Create Payment must trigger AML.
      // Sandbox currently drives the payment all the way to `confirmed`
      // synchronously, which would leave nothing for the OFI to upload.
      // Re-triggering AML here normalizes the state to `pending_aml` so
      // the OFI can upload the AML file from Payment-Manual AML.
      if ("success" in r) {
        await triggerManualAml({ data: { paymentId: r.success.payment.id } });
      }
      await refresh();
      // Tell the AML panel to surface + highlight this payment so the
      // operator lands on the upload row immediately. The existing
      // useEffect on `data.payments` (and on the `?aml-required=`
      // search param) picks this up and scrolls + ring-highlights.
      if ("success" in r) {
        const params = new URLSearchParams(window.location.search);
        params.set("aml-required", r.success.payment.id);
        router.navigate({
          to: "/ofi",
          search: { "aml-required": r.success.payment.id },
          replace: true,
        });
      }
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

  const onTriggerAml = (p: Payment) =>
    run(async () => {
      await triggerManualAml({ data: { paymentId: p.id } });
      await refresh();
    });

  // OFI uploads the AML document for a pending_aml payment. The
  // server fn validates the file + writes amlFile metadata. The
  // Provider separately approves / rejects / cancels AML.
  const onUploadAmlFile = async (paymentId: string, file: File) => {
    await run(async () => {
      await uploadAmlFile({
        data: {
          paymentId,
          filename: file.name,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
        },
      });
    });
  };

  // ── OFI Payment-Manual AML: Approve/Reject Quote (Last Look) ───────
  const onApproveQuote = (paymentId: string, quoteId: string) =>
    run(async () => {
      await approvePaymentQuote({ data: { paymentId, quoteId } });
      await refresh();
    });

  const onRejectQuote = (paymentId: string, quoteId: string) =>
    run(async () => {
      // Reject quote: mark payment as rejected via manual AML
      await completeManualAml({ data: { paymentId, approved: false } });
      await refresh();
    });

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

        <OfiSidebarMenu
          key={initialDefaultTab}
          defaultTab={initialDefaultTab}
          fundingContent={
            <PanelCard step="04" title="Funding & Capacity">
              <div className="space-y-4" data-testid="funding-panel">
                {readModelData?.latestLimit ? (
                  <div className="grid gap-3 md:grid-cols-4 font-mono text-caption">
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Payout limit
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">
                          ${readModelData.latestLimit.payoutLimit.unscaled}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Credit limit
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">
                          ${readModelData.latestLimit.creditLimit?.unscaled ?? "—"}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Credit usage
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">
                          ${readModelData.latestLimit.creditUsage?.unscaled ?? "—"}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Reserve
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">
                          ${readModelData.latestLimit.reserve?.unscaled ?? "—"}
                        </span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p
                    className="font-mono text-muted-foreground"
                    style={{ fontSize: "12px" }}
                    data-testid="funding-no-limit"
                  >
                    Network has not yet informed us of a payout limit. Capacity is unknown until the
                    first <code>UpdateLimit</code> callback arrives.
                  </p>
                )}

                <div
                  className="font-mono rounded border border-hairline p-3 space-y-3"
                  style={{ fontSize: "12px" }}
                >
                  <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                    Sandbox: simulate a USDT transfer by submitting a txHash. Real deployments
                    should use the OFI Treasury workflow to transfer from a whitelisted wallet.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <Label
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: "11px" }}
                      >
                        Amount (USD)
                      </Label>
                      <Input
                        type="number"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(Number(e.target.value))}
                        className="w-32 font-mono"
                        data-testid="funding-amount"
                      />
                    </div>
                    <div>
                      <Label
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: "11px" }}
                      >
                        Chain
                      </Label>
                      <Select
                        value={fundingChain}
                        onValueChange={(v) => setFundingChain(v as typeof fundingChain)}
                      >
                        <SelectTrigger className="w-32 font-mono" data-testid="funding-chain">
                          <SelectValue aria-label={fundingChain}>{fundingChain}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRON">TRON</SelectItem>
                          <SelectItem value="ETHEREUM">ETHEREUM</SelectItem>
                          <SelectItem value="BSC">BSC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <Label
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: "11px" }}
                      >
                        txHash (optional, auto-generated if blank)
                      </Label>
                      <Input
                        type="text"
                        value={txHashDraft}
                        onChange={(e) => setTxHashDraft(e.target.value)}
                        placeholder="0x…"
                        className="w-full font-mono"
                        data-testid="funding-txhash"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="btn-glow"
                      onClick={onFund}
                      disabled={busy}
                      data-testid="btn-fund"
                    >
                      <PiggyBank className="w-4 h-4" />
                      Submit funding
                    </Button>
                  </div>
                </div>

                {readModelData && readModelData.activeProjections.length > 0 && (
                  <div
                    className="font-mono rounded border border-hairline p-3 space-y-2"
                    data-testid="active-projections"
                  >
                    <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                      Active projections
                    </p>
                    {readModelData.activeProjections.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center gap-2"
                        data-testid={`projection-${p.id}`}
                      >
                        <Activity className="w-3 h-3 text-muted-foreground" />
                        <span className="tabular">{p.txHash.slice(0, 10)}…</span>
                        <span className="text-muted-foreground">{p.chain}</span>
                        <span className="text-muted-foreground">·</span>
                        <span>{p.chainStatus}</span>
                        <span className="text-muted-foreground">·</span>
                        <span>{p.accountingStatus}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="tabular">${p.amount.unscaled}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PanelCard>
          }
          paymentPreSettlementContent={
            <>
              <PanelCard step="05" title="USDT Settlement Transfer">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    OFI initiates a USDT transfer from their whitelisted wallet to the Payout
                    Provider's whitelisted wallet. This is the pre-settlement step (§4) that tops up
                    credit for future payments.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <Label
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: "11px" }}
                      >
                        Amount (USD)
                      </Label>
                      <Input
                        type="number"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(Number(e.target.value))}
                        className="w-32 font-mono"
                      />
                    </div>
                    <div>
                      <Label
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: "11px" }}
                      >
                        Chain
                      </Label>
                      <Select
                        value={fundingChain}
                        onValueChange={(v) => setFundingChain(v as typeof fundingChain)}
                      >
                        <SelectTrigger className="w-32 font-mono">
                          <SelectValue aria-label={fundingChain}>{fundingChain}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRON">TRON</SelectItem>
                          <SelectItem value="ETHEREUM">ETHEREUM</SelectItem>
                          <SelectItem value="BSC">BSC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <Label
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: "11px" }}
                      >
                        txHash (optional)
                      </Label>
                      <Input
                        type="text"
                        value={txHashDraft}
                        onChange={(e) => setTxHashDraft(e.target.value)}
                        placeholder="0x…"
                        className="w-full font-mono"
                      />
                    </div>
                    <Button size="sm" className="btn-glow" onClick={onFund} disabled={busy}>
                      <PiggyBank className="w-4 h-4" />
                      Submit settlement
                    </Button>
                  </div>
                </div>
              </PanelCard>

              <PanelCard step="06" title="Credit Usage & Ledger">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 font-mono text-caption">
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Available credit
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">
                          ${data.settlementState.ofiCredit.available.toLocaleString()}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground" style={{ fontSize: "11px" }}>
                        Reserved credit
                      </p>
                      <p className="text-foreground">
                        <span className="tabular">
                          ${data.settlementState.ofiCredit.reserved.toLocaleString()}
                        </span>
                      </p>
                    </div>
                  </div>

                  {data.settlementState.ledger.length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No ledger entries yet. Submit a USDT settlement to see credit changes.
                    </p>
                  ) : (
                    <List
                      items={[...data.settlementState.ledger].reverse()}
                      emptyMessage="No ledger entries."
                      render={(entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between gap-2 border-b border-hairline py-2 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusDot
                              status={
                                entry.reason === "SETTLEMENT_CREDIT"
                                  ? "confirmed"
                                  : entry.reason === "RESERVATION"
                                    ? "pending"
                                    : entry.reason === "SETTLEMENT"
                                      ? "success"
                                      : "rejected"
                              }
                            />
                            <span className="font-mono tabular text-caption text-foreground truncate">
                              {entry.reason}
                            </span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <span className="font-mono text-caption text-muted-foreground">
                              {entry.account}
                            </span>
                            <span
                              className={`font-mono tabular text-caption ${entry.delta >= 0 ? "text-accent-green" : "text-[#ff453a]"}`}
                            >
                              {entry.delta >= 0 ? "+" : ""}
                              {entry.delta.toLocaleString()}
                            </span>
                            <span className="font-mono text-caption text-muted-foreground">
                              {new Date(entry.at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    />
                  )}
                </div>
              </PanelCard>

              <PanelCard step="06b" title="Credit Usage Notifications (to OFI)">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Notifications from the network regarding credit usage against published quotes,
                    including settlement confirmation and payment settlement details.
                  </p>
                  {data.events.filter(
                    (e): e is NetworkEvent & { type: "CreditUsageNotification" } =>
                      e.type === "CreditUsageNotification" && e.counterparty === "ofi",
                  ).length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No credit usage notifications yet. Submit a settlement or create a payment to
                      trigger the flow.
                    </p>
                  ) : (
                    <List
                      items={data.events
                        .filter(
                          (e): e is NetworkEvent & { type: "CreditUsageNotification" } =>
                            e.type === "CreditUsageNotification" && e.counterparty === "ofi",
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
              <PanelCard step="07" title="Create Payment">
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

              <PanelCard step="08" title="Payment Lifecycle · Callbacks">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Network callbacks: Payout Accepted → Payout Success → Payment Confirmed.
                  </p>
                  {data.events.filter((e) =>
                    ["PayoutAccepted", "PayoutSuccess", "PaymentConfirmed"].includes(e.type),
                  ).length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No lifecycle callbacks yet. Create a payment to trigger the flow.
                    </p>
                  ) : (
                    <List
                      items={data.events
                        .filter((e) =>
                          ["PayoutAccepted", "PayoutSuccess", "PaymentConfirmed"].includes(e.type),
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
                                  : e.type,
                        }))}
                      emptyMessage="No lifecycle callbacks."
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
            <>
              <OfiManualAmlPanel
                payments={data.payments}
                busy={busy}
                onTriggerAml={onTriggerAml}
                onUploadAmlFile={onUploadAmlFile}
              />
              <PanelCard step="09" title="Payout Requests">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Payout requests from the Provider awaiting OFI's "Last Look" quote approval.
                    After the Provider completes manual AML review, the Network sends a refreshed
                    quote for the OFI to approve or reject before payout execution proceeds.
                  </p>
                  {data.payments.filter((p) => p.status === "accepted").length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No payout requests awaiting approval. Create a payment and wait for the
                      Provider to complete AML review.
                    </p>
                  ) : (
                    <List
                      items={data.payments.filter((p) => p.status === "accepted")}
                      emptyMessage="No payout requests awaiting approval."
                      render={(p) => (
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
                                disabled={busy}
                                onClick={() => onApproveQuote(p.id, p.quoteId)}
                                data-testid={`aml-approve-quote-${p.id}`}
                              >
                                <Shield className="w-3.5 h-3.5" />
                                Approve Quote
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                                onClick={() => onRejectQuote(p.id, p.quoteId)}
                                data-testid={`aml-reject-quote-${p.id}`}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject Quote
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
                            <span className="font-mono text-caption text-muted-foreground">
                              Status: {p.status}
                            </span>
                          </div>
                        </div>
                      )}
                    />
                  )}
                </div>
              </PanelCard>

              <PanelCard step="10" title="Quote Confirmations">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Quote confirmations sent by the OFI during the Last Look approval step. These
                    represent the OFI's approval or rejection of the refreshed quote rates after the
                    Provider's manual AML review.
                  </p>
                  {data.events.filter(
                    (e): e is NetworkEvent & { type: "OfiAmlEvent" } => e.type === "OfiAmlEvent",
                  ).length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No quote confirmations yet. Approve or reject a payout request to trigger the
                      Last Look flow.
                    </p>
                  ) : (
                    <List
                      items={data.events
                        .filter(
                          (e): e is NetworkEvent & { type: "OfiAmlEvent" } =>
                            e.type === "OfiAmlEvent",
                        )
                        .map((e) => ({
                          id: `${e.type}-${e.at}`,
                          type: e.type,
                          paymentId: e.paymentId,
                          quoteId: e.quoteId,
                          action: e.action,
                          at: e.at,
                        }))}
                      emptyMessage="No quote confirmations."
                      render={(item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 border-b border-hairline py-2 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusDot
                              status={item.action === "approved" ? "confirmed" : "rejected"}
                            />
                            <span className="font-mono tabular text-caption text-foreground truncate">
                              Payment {item.paymentId.slice(0, 20)}… · Quote{" "}
                              {item.quoteId.slice(0, 16)}…
                            </span>
                            <span
                              className={`font-mono text-caption ${item.action === "approved" ? "text-accent-green" : "text-[#ff453a]"}`}
                            >
                              {item.action === "approved" ? "Approved" : "Rejected"}
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

              <PanelCard step="11" title="Payment Confirmed">
                <div className="space-y-4">
                  <p className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Payments that have been fully confirmed by the Network after successful payout
                    execution. The complete manual AML flow is finished.
                  </p>
                  {data.payments.filter((p) => p.status === "confirmed").length === 0 ? (
                    <p
                      className="font-mono text-muted-foreground text-center py-8"
                      style={{ fontSize: "11px" }}
                    >
                      No confirmed payments yet. Approve a quote, then wait for the Provider to
                      execute the payout.
                    </p>
                  ) : (
                    <List
                      items={data.payments.filter((p) => p.status === "confirmed")}
                      emptyMessage="No confirmed payments."
                      render={(p) => {
                        const payout = data.payouts.find((po) => po.paymentId === p.id);
                        return (
                          <div
                            key={p.id}
                            className="flex flex-col gap-1 border-b border-hairline py-2 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <StatusDot status="confirmed" />
                                <span className="font-mono tabular text-caption text-foreground truncate">
                                  {p.id} · {p.currency} {p.localAmount.toFixed(2)} ·{" "}
                                  {p.beneficiaryRef}
                                </span>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                {payout && (
                                  <span
                                    className={`font-mono text-caption ${payout.status === "success" ? "text-accent-green" : payout.status === "failed" ? "text-[#ff453a]" : "text-muted-foreground"}`}
                                  >
                                    Payout: {payout.status}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-6">
                              <span className="font-mono text-caption text-muted-foreground">
                                Quote: {p.quoteId.slice(0, 16)}…
                              </span>
                              <span className="font-mono text-caption text-muted-foreground">
                                USD: ${p.usdAmount.toLocaleString()}
                              </span>
                              <span className="font-mono text-caption text-accent-green">
                                Status: {p.status}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  )}
                </div>
              </PanelCard>
            </>
          }
        >
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

          <PanelCard step="02" title={`My Payments · ${data.payments.length}`}>
            <List
              items={data.payments}
              testId="payments-list"
              render={(p) => {
                // Find associated payout for this payment
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
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy || p.status === "pending_aml"}
                          onClick={() => onTriggerAml(p)}
                          data-testid={`trigger-aml-${p.id}`}
                        >
                          <Shield className="w-3.5 h-3.5" />
                          Trigger AML
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
                      <span className="font-mono text-caption text-muted-foreground">
                        Ref: {p.beneficiaryRef}
                      </span>
                      {payout && (
                        <span
                          className={`font-mono text-caption ${payout.status === "success" ? "text-accent-green" : payout.status === "failed" ? "text-[#ff453a]" : "text-muted-foreground"}`}
                        >
                          Payout: {payout.status}
                          {payout.fee !== undefined && ` · Fee: $${payout.fee.toFixed(2)}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          </PanelCard>
        </OfiSidebarMenu>

        <p
          className="font-mono text-muted-canvas text-center"
          style={{ fontSize: "11px" }}
          data-testid="ofi-role-footer"
        >
          OFI role · open-access sandbox
        </p>
      </div>
    </SiteLayout>
  );
}
