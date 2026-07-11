// login.api.test.ts — Unit tests for the no-op /api/login route.
//
// 2026-07-10 audit: the credentialed login flow was removed. This route
// exists only so legacy callers (curl, old tabs, scripts) get a clean
// redirect rather than a 404.

import { describe, it, expect } from "vitest";
import { postHandler, getHandler } from "./login";

describe("/api/login postHandler", () => {
  it("returns 303 See Other", async () => {
    const res = postHandler();
    expect(res.status).toBe(303);
  });

  it("redirects to /login", async () => {
    const res = postHandler();
    expect(res.headers.get("location")).toBe("/login");
  });

  it("has an empty body (the client should follow the redirect)", async () => {
    const res = postHandler();
    const text = await res.text();
    expect(text).toBe("");
  });
});

describe("/api/login getHandler", () => {
  it("returns 200 (the endpoint is informational)", () => {
    const res = getHandler();
    expect(res.status).toBe(200);
  });

  it("explains the new open-access posture", async () => {
    const res = getHandler();
    const text = await res.text();
    expect(text).toMatch(/Auth removed/);
    expect(text).toMatch(/open access/);
    expect(text).toMatch(/\/login/);
  });
});
