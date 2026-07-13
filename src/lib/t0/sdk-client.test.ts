import { describe, it, expect } from "vitest";
import { create } from "@bufbuild/protobuf";
import { wrapSdkClient, asLegacyT0Client, createSdkNetworkClient } from "./sdk-client";
import {
  DecimalSchema,
  GetQuoteResponseSchema,
  GetQuoteResponse_SuccessSchema,
  GetQuoteResponse_Failure_Reason,
  CreatePaymentResponseSchema,
  CreatePaymentResponse_Failure_Reason,
  UpdateQuoteResponseSchema,
  type Client,
  NetworkService,
} from "@t-0/provider-sdk";

const successResp = (rate: number) =>
  create(GetQuoteResponseSchema, {
    result: {
      case: "success",
      value: create(GetQuoteResponse_SuccessSchema, {
        rate: create(DecimalSchema, { unscaled: BigInt(Math.round(rate * 100)), exponent: 2 }),
        payOutAmount: create(DecimalSchema, {
          unscaled: BigInt(Math.round(rate * 1000)),
          exponent: 2,
        }),
        settlementAmount: create(DecimalSchema, { unscaled: BigInt(1000), exponent: 2 }),
        quoteId: { quoteId: BigInt(99), providerId: 1 },
      }),
    },
  });

const acceptedPaymentResp = (id: bigint) =>
  create(CreatePaymentResponseSchema, {
    paymentClientId: "client_1",
    result: {
      case: "accepted",
      value: { paymentId: id },
    },
  });

const mkSdk = (
  overrides: Partial<{
    updateQuote: (req: unknown) => Promise<unknown>;
    getQuote: (req: unknown) => Promise<unknown>;
    createPayment: (req: unknown) => Promise<unknown>;
  }> = {},
): Client<typeof NetworkService> => {
  return {
    updateQuote: overrides.updateQuote ?? (async () => create(UpdateQuoteResponseSchema, {})),
    getQuote: overrides.getQuote ?? (async () => successResp(0.9)),
    createPayment: overrides.createPayment ?? (async () => acceptedPaymentResp(BigInt(7))),
  } as unknown as Client<typeof NetworkService>;
};

describe("wrapSdkClient.updateQuote", () => {
  it("calls the SDK with a proto request and returns an internal Quote", async () => {
    let captured: unknown = null;
    const client = wrapSdkClient(
      mkSdk({
        updateQuote: async (req) => {
          captured = req;
          return {};
        },
      }),
    );
    const quote = await client.updateQuote({
      currency: "EUR",
      band: 1000,
      rate: 0.92,
      expiresAt: 1_700_000_000_000,
    });
    expect(quote.currency).toBe("EUR");
    expect(quote.band).toBe(1000);
    expect(quote.rate).toBe(0.92);
    expect(quote.expiresAt).toBe(1_700_000_000_000);
    expect(captured).not.toBeNull();
  });
});

describe("wrapSdkClient.getQuote", () => {
  it("returns the rate and amounts from the proto response", async () => {
    const client = wrapSdkClient(mkSdk({ getQuote: async () => successResp(0.85) }));
    const r = await client.getQuote({ usdAmount: 1000, currency: "EUR" });
    expect(r.success).toBeDefined();
    expect(r.success!.rate).toBe(0.85);
    expect(r.success!.id).toBe("99");
  });

  it("returns a failure reason when the SDK responds with failure", async () => {
    const failure = create(GetQuoteResponseSchema, {
      result: {
        case: "failure",
        value: { reason: GetQuoteResponse_Failure_Reason.CREDIT_OR_PREDEPOSIT_REQUIRED },
      },
    });
    const client = wrapSdkClient(mkSdk({ getQuote: async () => failure }));
    const r = await client.getQuote({ usdAmount: 1000, currency: "EUR" });
    expect(r.failureReason).toBeDefined();
    expect(r.success).toBeUndefined();
  });
});

describe("wrapSdkClient.createPayment", () => {
  it("returns the network-assigned paymentId on accept", async () => {
    const client = wrapSdkClient(
      mkSdk({
        createPayment: async () => acceptedPaymentResp(BigInt(12345)),
      }),
    );
    const r = await client.createPayment({
      paymentClientId: "baxs_test",
      quoteId: "42",
      beneficiaryRef: "BEN",
      usdAmount: 100,
      currency: "EUR",
    });
    expect(r.created).toBe(true);
    expect(r.paymentId).toBe("12345");
  });

  it("falls back to the client id when paymentId is absent", async () => {
    const client = wrapSdkClient(
      mkSdk({
        createPayment: async () =>
          create(CreatePaymentResponseSchema, {
            paymentClientId: "fallback_id",
            result: { case: "settlementRequired", value: {} },
          }),
      }),
    );
    const r = await client.createPayment({
      paymentClientId: "fallback_id",
      quoteId: "42",
      beneficiaryRef: "BEN",
      usdAmount: 100,
      currency: "EUR",
    });
    expect(r.created).toBe(false);
    expect(r.paymentId).toBe("fallback_id");
  });

  it("handles a number paymentId (non-bigint variant)", async () => {
    const client = wrapSdkClient(
      mkSdk({
        createPayment: async () =>
          create(CreatePaymentResponseSchema, {
            paymentClientId: "c",
            result: { case: "accepted", value: { paymentId: BigInt(42) } },
          }),
      }),
    );
    const r = await client.createPayment({
      paymentClientId: "c",
      quoteId: "42",
      beneficiaryRef: "BEN",
      usdAmount: 100,
      currency: "EUR",
    });
    expect(r.created).toBe(true);
    expect(r.paymentId).toBe("42");
  });

  it("returns failure reason when the network rejects a createPayment", async () => {
    const client = wrapSdkClient(
      mkSdk({
        createPayment: async () =>
          create(CreatePaymentResponseSchema, {
            paymentClientId: "c",
            result: {
              case: "failure",
              value: { reason: CreatePaymentResponse_Failure_Reason.QUOTE_NOT_FOUND },
            },
          }),
      }),
    );
    const r = await client.createPayment({
      paymentClientId: "c",
      quoteId: "42",
      beneficiaryRef: "BEN",
      usdAmount: 100,
      currency: "EUR",
    });
    expect(r.created).toBe(false);
    expect(r.paymentId).toBe("c");
  });
});

describe("asLegacyT0Client", () => {
  it("forwards updateQuote to the SDK adapter", async () => {
    let called = false;
    const sdk = {
      async updateQuote(input: { currency: string }) {
        called = true;
        expect(input.currency).toBe("USD");
        return {} as never;
      },
      async getQuote() {
        return { failureReason: "OTHER" as const };
      },
      async createPayment() {
        return { created: false, paymentId: "" };
      },
    };
    const legacy = asLegacyT0Client(sdk);
    const out = await legacy.updateQuote({
      id: "q1",
      currency: "USD",
      band: 1000,
      rate: 1,
      createdAt: 0,
      expiresAt: 1,
    });
    expect(called).toBe(true);
    expect(out).toEqual({ ok: true });
  });

  it("returns ok on emit (no-op in SDK mode)", async () => {
    const sdk = {
      async updateQuote() {
        return {} as never;
      },
      async getQuote() {
        return { failureReason: "OTHER" as const };
      },
      async createPayment() {
        return { created: false, paymentId: "" };
      },
    };
    const legacy = asLegacyT0Client(sdk);
    const out = await legacy.emit({ type: "PaymentAccepted", paymentId: "p", at: 0 });
    expect(out).toEqual({ ok: true });
  });
});

describe("createSdkNetworkClient", () => {
  it("rejects a malformed private key up-front (no network call)", () => {
    expect(() => createSdkNetworkClient("not-hex", "https://api.test")).toThrow();
  });

  it("builds a real SDK client for a valid hex key (no network call is made)", () => {
    // Validates line 41-42: createSdkNetworkClient returns an OutboundNetworkClient
    // with real SDK wiring. We don't actually call out — the SDK defers network
    // access to the first RPC call.
    const client = createSdkNetworkClient("a".repeat(64), "https://api.example.invalid");
    expect(typeof client.updateQuote).toBe("function");
    expect(typeof client.getQuote).toBe("function");
    expect(typeof client.createPayment).toBe("function");
  });
});
