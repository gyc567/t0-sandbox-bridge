/**
 * Contract test for ecdsa — the AI regression baseline.
 *
 * Goal: any future AI-generated change to ecdsa.ts must keep these invariants
 * intact. If it doesn't, the schema parse or assertContract call will fail
 * with a precise error message pointing at the exact field.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { signRequest, verifySignature, buildAuthHeaders, toCurl } from "./ecdsa";
import { assertContract, assertContractRoundtrip } from "@/test/contract";
import { TEST_PRIVATE_KEY, TEST_TIMESTAMP_MS, TEST_BODY } from "@/test/fixtures";
import { assertStableSnapshot } from "@/test/snapshot";

// Mirror buildAuthHeaders() — single source of truth for the auth header shape.
// If ecdsa.ts adds/removes a header, this schema must move with it.
const AuthHeadersSchema = z.object({
  "X-Signature": z.string().regex(/^0x[0-9a-fA-F]{128}$/),
  "X-Public-Key": z.string().regex(/^0x[0-9a-fA-F]{66}$/),
  "X-Signature-Timestamp": z.string().regex(/^\d+$/),
});

describe("ecdsa / contract: signRequest output", () => {
  it("matches the auth-headers schema", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, BigInt(TEST_TIMESTAMP_MS));
    const headers = buildAuthHeaders(signed);

    assertContract(AuthHeadersSchema, headers, "buildAuthHeaders");
    assertContractRoundtrip(AuthHeadersSchema, headers, "buildAuthHeaders");
  });

  it("verifySignature round-trips for any caller-provided body", async () => {
    const body = JSON.stringify({ n: 42, msg: "hi" });
    const signed = await signRequest(body, TEST_PRIVATE_KEY, BigInt(TEST_TIMESTAMP_MS));
    const ok = await verifySignature(body, signed);
    expect(ok).toBe(true);
  });

  it("toCurl produces a stable snapshot (signatures masked)", async () => {
    const signed = await signRequest(TEST_BODY, TEST_PRIVATE_KEY, BigInt(TEST_TIMESTAMP_MS));
    const curl = toCurl("https://api.example.com/x", TEST_BODY, signed, "POST");

    // Mask only the volatile fields so the snapshot stays readable across
    // signature regeneration. URL/method/body stay visible. Order matters:
    // longer/more specific needles first to avoid prefix collisions.
    assertStableSnapshot(
      curl,
      ["X-Signature-Timestamp", "X-Signature", "X-Public-Key"],
      "ecdsa.toCurl shape",
    );
  });
});
