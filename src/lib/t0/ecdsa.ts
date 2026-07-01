// ECDSA signature module for T-0 API authentication.
// Follows the protocol: body + 8-byte little-endian timestamp -> Keccak-256 -> sign

import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { etc } from "@noble/secp256k1";

/** Result of signing a request body */
export interface SignatureResult {
  /** 0x + 65 bytes hex (v + r + s) */
  signature: string;
  /** 0x + 33 bytes hex (compressed public key) */
  publicKey: string;
  /** Unix timestamp in milliseconds */
  timestamp: bigint;
  /** Keccak-256 hash of payload */
  hash: string;
}

/**
 * Build signing payload: body + 8-byte little-endian timestamp.
 */
function buildPayload(body: string, timestamp: bigint): Uint8Array {
  const bodyBytes = new TextEncoder().encode(body);
  const timestampBytes = new Uint8Array(8);
  new DataView(timestampBytes.buffer).setBigUint64(0, timestamp, true);
  const payload = new Uint8Array(bodyBytes.length + 8);
  payload.set(bodyBytes);
  payload.set(timestampBytes, bodyBytes.length);
  return payload;
}

/**
 * Sign a request body for T-0 API authentication.
 * Protocol: body + 8-byte little-endian timestamp -> Keccak-256 -> secp256k1 sign
 */
export async function signRequest(
  body: string,
  privateKeyHex: string,
  timestamp: bigint = BigInt(Date.now()),
): Promise<SignatureResult> {
  const payload = buildPayload(body, timestamp);
  const hash = keccak_256(payload);
  const hashHex = "0x" + etc.bytesToHex(hash);

  const pk = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  const privateKey = etc.hexToBytes(pk);
  // Use compact format (64 bytes: r + s) for verification compatibility
  const signatureBytes = await secp.signAsync(hash, privateKey, {
    prehash: false,
    format: "compact",
  });

  const signatureHex = etc.bytesToHex(signatureBytes);
  const publicKeyBytes = secp.getPublicKey(privateKey, true);
  const publicKey = "0x" + etc.bytesToHex(publicKeyBytes);

  return {
    signature: "0x" + signatureHex,
    publicKey,
    timestamp,
    hash: hashHex,
  };
}

/**
 * Verify a signature produced by signRequest.
 */
export async function verifySignature(
  body: string,
  result: SignatureResult,
): Promise<boolean> {
  const payload = buildPayload(body, result.timestamp);
  const hash = keccak_256(payload);
  const sig = result.signature.startsWith("0x") ? result.signature.slice(2) : result.signature;
  const pub = result.publicKey.startsWith("0x") ? result.publicKey.slice(2) : result.publicKey;
  const signatureBytes = etc.hexToBytes(sig);
  const publicKeyBytes = etc.hexToBytes(pub);

  return secp.verifyAsync(signatureBytes, hash, publicKeyBytes, {
    prehash: false,
  });
}

/**
 * Generate a random secp256k1 private key (32 bytes hex).
 */
export function generatePrivateKey(): string {
  const key = secp.utils.randomSecretKey();
  return "0x" + etc.bytesToHex(key);
}

/**
 * Derive compressed public key from private key.
 */
export function derivePublicKey(privateKeyHex: string): string {
  const pk = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  const privateKey = etc.hexToBytes(pk);
  const publicKeyBytes = secp.getPublicKey(privateKey, true);
  return "0x" + etc.bytesToHex(publicKeyBytes);
}

/**
 * Build HTTP headers for signed request.
 */
export function buildAuthHeaders(result: SignatureResult): Record<string, string> {
  return {
    "X-Signature": result.signature,
    "X-Public-Key": result.publicKey,
    "X-Signature-Timestamp": result.timestamp.toString(),
  };
}

/**
 * Generate cURL command for testing signed requests.
 */
export function toCurl(
  url: string,
  body: string,
  result: SignatureResult,
  method = "POST",
): string {
  const headers = buildAuthHeaders(result);
  const headerFlags = Object.entries(headers)
    .map(([k, v]) => `-H '${k}: ${v}'`)
    .join(" ");
  const dataFlag = body ? `-d '${body}'` : "";
  const methodPart = method !== "GET" ? `-X ${method}` : "";
  return `curl ${methodPart} '${url}' ${headerFlags} ${dataFlag}`.trim().replace(/\s+/g, " ");
}