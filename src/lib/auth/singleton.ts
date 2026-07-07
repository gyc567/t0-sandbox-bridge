// Shared auth singleton — kept in its own module so every Vite SSR chunk
// that imports `auth` ends up with the same instance. Without this, code-
// splitting the auth.functions.ts file produces two independent singletons,
// and a session created by the loginFn handler is invisible to the
// getSessionFn / beforeLoad calls made on the next request.
//
// In Vite dev, the SSR module graph is re-evaluated on each request (and on
// HMR) — so a plain `new AuthService()` would still produce a fresh map per
// request. We stash the instance on `globalThis` so it survives module
// re-evaluation.

import { AuthService } from "./service";
import { InMemoryUserStore } from "./store";

type GlobalCache = { __t0AuthService?: AuthService };
const g = globalThis as unknown as GlobalCache;

export const authService: AuthService =
  g.__t0AuthService ?? (g.__t0AuthService = new AuthService(new InMemoryUserStore()));
