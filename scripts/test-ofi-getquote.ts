// scripts/test-ofi-getquote.ts — runtime smoke test for the OFI Get Quote
// REST refactor. Verifies the full chain:
//   sandboxNetwork.getQuote() → OfiT0Client (mock) → quote-mapper → GetQuoteResult
//
// Run with:  bun run scripts/test-ofi-getquote.ts

import "../src/lib/t0/index";
import { providerService, sandboxNetwork } from "../src/lib/t0/index";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("ASSERT FAILED:", msg);
    process.exit(1);
  }
  console.log("  ✓", msg);
}

async function main() {
  console.log("\n=== Test 1: Empty provider — should fail with NO_QUOTE_AVAILABLE ===");
  const r1 = await sandboxNetwork.getQuote({ usdAmount: 1000, currency: "EUR" });
  assert("failure" in r1, "returns failure envelope");
  if ("failure" in r1) {
    assert(r1.failure.reason === "REASON_NO_QUOTE_AVAILABLE", `reason=${r1.failure.reason}`);
  }

  console.log("\n=== Test 2: Publish 1 quote (EUR, band=5000, rate=0.86) ===");
  const q = await providerService.publishQuote({
    currency: "EUR",
    band: 5000,
    rate: 0.86,
    ttlMs: 60000,
  });
  console.log("  quote id:", q.id);

  console.log("\n=== Test 3: GetQuote for 1000 EUR — should succeed ===");
  const r2 = await sandboxNetwork.getQuote({ usdAmount: 1000, currency: "EUR" });
  assert("success" in r2, "returns success envelope");
  if ("success" in r2) {
    assert(r2.success.quote.id === q.id, `quote.id matches (${r2.success.quote.id})`);
    assert(r2.success.quote.rate === 0.86, `rate=${r2.success.quote.rate}`);
    assert(r2.success.payoutAmount === 860, `payoutAmount=${r2.success.payoutAmount}`);
    assert(r2.success.settlementAmount === 1000, `settlementAmount=${r2.success.settlementAmount}`);
  }

  console.log("\n=== Test 4: GetQuote with 0 USD — should fail INVALID_AMOUNT ===");
  const r3 = await sandboxNetwork.getQuote({ usdAmount: 0, currency: "EUR" });
  assert("failure" in r3, "returns failure");
  if ("failure" in r3) {
    assert(r3.failure.reason === "REASON_INVALID_AMOUNT", `reason=${r3.failure.reason}`);
  }

  console.log(
    "\n=== Test 5: GetQuote for unsupported currency — should fail CURRENCY_NOT_SUPPORTED ===",
  );
  const r4 = await sandboxNetwork.getQuote({ usdAmount: 1000, currency: "ZWL" as never });
  assert("failure" in r4, "returns failure");
  if ("failure" in r4) {
    assert(r4.failure.reason === "REASON_CURRENCY_NOT_SUPPORTED", `reason=${r4.failure.reason}`);
  }

  console.log("\n=== Test 6: GetQuote amount > band — should fail NO_QUOTE_AVAILABLE ===");
  const r5 = await sandboxNetwork.getQuote({ usdAmount: 10000, currency: "EUR" });
  assert("failure" in r5, "returns failure");
  if ("failure" in r5) {
    assert(r5.failure.reason === "REASON_NO_QUOTE_AVAILABLE", `reason=${r5.failure.reason}`);
  }

  console.log("\n=== Test 7: Pick best of 3 quotes (EUR) — lowest rate wins ===");
  await providerService.publishQuote({ currency: "EUR", band: 1000, rate: 0.95 });
  await providerService.publishQuote({ currency: "EUR", band: 1000, rate: 0.85 }); // best
  await providerService.publishQuote({ currency: "EUR", band: 1000, rate: 0.9 });
  const r6 = await sandboxNetwork.getQuote({ usdAmount: 500, currency: "EUR" });
  assert("success" in r6, "returns success");
  if ("success" in r6) {
    assert(r6.success.quote.rate === 0.85, `best rate picked (${r6.success.quote.rate})`);
    assert(r6.success.payoutAmount === 425, `payout=${r6.success.payoutAmount}`);
  }

  console.log("\n✅ All 7 smoke tests passed");
}

main().catch((e) => {
  console.error("UNEXPECTED ERROR:", e);
  process.exit(1);
});
