/**
 * Artifact templates + mock generators.
 *
 * Used by the ArtifactDrawer (Phase 6) to render monospace protocol payloads
 * that match what each flow step produces on the wire.
 *
 * Generators produce realistic-looking identifiers (UUIDs, keccak hashes,
 * secp256k1 signatures) — all mock, all deterministic-seedable so the
 * playground is reproducible.
 */

import type { ArtifactType } from "./flows";

// ─── Generators ───────────────────────────────────────────────────────

/** secp256k1-style 64-byte hex string (mock). */
export function generateSignature(seed?: number): string {
  const hex = "0123456789abcdef";
  const len = 130; // 65 bytes including v byte
  let out = "0x";
  let s = seed ?? Math.floor(Math.random() * 1e9);
  for (let i = 0; i < len; i++) {
    s = (s * 9301 + 49297) % 233280;
    out += hex[Math.floor((s / 233280) * 16)];
  }
  return out;
}

/** Keccak-256 hash: 0x + 64 hex chars (mock). */
export function generateHash(seed?: number): string {
  const hex = "0123456789abcdef";
  let out = "0x";
  let s = seed ?? Math.floor(Math.random() * 1e9);
  for (let i = 0; i < 64; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += hex[s % 16];
  }
  return out;
}

/** Transaction hash: 0x + 64 hex chars. */
export function generateTxHash(seed?: number): string {
  return generateHash(seed);
}

/** Network-assigned UUID-style payment_id. */
export function generatePaymentId(): string {
  // RFC 4122 v4 shape
  const hex = "0123456789abcdef";
  const out: string[] = [];
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out.push("-");
    } else if (i === 14) {
      out.push("4");
    } else if (i === 19) {
      out.push(hex[(Math.random() * 4) | 8]); // 8-b
    } else {
      out.push(hex[(Math.random() * 16) | 0]);
    }
  }
  return out.join("");
}

/** Provider-assigned client_quote_id (1-64 chars). */
export function generateClientQuoteId(band: number = 1000, currency: string = "EUR"): string {
  const ts = new Date().toISOString().slice(0, 10);
  const seq = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
  return `ql-${ts}-${currency.toLowerCase()}-${band}-${seq}`;
}

/** Generate a stable network quote_id (qt-…) when none is provided. */
export function generateQuoteId(): string {
  return `qt-${Math.random().toString(16).slice(2, 18)}`;
}

/** Compressed secp256k1 public key: 0x + 33 bytes hex = 66 chars. */
export function generatePublicKey(seed?: number): string {
  const hex = "0123456789abcdef";
  let out = "0x02"; // compressed pubkey prefix
  let s = (seed ?? Math.floor(Math.random() * 1e9)) ^ 0xdeadbeef;
  for (let i = 0; i < 64; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += hex[s % 16];
  }
  return out;
}

// ─── Artifact templates ───────────────────────────────────────────────

export interface LiveIds {
  paymentId?: string;
  quoteId?: string;
}

export interface ArtifactTemplate {
  type: ArtifactType;
  /** Top-of-drawer heading. */
  title: string;
  /** Subline / endpoint hint. */
  endpoint: string;
  /**
   * Render the payload as a structured object. Keys are display labels,
   * values are the actual protocol values. The drawer formats them as
   * a monospace key/value list.
   *
   * When `live` is provided, templates substitute real sandbox IDs in
   * place of the mocked payment_id / quote_id so the drawer reflects
   * the actual server-side state.
   */
  build: (live?: LiveIds) => Record<string, string | number | boolean>;
}

/** Common mock context shared across several artifacts. */
function mockContext(live?: LiveIds) {
  return {
    currency: "EUR",
    band: 1_000,
    rate: 0.9214,
    paymentId: live?.paymentId ?? generatePaymentId(),
    quoteId: live?.quoteId ?? generateQuoteId(),
    signature: generateSignature(),
    hash: generateHash(),
    txHash: generateTxHash(),
    publicKey: generatePublicKey(),
    timestamp: new Date().toISOString(),
  };
}

export const ARTIFACT_TEMPLATES: Record<ArtifactType, ArtifactTemplate> = {
  "update-quote": {
    type: "update-quote",
    title: "UpdateQuote",
    endpoint: "POST /tzero.v1.payment.NetworkService/UpdateQuote",
    build: (live) => {
      const c = mockContext(live);
      return {
        client_quote_id: c.quoteId,
        currency: c.currency,
        band: c.band,
        rate: c.rate,
        chain: "tron",
        wallet_address: "TXyz...abc1",
        valid_until: new Date(Date.now() + 30_000).toISOString(),
        timestamp: c.timestamp,
      };
    },
  },
  "get-quote": {
    type: "get-quote",
    title: "GetQuote (response)",
    endpoint: "tzero.v1.payment.NetworkService/GetQuote",
    build: (live) => {
      const c = mockContext(live);
      return {
        quote_id: c.quoteId,
        client_quote_id: c.quoteId,
        currency: c.currency,
        band: c.band,
        rate: c.rate,
        all_quotes: "[ 4 quotes aggregated ]",
        latency_ms: 28,
      };
    },
  },
  "usdt-settle": {
    type: "usdt-settle",
    title: "USDT Settlement",
    endpoint: "chain · USDT-TRC20",
    build: (live) => {
      const c = mockContext(live);
      return {
        chain: "tron",
        asset: "USDT",
        amount: `${c.band.toLocaleString()}.00`,
        from: "TBeneficiary...addr",
        to: "TPayoutWallet..addr",
        tx_hash: c.txHash,
        block: 67_124_312,
        confirmations: "3/3",
        finality: "Tron finality (~60s)",
      };
    },
  },
  "update-limit": {
    type: "update-limit",
    title: "UpdateLimit (webhook)",
    endpoint: "provider.WebhookService/UpdateLimit",
    build: (live) => {
      const c = mockContext(live);
      return {
        counterparty: "ofi-demo",
        credit_limit: 250_000,
        available: 247_500,
        used: 2_500,
        currency: "USD",
        settlement_frequency: "every 8h",
        timestamp: c.timestamp,
      };
    },
  },
  "create-payment": {
    type: "create-payment",
    title: "CreatePayment",
    endpoint: "POST /tzero.v1.payment.NetworkService/CreatePayment",
    build: (live) => {
      const c = mockContext(live);
      return {
        payment_id: c.paymentId,
        quote_id: c.quoteId,
        rate: c.rate,
        source_amount: `${c.band}.00`,
        settlement_amount: (c.band * c.rate).toFixed(2),
        currency: c.currency,
        beneficiary_ref: `BEN-${Date.now()}`,
      };
    },
  },
  "payout-rpc": {
    type: "payout-rpc",
    title: "PayOut (RPC)",
    endpoint: "provider.NetworkService/PayOut",
    build: (live) => {
      const c = mockContext(live);
      return {
        payment_id: c.paymentId,
        amount: `${c.band}.00`,
        currency: c.currency,
        rail: "stablecoin",
        travel_rule: "{ ... }",
        sla: "30s",
      };
    },
  },
  "ecdsa-sign": {
    type: "ecdsa-sign",
    title: "ECDSA Sign (Keccak-256 + secp256k1)",
    endpoint: "internal · cryptographically valid against sandbox keypair",
    build: (live) => {
      const c = mockContext(live);
      return {
        public_key: c.publicKey,
        x_signature: c.signature.slice(0, 74) + "...",
        x_public_key: c.publicKey,
        x_signature_timestamp: Date.now(),
        keccak256_hash: c.hash,
      };
    },
  },
  "finalize-payout": {
    type: "finalize-payout",
    title: "FinalizePayout",
    endpoint: "provider.NetworkService/FinalizePayout",
    build: (live) => {
      const c = mockContext(live);
      return {
        payment_id: c.paymentId,
        outcome: "success",
        completed_at: new Date().toISOString(),
        network_fee_bps: 5,
        net_to_beneficiary: (c.band - c.band * 0.0005).toFixed(2),
      };
    },
  },
  "ledger-entry": {
    type: "ledger-entry",
    title: "AppendLedgerEntries (double-entry)",
    endpoint: "internal · TransactionID is idempotency key",
    build: (live) => {
      const c = mockContext(live);
      return {
        transaction_id: Math.random().toString(16).slice(2, 14),
        debit: {
          account: "PAYOUT_RESERVE",
          amount: `${c.band}.00`,
        },
        credit: {
          account: "PAYABLE",
          amount: `${c.band}.00`,
        },
        timestamp: c.timestamp,
      };
    },
  },
  // ── Phase 8: new artifact types ──
  "ivms101-disclosure": {
    type: "ivms101-disclosure",
    title: "Travel Rule (IVMS101 disclosure)",
    endpoint: "POST /tzero.v1.payment.NetworkService/SubmitTravelRule",
    build: (live) => {
      const c = mockContext(live);
      return {
        payment_id: c.paymentId,
        originator: {
          natural_person: {
            name: "Anna Müller",
            country: "DE",
            address: "Friedrichstr. 1, Berlin",
          },
          lei: "529900T8BM49AURSDO55",
        },
        beneficiary: {
          natural_person: {
            name: "Wei Chen",
            country: "CN",
            address: "Pudong, Shanghai",
          },
        },
        amount: `${c.band}.00`,
        currency: c.currency,
        timestamp: c.timestamp,
      };
    },
  },
  "aml-pending": {
    type: "aml-pending",
    title: "ManualAmlCheck (PENDING_REVIEW)",
    endpoint: "internal · compliance hold",
    build: (live) => {
      const c = mockContext(live);
      return {
        payment_id: c.paymentId,
        status: "PENDING_REVIEW",
        queue: "tier-2-manual-aml",
        assigned_to: "compliance-ops@provider",
        sla_seconds: 90,
        opened_at: c.timestamp,
        reason: "high_band_first_time_beneficiary",
      };
    },
  },
  "last-look-approval": {
    type: "last-look-approval",
    title: "ApprovePaymentQuotes (Last Look)",
    endpoint: "POST /tzero.v1.payment.NetworkService/ApprovePaymentQuotes",
    build: (live) => {
      const c = mockContext(live);
      return {
        payment_id: c.paymentId,
        quote_id: c.quoteId,
        approval: "APPROVED",
        approved_rate: c.rate,
        approved_band: c.band,
        approved_at: c.timestamp,
        approver: "payout-provider-rpc",
      };
    },
  },
  "pay-in-receipt": {
    type: "pay-in-receipt",
    title: "Pay-In Receipt (off-network rail)",
    endpoint: "POST /tzero.v1.payment.NetworkService/ConfirmFundsReceived",
    build: (live) => {
      const c = mockContext(live);
      return {
        payment_id: c.paymentId,
        payin_provider: "stripe-mock",
        fiat_amount: `${(c.band * c.rate).toFixed(2)}`,
        fiat_currency: "EUR",
        rail: "SEPA Instant",
        tx_ref: `pi-${Math.random().toString(16).slice(2, 12)}`,
        received_at: c.timestamp,
        rate_locked: true,
      };
    },
  },
};

export function getArtifactTemplate(type: ArtifactType): ArtifactTemplate {
  return ARTIFACT_TEMPLATES[type];
}

/**
 * Build a mock curl command for the sandbox endpoint matching an artifact.
 *
 * No real secrets are included. Headers and body are synthetic examples
 * that mirror the shape a provider would send.
 */
export function buildCurlCommand(type: ArtifactType, live?: LiveIds): string {
  const t = getArtifactTemplate(type);
  const payload = t.build(live);
  const url = "https://api-sandbox.t-0.network/v1/";
  const headers = [
    '-H "Content-Type: application/json"',
    '-H "X-Signature: [REDACTED]"',
    '-H "X-Public-Key: [REDACTED]"',
    '-H "X-Signature-Timestamp: ' + Date.now() + '"',
  ].join(" \\\n  ");

  let path: string;
  switch (type) {
    case "update-quote":
      path = "quote";
      break;
    case "get-quote":
      path = "quote:get";
      break;
    case "usdt-settle":
      path = "settlement";
      break;
    case "update-limit":
      path = "limit";
      break;
    case "create-payment":
      path = "payment";
      break;
    case "payout-rpc":
      path = "payout";
      break;
    case "ecdsa-sign":
      path = "auth/sign";
      break;
    case "finalize-payout":
      path = "payout:finalize";
      break;
    case "ledger-entry":
      path = "ledger";
      break;
    case "ivms101-disclosure":
      path = "travel-rule";
      break;
    case "aml-pending":
      path = "compliance/manual-aml";
      break;
    case "last-look-approval":
      path = "payment:approve";
      break;
    case "pay-in-receipt":
      path = "payin/confirm";
      break;
    default:
      path = "noop";
  }

  return `curl -X POST ${url}${path} \\
  ${headers} \\
  -d '${JSON.stringify(payload, null, 2)}'`;
}
