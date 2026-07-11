// /api/login — kept as a stable POST target for any legacy callers.
//
// Auth was removed (2026-07-10 audit): the OFI/Provider consoles are open in
// the sandbox. The picker page at /login issues a client-side navigation
// directly, so this route is essentially dead weight. We still resolve POST
// to a 303 → /login so any straggling form (curl, integration script, old
// browser tab) can't surprise the operator with a 404.
//
// The handler factories are exported as plain functions so unit tests can
// exercise them without spinning up a router.

import { createFileRoute } from "@tanstack/react-router";

/** POST → 303 redirect to the picker page. */
export function postHandler(): Response {
  return new Response(null, {
    status: 303,
    headers: { location: "/login" },
  });
}

/** GET → a friendly 200 notice (no more credential flow). */
export function getHandler(): Response {
  return new Response("Auth removed — sandbox is open access. Visit /login to pick a role.", {
    status: 200,
  });
}

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: () => postHandler(),
      GET: () => getHandler(),
    },
  },
});
