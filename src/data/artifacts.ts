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
   */
  build: () => Record<string, string | number | boolean>;
}

/** Common mock context shared across several artifacts. */
function mockContext() {
  return {
    currency: "EUR",
    band: 1_000,
    rate: 0.9214,
    paymentId: generatePaymentId(),
    quoteId: generateClientQuoteId(),
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
    build: () => {
      const c = mockContext();
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
    build: () => {
      const c = mockContext();
      return {
        quote_id: `qt-${Math.random().toString(16).slice(2, 18)}`,
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
    build: () => {
      const c = mockContext();
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
    build: () => {
      const c = mockContext();
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
    build: () => {
      const c = mockContext();
      return {
        payment_id: c.paymentId,
        quote_id: `qt-${Math.random().toString(16).slice(2, 18)}`,
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
    build: () => {
      const c = mockContext();
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
    build: () => {
      const c = mockContext();
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
    build: () => {
      const c = mockContext();
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
    build: () => {
      const c = mockContext();
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
};

export function getArtifactTemplate(type: ArtifactType): ArtifactTemplate {
  return ARTIFACT_TEMPLATES[type];
}
