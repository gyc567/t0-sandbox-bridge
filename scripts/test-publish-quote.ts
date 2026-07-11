import "../src/lib/t0/index";
import { providerService } from "../src/lib/t0/index";

async function main() {
  try {
    const quote = await providerService.publishQuote({
      currency: "EUR",
      band: 1000,
      rate: 0.86,
      ttlMs: 30000,
    });
    console.log("SUCCESS:", quote);
  } catch (e) {
    console.error("FAILED:", e);
    process.exit(1);
  }
}

main();
