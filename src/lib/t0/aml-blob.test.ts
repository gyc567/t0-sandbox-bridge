import { describe, it, expect } from "vitest";
import { bytesToBase64, base64ToBytes } from "./aml-blob";

describe("bytesToBase64", () => {
  it("encodes empty array to empty string", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
  });

  it("round-trips a known byte sequence correctly", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = bytesToBase64(original);
    expect(encoded).toBe("SGVsbG8=");
    expect(base64ToBytes(encoded)).toEqual(original);
  });

  it("round-trips binary data with all byte values (0x00–0xFF)", () => {
    const allBytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) allBytes[i] = i;
    const encoded = bytesToBase64(allBytes);
    expect(base64ToBytes(encoded)).toEqual(allBytes);
  });
});

describe("base64ToBytes", () => {
  it("decodes a standard base64 string correctly", () => {
    expect(Array.from(base64ToBytes("SGVsbG8="))).toEqual([72, 101, 108, 108, 111]);
  });

  it("decodes empty string to empty array", () => {
    expect(base64ToBytes("")).toEqual(new Uint8Array([]));
  });
});
