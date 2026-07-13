import { HttpT0Client } from "../src/lib/t0/client";

const client = new HttpT0Client(
  "https://absurd-payphone-hankie.ngrok-free.dev",
  "419fd08e039e5e1e5b11d29f57ad0d7b299ce0094d457ff582441d5dee53e4f4",
);

async function main() {
  try {
    const result = await client.updateQuote({
      id: "qt-test-001",
      currency: "EUR",
      band: 1000,
      rate: 0.86,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30000,
    });
    console.log("SUCCESS:", result);
  } catch (e) {
    console.error("FAILED:", e);
    process.exit(1);
  }
}

main();
