// index.test.ts — env validation fail-fast (audit §6.1 A6).
//
// `validateOfiEnv` is called once at module load; if misconfigured the
// process should crash with a clear message. We test the function in
// isolation by passing an explicit config object so we don't mutate the
// live process env (which would race other tests).

import { describe, it, expect } from "vitest";
import { validateOfiEnv } from "./index";

describe("validateOfiEnv", () => {
  it("accepts default mock mode without env", () => {
    expect(() =>
      validateOfiEnv({
        mode: "mock",
        baseUrl: "https://api.agtpay.xyz",
        apiKey: "",
        timeoutMs: 5000,
      }),
    ).not.toThrow();
  });

  it("accepts uppercase HTTP mode (case-insensitive)", () => {
    expect(() =>
      validateOfiEnv({
        mode: "HTTP",
        baseUrl: "https://api.agtpay.xyz",
        apiKey: "k",
        timeoutMs: 5000,
      }),
    ).not.toThrow();
  });

  it("rejects unknown mode values (typo protection)", () => {
    expect(() =>
      validateOfiEnv({
        mode: "htttp",
        baseUrl: "https://api.agtpay.xyz",
        apiKey: "k",
        timeoutMs: 5000,
      }),
    ).toThrow(/T0_QUOTE_CLIENT_MODE must be "http" or "mock"/);
  });

  it("rejects http mode without api key", () => {
    expect(() =>
      validateOfiEnv({
        mode: "http",
        baseUrl: "https://api.agtpay.xyz",
        apiKey: "",
        timeoutMs: 5000,
      }),
    ).toThrow(/T0_OFI_API_KEY is required/);
  });

  it("rejects http mode with NaN timeout", () => {
    expect(() =>
      validateOfiEnv({
        mode: "http",
        baseUrl: "https://api.agtpay.xyz",
        apiKey: "k",
        timeoutMs: NaN,
      }),
    ).toThrow(/T0_OFI_TIMEOUT_MS must be a finite positive number/);
  });

  it("rejects http mode with zero timeout", () => {
    expect(() =>
      validateOfiEnv({
        mode: "http",
        baseUrl: "https://api.agtpay.xyz",
        apiKey: "k",
        timeoutMs: 0,
      }),
    ).toThrow(/T0_OFI_TIMEOUT_MS must be a finite positive number/);
  });

  it("rejects http mode with negative timeout", () => {
    expect(() =>
      validateOfiEnv({
        mode: "http",
        baseUrl: "https://api.agtpay.xyz",
        apiKey: "k",
        timeoutMs: -1,
      }),
    ).toThrow(/T0_OFI_TIMEOUT_MS must be a finite positive number/);
  });

  it("rejects http mode with unparseable baseUrl", () => {
    expect(() =>
      validateOfiEnv({ mode: "http", baseUrl: "not a url", apiKey: "k", timeoutMs: 5000 }),
    ).toThrow(/T0_OFI_API_BASE_URL is not a valid URL/);
  });

  it("rejects non-localhost HTTP URLs (must use TLS)", () => {
    expect(() =>
      validateOfiEnv({
        mode: "http",
        baseUrl: "http://api.agtpay.xyz",
        apiKey: "k",
        timeoutMs: 5000,
      }),
    ).toThrow(/must use https/);
  });

  it("permits http://localhost for local development", () => {
    expect(() =>
      validateOfiEnv({
        mode: "http",
        baseUrl: "http://localhost:8080",
        apiKey: "k",
        timeoutMs: 5000,
      }),
    ).not.toThrow();
  });

  it("permits http://127.0.0.1 for local development", () => {
    expect(() =>
      validateOfiEnv({
        mode: "http",
        baseUrl: "http://127.0.0.1:8080",
        apiKey: "k",
        timeoutMs: 5000,
      }),
    ).not.toThrow();
  });
});
