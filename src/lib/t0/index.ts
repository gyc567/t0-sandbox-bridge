import { HttpT0Client, MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { HttpOfiT0Client, MockOfiT0Client } from "./ofi-client";
import type { OfiT0Client } from "./ofi-client";
import { SettlementRegistry } from "./settlement";

// ── Provider → Network push client (unchanged) ─────────────────────
const ngrokUrl = process.env.T0_NGROK_URL;
const apiKey = process.env.T0_API_KEY;

export const t0Client =
  ngrokUrl && apiKey ? new HttpT0Client(ngrokUrl, apiKey) : new MockT0Client();

// ── OFI quote client (OFI pulls pay-out quote from agtpay /api/v1/quotes/network)
const quoteModeRaw = process.env.T0_QUOTE_CLIENT_MODE ?? "mock";
const quoteMode = quoteModeRaw.toLowerCase();
const ofiBaseUrl = process.env.T0_OFI_API_BASE_URL ?? "https://api.agtpay.xyz";
const ofiApiKey = process.env.T0_OFI_API_KEY ?? "";
const ofiTimeoutMs = Number(process.env.T0_OFI_TIMEOUT_MS ?? 5000);
const ofiPaymentMethod = process.env.T0_OFI_PAYMENT_METHOD ?? "PAYMENT_METHOD_TYPE_SEPA";

/**
 * Audit §6.1 A6 — fail-fast env validation.
 *
 * Snapshot of one OFI config tuple. Tests construct one explicitly so they
 * don't have to mutate the live process env (which would race other tests).
 */
export interface OfiEnvConfig {
  mode: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

/**
 * Read OFI env from process.env. Public so it can be passed to validateOfiEnv
 * for unit testing. Always returns normalized values.
 */
export function readOfiEnv(): OfiEnvConfig {
  return {
    mode: (process.env.T0_QUOTE_CLIENT_MODE ?? "mock").toLowerCase(),
    baseUrl: process.env.T0_OFI_API_BASE_URL ?? "https://api.agtpay.xyz",
    apiKey: process.env.T0_OFI_API_KEY ?? "",
    timeoutMs: Number(process.env.T0_OFI_TIMEOUT_MS ?? 5000),
  };
}

/**
 * Audit §6.1 A6 — fail-fast env validation.
 *
 * Validation runs once at module load, before any client is built, so a
 * misconfigured deployment produces a clear error on first import instead of
 * silently falling back to mock or burning through calls.
 *
 * Rules (intentionally narrow — reject typos, notions of "almost correct"):
 *   - mode ∈ {"http", "mock"}, case-insensitive (other values are typos)
 *   - when mode=http:
 *       - apiKey non-empty
 *       - timeoutMs is finite and > 0
 *       - baseUrl is a parseable URL
 *       - non-localhost http:// URLs are rejected (production must use TLS)
 */
export function validateOfiEnv(cfg: OfiEnvConfig = readOfiEnv()): void {
  // Normalize at the boundary so callers can pass either "HTTP" or "http".
  const mode = cfg.mode.toLowerCase();
  if (mode !== "http" && mode !== "mock") {
    throw new Error(`T0_QUOTE_CLIENT_MODE must be "http" or "mock", got "${cfg.mode}"`);
  }
  if (mode === "http") {
    if (!cfg.apiKey) {
      throw new Error("T0_OFI_API_KEY is required when T0_QUOTE_CLIENT_MODE=http");
    }
    if (!Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs <= 0) {
      throw new Error(`T0_OFI_TIMEOUT_MS must be a finite positive number, got "${cfg.timeoutMs}"`);
    }
    try {
      // eslint-disable-next-line no-new
      new URL(cfg.baseUrl);
    } catch {
      throw new Error(`T0_OFI_API_BASE_URL is not a valid URL: "${cfg.baseUrl}"`);
    }
    if (cfg.baseUrl.startsWith("http://") && !/localhost|127\.0\.0\.1/.test(cfg.baseUrl)) {
      throw new Error(
        `T0_OFI_API_BASE_URL must use https:// (non-localhost HTTP rejected): "${cfg.baseUrl}"`,
      );
    }
  }
}

function buildOfiClient(providerService: PayoutProviderService): OfiT0Client {
  if (quoteMode === "http") {
    return new HttpOfiT0Client({
      baseUrl: ofiBaseUrl,
      apiKey: ofiApiKey,
      timeoutMs: ofiTimeoutMs,
    });
  }
  // Mock: re-use the in-memory provider's quote book so dev/CI keep working
  // without an external service. "Best" = lowest rate among live quotes that
  // cover the requested USD amount — preserved from pre-refactor semantics.
  return new MockOfiT0Client({
    pickBestQuote: (usdAmount, currency, now) => {
      const candidates = providerService
        .snapshot()
        .quotes.filter((q) => q.currency === currency && q.expiresAt > now && q.band >= usdAmount);
      if (candidates.length === 0) return null;
      const best = candidates.reduce((a, b) => (a.rate <= b.rate ? a : b));
      return {
        rate: best.rate,
        expiresAt: best.expiresAt,
        createdAt: best.createdAt,
        quoteId: best.id,
      };
    },
  });
}

// Run validation once at module load. Throws on misconfiguration.
// Note: default mode is "mock" so this passes even without any env set.
validateOfiEnv();

// ── Pre-Settlement registry (audit §4–§7) ────────────────────────────
// Single shared registry: both PayoutProviderService and SandboxNetwork
// receive the same instance so OFI + Provider see one consistent ledger.

// Create provider first (registry needs it for onConfirm callback).
export const providerService = new PayoutProviderService(t0Client, Date.now, undefined, sharedStore);

const confirmDelayMs = Number(process.env.T0_SETTLEMENT_CONFIRM_DELAY_MS ?? 0);
export const settlementRegistry = new SettlementRegistry({
  confirmDelayMs: Number.isFinite(confirmDelayMs) && confirmDelayMs >= 0 ? confirmDelayMs : 0,
  onConfirm: (_txHash, usdAmount) => {
    // Auto-emit CreditUsageNotification when settlement is confirmed.
    providerService.notifyCreditUsage("provider", usdAmount);
  },
});

// Wire the registry back into the provider (it was created without one).
providerService.settlementRegistry = settlementRegistry;

// ── Demo seed: pre-populate a settlement so the Create Payment flow works
// immediately without requiring manual funding. Sandbox only.
const demoSettlement = settlementRegistry.submitSettlement({
  blockchain: "TRON",
  fromAddress: "TXw1OFI…sandbox",
  toAddress: "TXw2Provider…sandbox",
  usdAmount: 5000,
});
providerService.receiveSettlementConfirmation(demoSettlement.txHash);

// ── Demo seed: pre-publish a quote so Get Quote works immediately.
providerService.publishQuote({
  currency: "EUR",
  band: 1000,
  rate: 0.92,
  ttlMs: 300_000, // 5 minutes
});

const ofiClient = buildOfiClient(providerService);

// ── Phase 1: durable callback read model ─────────────────────────────
// Default InMemoryStore; production deployments can swap in a
// JsonFileStore (read-model/json-file-store.ts) by re-creating
// `sharedCallbackInbox` after import.
import { sharedCallbackInbox, sharedStore } from "./read-model/instance";
export { sharedCallbackInbox as callbackInbox, sharedStore as readModelStore };
export const sandboxNetwork = new SandboxNetwork(
  providerService,
  ofiClient,
  ofiPaymentMethod,
  Date.now,
  settlementRegistry,
  sharedStore,
);

// Re-export all modules
export * from "./ecdsa";
export * from "./csv";
export * from "./events";
