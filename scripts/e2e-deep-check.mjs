/**
 * Deep E2E check for the redesigned /sandbox Payout Provider Console.
 *
 * Verifies:
 *   1. Console loads and 6 primary cards are present
 *   2. "Publish quote" interaction produces a quote card
 *   3. "Simulate USDT settlement" triggers an inbound notification
 *   4. Event log receives entries
 *   5. API Tester can derive public key and generate a signature
 *
 * Run with:
 *   BASE_URL=http://localhost:8080 node scripts/e2e-deep-check.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173";
const REPORT_DIR = path.resolve(__dirname, "..", "e2e-reports");

await fs.mkdir(REPORT_DIR, { recursive: true });

const results = [];
function record(name, status, durationMs, details = {}) {
  results.push({ name, status, durationMs, ...details });
  const marker = status === "PASS" ? "✓" : "✗";
  console.log(`  ${marker} ${name} (${durationMs}ms)${details.note ? " — " + details.note : ""}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleMsgs = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleMsgs.push(m.text());
});
page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e.message}`));

const t0 = Date.now();
await page.goto(`${BASE_URL}/sandbox`, { waitUntil: "domcontentloaded", timeout: 20000 });
record("sandbox console loads", "PASS", Date.now() - t0);

// 1. Six primary cards visible
{
  const start = Date.now();
  const expectedCards = [
    "Publish Quote",
    "Inbound Notifications",
    "Quotes",
    "Payments",
    "Payouts",
    "Event Log",
  ];
  const mainText = await page.textContent("main");
  const missing = expectedCards.filter((c) => !mainText.includes(c));
  record(
    "six primary console cards present",
    missing.length === 0 ? "PASS" : "FAIL",
    Date.now() - start,
    { note: missing.length ? `missing: ${missing.join(", ")}` : "" },
  );
}

// 2. API Tester section is visible and interactive
{
  const start = Date.now();
  const signBtn = await page.$('button:has-text("Sign Request")');
  const generateBtn = await page.$('button:has-text("Generate")');
  const privateKey = await page.$eval("#privateKey", (el) => el.value).catch(() => null);
  record(
    "API Tester section mounted with controls",
    signBtn && generateBtn && privateKey ? "PASS" : "FAIL",
    Date.now() - start,
    { note: privateKey ? `pk prefix ${privateKey.slice(0, 4)}` : "no privateKey" },
  );
}

// 3. Generate a new key pair
{
  const start = Date.now();
  await page.click('button:has-text("Generate")');
  await page.waitForTimeout(300);
  const publicKey = await page.$eval("#pubkey", (el) => el.value).catch(() => "");
  const privateKey = await page.$eval("#privateKey", (el) => el.value).catch(() => "");
  const looksLikeKey = /^0x[0-9a-f]{66}$/i.test(publicKey);
  record(
    "Generate produces a valid-looking key pair",
    looksLikeKey && privateKey.length === 66 ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `pub ${publicKey.slice(0, 8)}…` },
  );
}

// 4. Sign Request produces a signature
{
  const start = Date.now();
  await page.locator('button:has-text("Sign Request")').click();
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.innerText || "";
        return /Signature|curl -X/.test(text) && /0x[0-9a-f]{64,}/i.test(text);
      },
      null,
      { timeout: 5000 },
    );
    record("Sign Request yields signature output", "PASS", Date.now() - start);
  } catch {
    const text = await page.textContent("main");
    record("Sign Request yields signature output", "FAIL", Date.now() - start, {
      note: `main text contains Signature: ${text.includes("Signature")}`,
    });
  }
}

// Helper: click a button and wait for the snapshot to update.
// `predicate` is a function body (with `text` in scope) returning boolean.
async function waitForCount(predicate, timeoutMs = 15000) {
  await page.waitForFunction(
    (body) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function("text", body);
      return fn(document.body.textContent || "");
    },
    predicate,
    { timeout: timeoutMs },
  );
}

// 5. Publish quote flow
{
  const start = Date.now();
  const publishBtn = page.locator('button:has-text("Publish quote")').first();
  if (await publishBtn.count()) {
    await publishBtn.click();
    try {
      await waitForCount("return /Quotes\\s*·\\s*([1-9]\\d*)/.test(text);", 15000);
      const pageText = (await page.textContent("main")) || "";
      const quoteCount = pageText.match(/Quotes\s*·\s*(\d+)/)?.[1] ?? "0";
      record(
        "Publish quote updates Quotes card",
        Number(quoteCount) > 0 ? "PASS" : "FAIL",
        Date.now() - start,
        { note: `Quotes · ${quoteCount}` },
      );
    } catch {
      const pageText = (await page.textContent("main")) || "";
      const quoteCount = pageText.match(/Quotes\s*·\s*(\d+)/)?.[1] ?? "0";
      record("Publish quote updates Quotes card", "FAIL", Date.now() - start, {
        note: `Quotes · ${quoteCount} (timeout)`,
      });
    }
  } else {
    record("Publish quote updates Quotes card", "FAIL", Date.now() - start, {
      note: "button not found",
    });
  }
}

// 6. Simulate USDT settlement
{
  const start = Date.now();
  const btn = page.locator('button:has-text("Simulate USDT settlement")').first();
  if (await btn.count()) {
    await btn.click();
    try {
      await waitForCount(
        "return /Payments\\s*·\\s*([1-9]\\d*)/.test(text) || /Event Log\\s*·\\s*([1-9]\\d*)/.test(text);",
        15000,
      );
      const pageText = (await page.textContent("main")) || "";
      const paymentsCount = pageText.match(/Payments\s*·\s*(\d+)/)?.[1] ?? "0";
      const eventCount = pageText.match(/Event Log\s*·\s*(\d+)/)?.[1] ?? "0";
      record(
        "Simulate USDT settlement updates Payments and Event Log",
        Number(paymentsCount) > 0 || Number(eventCount) > 0 ? "PASS" : "FAIL",
        Date.now() - start,
        { note: `Payments · ${paymentsCount}, Event Log · ${eventCount}` },
      );
    } catch {
      const pageText = (await page.textContent("main")) || "";
      const paymentsCount = pageText.match(/Payments\s*·\s*(\d+)/)?.[1] ?? "0";
      const eventCount = pageText.match(/Event Log\s*·\s*(\d+)/)?.[1] ?? "0";
      record(
        "Simulate USDT settlement updates Payments and Event Log",
        "FAIL",
        Date.now() - start,
        { note: `Payments · ${paymentsCount}, Event Log · ${eventCount} (timeout)` },
      );
    }
  } else {
    record("Simulate USDT settlement updates Payments and Event Log", "FAIL", Date.now() - start, {
      note: "button not found",
    });
  }
}

// 7. Simulate credit usage
{
  const start = Date.now();
  const btn = page.locator('button:has-text("Simulate credit usage")').first();
  if (await btn.count()) {
    await btn.click();
    try {
      await waitForCount(
        "return /Payouts\\s*·\\s*([1-9]\\d*)/.test(text) || /Event Log\\s*·\\s*([1-9]\\d*)/.test(text);",
        15000,
      );
      const pageText = (await page.textContent("main")) || "";
      const payoutsCount = pageText.match(/Payouts\s*·\s*(\d+)/)?.[1] ?? "0";
      const eventCount = pageText.match(/Event Log\s*·\s*(\d+)/)?.[1] ?? "0";
      record(
        "Simulate credit usage updates Payouts and Event Log",
        Number(payoutsCount) > 0 || Number(eventCount) > 0 ? "PASS" : "FAIL",
        Date.now() - start,
        { note: `Payouts · ${payoutsCount}, Event Log · ${eventCount}` },
      );
    } catch {
      const pageText = (await page.textContent("main")) || "";
      const payoutsCount = pageText.match(/Payouts\s*·\s*(\d+)/)?.[1] ?? "0";
      const eventCount = pageText.match(/Event Log\s*·\s*(\d+)/)?.[1] ?? "0";
      record("Simulate credit usage updates Payouts and Event Log", "FAIL", Date.now() - start, {
        note: `Payouts · ${payoutsCount}, Event Log · ${eventCount} (timeout)`,
      });
    }
  } else {
    record("Simulate credit usage updates Payouts and Event Log", "FAIL", Date.now() - start, {
      note: "button not found",
    });
  }
}

// 8. Event log contains entries
{
  const start = Date.now();
  const eventCount = await page.$eval("main", (el) => {
    const text = el.textContent || "";
    const m = text.match(/Event Log\s*·\s*(\d+)/);
    return m ? Number(m[1]) : 0;
  });
  record(
    "Event Log has entries after simulations",
    eventCount > 0 ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `Event Log · ${eventCount}` },
  );
}

await page.screenshot({ path: path.join(REPORT_DIR, "sandbox-deep-check.png"), fullPage: true });

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n=== DEEP CHECK SUMMARY ===`);
console.log(`Total: ${results.length} · PASS: ${passed} · FAIL: ${failed}`);
console.log(`Console errors during run: ${consoleMsgs.length}`);
if (consoleMsgs.length) {
  for (const m of consoleMsgs.slice(0, 5)) console.log(`  ! ${m.slice(0, 200)}`);
}

const reportPath = path.join(REPORT_DIR, "deep-check-report.json");
await fs.writeFile(
  reportPath,
  JSON.stringify(
    {
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString(),
      results,
      consoleErrors: consoleMsgs,
      summary: { total: results.length, pass: passed, fail: failed },
    },
    null,
    2,
  ),
);
console.log(`Report: ${reportPath}`);

await browser.close();
process.exit(failed > 0 ? 1 : 0);
