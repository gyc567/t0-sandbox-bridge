import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryUserStore } from "./store";
import { AuthService, AuthError } from "./service";
import type { Role } from "./types";

let clock = 1_700_000_000_000;
const now = () => clock;

describe("InMemoryUserStore", () => {
  let store: InMemoryUserStore;
  beforeEach(() => {
    store = new InMemoryUserStore();
  });

  it("seeds two demo accounts (ofi and provider)", async () => {
    const all = await store.list();
    expect(all).toHaveLength(2);
    const roles = all.map((u) => u.role).sort();
    expect(roles).toEqual<Role[]>(["ofi", "provider"]);
  });

  it("finds a user by email (case-insensitive)", async () => {
    const u = await store.findByEmail("OFI@BAXS.DEMO");
    expect(u).not.toBeNull();
    expect(u!.role).toBe("ofi");
  });

  it("returns null for unknown email", async () => {
    expect(await store.findByEmail("ghost@nope")).toBeNull();
  });

  it("finds a user by id", async () => {
    const list = await store.list();
    const u = await store.findById(list[0].id);
    expect(u).not.toBeNull();
    expect(u!.id).toBe(list[0].id);
  });

  it("returns null for unknown id", async () => {
    expect(await store.findById("u_missing")).toBeNull();
  });

  it("hash() is deterministic and non-empty", () => {
    const a = InMemoryUserStore.hash("saltsaltsalt0000", "x");
    const b = InMemoryUserStore.hash("saltsaltsalt0000", "x");
    expect(a).toBe(b);
    const [salt, hash] = a.split(":");
    expect(salt).toBeTruthy();
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("rejects a corrupted passwordHash format", async () => {
    const store = new InMemoryUserStore();
    const list = await store.list();
    const target = list[0];
    // Force-corrupt via private field — only feasible because the store holds a plain object.
    (store as unknown as { byId: Map<string, typeof target> }).byId.set(target.id, {
      ...target,
      passwordHash: "no-colon-here",
    });
    const svc = new AuthService(store);
    await expect(svc.login(target.email, "anything")).rejects.toMatchObject({
      code: "InvalidCredentials",
    });
  });

  it("password hashes are non-empty and unique per salt", async () => {
    const list = await store.list();
    const seen = new Set<string>();
    for (const u of list) {
      expect(u.passwordHash).toMatch(/.+:.+/);
      expect(seen.has(u.passwordHash)).toBe(false);
      seen.add(u.passwordHash);
    }
  });
});

describe("AuthService", () => {
  let users: InMemoryUserStore;
  let auth: AuthService;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    users = new InMemoryUserStore();
    auth = new AuthService(users, now);
  });

  it("logs in with correct credentials and returns a session", async () => {
    const session = await auth.login("ofi@baxs.demo", "demo-ofi-2026");
    expect(session.role).toBe("ofi");
    expect(session.token).toMatch(/^sess_/);
    expect(session.expiresAt).toBe(clock + 8 * 60 * 60 * 1000);
  });

  it("rejects wrong password with InvalidCredentials", async () => {
    let caught: unknown;
    try {
      await auth.login("ofi@baxs.demo", "wrong");
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: "InvalidCredentials" });
  });

  it("verifyPassword covers both true and false branches (defensive)", async () => {
    // wrong password: actualHash === expected -> false
    await expect(auth.login("ofi@baxs.demo", "wrong-pw")).rejects.toMatchObject({
      code: "InvalidCredentials",
    });
    // right password: actualHash === expected -> true, session issued
    const s = await auth.login("ofi@baxs.demo", "demo-ofi-2026");
    expect(s.token).toMatch(/^sess_/);
  });

  it("rejects unknown user with UserNotFound", async () => {
    await expect(auth.login("nope@x.com", "x")).rejects.toMatchObject({
      code: "UserNotFound",
    });
  });

  it("retrieves a live session by token", async () => {
    const s = await auth.login("provider@baxs.demo", "demo-provider-2026");
    const got = await auth.getSession(s.token);
    expect(got).not.toBeNull();
    expect(got!.role).toBe("provider");
  });

  it("returns null for expired sessions and drops them", async () => {
    const s = await auth.login("provider@baxs.demo", "demo-provider-2026");
    clock += 8 * 60 * 60 * 1000 + 1;
    expect(await auth.getSession(s.token)).toBeNull();
  });

  it("returns null for unknown token", async () => {
    expect(await auth.getSession("sess_unknown")).toBeNull();
  });

  it("returns null when token is null/empty", async () => {
    expect(await auth.getSession(null)).toBeNull();
    expect(await auth.getSession("")).toBeNull();
  });

  it("logout removes the session", async () => {
    const s = await auth.login("provider@baxs.demo", "demo-provider-2026");
    await auth.logout(s.token);
    expect(await auth.getSession(s.token)).toBeNull();
  });

  it("successful login gives session matching the request role", async () => {
    const ofi = await auth.login("ofi@baxs.demo", "demo-ofi-2026");
    const prov = await auth.login("provider@baxs.demo", "demo-provider-2026");
    expect(ofi.role).toBe("ofi");
    expect(prov.role).toBe("provider");
    expect(ofi.userId).not.toBe(prov.userId);
  });

  it("returns null on second getSession after logout", async () => {
    const s = await auth.login("provider@baxs.demo", "demo-provider-2026");
    await auth.logout(s.token);
    expect(await auth.getSession(s.token)).toBeNull();
  });

  describe("requireRole", () => {
    it("throws NoSession when token is missing", () => {
      expect(() => auth.requireRole(null, "ofi")).toThrowError(
        expect.objectContaining({ code: "NoSession" }),
      );
    });

    it("throws NoSession when token has no matching session", () => {
      expect(() => auth.requireRole("sess_orphan", "ofi")).toThrowError(
        expect.objectContaining({ code: "NoSession" }),
      );
    });

    it("throws SessionExpired when token is dead", () => {
      // Build a session synchronously by logging in, then advance the clock.
      const sPromise = auth.login("provider@baxs.demo", "demo-provider-2026");
      return sPromise.then((s) => {
        clock += 8 * 60 * 60 * 1000 + 1;
        expect(() => auth.requireRole(s.token, "provider")).toThrowError(
          expect.objectContaining({ code: "SessionExpired" }),
        );
      });
    });

    it("throws WrongRole when role mismatches", async () => {
      const s = await auth.login("ofi@baxs.demo", "demo-ofi-2026");
      expect(() => auth.requireRole(s.token, "provider")).toThrowError(
        expect.objectContaining({ code: "WrongRole" }),
      );
    });

    it("returns the session when role matches", async () => {
      const s = await auth.login("ofi@baxs.demo", "demo-ofi-2026");
      const got = auth.requireRole(s.token, "ofi");
      expect(got.userId).toBe(s.userId);
    });
  });
});
