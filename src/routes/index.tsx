import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "T-0 Sandbox Bridge" },
      { name: "description", content: "Provider sandbox for quote, settlement, payment, payout flows." },
      { property: "og:title", content: "T-0 Sandbox Bridge" },
      { property: "og:description", content: "Provider sandbox for quote, settlement, payment, payout flows." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background py-section">
      <div className="max-w-3xl text-center space-y-8 px-6">
        <div className="space-y-2">
          <p className="text-caption font-medium uppercase tracking-wider text-primary">Sandbox</p>
          <h1 className="text-display-lg font-semibold tracking-tight">T-0 Sandbox Bridge</h1>
          <p className="text-tagline text-muted-foreground">
            Provider sandbox for quote, settlement, payment, payout flows.
          </p>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Open Sandbox</CardTitle>
              <CardDescription>
                Test the complete T-0 flow: quote → inbound notification → payment → payout → confirmed.
              </CardDescription>
            </CardHeader>
          </Card>

          <Button asChild size="lg" className="w-full">
            <Link to="/sandbox">Open Sandbox</Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="w-full">
            <Link to="/docs">Read Docs</Link>
          </Button>
        </div>

        <p className="text-caption text-muted-foreground">
          Built with TanStack Start + Nitro
        </p>
      </div>
    </div>
  );
}