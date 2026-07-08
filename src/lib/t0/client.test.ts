import { describe, it, expect, vi } from "vitest";
import { HttpT0Client, MockT0Client } from "./client";
import type { Quote } from "./types";

const quote: Quote = {
  id: "q1",
  currency: "USD",
  band: 1000,
  rate: 1,
  createdAt: 0,
  expiresAt: 1,
};

describe("MockT0Client", () => {
  it("records outbound quotes and events", async () => {
    const c = new MockT0Client();
    await c.updateQuote(quote);
    await c.emit({ type: "PayoutAccepted", payoutId: "p", at: 0 });
    expect(c.outbound).toHaveLength(2);
    expect(c.outbound[0]).toEqual({ kind: "quote", payload: quote });
    expect(c.outbound[1].kind).toBe("event");
  });
});

describe("HttpT0Client", () => {
  it("POSTs pay-out quotes and events with auth + idempotency headers", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
    const c = new HttpT0Client("https://api.test", "key123", fetchImpl);
    await c.updateQuote(quote);
    await c.emit({ type: "PayoutSuccess", payoutId: "p", at: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // updateQuote → /api/v1/quotes/pay-out with groups body
    const [url1, init1] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url1).toBe("https://api.test/api/v1/quotes/pay-out");
    const body1 = JSON.parse((init1 as RequestInit).body as string);
    expect(body1).toHaveProperty("groups");
    expect(body1.groups[0]).toMatchObject({
      currency: quote.currency,
      payment_method: "SEPA",
      bands: [{ client_quote_id: quote.id, max_amount_usd: String(quote.band), rate: String(quote.rate) }],
    });
    expect((init1 as RequestInit).headers).toMatchObject({
      authorization: "Bearer key123",
    });
    expect((init1 as RequestInit).headers).toHaveProperty("idempotency-key");

    // emit → /v1/events
    const [url2, init2] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(url2).toBe("https://api.test/v1/events");
    expect((init2 as RequestInit).headers).toMatchObject({ authorization: "Bearer key123" });
  });

  it("throws on non-2xx response", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch;
    const c = new HttpT0Client("https://api.test", "k", fetchImpl);
    await expect(c.updateQuote(quote)).rejects.toThrow(/500/);
  });
});
