import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173";
const EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);
const REPORT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "e2e-reports");

const results = [];

function log(section, message) {
  console.log(`[${section}] ${message}`);
}

async function testPage(context, { name, path: pagePath, checks }) {
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

  try {
    const url = `${BASE_URL}${pagePath}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");

    for (const check of checks) {
      const el = await page.$(check.selector);
      if (!el) {
        throw new Error(`Missing element: ${check.name} (${check.selector})`);
      }
      if (check.text) {
        const text = await el.textContent();
        if (!text.includes(check.text)) {
          throw new Error(`Expected "${check.text}" in ${check.name}, got "${text}"`);
        }
      }
    }

    const screenshotPath = path.join(REPORT_DIR, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    results.push({
      name,
      path: pagePath,
      status: "PASS",
      durationMs: Date.now() - start,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });
  } catch (err) {
    ok = false;
    error = err.message;
    const screenshotPath = path.join(REPORT_DIR, `${name}-failure.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      /* ignore */
    }
    results.push({
      name,
      path: pagePath,
      status: "FAIL",
      durationMs: Date.now() - start,
      error,
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
  log("setup", `Testing ${BASE_URL}`);
  log("setup", `Report dir: ${REPORT_DIR}`);

  const browser = await chromium.launch({
    headless: true,
    ...(EXECUTABLE_PATH ? { executablePath: EXECUTABLE_PATH } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let allPassed = true;

  try {
    allPassed &= await testPage(context, {
      name: "landing",
      path: "/",
      checks: [
        { name: "hero heading", selector: ".text-display-mega", text: "资金" },
        { name: "theme toggle", selector: "button[aria-label^='Switch to']" },
        { name: "sandbox CTA", selector: "main a[href='/sandbox']", text: "Open Sandbox" },
        { name: "docs CTA", selector: "a[href='/docs']", text: "Docs" },
      ],
    });

    allPassed &= await testPage(context, {
      name: "sandbox",
      path: "/sandbox",
      checks: [
        { name: "sandbox console renders", selector: "main" },
        { name: "BAXS brand block", selector: "header" },
      ],
    });

    // /playground is now a hard 404 (route file removed in phase 3; TanStack Router
    // 302 redirect in SSR was unstable). Future reinstatement via redirect is
    // a deferred item. We assert the route returns 404 here.
    {
      const page = await context.newPage();
      try {
        const resp = await page.goto(`${BASE_URL}/playground`, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        const status = resp ? resp.status() : 0;
        const passed = status === 404;
        results.push({
          name: "playground-route-returns-404",
          path: "/playground",
          status: passed ? "PASS" : "FAIL",
          durationMs: 0,
          error: passed ? undefined : `expected /playground to return 404, got status ${status}`,
          consoleMessages: [],
          failedRequests: [],
          screenshot: undefined,
        });
        if (!passed) allPassed = false;
      } catch (err) {
        allPassed = false;
        results.push({
          name: "playground-route-returns-404",
          path: "/playground",
          status: "FAIL",
          durationMs: 0,
          error: err.message,
          consoleMessages: [],
          failedRequests: [],
          screenshot: undefined,
        });
      } finally {
        await page.close();
      }
    }

    allPassed &= await testPage(context, {
      name: "sandbox",
      path: "/sandbox",
      checks: [
        { name: "page heading", selector: "h1", text: "Payout Provider Sandbox" },
        { name: "currency select", selector: '[role="combobox"]' },
        {
          name: "publish button",
          selector: 'button:has-text("Publish quote")',
          text: "Publish quote",
        },
      ],
    });

    allPassed &= await testPage(context, {
      name: "docs",
      path: "/docs",
      checks: [
        { name: "page heading", selector: "h1", text: "Integration Guide" },
        { name: "TOC", selector: "aside" },
        { name: "prose content", selector: ".prose" },
      ],
    });
  } finally {
    await browser.close();
  }

  const reportPath = path.join(REPORT_DIR, "report.json");
  await (
    await import("node:fs/promises")
  ).writeFile(
    reportPath,
    JSON.stringify({ baseUrl: BASE_URL, passed: allPassed, results }, null, 2),
  );

  console.log("\n=== E2E SMOKE TEST REPORT ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Overall:  ${allPassed ? "PASS" : "FAIL"}`);
  for (const r of results) {
    console.log(
      `  ${r.status} | ${r.name.padEnd(12)} | ${r.durationMs}ms | ${
        r.error || r.consoleMessages.length + " console issues"
      }`,
    );
  }
  console.log(`\nReport JSON: ${reportPath}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
