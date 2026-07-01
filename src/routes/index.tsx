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
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: "#fcfbf8" }}
    >
      <div className="max-w-md text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">T-0 Sandbox Bridge</h1>
          <p className="text-lg text-muted-foreground">
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

          <Link to="/sandbox" className="contents">
            <Button size="lg" className="w-full">
              Open Sandbox
            </Button>
          </Link>

          <Link to="/docs" className="contents">
            <Button variant="outline" size="lg" className="w-full">
              Read Docs
            </Button>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">
          Built with TanStack Start + Nitro
        </p>
      </div>
    </div>
  );
}
