import { describe, it, expect } from "vitest";
import { SignerConfigError, normalisePrivateKey } from "./sdk-signer";

const VALID_KEY = "a".repeat(64);
const VALID_KEY_0X = "0x" + VALID_KEY;

describe("normalisePrivateKey", () => {
  it("accepts a 64-char hex without 0x prefix", () => {
    expect(normalisePrivateKey(VALID_KEY)).toBe("0x" + VALID_KEY);
  });

  it("accepts a 64-char hex with 0x prefix", () => {
    expect(normalisePrivateKey(VALID_KEY_0X)).toBe(VALID_KEY_0X);
  });

  it("accepts uppercase hex", () => {
    const upper = ("A".repeat(32) + "B".repeat(32));
    expect(normalisePrivateKey(upper)).toBe("0x" + upper);
  });

  it("trims surrounding whitespace", () => {
    expect(normalisePrivateKey("  " + VALID_KEY + "\n")).toBe("0x" + VALID_KEY);
  });

  it("throws SignerConfigError on non-hex characters", () => {
    expect(() => normalisePrivateKey("z".repeat(64))).toThrow(SignerConfigError);
    expect(() => normalisePrivateKey("z".repeat(64))).toThrow(/64 hex characters/);
  });

  it("throws SignerConfigError when too short", () => {
    expect(() => normalisePrivateKey("abcd")).toThrow(SignerConfigError);
  });

  it("throws SignerConfigError when too long", () => {
    expect(() => normalisePrivateKey("a".repeat(66))).toThrow(SignerConfigError);
  });

  it("throws SignerConfigError on empty string", () => {
    expect(() => normalisePrivateKey("")).toThrow(SignerConfigError);
  });

  it("throws SignerConfigError on pure whitespace", () => {
    expect(() => normalisePrivateKey("   ")).toThrow(SignerConfigError);
  });
});

describe("SignerConfigError", () => {
  it("carries the configured name", () => {
    const err = new SignerConfigError("boom");
    expect(err.name).toBe("SignerConfigError");
    expect(err.message).toBe("boom");
    expect(err instanceof Error).toBe(true);
  });
});