// Outbound SDK-backed client. Wraps @t-0/provider-sdk's `createClient` with
// our internal types so business code (provider.ts, ofi.ts) stays free of
// proto concerns.
//
// Single seam: this is the only place that imports the SDK's NetworkService
// descriptor. All callers go through the `OutboundNetworkClient` interface.

import {
  createClient as sdkCreateClient,
  NetworkService,
  type Client,
  type GetQuoteResponse,
} from "@t-0/provider-sdk";
import {
  toUpdateQuoteRequest,
  toGetQuoteRequest,
  toCreatePaymentRequest,
  fromGetQuoteResponse,
  fromUpdateQuoteResponse,
  type OutboundQuoteInput,
  type OutboundGetQuoteInput,
  type OutboundCreatePaymentInput,
  type QuoteResult,
} from "./sdk-adapter";
import { normalisePrivateKey } from "./sdk-signer";
import type { Quote } from "./types";
export type { QuoteResult };

/**
 * Build a real T-0 Network client backed by the @t-0/provider-sdk.
 * @param privateKeyHex  provider private key (0x-prefixed or not)
 * @param endpoint       full URL, e.g. "https://api-sandbox.t-0.network"
 */
export function createSdkNetworkClient(
  privateKeyHex: string,
  endpoint: string,
): OutboundNetworkClient {
  // The SDK's createClient accepts a hex string directly; it builds the
  // signer internally. We pre-validate here so the error surfaces early.
  const validated = normalisePrivateKey(privateKeyHex);
  const sdk = sdkCreateClient(validated, endpoint, NetworkService);
  return wrapSdkClient(sdk);
}

/**
 * Lower-level: wrap an already-constructed ConnectRPC client so tests can
 * stub `NetworkService.updateQuote` / `.getQuote` / `.createPayment` without
 * needing a real network.
 */
export function wrapSdkClient(sdk: Client<typeof NetworkService>): OutboundNetworkClient {
  return {
    async updateQuote(input: OutboundQuoteInput): Promise<Quote> {
      const req = toUpdateQuoteRequest(input);
      const res = await sdk.updateQuote(req);
      return fromUpdateQuoteResponse(res, input);
    },
    async getQuote(input: OutboundGetQuoteInput): Promise<QuoteResult> {
      const req = toGetQuoteRequest(input);
      const res: GetQuoteResponse = await sdk.getQuote(req);
      return fromGetQuoteResponse(res);
    },
    async createPayment(input: OutboundCreatePaymentInput) {
      const req = toCreatePaymentRequest(input);
      const res = await sdk.createPayment(req);
      // Real network returns CreatePaymentResponse with:
      //   { paymentClientId, result: { case: "accepted"|"settlementRequired"|"failure", value: ... } }
      // The Accepted variant carries paymentId: bigint (uint64).
      const result = (res as { result?: { case: string; value: Record<string, unknown> } }).result;
      let id = input.paymentClientId;
      if (result?.case === "accepted") {
        const pid = (result.value as { paymentId?: bigint | number }).paymentId;
        if (typeof pid === "bigint") id = pid.toString();
        else if (typeof pid === "number") id = String(pid);
      }
      const created = result?.case === "accepted";
      return { created, paymentId: id };
    },
  };
}

export interface OutboundNetworkClient {
  updateQuote(input: OutboundQuoteInput): Promise<Quote>;
  getQuote(input: OutboundGetQuoteInput): Promise<QuoteResult>;
  createPayment(
    input: OutboundCreatePaymentInput,
  ): Promise<{ created: boolean; paymentId: string }>;
}

/**
 * Adapter: expose the SDK-backed client through the legacy `T0Client` port
 * so PayoutProviderService can call it without knowing about the SDK.
 *
 * PayoutProviderService only calls `updateQuote(Quote)` and `emit(NetworkEvent)`.
 * The SDK doesn't have a generic `emit` — events flow via the inbound
 * `ProviderService` RPCs. For now, `emit` becomes a no-op when using the
 * SDK (the Provider's network state is updated via the inbound callbacks
 * once Iter 2 lands; emit on the outbound path is sandbox-only).
 */
import type { T0Client } from "./client";
import type { NetworkEvent } from "./types";

export function asLegacyT0Client(sdk: OutboundNetworkClient): T0Client {
  return {
    async updateQuote(quote) {
      await sdk.updateQuote({
        currency: quote.currency,
        band: quote.band,
        rate: quote.rate,
        expiresAt: quote.expiresAt,
      });
      return { ok: true as const };
    },
    async emit(_event: NetworkEvent) {
      // No-op in SDK mode. Real T-0 Network learns about events via
      // the inbound ProviderService RPCs (payOut, updatePayment, etc.),
      // not via an outbound emit.
      return { ok: true as const };
    },
  };
}
