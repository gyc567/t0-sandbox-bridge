// playground.tsx — Thin 302 redirect wrapper for /playground.
//
// History: /playground was the original T-0 visualizer route. After the
// unified polished_product chrome shipped, the visualizer components
// moved into /sandbox and /playground became a bookmark-shaped stub
// for visitors with old URLs.
//
// Phase 1 of this delivery makes /playground a deterministic 302 redirect
// to /sandbox so visitors with old links still land on the working
// console. The visualizer code under src/components/playground/* stays
// on disk as unreachable reference code per the design decision
// (decision-keep-playground-code-on-disk); this file does NOT import it.
//
// Failure mode: if the redirect throws inside `beforeLoad`, TanStack's
// NotFoundComponent renders for the visitor; the TopBar still shows
// the 3-item nav so they can navigate forward manually.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/playground")({
  // Server-side: this throws a `Response` that the TanStack Start
  // runtime translates into HTTP 302 with Location: /sandbox.
  // Client-side: the loader catches the same redirect and pushes the
  // client router to /sandbox.
  beforeLoad: () => {
    throw redirect({ to: "/sandbox" });
  },
  // `loader` is never reached because `beforeLoad` always throws.
  // Kept as a defensive fallback so the route component is still
  // resolvable; if the redirect path is somehow exhausted the
  // component renders an explicit error and lets the global
  // NotFoundComponent take over via the catch boundary.
  loader: () => {
    return { status: "redirect-exhausted" as const };
  },
  component: PlaygroundRedirectExhausted,
});

function PlaygroundRedirectExhausted() {
  // Defensive render — only reached if the redirect path failed
  // silently. The 3-item TopBar still renders above this, so the
  // visitor can navigate manually to /sandbox.
  return (
    <div className="container container-7xl py-section space-y-4" data-testid="playground-fallback">
      <h1 className="text-display-md font-semibold tracking-tight text-foreground">
        Playground has moved
      </h1>
      <p className="text-caption text-muted-foreground">
        The T-0 visualizer now lives at{" "}
        <a className="text-accent-cyan underline" href="/sandbox">
          /sandbox
        </a>
        .
      </p>
    </div>
  );
}