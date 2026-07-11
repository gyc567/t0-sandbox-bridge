// login.test.ts — Unit tests for the /login role-picker pure helpers.
//
// The picker page itself is a React component (covered visually / by E2E
// smoke), but the two policy decisions inside it — "is this redirect safe?"
// and "where should I navigate?" — are exported as pure functions so they
// can be exercised without rendering. 100% coverage on the new module.

import { describe, it, expect } from "vitest";
import { DEMO_ACCOUNTS, safeRedirectPath, pickEntryTarget } from "./login";

describe("safeRedirectPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(safeRedirectPath("/ofi")).toBe("/ofi");
    expect(safeRedirectPath("/provider")).toBe("/provider");
  });

  it("accepts paths with query strings and subpaths", () => {
    expect(safeRedirectPath("/ofi?band=1000")).toBe("/ofi?band=1000");
    expect(safeRedirectPath("/provider/console?tab=events")).toBe("/provider/console?tab=events");
  });

  it("rejects empty / missing / non-string values", () => {
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath("")).toBeNull();
    expect(safeRedirectPath(42 as never)).toBeNull();
    expect(safeRedirectPath({} as never)).toBeNull();
  });

  it("rejects external URLs and protocol-relative paths", () => {
    expect(safeRedirectPath("https://evil.example.com/x")).toBeNull();
    expect(safeRedirectPath("//evil.example.com")).toBeNull();
    expect(safeRedirectPath("javascript:alert(1)")).toBeNull();
    expect(safeRedirectPath("file:///etc/passwd")).toBeNull();
  });

  it("rejects paths that don't start with /", () => {
    expect(safeRedirectPath("ofi")).toBeNull();
    expect(safeRedirectPath("provider/x")).toBeNull();
  });
});

describe("pickEntryTarget", () => {
  const ofi = DEMO_ACCOUNTS.find((a) => a.to === "/ofi")!;
  const provider = DEMO_ACCOUNTS.find((a) => a.to === "/provider")!;

  it("falls back to the role's console when no redirect is supplied", () => {
    expect(pickEntryTarget(ofi, null)).toBe("/ofi");
    expect(pickEntryTarget(provider, null)).toBe("/provider");
  });

  it("uses the safe redirect when it matches a known demo destination", () => {
    expect(pickEntryTarget(provider, "/ofi")).toBe("/ofi");
    expect(pickEntryTarget(ofi, "/provider")).toBe("/provider");
  });

  it("falls back to the role's console when redirect is unsafe or non-matching", () => {
    expect(pickEntryTarget(ofi, null)).toBe("/ofi");
    expect(pickEntryTarget(provider, null)).toBe("/provider");
  });
});

describe("DEMO_ACCOUNTS", () => {
  it("exposes the two demo roles", () => {
    expect(DEMO_ACCOUNTS.map((a) => a.role)).toEqual(["OFI", "Provider"]);
  });

  it("uses unique routes per demo account", () => {
    const routes = new Set(DEMO_ACCOUNTS.map((a) => a.to));
    expect(routes.size).toBe(DEMO_ACCOUNTS.length);
  });

  it("uses non-empty email/note fields so the picker is informative", () => {
    for (const a of DEMO_ACCOUNTS) {
      expect(a.email.length).toBeGreaterThan(0);
      expect(a.note.length).toBeGreaterThan(0);
    }
  });
});
