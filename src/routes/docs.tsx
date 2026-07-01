import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// In production, this would be loaded from a file or API
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

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation - T-0 Sandbox Bridge" },
      { name: "description", content: "T-0 Integration Guide and API Documentation" },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container py-4 flex items-center justify-between">
          <h1 className="text-tagline font-semibold">T-0 Sandbox Bridge</h1>
          <Button asChild variant="outline" size="sm">
            <Link to="/sandbox">Open Sandbox</Link>
          </Button>
        </div>
      </header>

      <main className="container py-section max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Integration Guide</CardTitle>
          </CardHeader>
          <CardContent className="prose max-w-none">
            <ReactMarkdown>{docsContent}</ReactMarkdown>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}