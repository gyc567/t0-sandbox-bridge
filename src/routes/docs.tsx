import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";

const docsContent = `
# T-0 Integration Guide

## Overview

The T-0 Sandbox Bridge provides a complete sandbox environment for testing T-0 Provider flows.

## Quick Start

1. Navigate to the Sandbox
2. Publish a Quote with your desired currency and rate
3. Simulate USDT settlement inbound notification
4. Accept a payment against the quote
5. Process payout to confirm the transaction

## API Authentication

All API requests must be signed with ECDSA secp256k1:

1. Build payload: \`body + 8-byte little-endian Unix timestamp\`
2. Hash with Keccak-256
3. Sign with secp256k1 private key
4. Include headers:
   - \`X-Signature\`: \`0x\` + 65 bytes hex (v+r+s)
   - \`X-Public-Key\`: \`0x\` + 33 bytes hex (compressed)
   - \`X-Signature-Timestamp\`: Unix timestamp in milliseconds

## Supported Currencies

- USD, EUR, GBP, CNH, MXN, BRL, NGN, INR

## Volume Bands

- 1,000 | 5,000 | 10,000 | 25,000 | 250,000 | 1,000,000 USD

## Event Types

- \`QuotePublished\` - New exchange rate quote available
- \`USDTTransactionNotification\` - USDT inbound settlement
- \`CreditUsageNotification\` - Credit line usage
- \`PaymentAccepted\` - Payment accepted by provider
- \`PayoutAccepted\` - Payout processing started
- \`PayoutSuccess\` - Payout completed successfully
- \`PaymentConfirmed\` - Payment confirmed
`;

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "quick-start", label: "Quick Start" },
  { id: "api-authentication", label: "API Authentication" },
  { id: "supported-currencies", label: "Supported Currencies" },
  { id: "volume-bands", label: "Volume Bands" },
  { id: "event-types", label: "Event Types" },
];

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "BAXS · T-0 — Documentation & Integration Guide" },
      {
        name: "description",
        content:
          "BAXS PAY LIMITED · T-0 Network sandbox bridge. Integration Guide and API Documentation.",
      },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  return (
    <SiteLayout>
      <div className="container container-7xl py-section">
        <div className="grid gap-8 lg:grid-cols-[1fr_220px]">
          {/* Main content */}
          <div className="min-w-0">
            <div className="mb-8 space-y-2">
              <p className="eyebrow">BAXS · T-0 · DOCUMENTATION</p>
              <h1 className="text-display-md font-semibold tracking-tight text-foreground">
                Integration Guide
              </h1>
              <p className="text-tagline text-muted-foreground">
                BAXS PAY LIMITED · T-0 Network sandbox bridge.
                How to wire your provider into the T-0 Network REST contract.
              </p>
            </div>

            <Card className="border-hairline bg-glass backdrop-blur-xl">
              <CardContent className="prose max-w-none p-8">
                <ReactMarkdown>{docsContent}</ReactMarkdown>
              </CardContent>
            </Card>

            <div className="mt-8 flex justify-end">
              <Button asChild variant="outline" size="sm">
                <Link to="/sandbox">
                  Open Console
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Sticky TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <div className="space-y-3">
                <h4
                  className="font-mono uppercase text-muted-canvas"
                  style={{ fontSize: "10px", letterSpacing: "0.14em" }}
                >
                  On this page
                </h4>
                <nav className="space-y-1.5">
                  {TOC.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="block font-mono text-secondary-canvas transition-colors hover:text-accent-cyan"
                      style={{ fontSize: "11px", letterSpacing: "0.04em" }}
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>

              <div className="rounded-lg border border-hairline bg-glass p-4 space-y-2">
                <p className="font-mono text-accent-cyan" style={{ fontSize: "10px", letterSpacing: "0.12em" }}>
                  BAXS INTEGRATION
                </p>
                <p className="text-fine-print text-muted-foreground">
                  For the full BAXS × T-0 architecture deep-dive, see the architecture page.
                </p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/integration">View Architecture</Link>
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}
