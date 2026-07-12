import { describe, it, expect } from "vitest";
import { create } from "@bufbuild/protobuf";
import {
  toUpdateQuoteRequest,
  toGetQuoteRequest,
  toCreatePaymentRequest,
  fromUpdateQuoteResponse,
  fromGetQuoteResponse,
} from "./sdk-adapter";
import {
  DecimalSchema,
  GetQuoteResponseSchema,
  GetQuoteResponse_SuccessSchema,
  GetQuoteResponse_FailureSchema,
  GetQuoteResponse_Failure_Reason,
} from "@t-0/provider-sdk";

describe("toUpdateQuoteRequest", () => {
  it("converts an internal Quote into a proto UpdateQuoteRequest with the correct shape", () => {
    const req = toUpdateQuoteRequest({
      currency: "EUR",
      band: 1000,
      rate: 0.92,
      expiresAt: 1_700_000_000_000,
    });
    expect(req.payOut).toHaveLength(1);
    const q = req.payOut![0]!;
    expect(q.currency).toBe("EUR");
    expect(q.bands).toHaveLength(1);
    const band = q.bands![0]!;
    expect(band.maxAmount!.unscaled).toBe(BigInt(100000));
    expect(band.maxAmount!.exponent).toBe(2);
    expect(band.rate!.unscaled).toBe(BigInt(92));
    expect(band.rate!.exponent).toBe(2);
    expect(band.clientQuoteId).toMatch(/^baxs_EUR_1000$/);
    expect(q.expiration!.seconds).toBe(BigInt(1_700_000_000));
  });

  it("rounds floating-point amounts to cents", () => {
    const req = toUpdateQuoteRequest({ currency: "USD", band: 1234, rate: 1.0051, expiresAt: 1 });
    const band = req.payOut![0]!.bands![0]!;
    // 1234 * 100 = 123400; 1.0051 * 100 = 100.51 -> rounds to 101
    expect(band.maxAmount!.unscaled).toBe(BigInt(123400));
    expect(band.rate!.unscaled).toBe(BigInt(101));
  });
});

describe("fromUpdateQuoteResponse", () => {
  it("synthesizes a Quote from the original input", () => {
    const quote = fromUpdateQuoteResponse({}, { currency: "GBP", band: 5000, rate: 0.85, expiresAt: 12345 });
    expect(quote.currency).toBe("GBP");
    expect(quote.band).toBe(5000);
    expect(quote.rate).toBe(0.85);
    expect(quote.expiresAt).toBe(12345);
    expect(quote.id).toMatch(/^qt_GBP_5000_/);
  });
});

describe("toGetQuoteRequest", () => {
  it("builds a GetQuoteRequest with the right oneof amount", () => {
    const req = toGetQuoteRequest({ usdAmount: 500, currency: "EUR" });
    expect(req.payOutCurrency).toBe("EUR");
    expect(req.amount).toBeDefined();
    expect(req.amount!.amount.case).toBe("payOutAmount");
    if (req.amount!.amount.case === "payOutAmount") {
      expect(req.amount!.amount.value.unscaled).toBe(BigInt(50000));
    }
  });
});

describe("fromGetQuoteResponse", () => {
  it("extracts rate and amounts from a Success response", () => {
    const success = create(GetQuoteResponse_SuccessSchema, {
      rate: create(DecimalSchema, { unscaled: BigInt(92), exponent: 2 }),
      payOutAmount: create(DecimalSchema, { unscaled: BigInt(920), exponent: 2 }),
      settlementAmount: create(DecimalSchema, { unscaled: BigInt(1000), exponent: 2 }),
    });
    const response = create(GetQuoteResponseSchema, {
      result: { case: "success", value: success },
    });
    const out = fromGetQuoteResponse(response);
    expect(out.success).toBeDefined();
    expect(out.success!.rate).toBe(0.92);
    expect(out.success!.payoutAmount).toBe(9.2);
    expect(out.success!.settlementAmount).toBe(10);
  });

  it("extracts reason from a Failure response", () => {
    const failure = create(GetQuoteResponse_FailureSchema, {
      reason: GetQuoteResponse_Failure_Reason.QUOTE_NOT_FOUND,
    });
    const response = create(GetQuoteResponseSchema, {
      result: { case: "failure", value: failure },
    });
    const out = fromGetQuoteResponse(response);
    expect(out.failureReason).toBeDefined();
    expect(out.success).toBeUndefined();
  });

  it("returns a 0 expiresAt when the success response omits expiration", () => {
    const success = create(GetQuoteResponse_SuccessSchema, {
      rate: create(DecimalSchema, { unscaled: BigInt(92), exponent: 2 }),
    });
    const response = create(GetQuoteResponseSchema, {
      result: { case: "success", value: success },
    });
    const out = fromGetQuoteResponse(response);
    expect(out.success).toBeDefined();
    expect(out.success!.expiresAt).toBe(0);
  });

  it("decodes a non-zero timestamp from the proto expiration", () => {
    const success = create(GetQuoteResponse_SuccessSchema, {
      rate: create(DecimalSchema, { unscaled: BigInt(92), exponent: 2 }),
      expiration: { seconds: BigInt(1_700_000_000), nanos: 0 } as never,
    });
    const response = create(GetQuoteResponseSchema, {
      result: { case: "success", value: success },
    });
    const out = fromGetQuoteResponse(response);
    expect(out.success!.expiresAt).toBe(1_700_000_000_000);
  });

  it("returns 0 for an undefined Quote amount", () => {
    // Round-trip via toGetQuoteRequest + fromGetQuoteResponse with the
    // decimal stripped out — defends the `if (!value) return 0` branch.
    const req = toGetQuoteRequest({ usdAmount: 0, currency: "USD" });
    expect(req.amount!.amount.value!.unscaled).toBe(BigInt(0));
  });

  it("returns OTHER when the result case is neither success nor failure", () => {
    // Manually construct an unrecognised result — protobuf guarantees oneof
    // is always set, but defensiveness matters at the adapter boundary.
    const response = { result: { case: "unknown", value: {} } } as unknown as Parameters<typeof fromGetQuoteResponse>[0];
    const out = fromGetQuoteResponse(response);
    expect(out.failureReason).toBe("OTHER");
  });
});

describe("toCreatePaymentRequest", () => {
  it("builds a CreatePaymentRequest with quoteId bigint", () => {
    const req = toCreatePaymentRequest({
      paymentClientId: "baxs_001",
      quoteId: "42",
      beneficiaryRef: "BEN-1",
      usdAmount: 1000,
      currency: "EUR",
    });
    expect(req.paymentClientId).toBe("baxs_001");
    expect(req.currency).toBe("EUR");
    expect(req.quoteId!.quoteId).toBe(BigInt(42));
    expect(req.amount!.amount.case).toBe("payOutAmount");
  });
});