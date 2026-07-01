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

/** Real sandbox client — POSTs to https://app-sandbox.t-0.network. Kept thin. */
export class HttpT0Client implements T0Client {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: unknown) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`T0 ${path} failed: ${res.status}`);
    return { ok: true as const };
  }

  updateQuote(quote: Quote) {
    return this.post("/v1/quotes", quote);
  }

  emit(event: NetworkEvent) {
    return this.post("/v1/events", event);
  }
}
