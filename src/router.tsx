import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

type AppRouter = ReturnType<typeof createRouter<typeof routeTree>>;

/**
 * IMPORTANT: Do NOT cache the router across SSR requests.
 *
 * `@tanstack/react-start`'s server entry calls `getRouter()` once per
 * request and caches the result within that request. The router instance
 * itself carries per-request state on `state.matches`, `state.redirect`,
 * and the loader/loader-bytes stores. If a single shared instance is
 * reused across requests, the first request's redirect (`/ofi` →
 * `/login?redirect=/ofi`) leaks into every subsequent request and the
 * whole site starts 307'ing to the same login URL.
 *
 * `createRouter()` is cheap (no IO), but building a `QueryClient` per
 * request is not. We share that one piece on `globalThis` for sandbox
 * stability while still rebuilding the router per request.
 */
let cachedQueryClient: QueryClient | undefined;
const sharedQueryClient = (): QueryClient =>
  cachedQueryClient ?? (cachedQueryClient = new QueryClient());

export const getRouter = (): AppRouter => {
  const queryClient = sharedQueryClient();
  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  }) as AppRouter;
};
