// aml-blob.ts — Base64 encoding/decoding helpers for AML file transfer.
//
// Node.js (server-side): uses Buffer for O(n) performance.
// Browser (client-side): uses btoa + String.fromCharCode fallback.
//
// Both paths are pure functions with no side effects or DOM dependencies,
// so they are safe to call during SSR without a window reference.

/** Encode a Uint8Array to a base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Decode a base64 string to a Uint8Array. */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
