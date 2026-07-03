/**
 * ECDSA signature auth flow from spec §2.
 * 4 steps + 3 headers + 1-minute replay window.
 */

export interface AuthStep {
  index: string;
  title: string;
  detail: string;
}

export interface AuthHeader {
  name: string;
  format: string;
  description: string;
}

export const AUTH_STEPS: readonly AuthStep[] = [
  {
    index: "01",
    title: "Get timestamp",
    detail: "Unix milliseconds as 64-bit little-endian unsigned int",
  },
  {
    index: "02",
    title: "Concatenate",
    detail: "Append timestamp bytes to the request body",
  },
  {
    index: "03",
    title: "Hash",
    detail: "Keccak-256(combined) → 32 bytes digest",
  },
  {
    index: "04",
    title: "Sign",
    detail: "secp256k1 ECDSA over digest → 65 bytes (v + r + s)",
  },
];

export const AUTH_HEADERS: readonly AuthHeader[] = [
  {
    name: "X-Signature",
    format: "Hex-encoded ECDSA signature (65 bytes)",
    description: "Keccak-256(body + timestamp) 的签名结果",
  },
  {
    name: "X-Public-Key",
    format: "Hex-encoded public key (33 bytes compressed preferred)",
    description: "Provider 用于验签的公钥",
  },
  {
    name: "X-Signature-Timestamp",
    format: "Unix milliseconds",
    description: "防重放窗口 ±1 分钟",
  },
];

export const REPLAY_WINDOW_MS = 60_000;

/**
 * 20-line TypeScript snippet from spec §2.3, trimmed.
 * Used inside FlowAuthFlow code block.
 */
export const SIGN_REQUEST_SNIPPET = `// 1. timestamp → little-endian 64-bit
const timestamp = Date.now();
const tsBuf = Buffer.alloc(8);
tsBuf.writeBigUInt64LE(BigInt(timestamp));

// 2. concatenate body + timestamp
const combined = Buffer.concat([
  Buffer.isBuffer(body) ? body : Buffer.from(body),
  tsBuf,
]);

// 3. Keccak-256 hash
const hash = keccak256(combined);

// 4. ECDSA secp256k1 sign
const sig = ecsign(hash, this.privateKey);
const signature = '0x' + toCompactSig(sig.v, sig.r, sig.s)
  .toString('hex');

// 5. headers
return {
  'X-Signature': signature,
  'X-Public-Key': '0x' + this.publicKey.toString('hex'),
  'X-Signature-Timestamp': timestamp.toString(),
};`;
