/**
 * Crypto-specific invariants.
 *
 * These checks intentionally accept loose shapes (length, charset) rather than
 * full semantic validation — the actual signature/hash verification happens
 * upstream via @noble/* . The goal here is to catch "AI passed the wrong kind
 * of string" mistakes at the boundary.
 */

const SIG_COMPACT_RE = /^0x[0-9a-fA-F]{128}$/; // 64 bytes
const PUBKEY_COMPACT_RE = /^0x[0-9a-fA-F]{66}$/; // 33 bytes compressed
const HASH_RE = /^0x[0-9a-fA-F]{64}$/; // 32 bytes

export function assertSignature(signature: string, label = "signature"): string {
  if (!SIG_COMPACT_RE.test(signature)) {
    throw new Error(
      `[contract:signature] ${label} must be 64-byte hex (128 chars + 0x), got ${signature.slice(0, 12)}…`,
    );
  }
  return signature.toLowerCase();
}

export function assertPublicKey(publicKey: string, label = "publicKey"): string {
  if (!PUBKEY_COMPACT_RE.test(publicKey)) {
    throw new Error(
      `[contract:publicKey] ${label} must be 33-byte compressed hex (66 chars + 0x), got ${publicKey.slice(0, 12)}…`,
    );
  }
  return publicKey.toLowerCase();
}

export function assertHash(hash: string, label = "hash"): string {
  if (!HASH_RE.test(hash)) {
    throw new Error(
      `[contract:hash] ${label} must be 32-byte hex (64 chars + 0x), got ${hash.slice(0, 12)}…`,
    );
  }
  return hash.toLowerCase();
}
