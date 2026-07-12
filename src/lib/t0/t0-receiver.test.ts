import { describe, it, expect } from "vitest";
import {
  verifyRequestSignature,
  buildT0Receiver,
} from "./t0-receiver";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Buffer } from "node:buffer";
import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";

const TEST_PRIVATE_KEY = Buffer.from("ab".repeat(32), "hex");
const TEST_PUBLIC_KEY = secp256k1.getPublicKey(TEST_PRIVATE_KEY, false);
const TEST_PUBLIC_KEY_HEX = "0x" + Buffer.from(TEST_PUBLIC_KEY).toString("hex");

// Frozen epoch for the verifyRequestSignature tests so signing and
// verification share the same "now". The 60s tolerance window
// protects against small drift but not multi-hour vitest runtimes.
const FROZEN_NOW = 1_700_000_000_000;
const FROZEN_NOW_FN = () => FROZEN_NOW;

interface SignedHeaders {
  signature: string;
  publicKey: string;
  timestamp: string;
}

function signRequest(privateKey: Uint8Array, bodyBytes: Uint8Array, tsMs: number): SignedHeaders {
  const hasher = keccak_256.create();
  hasher.update(bodyBytes);
  const tsBuf = new ArrayBuffer(8);
  new DataView(tsBuf).setBigUint64(0, BigInt(tsMs), true);
  hasher.update(new Uint8Array(tsBuf));
  const digest = hasher.digest();
  const sig = secp256k1.sign(digest, privateKey, { prehash: false });
  const sigWithRecovery = new Uint8Array(65);
  sigWithRecovery.set(sig, 0);
  sigWithRecovery[64] = sig[64]!;
  return {
    signature: "0x" + Buffer.from(sigWithRecovery).toString("hex"),
    publicKey: TEST_PUBLIC_KEY_HEX,
    timestamp: tsMs.toString(),
  };
}

/** Build a signed Request using a frozen timestamp (FROZEN_NOW). */
function makeFrozenRequest(
  body: string = "",
  tsDeltaMs: number = 0,
  tamperedBody: string | null = null,
): Request {
  const ts = FROZEN_NOW + tsDeltaMs;
  const bodyBytes = new TextEncoder().encode(body);
  const { signature, publicKey, timestamp } = signRequest(TEST_PRIVATE_KEY, bodyBytes, ts);
  const finalBytes = new TextEncoder().encode(tamperedBody ?? body);
  const headers = new Headers({
    "content-type": "application/json",
    "X-Signature": signature,
    "X-Public-Key": publicKey,
    "X-Signature-Timestamp": timestamp,
  });
  return new Request("http://localhost/api/t0/provider/tzero.v1.payment.ProviderService/PayOut", {
    method: "POST",
    headers,
    body: finalBytes,
  });
}

/** Build a signed Request using real Date.now() — for the black-box
 *  buildT0Receiver tests where the receiver uses Date.now() internally. */
function makeRealtimeRequest(
  body: string = "",
  tsDeltaMs: number = 0,
  tamperedBody: string | null = null,
): Request {
  const ts = Date.now() + tsDeltaMs;
  const bodyBytes = new TextEncoder().encode(body);
  const { signature, publicKey, timestamp } = signRequest(TEST_PRIVATE_KEY, bodyBytes, ts);
  const finalBytes = new TextEncoder().encode(tamperedBody ?? body);
  const headers = new Headers({
    "content-type": "application/json",
    "X-Signature": signature,
    "X-Public-Key": publicKey,
    "X-Signature-Timestamp": timestamp,
  });
  return new Request("http://localhost/api/t0/provider/tzero.v1.payment.ProviderService/PayOut", {
    method: "POST",
    headers,
    body: finalBytes,
  });
}

async function readBody(req: Request): Promise<Uint8Array> {
  return new Uint8Array(await req.arrayBuffer());
}

describe("verifyRequestSignature", () => {
  it("accepts a valid signature", async () => {
    const req = makeFrozenRequest("body");
    const body = await readBody(req);
    const result = await verifyRequestSignature(req, body, TEST_PUBLIC_KEY, FROZEN_NOW_FN);
    expect(result).toBeNull();
  });

  it("rejects when any required header is missing", async () => {
    const req = new Request("http://localhost/", { method: "POST" });
    const result = await verifyRequestSignature(req, new Uint8Array(), TEST_PUBLIC_KEY, FROZEN_NOW_FN);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("rejects a wrong public key", async () => {
    const req = makeFrozenRequest("body");
    const body = await readBody(req);
    const wrongKey = "0x" + "cd".repeat(32);
    const headers = new Headers(req.headers);
    headers.set("X-Public-Key", wrongKey);
    const mutated = new Request(req.url, { method: "POST", headers, body: body as BodyInit });
    const result = await verifyRequestSignature(mutated, body, TEST_PUBLIC_KEY, FROZEN_NOW_FN);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("rejects a stale timestamp", async () => {
    const req = makeFrozenRequest("body", -120_000);
    const body = await readBody(req);
    const result = await verifyRequestSignature(req, body, TEST_PUBLIC_KEY, FROZEN_NOW_FN);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(408);
  });

  it("rejects a tampered body", async () => {
    const req = makeFrozenRequest("original", 0, "TAMPERED");
    const body = await readBody(req);
    const result = await verifyRequestSignature(req, body, TEST_PUBLIC_KEY, FROZEN_NOW_FN);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("rejects non-hex signature", async () => {
    const headers = new Headers({
      "X-Signature": "not-hex!@#",
      "X-Public-Key": TEST_PUBLIC_KEY_HEX,
      "X-Signature-Timestamp": FROZEN_NOW.toString(),
    });
    const req = new Request("http://localhost/x", { method: "POST", headers, body: "" });
    const result = await verifyRequestSignature(req, new Uint8Array(0), TEST_PUBLIC_KEY, FROZEN_NOW_FN);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("accepts a signature without the 0x prefix on either header", async () => {
    const bodyBytes = new TextEncoder().encode("body");
    const { signature, timestamp } = signRequest(TEST_PRIVATE_KEY, bodyBytes, FROZEN_NOW);
    const headers = new Headers({
      "X-Signature": signature.replace(/^0x/, ""),
      "X-Public-Key": TEST_PUBLIC_KEY_HEX.replace(/^0x/, ""),
      "X-Signature-Timestamp": timestamp,
    });
    const req = new Request("http://localhost/x", { method: "POST", headers, body: bodyBytes });
    const result = await verifyRequestSignature(req, bodyBytes, TEST_PUBLIC_KEY, FROZEN_NOW_FN);
    expect(result).toBeNull();
  });
});

describe("buildT0Receiver", () => {
  const svc = new PayoutProviderService(new MockT0Client(), () => FROZEN_NOW);

  it("returns 405 for non-POST methods", async () => {
    const receiver = buildT0Receiver({ networkPublicKey: TEST_PUBLIC_KEY_HEX, network: svc as never });
    const res = await receiver(new Request("http://localhost/x", { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("returns 401 when signature verification fails (missing headers)", async () => {
    const receiver = buildT0Receiver({ networkPublicKey: TEST_PUBLIC_KEY_HEX, network: svc as never });
    const res = await receiver(new Request("http://localhost/x", { method: "POST", body: "body" }));
    expect(res.status).toBe(401);
  });

  it("returns 408 when timestamp is stale", async () => {
    const receiver = buildT0Receiver({ networkPublicKey: TEST_PUBLIC_KEY_HEX, network: svc as never });
    // Use real-time signing so the timestamp is in range, then send to a
    // receiver whose "now" is the real time minus 5 min.
    const req = makeRealtimeRequest("", 0);
    // Replace the receiver's clock to be 5 min in the future, so the
    // real-time signature is "5 min old" from the receiver's view.
    const fiveMinFuture = () => Date.now() + 5 * 60_000;
    // We can't pass `now` into the receiver; instead, sign with -5min offset.
    const staleReq = makeRealtimeRequest("", -5 * 60_000);
    const res = await receiver(staleReq);
    expect(res.status).toBe(408);
  });

  it("returns 401 when signature doesn't match body", async () => {
    const receiver = buildT0Receiver({ networkPublicKey: TEST_PUBLIC_KEY_HEX, network: svc as never });
    const req = makeRealtimeRequest("original", 0, "DIFFERENT BODY");
    const res = await receiver(req);
    expect(res.status).toBe(401);
  });

  it("dispatches a valid signed payOut (connect envelope, not 401/408)", async () => {
    const receiver = buildT0Receiver({ networkPublicKey: TEST_PUBLIC_KEY_HEX, network: svc as never });
    const body = JSON.stringify({ paymentId: "99", currency: "EUR", clientQuoteId: "qt" });
    const req = makeRealtimeRequest(body);
    const res = await receiver(req);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(408);
  });

  it("returns 404 for an unknown provider path", async () => {
    const receiver = buildT0Receiver({ networkPublicKey: TEST_PUBLIC_KEY_HEX, network: svc as never });
    const req = makeRealtimeRequest("body");
    // Force a URL that matches our catch-all but no router handler.
    const headers = new Headers(req.headers);
    const url = new URL(req.url);
    url.pathname = "/api/t0/provider/tzero.v1.payment.ProviderService/UnknownMethod";
    const mutated = new Request(url.toString(), { method: "POST", headers, body: req.body });
    const res = await receiver(mutated);
    expect(res.status).toBe(404);
  });
});