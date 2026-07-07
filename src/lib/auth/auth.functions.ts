// Auth server functions — wrap AuthService for TanStack Start RPC.
// Uses a cookie to carry the session token (HttpOnly would be set via headers
// in production; for sandbox we use a simple readable cookie).

import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/start-server-core/request-response";
import { AuthError } from "./types";
import { authService } from "./singleton";
import type { Role, Session } from "./types";

export const SESSION_COOKIE = "t0sb_session";
const SESSION_COOKIE_MAX_AGE = 8 * 60 * 60; // seconds

// Re-use the shared singleton so loginFn / getSessionFn / guardRole all
// see the same in-memory session map (the Vite SSR code splitter would
// otherwise create a separate AuthService per chunk).
const auth = authService;

export const loginFn = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string } | FormData) => {
    // Support both React-serialized object POSTs and native HTML form POSTs.
    if (typeof FormData !== "undefined" && d instanceof FormData) {
      return {
        email: String(d.get("email") ?? ""),
        password: String(d.get("password") ?? ""),
      };
    }
    return d;
  })
  .handler(async ({ data }) => {
    try {
      const session = await auth.login(data.email, data.password);
      setCookie(SESSION_COOKIE, session.token, {
        maxAge: SESSION_COOKIE_MAX_AGE,
        path: "/",
        httpOnly: false,
        sameSite: "lax",
      });
      return { ok: true as const, role: session.role };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false as const, code: e.code };
      throw e;
    }
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE) ?? null;
  if (token) await auth.logout(token);
  deleteCookie(SESSION_COOKIE);
  return { ok: true as const };
});

export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ session: Session | null }> => {
    const token = getCookie(SESSION_COOKIE) ?? null;
    const session = await auth.getSession(token);
    return { session };
  },
);

/**
 * Used by route beforeLoad guards. Synchronous (relies on the auth service's
 * in-memory map). Throws AuthError on failure.
 */
export function guardRole(role: Role): Session {
  const token = getCookie(SESSION_COOKIE) ?? null;
  return auth.requireRole(token, role);
}