// Catch-all route for inbound T-0 Network callbacks.
//
// The T-0 Network calls our ProviderService via ConnectRPC at paths
// like `/api/t0/provider/tzero.v1.payment.ProviderService/PayOut`. The
// catch-all `$` route matches everything under `/api/t0/provider/`.
//
// Signature verification happens inside `buildT0Receiver`; an unsigned
// or stale request gets 401/408 immediately. Valid requests are
// dispatched to the matching Connect handler.

import { createFileRoute } from "@tanstack/react-router";
import { buildT0Receiver } from "@/lib/t0/t0-receiver";

const networkPublicKey = process.env.T0_NETWORK_PUBLIC_KEY ?? "";

export const Route = createFileRoute("/api/t0/provider/$")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!networkPublicKey) {
          return new Response(
            "T0_NETWORK_PUBLIC_KEY is not configured; inbound ProviderService is disabled",
            { status: 503 },
          );
        }
        const handler = buildT0Receiver({ networkPublicKey });
        return handler(request);
      },
    },
  },
});