import { createFileRoute, redirect, useRouter, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logoutFn, getSessionFn } from "@/lib/auth/auth.functions";
import { KeyRound, LogOut } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — T-0 Sandbox Bridge" },
      { name: "description", content: "Sign in as OFI or Provider to enter the BAXS T-0 sandbox." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async () => {
    const { session } = await getSessionFn();
    if (session) throw redirect({ to: routeFromRole(session.role) as "/" });
    return {};
  },
  component: LoginPage,
});

function routeFromRole(role: "ofi" | "provider"): string {
  return role === "ofi" ? "/ofi" : "/provider";
}

const DEMO_ACCOUNTS = [
  { email: "ofi@baxs.demo", password: "demo-ofi-2026", role: "OFI", note: "Originates payments" },
  {
    email: "provider@baxs.demo",
    password: "demo-provider-2026",
    role: "Provider",
    note: "Publishes quotes & executes payouts",
  },
];

function LoginPage() {
  const search = useSearch({ from: "/login" });
  const redirectTo = search.redirect;
  const router = useRouter();
  const logout = useServerFn(logoutFn);

  const [email, setEmail] = useState("ofi@baxs.demo");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The form is a native HTML POST to /api/login — works without React
  // hydration. The URL query ?error=…&redirect=… is set on bad credentials.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(messageForCode(err));
  }, []);

  const fill = (acct: { email: string; password: string }) => {
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
  };

  const onLogout = async () => {
    await logout({});
    await router.invalidate();
    router.navigate({ to: "/login" });
  };

  return (
    <SiteLayout>
      <div className="container container-7xl py-section">
        <div className="mx-auto max-w-2xl space-y-6">
          <header className="space-y-2 text-center border-b border-hairline pb-6">
            <p className="eyebrow">ACCESS · SANDBOX</p>
            <h1 className="text-display-md font-semibold tracking-tight text-foreground">
              Sign in to your console
            </h1>
            <p className="font-mono text-muted-foreground" style={{ fontSize: "12px" }}>
              Two roles, two flows — pick yours
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
                  Credentials
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <form
                action="/api/login"
                method="post"
                className="space-y-4"
                data-testid="login-form"
              >
                {/* hidden redirect target so the server can send us back where we came from */}
                {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    className="font-mono text-caption"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    Password
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="font-mono text-caption"
                  />
                </div>
                {error && (
                  <p
                    className="font-mono text-[#ff453a]"
                    style={{ fontSize: "12px" }}
                    data-testid="login-error"
                  >
                    {error}
                  </p>
                )}
                <Button type="submit" className="btn-glow w-full">
                  Sign In
                </Button>
              </form>

              <div className="mt-4 flex justify-end">
                <Button variant="ghost" size="sm" onClick={onLogout} data-testid="logout-btn">
                  <LogOut className="w-4 h-4" />
                  Clear session
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-hairline bg-glass backdrop-blur-xl">
            <CardHeader className="border-b border-hairline">
              <CardTitle
                className="font-mono uppercase text-foreground"
                style={{ fontSize: "12px", letterSpacing: "0.08em" }}
              >
                Demo accounts (sandbox)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => fill(a)}
                  className="w-full rounded-md border border-hairline bg-background/40 px-3 py-2 text-left transition-colors hover:border-accent-cyan"
                  data-testid={`fill-${a.role}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-foreground" style={{ fontSize: "13px" }}>
                      {a.role}
                    </span>
                    <span className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>
                      click to fill
                    </span>
                  </div>
                  <div className="font-mono text-muted-foreground" style={{ fontSize: "11px" }}>
                    {a.email}
                  </div>
                  <div className="font-mono text-muted-canvas" style={{ fontSize: "10px" }}>
                    {a.note}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </SiteLayout>
  );
}

function messageForCode(code: string): string {
  switch (code) {
    case "UserNotFound":
      return "No account with that email.";
    case "InvalidCredentials":
      return "Wrong password.";
    case "SessionExpired":
      return "Session expired — please sign in again.";
    default:
      return `Sign-in failed (${code}).`;
  }
}