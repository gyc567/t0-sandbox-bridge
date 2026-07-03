import { describe, it, expect } from "vitest";
import {
  ContractError,
  assertDefined,
  assertNever,
  assertUnreachable,
  assert,
  assertNonEmpty,
  assertPositiveNumber,
  assertNonNegativeNumber,
  assertPositiveBigInt,
  assertHex,
  assertHexBytes,
  assertTimestampMs,
  assertSignature,
  assertPublicKey,
  assertHash,
} from "./index";

describe("contracts / assert", () => {
  it("assertDefined narrows and rejects null/undefined", () => {
    const v: string | null = "ok";
    assertDefined(v);
    expect(v.toUpperCase()).toBe("OK");

    expect(() => assertDefined(null, "x")).toThrowError(ContractError);
    expect(() => assertDefined(undefined, "x")).toThrowError(/\[contract:defined\] x/);
  });

  it("assertNever rejects unexpected discriminant", () => {
    type D = { k: "a" } | { k: "b" };
    const handle = (d: D): string => {
      switch (d.k) {
        case "a":
          return "A";
        case "b":
          return "B";
        default:
          return assertNever(d);
      }
    };
    expect(handle({ k: "a" })).toBe("A");
    expect(handle({ k: "b" })).toBe("B");
  });

  it("assertUnreachable throws", () => {
    expect(() => assertUnreachable()).toThrowError(/\[contract:unreachable\]/);
  });

  it("assert rejects false condition with rule prefix", () => {
    expect(() => assert(false, "x", "y")).toThrowError(/\[contract:x\] y/);
    expect(() => assert(true, "x", "y")).not.toThrow();
  });

  it("assertNonEmpty trims and rejects empty/whitespace", () => {
    expect(assertNonEmpty("  hi ")).toBe("hi");
    expect(() => assertNonEmpty("   ", "name")).toThrowError(/name/);
  });
});

describe("contracts / financial", () => {
  it("assertPositiveNumber", () => {
    expect(assertPositiveNumber(1)).toBe(1);
    expect(() => assertPositiveNumber(0)).toThrow();
    expect(() => assertPositiveNumber(-1)).toThrow();
    expect(() => assertPositiveNumber(NaN)).toThrow();
    expect(() => assertPositiveNumber(Infinity)).toThrow();
  });

  it("assertNonNegativeNumber allows zero", () => {
    expect(assertNonNegativeNumber(0)).toBe(0);
    expect(() => assertNonNegativeNumber(-0.01)).toThrow();
  });

  it("assertPositiveBigInt", () => {
    expect(assertPositiveBigInt(1n)).toBe(1n);
    expect(() => assertPositiveBigInt(0n)).toThrow();
    expect(() => assertPositiveBigInt(-1n)).toThrow();
  });

  it("assertHex normalises case and validates prefix", () => {
    expect(assertHex("0xABCD")).toBe("0xabcd");
    expect(() => assertHex("ABCD")).toThrow();
    expect(() => assertHex("0xZZ")).toThrow();
  });

  it("assertHexBytes enforces length", () => {
    expect(assertHexBytes("0x" + "ab".repeat(32), 32)).toHaveLength(66);
    expect(() => assertHexBytes("0xab", 32)).toThrow(/32 bytes/);
  });

  it("assertTimestampMs bounds range", () => {
    expect(assertTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(() => assertTimestampMs(0)).toThrow();
    expect(() => assertTimestampMs(1.5)).toThrow();
    expect(() => assertTimestampMs(99_999_999_999_999)).toThrow();
  });
});

describe("contracts / crypto", () => {
  const sig = "0x" + "11".repeat(64);
  const pub = "0x" + "02" + "22".repeat(32);
  const hash = "0x" + "33".repeat(32);

  it("assertSignature accepts 64-byte hex", () => {
    expect(assertSignature(sig)).toBe(sig);
    expect(() => assertSignature("0xabcd")).toThrow(/64-byte/);
  });

  it("assertPublicKey accepts 33-byte compressed", () => {
    expect(assertPublicKey(pub)).toBe(pub);
    // 34 bytes is one too many — should be rejected.
    expect(() => assertPublicKey("0x" + "02".repeat(34))).toThrow(/33-byte/);
    expect(() => assertPublicKey("0x" + "02".repeat(20))).toThrow(/33-byte/);
  });

  it("assertHash accepts 32-byte hex", () => {
    expect(assertHash(hash)).toBe(hash);
    expect(() => assertHash("0xabcd")).toThrow(/32-byte/);
  });
});
