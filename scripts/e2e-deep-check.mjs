/**
 * Phase 8 deep-check: validates the 4-node topology, 4 server fns wired
 * to real IDs, transport bar, and live event log behaviour.
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173";
const REPORT_DIR = path.resolve(__dirname, "..", "e2e-reports");

const results = [];
function record(name, status, durationMs, details = {}) {
  results.push({ name, status, durationMs, ...details });
  const marker = status === "PASS" ? "✓" : "✗";
  console.log(`  ${marker} ${name} (${durationMs}ms)${details.note ? " — " + details.note : ""}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleMsgs = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleMsgs.push(m.text());
});
page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e.message}`));

const t0 = Date.now();
// /playground is now a 302 redirect wrapper to /sandbox (phase 3 plan).
// We hit /sandbox directly since the redirect target is the surface we want to verify.
await page.goto(`${BASE_URL}/sandbox`, { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForSelector("main", { timeout: 5000 });
record("sandbox page loads", "PASS", Date.now() - t0);

// 1. Default flow (Cross-Border → pay-out) — 3 node cards, no Pay-In
{
  const start = Date.now();
  const cardCount = await page.evaluate(() =>
    document.querySelectorAll('[aria-label^="Inspect "]').length
  );
  record(
    "sandbox console: 3 node cards (no Pay-In)",
    cardCount === 3 ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `found ${cardCount} (expected 3)` }
  );
}

// 2. TransportBar visible in auto mode
{
  const start = Date.now();
  const bar = await page.$('[aria-label="Playback transport"]');
  const playBtn = await page.$('button[aria-label^="Pause"]');
  record(
    "TransportBar + Pause button in auto mode",
    bar && playBtn ? "PASS" : "FAIL",
    Date.now() - start
  );
}

// 3. Speed selector shows 0.5x / 1x / 2x
{
  const start = Date.now();
  const speeds = await page.$$eval(
    '[aria-label="Playback speed"] button',
    (els) => els.map((e) => e.textContent)
  );
  record(
    "Speed selector has 0.5x / 1x / 2x",
    JSON.stringify(speeds) === '["0.5x","1x","2x"]' ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `got ${JSON.stringify(speeds)}` }
  );
}

// 4. Live event log mounted
{
  const start = Date.now();
  const log = await page.$('section[aria-label="Live network event log"]');
  record("Live event log present", log ? "PASS" : "FAIL", Date.now() - start);
}

// 5. Auto-play advances progress over 5s
{
  const start = Date.now();
  await page.waitForTimeout(5000);
  const width = await page.evaluate(() => {
    let best = 0;
    for (const t of document.querySelectorAll('div[style*="width:"]')) {
      const m = t.style.width.match(/^(\d+(?:\.\d+)?)%$/);
      if (m) best = Math.max(best, parseFloat(m[1]));
    }
    return best;
  });
  record(
    "auto-play progress > 0.3% after 5s",
    width > 0.3 ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `fill=${width.toFixed(3)}%` }
  );
}

// 6. Click a packet/marker → ArtifactDrawer opens with liveIds
{
  const start = Date.now();
  // Click the create-payment marker (the timeline scrubber is sticky-bottom,
  // markers are buttons with title="CreatePayment" in the scrubber).
  const marker = await page.$('button[aria-label="Open artifact for CreatePayment"]');
  if (marker) {
    await marker.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
    const dialogText = await page.textContent('[role="dialog"]');
    const hasPaymentId = /payment_id|payment\.id|pm_/i.test(dialogText);
    record(
      "ArtifactDrawer opens with payment_id field",
      hasPaymentId ? "PASS" : "FAIL",
      Date.now() - start,
      { note: hasPaymentId ? "" : "no payment_id pattern found" }
    );
    // Close drawer
    await page.click('button[aria-label="Close artifact drawer"]');
  } else {
    record("ArtifactDrawer opens with payment_id field", "FAIL", Date.now() - start, {
      note: "marker not found",
    });
  }
}

// 7. Switch to Trading (manual-aml) channel
{
  const start = Date.now();
  await page.click('button:has-text("Trading Desk")');
  await page.waitForTimeout(500);
  const flowLabel = await page.textContent(".font-mono:has-text('flow · manual-aml')").catch(() => null);
  record(
    "Switching to Trading Desk changes flow to manual-aml",
    flowLabel !== null ? "PASS" : "FAIL",
    Date.now() - start
  );
}

// 8. Switch to Fintech (payment-intent) — Pay-In node should appear
{
  const start = Date.now();
  await page.click('button:has-text("Fintech")');
  await page.waitForTimeout(500);
  const cards = await page.$$eval(
    '[aria-label^="Inspect"]',
    (els) => els.map((e) => e.getAttribute("aria-label"))
  );
  const hasPayin = cards.includes("Inspect Pay-In Wallet");
  record(
    "Fintech flow shows Pay-In node",
    hasPayin ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `cards: ${JSON.stringify(cards)}` }
  );
}

// 9. Switch to Trading (manual-aml) — IVMS101 disclosure should appear
{
  const start = Date.now();
  await page.click('button:has-text("Trading Desk")');
  await page.waitForTimeout(500);
  const ivmsMarker = await page.$(
    'button[aria-label="Open artifact for Travel Rule (IVMS101)"]'
  );
  if (ivmsMarker) {
    await ivmsMarker.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
    const t = await page.textContent('[role="dialog"]');
    const hasIvms = /Travel Rule|IVMS101|originator|beneficiary/i.test(t);
    record(
      "IVMS101 disclosure artifact opens (manual-aml)",
      hasIvms ? "PASS" : "FAIL",
      Date.now() - start,
      { note: hasIvms ? "" : "no IVMS marker in drawer" }
    );
    await page.click('button[aria-label="Close artifact drawer"]');
  } else {
    record("IVMS101 disclosure artifact opens (manual-aml)", "FAIL", Date.now() - start, {
      note: "marker not found",
    });
  }
}

// 9. Pause button works
{
  const start = Date.now();
  await page.click('button[aria-label="Pause auto-playback"]');
  await page.waitForTimeout(500);
  const width1 = await page.evaluate(() => {
    let best = 0;
    for (const t of document.querySelectorAll('div[style*="width:"]')) {
      const m = t.style.width.match(/^(\d+(?:\.\d+)?)%$/);
      if (m) best = Math.max(best, parseFloat(m[1]));
    }
    return best;
  });
  await page.waitForTimeout(2000);
  const width2 = await page.evaluate(() => {
    let best = 0;
    for (const t of document.querySelectorAll('div[style*="width:"]')) {
      const m = t.style.width.match(/^(\d+(?:\.\d+)?)%$/);
      if (m) best = Math.max(best, parseFloat(m[1]));
    }
    return best;
  });
  const paused = Math.abs(width2 - width1) < 0.05;
  record(
    "Pause freezes progress",
    paused ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `before=${width1.toFixed(3)}% after2s=${width2.toFixed(3)}%` }
  );
}

// 10. Speed=2x advances faster
{
  const start = Date.now();
  await page.click('button[aria-label="Resume auto-playback"]');
  await page.click('button[role="radio"]:has-text("2x")');
  await page.waitForTimeout(3000);
  const width = await page.evaluate(() => {
    let best = 0;
    for (const t of document.querySelectorAll('div[style*="width:"]')) {
      const m = t.style.width.match(/^(\d+(?:\.\d+)?)%$/);
      if (m) best = Math.max(best, parseFloat(m[1]));
    }
    return best;
  });
  record(
    "2x speed advances ≥ 1% in 3s",
    width > 1 ? "PASS" : "FAIL",
    Date.now() - start,
    { note: `width=${width.toFixed(3)}%` }
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

await browser.close();
process.exit(failed > 0 ? 1 : 0);