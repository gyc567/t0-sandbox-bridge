// /login — Role picker (no auth).
//
// Audit (2026-07-10): the previous credentialed form hit `/api/login`, which
// set a session cookie guarded by `requireRole` on every route. That coupling
// made a single bad credential (or a Vite SSR middleware hiccup) block every
// downstream page. Per the operator, the demo controls are open: the user
// picks OFI or Provider and lands on the matching console. No password, no
// cookie, no gate.

import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyRound, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

interface DemoAccount {
  /** Where the picker sends the user. */
  to: "/ofi" | "/provider";
  role: "OFI" | "Provider";
  email: string;
  note: string;
}

export const DEMO_ACCOUNTS: ReadonlyArray<DemoAccount> = [
  { to: "/ofi", role: "OFI", email: "ofi@baxs.demo", note: "Originates payments" },
  {
    to: "/provider",
    role: "Provider",
    email: "provider@baxs.demo",
    note: "Publishes quotes & executes payouts",
  },
];

/**
 * Validate the optional `?redirect=` search param. Mirrors the policy used
 * inside the picker: same-origin paths only, no leading `//` (which the
 * browser would treat as an external URL).
 *
 * Exported as a pure helper so we can unit-test the policy without
 * rendering React. Returns null for unsafe or missing values.
 */
export function safeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

/**
 * Pick the route to navigate to after the operator chooses a role.
 * Honours a safe `?redirect=` param when it matches a known demo
 * destination; otherwise falls back to the role's console.
 */
export function pickEntryTarget(
  account: DemoAccount,
  safeRedirect: string | null,
): DemoAccount["to"] | string {
  if (safeRedirect && DEMO_ACCOUNTS.some((a) => a.to === safeRedirect)) {
    return safeRedirect;
  }
  return account.to;
}

function LoginPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const safeRedirect = safeRedirectPath(search.redirect);
  // Track which card the operator last hovered so the CTA can target it.
  const [pending, setPending] = useState<DemoAccount["to"] | null>(null);
  const enter = (account: DemoAccount) => {
    const target = pickEntryTarget(account, safeRedirect);
    // The literal values are narrow: we know they're "/ofi" or "/provider"
    // because pickEntryTarget only returns one of the demo destinations.
    router.navigate({ to: target as "/ofi" | "/provider" });
  };

  return (
    <SiteLayout>
      <div className="container container-7xl py-section">
        <div className="mx-auto max-w-2xl space-y-6">
          <header className="space-y-2 text-center border-b border-hairline pb-6">
            <p className="eyebrow">ACCESS · SANDBOX</p>
            <h1 className="text-display-md font-semibold tracking-tight text-foreground">
              Pick your console
            </h1>
            <p className="font-mono text-muted-foreground" style={{ fontSize: "12px" }}>
              Two roles, two flows — open access for demo & inspection
            </p>
          </header>

          <Card className="border-hairline bg-glass backdrop-blur-xl">
            <CardHeader className="border-b border-hairline">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-accent-cyan" />
                <CardTitle
                  className="font-mono uppercase text-foreground"
                  style={{ fontSize: "12px", letterSpacing: "0.08em" }}
                >
                  Choose role
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {DEMO_ACCOUNTS.map((a) => (
                <div
                  key={a.to}
                  role="group"
                  aria-label={`Enter ${a.role} console`}
                  data-testid={`enter-${a.role}`}
                  onMouseEnter={() => setPending(a.to)}
                  onFocus={() => setPending(a.to)}
                  className="rounded-md border border-hairline bg-background/40 transition-colors hover:border-accent-cyan"
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-foreground" style={{ fontSize: "13px" }}>
                          {a.role}
                        </span>
                        <span className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>
                          click to enter
                        </span>
                      </div>
                      <div className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                        {a.email}
                      </div>
                      <div className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>
                        {a.note}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="btn-glow"
                      onClick={() => enter(a)}
                      data-testid={`enter-${a.role}-btn`}
                      aria-label={`Enter ${a.role} console`}
                    >
                      Enter
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
              {/* pending/aria plumbing so tests can locate the focused card */}
              <span data-testid="login-pending" hidden>
                {pending ?? ""}
              </span>
            </CardContent>
          </Card>

          {safeRedirect && (
            <p className="font-mono text-muted-canvas text-center" style={{ fontSize: "11px" }}>
              After picking a role you will land on{" "}
              <code className="text-foreground">{safeRedirect}</code>.
            </p>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}

// re-export so KISS module shape stays explicit (no unused redirect helpers)
void redirect;
