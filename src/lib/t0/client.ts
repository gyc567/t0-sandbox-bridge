// T-0 Network client abstraction.
// Strategy pattern: swap MockT0Client for HttpT0Client without touching service code.

import type { NetworkEvent, Quote } from "./types";

export interface T0Client {
  updateQuote(quote: Quote): Promise<{ ok: true }>;
  emit(event: NetworkEvent): Promise<{ ok: true }>;
}

/** Records outbound calls in-memory. Used by tests and by the "Mock" sandbox mode. */
export class MockT0Client implements T0Client {
  public readonly outbound: Array<{ kind: "quote" | "event"; payload: unknown }> = [];

  async updateQuote(quote: Quote) {
    this.outbound.push({ kind: "quote", payload: quote });
    return { ok: true as const };
  }

  async emit(event: NetworkEvent) {
    this.outbound.push({ kind: "event", payload: event });
    return { ok: true as const };
  }
}

/** Maps internal Quote to the ngrok REST API shape. */
function quoteToPayOutGroup(quote: Quote) {
  return {
    currency: quote.currency,
    payment_method: "SEPA", // default; can be made configurable later
    expiration_seconds: Math.max(1, Math.floor((quote.expiresAt - Date.now()) / 1000)),
    bands: [
      {
        client_quote_id: quote.id,
        max_amount_usd: String(quote.band),
        rate: String(quote.rate),
      },
    ],
  };
}

/** Real sandbox client — POSTs to the configured ngrok / REST endpoint. */
export class HttpT0Client implements T0Client {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: unknown, opts?: { idempotencyKey?: string }) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
    if (opts?.idempotencyKey) {
      headers["idempotency-key"] = opts.idempotencyKey;
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`T0 ${path} failed: ${res.status} ${text}`);
    }
    return { ok: true as const };
  }

  updateQuote(quote: Quote) {
    const body = { groups: [quoteToPayOutGroup(quote)] };
    return this.post("/api/v1/quotes/pay-out", body, {
      idempotencyKey: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    });
  }

  emit(event: NetworkEvent) {
    return this.post("/v1/events", event);
  }
}
