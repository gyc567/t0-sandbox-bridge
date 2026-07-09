import { HttpT0Client, MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { HttpOfiT0Client, MockOfiT0Client } from "./ofi-client";
import type { OfiT0Client } from "./ofi-client";

// Switch to real HTTP client when T0_NGROK_URL is configured; otherwise mock.
const ngrokUrl = process.env.T0_NGROK_URL;
const apiKey = process.env.T0_API_KEY;

export const t0Client = ngrokUrl && apiKey
  ? new HttpT0Client(ngrokUrl, apiKey)
  : new MockT0Client();

// ── OFI quote client (OFI pulls pay-out quote from agtpay /api/v1/quotes/network)
// Mode switching via T0_QUOTE_CLIENT_MODE env; defaults to mock (uses the
// in-memory provider snapshot, mirroring pre-refactor behavior for dev/CI).
const quoteMode = (process.env.T0_QUOTE_CLIENT_MODE ?? "mock").toLowerCase();
const ofiBaseUrl = process.env.T0_OFI_API_BASE_URL ?? "https://api.agtpay.xyz";
const ofiApiKey = process.env.T0_OFI_API_KEY ?? "";
const ofiTimeoutMs = Number(process.env.T0_OFI_TIMEOUT_MS ?? 5000);
const ofiPaymentMethod =
  process.env.T0_OFI_PAYMENT_METHOD ?? "PAYMENT_METHOD_TYPE_SEPA";

function buildOfiClient(
  providerService: PayoutProviderService,
): OfiT0Client {
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
        .quotes.filter(
          (q) => q.currency === currency && q.expiresAt > now && q.band >= usdAmount,
        );
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

export const providerService = new PayoutProviderService(t0Client);
const ofiClient = buildOfiClient(providerService);
export const sandboxNetwork = new SandboxNetwork(
  providerService,
  ofiClient,
  ofiPaymentMethod,
);

// Re-export all modules
export * from "./ecdsa";
export * from "./csv";
export * from "./events";