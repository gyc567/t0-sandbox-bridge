// Inbound HTTP receiver for the T-0 Provider SDK.
//
// T-0 Network calls our ProviderService via ConnectRPC. The SDK's
// `createService` returns a `ConnectRouterOptions`-shaped object; we
// hand it to `createConnectRouter` and then build a single Web Fetch
// handler via `createFetchHandler`.
//
// Signature verification (the SDK's Node version uses `req.on('data')`
// to stream-hash the body) is reimplemented here for the Web Fetch
// platform: read the body once, hash incrementally, then dispatch the
// reconstructed request to the handler.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Buffer } from "node:buffer";
import { createConnectRouter } from "@connectrpc/connect";
import { createFetchHandler, type UniversalHandlerFn } from "@connectrpc/connect/protocol";
import { ProviderService } from "@t-0/provider-sdk";
import { sandboxNetwork } from "./index";
import { createProviderServiceImpl } from "./provider-impl";

// The T-0 Network's signature headers — must match the SDK's own values.
// Inlined here because the SDK does not re-export `NetworkHeaders` from
// its main entry (it lives at `@t-0/provider-sdk/common/headers` which is
// not part of the public surface).
const SIGNATURE_HEADERS = {
  signature: "X-Signature",
  publicKey: "X-Public-Key",
  timestamp: "X-Signature-Timestamp",
} as const;

const TIMESTAMP_TOLERANCE_MS = 60_000;
const HEX_0X = /^0x/i;

function stripHexPrefix(s: string): string {
  return HEX_0X.test(s) ? s.slice(2) : s;
}

function hexToBytes(value: string): Uint8Array {
  const hex = stripHexPrefix(value);
  if (hex.length % 2 !== 0) {
    throw new Error("hex string must have even length");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function timestampBytes(tsMs: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setBigUint64(0, BigInt(tsMs), true /* little-endian */);
  return new Uint8Array(buf);
}

export interface SignatureVerificationFailure {
  status: 401 | 408;
  body: string;
}

/**
 * Verify the three signature headers against the body bytes.
 * Returns null on success, or a failure descriptor with status + body on error.
 *
 * Mirrors the verification logic in `@t-0/provider-sdk`'s `service.ts`
 * `createSignatureVerification` interceptor — reimplemented here because
 * the SDK version expects a Node IncomingMessage and we run on Web Fetch.
 */
export async function verifyRequestSignature(
  request: Request,
  bodyBytes: Uint8Array,
  networkPublicKey: Uint8Array,
  now: () => number = Date.now,
): Promise<SignatureVerificationFailure | null> {
  const sigHeader = request.headers.get(SIGNATURE_HEADERS.signature);
  const pkHeader = request.headers.get(SIGNATURE_HEADERS.publicKey);
  const tsHeader = request.headers.get(SIGNATURE_HEADERS.timestamp);

  if (!sigHeader || !pkHeader || !tsHeader) {
    return { status: 401, body: `missing required signature header(s)` };
  }

  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts)) {
    return { status: 401, body: "invalid timestamp header" };
  }
  if (Math.abs(now() - ts) > TIMESTAMP_TOLERANCE_MS) {
    return { status: 408, body: "timestamp outside tolerance window" };
  }

  let publicKey: Uint8Array;
  try {
    publicKey = hexToBytes(pkHeader);
  } catch {
    return { status: 401, body: "invalid public-key format" };
  }
  if (!bytesEqual(publicKey, networkPublicKey)) {
    return { status: 401, body: "public key does not match network key" };
  }

  let signature: Uint8Array;
  try {
    signature = hexToBytes(sigHeader);
  } catch {
    return { status: 401, body: "invalid signature format" };
  }
  // Tolerate the 65-byte recovery-id form: drop the trailing byte.
  if (signature.length === 65) signature = signature.subarray(0, 64);

  const hasher = keccak_256.create();
  hasher.update(bodyBytes);
  hasher.update(timestampBytes(ts));
  const digest = hasher.digest();

  let ok = false;
  try {
    ok = secp256k1.verify(signature, digest, publicKey, { prehash: false });
  } catch {
    return { status: 401, body: "signature verification threw" };
  }
  if (!ok) return { status: 401, body: "signature did not verify" };

  return null;
}

// ── Bootstrap a Web Fetch handler ──────────────────────────────────

export interface BuildReceiverOptions {
  /** Hex-encoded (0x-prefixed or not) compressed/uncompressed network public key. */
  networkPublicKey: string;
  /** Override the SandboxNetwork used by the RPC handlers. Defaults
   *  to the module-level singleton from ./index. */
  network?: typeof sandboxNetwork;
}

/**
 * Build a single (req: Request) => Response handler for the T-0 Provider
 * service. Verifies the signature headers, then dispatches via ConnectRPC.
 *
 * Returned handler is suitable to pass directly to TanStack Start's
 * `createFileRoute("/api/t0/provider/$").server.handlers.POST = ...`.
 */
export function buildT0Receiver(
  opts: BuildReceiverOptions,
): (request: Request) => Promise<Response> {
  // Convert Uint8Array → Buffer so the SDK's `Buffer.compare` works.
  const networkPublicKey = Buffer.from(hexToBytes(opts.networkPublicKey));
  const network = opts.network ?? sandboxNetwork;

  // Build the Connect handler once. The SDK's `createService` returns a
  // `ConnectRouterOptions` whose `.routes` callback registers our handlers
  // on a `ConnectRouter`. We then feed that router into `createFetchHandler`.
  //
  // NOTE: We do NOT pass the SDK's interceptors (signature verification,
  // response validation) because they expect a Node IncomingMessage with
  // a `.hasher` property attached by `signatureValidation` middleware.
  // We do signature verification ourselves in `verifyRequestSignature` above
  // — the SDK's interceptor would be redundant and is broken on Web Fetch.
  let cachedHandler: ((req: Request) => Promise<Response>) | null = null;
  function getHandler(): (req: Request) => Promise<Response> {
    if (cachedHandler !== null) return cachedHandler;
    const impl = createProviderServiceImpl(network);
    const router = createConnectRouter({});
    // `createConnectRouter` does not invoke our `routes` callback for us.
    router.service(ProviderService, impl as never);
    // Build a UniversalHandlerFn that finds the right handler by URL prefix.
    const dispatch: UniversalHandlerFn = (req) => {
      // `req.url` is a full URL like `http://host/api/t0/provider/...`.
      // Extract just the path component, then strip our catch-all prefix
      // so we can match against the router's `requestPath` (which is
      // just the service path like `/tzero.v1.payment.ProviderService/PayOut`).
      const fullUrl = new URL(req.url, "http://placeholder.invalid");
      const path = fullUrl.pathname;
      const prefix = "/api/t0/provider";
      const stripped = path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;
      const u = router.handlers.find((h) => stripped.startsWith(h.requestPath));
      if (!u) {
        const empty: AsyncIterable<Uint8Array> = {
          [Symbol.asyncIterator]: async function* () {
            // empty body
          },
        };
        return Promise.resolve({
          status: 404,
          header: new Headers(),
          body: empty,
          trailer: new Headers(),
        });
      }
      return u(req);
    };
    cachedHandler = createFetchHandler(dispatch);
    return cachedHandler;
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    // 1. Read the body once.
    const bodyBytes = new Uint8Array(await request.arrayBuffer());

    // 2. Verify signature headers BEFORE invoking the handler.
    const verification = await verifyRequestSignature(
      request,
      bodyBytes,
      new Uint8Array(networkPublicKey),
    );
    if (verification !== null) {
      return new Response(verification.body, { status: verification.status });
    }

    // 3. Dispatch via the cached Connect handler. `createFetchHandler`
    //    re-reads the body, so we reconstruct a Request with the cached bytes.
    const reconstructed = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bodyBytes,
      // @ts-expect-error — duplex not in standard lib.dom yet but supported in Node 18+
      duplex: "half",
    });
    try {
      return await getHandler()(reconstructed);
    } catch (e) {
      // The Connect layer normally converts thrown errors to 500 responses,
      // so this catch is a safety net for unexpected infrastructure errors
      // (e.g. body stream failure, hasher init bug).
      const message = e instanceof Error ? e.message : String(e);
      console.error("t0-receiver dispatch error:", message, e instanceof Error ? e.stack : "");
      return new Response(
        JSON.stringify({ code: "internal", message: "receiver error: " + message }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  };
}

// Re-export for callers that want the sandboxNetwork singleton.
export { sandboxNetwork };
