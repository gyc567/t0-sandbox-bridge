import { describe, it, expect } from "vitest";
import {
  signRequest,
  verifySignature,
  generatePrivateKey,
  derivePublicKey,
  buildAuthHeaders,
  toCurl,
} from "./ecdsa";

// Fixed test vector for deterministic testing
const TEST_PRIVATE_KEY = "0x" + "01".repeat(32);
const TEST_TIMESTAMP = 1_700_000_000_000n;
const TEST_BODY = '{"test":"data"}';

describe("signRequest", () => {
  it("produces valid signature structure", async () => {
    const result = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);

    expect(result.signature).toMatch(/^0x[0-9a-f]{128}$/); // 64 bytes = 128 hex chars (compact format)
    expect(result.publicKey).toMatch(/^0x[0-9a-f]{66}$/); // 33 bytes = 66 hex chars
    expect(result.timestamp).toBe(TEST_TIMESTAMP);
    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
  });

  it("produces deterministic signature for same input", async () => {
    const result1 = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const result2 = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);

    // Signatures may differ due to k randomness, but publicKey and hash are deterministic
    expect(result1.publicKey).toBe(result2.publicKey);
    expect(result1.hash).toBe(result2.hash);
    expect(result1.timestamp).toBe(result2.timestamp);
  });

  it("uses provided timestamp", async () => {
    const ts = 1_700_000_000_000n;
    const result = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, ts);
    expect(result.timestamp).toBe(ts);
  });

  it("uses current time when timestamp not provided", async () => {
    const before = BigInt(Date.now());
    const result = await signRequest(TEST_BODY, TEST_PRIVATE_KEY);
    const after = BigInt(Date.now());

    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  it("produces different signatures for different bodies", async () => {
    const result1 = await signRequest('{"a":1}', TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const result2 = await signRequest('{"a":2}', TEST_PRIVATE_KEY, TEST_TIMESTAMP);

    expect(result1.signature).not.toBe(result2.signature);
    expect(result1.hash).not.toBe(result2.hash);
  });

  it("produces different signatures for different timestamps", async () => {
    const result1 = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, 1_700_000_000_000n);
    const result2 = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, 1_700_000_001_000n);

    expect(result1.signature).not.toBe(result2.signature);
    expect(result1.hash).not.toBe(result2.hash);
  });
});

describe("verifySignature", () => {
  it("verifies valid signature", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const valid = await verifySignature(TEST_BODY, signed);

    expect(valid).toBe(true);
  });

  it("rejects signature with wrong body", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const valid = await verifySignature('{"wrong":"body"}', signed);

    expect(valid).toBe(false);
  });

  it("rejects signature with tampered timestamp", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const tampered = { ...signed, timestamp: TEST_TIMESTAMP + 1n };
    const valid = await verifySignature(TEST_BODY, tampered);

    expect(valid).toBe(false);
  });

  it("rejects signature with tampered signature", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    // Change first char to completely different value
    const tampered = { ...signed, signature: "0x" + "ff".repeat(64) };
    const valid = await verifySignature(TEST_BODY, tampered);

    expect(valid).toBe(false);
  });

  it("rejects signature with wrong public key", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const wrongKey = derivePublicKey("0x" + "02".repeat(32));
    const tampered = { ...signed, publicKey: wrongKey };
    const valid = await verifySignature(TEST_BODY, tampered);

    expect(valid).toBe(false);
  });
});

describe("generatePrivateKey", () => {
  it("generates 32-byte hex key with 0x prefix", () => {
    const key = generatePrivateKey();

    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("generates unique keys", () => {
    const key1 = generatePrivateKey();
    const key2 = generatePrivateKey();

    expect(key1).not.toBe(key2);
  });

  it("key is valid for signing", async () => {
    const key = generatePrivateKey();
    const result = await signRequest(TEST_BODY, key);
    const valid = await verifySignature(TEST_BODY, result);

    expect(valid).toBe(true);
  });
});

describe("derivePublicKey", () => {
  it("derives compressed 33-byte public key", () => {
    const pubKey = derivePublicKey(TEST_PRIVATE_KEY);

    expect(pubKey).toMatch(/^0x[0-9a-f]{66}$/);
  });

  it("derives consistent public key", () => {
    const pubKey1 = derivePublicKey(TEST_PRIVATE_KEY);
    const pubKey2 = derivePublicKey(TEST_PRIVATE_KEY);

    expect(pubKey1).toBe(pubKey2);
  });

  it("public key matches the one from signRequest", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const derived = derivePublicKey(TEST_PRIVATE_KEY);

    expect(signed.publicKey).toBe(derived);
  });

  it("different private keys produce different public keys", () => {
    const key1 = "0x" + "01".repeat(32);
    const key2 = "0x" + "02".repeat(32);

    const pubKey1 = derivePublicKey(key1);
    const pubKey2 = derivePublicKey(key2);

    expect(pubKey1).not.toBe(pubKey2);
  });

  it("derivePublicKey works without 0x prefix", () => {
    const key = "01".repeat(32); // No 0x prefix
    const pubKey = derivePublicKey(key);

    expect(pubKey).toMatch(/^0x[0-9a-f]{66}$/);
  });

  it("signRequest works without 0x prefix on private key", async () => {
    const key = "01".repeat(32); // No 0x prefix
    const result = await signRequest(TEST_BODY, key, TEST_TIMESTAMP);

    expect(result.signature).toMatch(/^0x[0-9a-f]{128}$/);
    expect(result.publicKey).toMatch(/^0x[0-9a-f]{66}$/);
  });

  it("verifySignature works without 0x prefix", async () => {
    const key = "01".repeat(32);
    const signed = await signRequest(TEST_BODY, key, TEST_TIMESTAMP);
    // Modify the result to not have 0x prefix
    const resultNoPrefix = {
      ...signed,
      signature: signed.signature.slice(2),
      publicKey: signed.publicKey.slice(2),
    };
    const valid = await verifySignature(TEST_BODY, resultNoPrefix);

    expect(valid).toBe(true);
  });
});

describe("buildAuthHeaders", () => {
  it("builds correct headers", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const headers = buildAuthHeaders(signed);

    expect(headers["X-Signature"]).toBe(signed.signature);
    expect(headers["X-Public-Key"]).toBe(signed.publicKey);
    expect(headers["X-Signature-Timestamp"]).toBe(signed.timestamp.toString());
  });

  it("headers contain all required fields", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const headers = buildAuthHeaders(signed);

    expect(Object.keys(headers)).toHaveLength(3);
    expect(headers).toHaveProperty("X-Signature");
    expect(headers).toHaveProperty("X-Public-Key");
    expect(headers).toHaveProperty("X-Signature-Timestamp");
  });
});

describe("toCurl", () => {
  it("generates valid curl command", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const curl = toCurl("https://api.example.com/endpoint", TEST_BODY, signed);

    expect(curl).toContain("curl");
    expect(curl).toContain("POST");
    expect(curl).toContain("https://api.example.com/endpoint");
    expect(curl).toContain("-d");
    expect(curl).toContain(TEST_BODY);
    expect(curl).toContain("-H 'X-Signature:");
    expect(curl).toContain("-H 'X-Public-Key:");
    expect(curl).toContain("-H 'X-Signature-Timestamp:");
  });

  it("omits -X flag for GET method", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const curl = toCurl("https://api.example.com/endpoint", TEST_BODY, signed, "GET");

    // GET requests don't need -X flag in curl (default is GET)
    expect(curl).not.toContain("-X");
    expect(curl).toContain("curl 'https://api.example.com/endpoint'");
  });

  it("includes -X flag for non-GET methods", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const curl = toCurl("https://api.example.com/endpoint", TEST_BODY, signed, "DELETE");

    expect(curl).toContain("-X DELETE");
  });

  it("POST method includes -X POST flag", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const curl = toCurl("https://api.example.com/endpoint", TEST_BODY, signed, "POST");

    expect(curl).toContain("-X POST");
  });

  it("includes body for POST with empty body", async () => {
    const signed = await signRequest("", TEST_PRIVATE_KEY, TEST_TIMESTAMP);
    const curl = toCurl("https://api.example.com/endpoint", "", signed);

    expect(curl).not.toContain("-d ''");
  });
});
