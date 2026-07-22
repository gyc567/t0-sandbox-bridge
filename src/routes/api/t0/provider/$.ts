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

/** Validate the public key is a proper secp256k1 hex string (33 or 65 bytes). */
function validatePublicKey(key: string): void {
  if (!/^0x[a-fA-F0-9]+$/.test(key)) {
    throw new Error("T0_NETWORK_PUBLIC_KEY must be a 0x-prefixed hex string");
  }
  const byteLen = (key.length - 2) / 2;
  if (byteLen !== 33 && byteLen !== 65) {
    throw new Error(
      `T0_NETWORK_PUBLIC_KEY must be 33 bytes (compressed) or 65 bytes (uncompressed), got ${byteLen} bytes`,
    );
  }
}

// Fail fast at module load time if the key is misconfigured.
if (networkPublicKey) {
  validatePublicKey(networkPublicKey);
}

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
