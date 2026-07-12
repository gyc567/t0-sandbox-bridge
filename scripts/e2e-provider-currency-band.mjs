import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { SUPPORTED_CURRENCIES } from "../src/lib/t0/currencies.ts";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8080";
const EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (os.platform() === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);
const REPORT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "e2e-reports");

const results = [];

function log(section, message) {
  console.log(`[${section}] ${message}`);
}

async function testProviderPage(context) {
  const page = await context.newPage();
  const consoleMessages = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      consoleMessages.push({ type, text: msg.text() });
    }
  });

  page.on("pageerror", (err) => {
    consoleMessages.push({ type: "pageerror", text: err.message });
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), status: 0, failure: req.failure()?.errorText });
  });

  const start = Date.now();
  let ok = true;
  let error = null;
  const checks = [];

  try {
    const url = `${BASE_URL}/provider`;
    log("navigate", `Opening ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");

    // 1. Page title check
    const title = await page.title();
    checks.push({ name: "page title", pass: title.includes("Provider Console") });
    if (!title.includes("Provider Console")) {
      throw new Error(`Expected page title to include "Provider Console", got "${title}"`);
    }

    // 2. Publish Quote section exists
    const publishQuoteBtn = await page.$('[data-testid="publish-quote"]');
    checks.push({ name: "publish quote button", pass: !!publishQuoteBtn });
    if (!publishQuoteBtn) {
      throw new Error("Missing Publish Quote button");
    }

    // 3. Currency dropdown exists - find by label text then navigate to parent div
    const currencyLabel = page.locator("label", { hasText: "Currency" }).first();
    const currencyTrigger = currencyLabel.locator("xpath=..").first().locator('button[role="combobox"]').first();
    checks.push({ name: "currency dropdown trigger", pass: (await currencyTrigger.count()) > 0 });
    if ((await currencyTrigger.count()) === 0) {
      throw new Error("Missing Currency dropdown trigger");
    }

    // 4. Band dropdown exists
    const bandLabel = page.locator("label", { hasText: "Band" }).first();
    const bandTrigger = bandLabel.locator("xpath=..").first().locator('button[role="combobox"]').first();
    checks.push({ name: "band dropdown trigger", pass: (await bandTrigger.count()) > 0 });
    if ((await bandTrigger.count()) === 0) {
      throw new Error("Missing Band dropdown trigger");
    }

    // 5. Open Currency dropdown and verify all 36 currencies are present
    log("currency", "Opening Currency dropdown...");
    await currencyTrigger.click();
    await page.waitForTimeout(300);

    // Wait for the dropdown content to appear
    const listbox = await page.$('[role="listbox"]');
    checks.push({ name: "currency listbox opened", pass: !!listbox });
    if (!listbox) {
      throw new Error("Currency dropdown did not open after click");
    }

    // Get all option text contents
    const options = await page.$$('[role="option"]');
    const optionTexts = await Promise.all(options.map(async (opt) => {
      const text = await opt.textContent();
      return text?.trim();
    }));

    const expectedCurrencies = SUPPORTED_CURRENCIES.map((c) => c.code);
    const missingCurrencies = expectedCurrencies.filter((c) => !optionTexts.includes(c));
    const extraCurrencies = optionTexts.filter((t) => !expectedCurrencies.includes(t) && t !== "");

    checks.push({
      name: "currency dropdown has all 36 supported currencies",
      pass: missingCurrencies.length === 0 && extraCurrencies.length === 0,
      details: {
        expectedCount: expectedCurrencies.length,
        actualCount: optionTexts.length,
        missing: missingCurrencies,
        extra: extraCurrencies,
        allOptions: optionTexts,
      },
    });

    if (missingCurrencies.length > 0) {
      throw new Error(`Missing currencies in dropdown: ${missingCurrencies.join(", ")}`);
    }
    if (extraCurrencies.length > 0) {
      throw new Error(`Unexpected extra currencies in dropdown: ${extraCurrencies.join(", ")}`);
    }

    log("currency", `✓ Found ${optionTexts.length} currencies, all match SUPPORTED_CURRENCIES`);

    // Close currency dropdown (press Escape)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // 6. Open Band dropdown and verify all 6 standard bands
    log("band", "Opening Band dropdown...");
    await bandTrigger.click();
    await page.waitForTimeout(300);

    const bandListbox = await page.$('[role="listbox"]');
    checks.push({ name: "band listbox opened", pass: !!bandListbox });
    if (!bandListbox) {
      throw new Error("Band dropdown did not open after click");
    }

    const bandOptions = await page.$$('[role="option"]');
    const bandOptionTexts = await Promise.all(bandOptions.map(async (opt) => {
      const text = await opt.textContent();
      return text?.trim();
    }));

    const expectedBands = ["$1,000", "$5,000", "$10,000", "$25,000", "$250,000", "$1,000,000"];
    const missingBands = expectedBands.filter((b) => !bandOptionTexts.includes(b));
    const extraBands = bandOptionTexts.filter((t) => !expectedBands.includes(t) && t !== "");

    checks.push({
      name: "band dropdown has all 6 standard bands",
      pass: missingBands.length === 0 && extraBands.length === 0,
      details: {
        expectedCount: expectedBands.length,
        actualCount: bandOptionTexts.length,
        missing: missingBands,
        extra: extraBands,
        allOptions: bandOptionTexts,
      },
    });

    if (missingBands.length > 0) {
      throw new Error(`Missing bands in dropdown: ${missingBands.join(", ")}`);
    }
    if (extraBands.length > 0) {
      throw new Error(`Unexpected extra bands in dropdown: ${extraBands.join(", ")}`);
    }

    log("band", `✓ Found ${bandOptionTexts.length} bands, all match standard set`);

    // Close band dropdown
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // 7. Verify default currency is EUR (first in the old list, but now should be first from SUPPORTED_CURRENCIES which is USD)
    // Actually the default is set to "EUR" in useState, so let's check that
    const currencyValue = await currencyTrigger.textContent();
    checks.push({
      name: "default currency display",
      pass: currencyValue?.trim() === "EUR",
      details: { actual: currencyValue?.trim() },
    });

    // 8. Verify default band is $1,000
    const bandValue = await bandTrigger.textContent();
    checks.push({
      name: "default band display",
      pass: bandValue?.trim() === "$1,000",
      details: { actual: bandValue?.trim() },
    });

    // Screenshot
    const screenshotPath = path.join(REPORT_DIR, "provider-currency-band-fix.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    results.push({
      name: "provider-currency-band",
      path: "/provider",
      status: "PASS",
      durationMs: Date.now() - start,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });
  } catch (err) {
    ok = false;
    error = err.message;
    const screenshotPath = path.join(REPORT_DIR, "provider-currency-band-failure.png");
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch {
      /* ignore */
    }
    results.push({
      name: "provider-currency-band",
      path: "/provider",
      status: "FAIL",
      durationMs: Date.now() - start,
      error,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });
  } finally {
    await page.close();
  }

  return ok;
}

async function main() {
  log("setup", `Testing ${BASE_URL}/provider`);
  log("setup", `Report dir: ${REPORT_DIR}`);
  log("setup", `Expected currencies: ${SUPPORTED_CURRENCIES.length}`);
  log("setup", `Expected bands: 6`);

  const browser = await chromium.launch({
    headless: true,
    ...(EXECUTABLE_PATH ? { executablePath: EXECUTABLE_PATH } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let allPassed = true;

  try {
    allPassed &= await testProviderPage(context);
  } finally {
    await browser.close();
  }

  const reportPath = path.join(REPORT_DIR, "provider-currency-band-report.json");
  await (
    await import("node:fs/promises")
  ).writeFile(
    reportPath,
    JSON.stringify({ baseUrl: BASE_URL, passed: allPassed, results }, null, 2),
  );

  // Write markdown report
  const mdReportPath = path.join(REPORT_DIR, "provider-currency-band-report.md");
  const md = generateMarkdownReport(allPassed, results);
  await (await import("node:fs/promises")).writeFile(mdReportPath, md);

  console.log("\n=== E2E PROVIDER CURRENCY/BAND TEST REPORT ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Overall:  ${allPassed ? "PASS ✓" : "FAIL ✗"}`);
  for (const r of results) {
    console.log(`\n  ${r.status} | ${r.name} | ${r.durationMs}ms`);
    if (r.checks) {
      for (const c of r.checks) {
        const icon = c.pass ? "✓" : "✗";
        console.log(`    ${icon} ${c.name}`);
        if (c.details && !c.pass) {
          console.log(`      Details: ${JSON.stringify(c.details, null, 2).replace(/\n/g, "\n      ")}`);
        }
      }
    }
    if (r.error) {
      console.log(`    ERROR: ${r.error}`);
    }
    if (r.consoleMessages?.length > 0) {
      console.log(`    Console issues: ${r.consoleMessages.length}`);
    }
  }
  console.log(`\nReport JSON: ${reportPath}`);
  console.log(`Report MD:   ${mdReportPath}`);

  process.exit(allPassed ? 0 : 1);
}

function generateMarkdownReport(passed, results) {
  const r = results[0];
  let md = `# Provider Currency / Band E2E Test Report\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n\n`;
  md += `**Base URL:** ${BASE_URL}\n\n`;
  md += `**Overall:** ${passed ? "PASS ✓" : "FAIL ✗"}\n\n`;
  md += `---\n\n`;

  md += `## Test: ${r.name}\n\n`;
  md += `- **Path:** ${r.path}\n`;
  md += `- **Status:** ${r.status}\n`;
  md += `- **Duration:** ${r.durationMs}ms\n\n`;

  md += `### Checks\n\n`;
  md += `| # | Check | Status | Details |\n`;
  md += `|---|-------|--------|---------|\n`;
  let idx = 1;
  for (const c of r.checks || []) {
    const status = c.pass ? "PASS ✓" : "FAIL ✗";
    let details = "";
    if (c.details) {
      if (c.details.expectedCount !== undefined) {
        details += `Expected: ${c.details.expectedCount}, Actual: ${c.details.actualCount}`;
        if (c.details.missing?.length > 0) {
          details += `, Missing: ${c.details.missing.join(", ")}`;
        }
        if (c.details.extra?.length > 0) {
          details += `, Extra: ${c.details.extra.join(", ")}`;
        }
      } else if (c.details.actual !== undefined) {
        details += `Actual: "${c.details.actual}"`;
      }
    }
    md += `| ${idx} | ${c.name} | ${status} | ${details} |\n`;
    idx++;
  }

  md += `\n`;

  if (r.error) {
    md += `### Error\n\n`;
    md += `\`\`\`\n${r.error}\n\`\`\`\n\n`;
  }

  if (r.details?.allOptions) {
    md += `### Currency Options Found\n\n`;
    md += `\`\`\`\n${r.details.allOptions.join(", ")}\n\`\`\`\n\n`;
  }

  if (r.consoleMessages?.length > 0) {
    md += `### Console Issues (${r.consoleMessages.length})\n\n`;
    for (const msg of r.consoleMessages.slice(0, 10)) {
      md += `- [${msg.type}] ${msg.text}\n`;
    }
    if (r.consoleMessages.length > 10) {
      md += `- ... and ${r.consoleMessages.length - 10} more\n`;
    }
    md += `\n`;
  }

  if (r.failedRequests?.length > 0) {
    md += `### Failed Requests (${r.failedRequests.length})\n\n`;
    for (const req of r.failedRequests.slice(0, 10)) {
      md += `- ${req.status} ${req.url}\n`;
    }
    md += `\n`;
  }

  md += `### Screenshot\n\n`;
  md += `![Provider Page](${path.basename(r.screenshot)})\n\n`;

  md += `---\n\n`;
  md += `## Expected Currency List (from SUPPORTED_CURRENCIES)\n\n`;
  md += SUPPORTED_CURRENCIES.map((c) => `- **${c.code}** — ${c.label} (${c.country})`).join("\n");
  md += `\n\n`;

  md += `## Expected Band List (from T-0 docs)\n\n`;
  md += `- $1,000\n- $5,000\n- $10,000\n- $25,000\n- $250,000\n- $1,000,000\n\n`;

  return md;
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
