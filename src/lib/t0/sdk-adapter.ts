// Proto ↔ internal-type adapter for the T-0 Network.
//
// Strict boundary: business code (provider.ts, ofi.ts) must never import
// @bufbuild/protobuf or any *_pb.js module. All proto conversion lives here.
//
// Conventions:
//   * Internal amounts are JS numbers in USD (e.g. 1000 = $1000).
//   * Proto amounts use Decimal { unscaled: bigint, exponent: int } with
//     exponent=2 for cents (matches the SDK's own examples).
//   * Timestamps on the wire are protobuf google.protobuf.Timestamp
//     (seconds: bigint). Internally we keep epoch-ms numbers.

import { create } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import {
  DecimalSchema,
  CreatePaymentRequestSchema,
  GetQuoteRequestSchema,
  PaymentMethodType,
  QuoteIdSchema,
  UpdateQuoteRequestSchema,
  UpdateQuoteRequest_QuoteSchema,
  UpdateQuoteRequest_Quote_BandSchema,
  type Decimal,
  type GetQuoteRequest,
  type GetQuoteResponse,
  type GetQuoteResponse_Success,
  type GetQuoteResponse_Failure,
  type UpdateQuoteRequest,
  type UpdateQuoteRequest_Quote_Band,
  type CreatePaymentRequest,
  QuoteType,
} from "@t-0/provider-sdk";
import type { Currency, Quote, VolumeBand } from "./types";

const AMOUNT_EXPONENT = 2;
const AMOUNT_SCALE = 100; // 10 ** exponent

// Sandbox default: SEPA. Real T-0 sandbox negotiates this out-of-band;
// we hard-code it here per the integration plan.
const DEFAULT_PAYMENT_METHOD: PaymentMethodType = PaymentMethodType.SEPA;

function toDecimal(value: number): Decimal {
  // Round to 2 decimal places (cents) to avoid floating-point drift.
  const cents = Math.round(value * AMOUNT_SCALE);
  return create(DecimalSchema, { unscaled: BigInt(cents), exponent: AMOUNT_EXPONENT });
}

function fromDecimal(value: Decimal | undefined): number {
  if (!value) return 0;
  const scale = 10 ** Math.max(0, value.exponent);
  return Number(value.unscaled) / scale;
}

function toTimestamp(epochMs: number): Timestamp {
  // `nanos` is required by the proto type but is 0 for second-precision times.
  return { seconds: BigInt(Math.floor(epochMs / 1000)), nanos: 0 } as Timestamp;
}

function fromTimestamp(ts: Timestamp | undefined): number {
  if (!ts) return 0;
  return Number(ts.seconds) * 1000;
}

function toBand(band: number, rate: number, clientQuoteId: string): UpdateQuoteRequest_Quote_Band {
  return create(UpdateQuoteRequest_Quote_BandSchema, {
    clientQuoteId,
    maxAmount: toDecimal(band),
    rate: toDecimal(rate),
  });
}

// ── Outbound (Provider → Network) ─────────────────────────────────

export interface OutboundQuoteInput {
  currency: Currency;
  /**
   * USD band amount. Typed as `number` (not `VolumeBand`) because the
   * adapter runs at the request boundary and the source `Quote.band`
   * field is a plain `number`; the proto wire format accepts any
   * positive integer unscaled value.
   */
  band: number;
  rate: number;
  expiresAt: number; // epoch ms
}

/**
 * Convert one internal quote to a proto UpdateQuoteRequest.
 * Sandbox publishes one band per request (our VolumeBand is a single
 * discrete tier, not a tiered range like the real network allows).
 */
export function toUpdateQuoteRequest(input: OutboundQuoteInput): UpdateQuoteRequest {
  const quote = create(UpdateQuoteRequest_QuoteSchema, {
    currency: input.currency,
    quoteType: QuoteType.REALTIME, // deprecated on server but kept for compat
    paymentMethod: DEFAULT_PAYMENT_METHOD,
    bands: [toBand(input.band, input.rate, `baxs_${input.currency}_${input.band}`)],
    expiration: toTimestamp(input.expiresAt),
    timestamp: toTimestamp(Date.now()),
  });
  return create(UpdateQuoteRequestSchema, {
    payOut: [quote],
  });
}

/**
 * Convert a proto UpdateQuoteResponse back to our internal `Quote` shape.
 * The real network returns OK with optional rejections per quote;
 * we synthesize an internal id since the server's quote id only lives
 * on its side.
 */
export function fromUpdateQuoteResponse(
  _response: unknown,
  input: OutboundQuoteInput,
): Quote {
  return {
    id: `qt_${input.currency}_${input.band}_${Date.now().toString(36)}`,
    currency: input.currency,
    band: input.band,
    rate: input.rate,
    createdAt: Date.now(),
    expiresAt: input.expiresAt,
  };
}

export interface OutboundGetQuoteInput {
  usdAmount: number;
  currency: Currency;
}

export function toGetQuoteRequest(input: OutboundGetQuoteInput): GetQuoteRequest {
  // The oneof `amount` field needs explicit `{ case, value }` shape; TS infers
  // the wider `MessageInit` union which doesn't accept `case` directly.
  const amount = { case: "payOutAmount", value: toDecimal(input.usdAmount) } as unknown as NonNullable<GetQuoteRequest["amount"]>["amount"];
  return create(GetQuoteRequestSchema, {
    amount: { amount },
    payOutCurrency: input.currency,
    payOutMethod: DEFAULT_PAYMENT_METHOD,
    quoteType: QuoteType.REALTIME,
  });
}

export interface InboundQuote {
  id: string;
  rate: number;
  payoutAmount: number;
  settlementAmount: number;
  expiresAt: number;
}

export interface QuoteResult {
  success?: InboundQuote;
  failureReason?: "NO_QUOTE_AVAILABLE" | "LIMIT_EXCEEDED" | "CURRENCY_NOT_SUPPORTED" | "INVALID_AMOUNT" | "INVALID_QUOTE_ID" | "QUOTE_EXPIRED" | "OTHER";
}

export function fromGetQuoteResponse(response: GetQuoteResponse): QuoteResult {
  const result = response.result;
  if (result.case === "success") {
    const s = result.value as GetQuoteResponse_Success;
    return {
      success: {
        id: s.quoteId ? String(s.quoteId.quoteId) : `quote_${Date.now().toString(36)}`,
        rate: fromDecimal(s.rate),
        payoutAmount: fromDecimal(s.payOutAmount),
        settlementAmount: fromDecimal(s.settlementAmount),
        expiresAt: fromTimestamp(s.expiration),
      },
    };
  }
  if (result.case === "failure") {
    const f = result.value as GetQuoteResponse_Failure;
    return { failureReason: (f.reason as unknown as QuoteResult["failureReason"]) ?? "OTHER" };
  }
  return { failureReason: "OTHER" };
}

export interface OutboundCreatePaymentInput {
  paymentClientId: string;
  quoteId: string;
  beneficiaryRef: string;
  usdAmount: number;
  currency: Currency;
}

export function toCreatePaymentRequest(input: OutboundCreatePaymentInput) {
  const amount = { case: "payOutAmount", value: toDecimal(input.usdAmount) } as unknown as NonNullable<CreatePaymentRequest["amount"]>["amount"];
  return create(CreatePaymentRequestSchema, {
    paymentClientId: input.paymentClientId,
    quoteId: create(QuoteIdSchema, { quoteId: BigInt(input.quoteId), providerId: 0 }),
    currency: input.currency,
    amount: { amount },
  });
}

// Re-export for tests (only the runtime-available ones).
export { DecimalSchema };
