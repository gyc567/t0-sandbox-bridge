// Native HTML form POST handler for the login page.
// Works without React hydration: the form's default submit goes here,
// and we set the session cookie + redirect to the role's console.
//
// This exists as a fallback for when client-side React hydration has not
// completed (the production TanStack Start build sometimes omits the
// client bootstrap script in its SSR output). The same flow is also
// available via the `loginFn` server function when JS is loaded.

import { createFileRoute } from "@tanstack/react-router";
import { AuthError } from "@/lib/auth";
import { authService } from "@/lib/auth/singleton";
import { setCookie, deleteCookie } from "@tanstack/start-server-core/request-response";

const SESSION_COOKIE = "t0sb_session";
const SESSION_COOKIE_MAX_AGE = 8 * 60 * 60; // seconds

// Re-use the shared singleton so this route + loginFn / getSessionFn
// / beforeLoad all see the same in-memory session map.
const auth = authService;

function redirectTo(to: string): Response {
  return new Response(null, {
    status: 303, // See Other: form POST -> GET
    headers: { location: to },
  });
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const redirectRaw = String(form.get("redirect") ?? "");
  const safeRedirect = redirectRaw.startsWith("/") && !redirectRaw.startsWith("//") ? redirectRaw : "";

  let session: Awaited<ReturnType<typeof auth.login>>;
  try {
    session = await auth.login(email, password);
  } catch (e) {
    if (e instanceof AuthError) {
      const params = new URLSearchParams({ error: e.code });
      if (safeRedirect) params.set("redirect", safeRedirect);
      return new Response(null, {
        status: 303,
        headers: { location: `/login?${params.toString()}` },
      });
    }
    throw e;
  }

  setCookie(SESSION_COOKIE, session.token, {
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });

  const fallback = session.role === "ofi" ? "/ofi" : "/provider";
  return redirectTo(safeRedirect || fallback);
}

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: () => new Response("Method not allowed", { status: 405 }),
    },
  },
});

// Suppress unused-export warning for `deleteCookie` if the framework
// re-exports route internals.
void deleteCookie;
