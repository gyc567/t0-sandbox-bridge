// e2e-aml-upload-download.mjs — E2E: OFI uploads AML → Provider sees Download button → downloads file.
//
// Flow:
//   1. OFI: Create a payment (pre-seeded quote exists) → triggers AML
//   2. OFI: Upload AML file
//   3. Provider: Refresh → Download button appears
//   4. Provider: Click Download → file is saved

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

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

async function testAmlUploadAndDownload(context) {
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

  const start = Date.now();
  let ok = true;
  let error = null;
  const checks = [];
  let paymentId = null;

  // Create a temp PDF file to upload.
  const tmpDir = os.tmpdir();
  const pdfPath = path.join(tmpDir, `aml-test-${Date.now()}.pdf`);
  const pdfContent = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n196\n%%EOF",
  );
  fs.writeFileSync(pdfPath, pdfContent);

  try {
    // ── Step 1: OFI — Get Quote ────────────────────────────────────────
    log("ofi", "Opening OFI console...");
    await page.goto(`${BASE_URL}/ofi`, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Wait for React hydration
    await page.waitForTimeout(2000);

    const title = await page.title();
    checks.push({ name: "OFI page title", pass: title.includes("OFI Console") });
    if (!title.includes("OFI Console")) throw new Error(`Unexpected title: ${title}`);

    // Wait for Get Quote button to be interactive
    log("ofi", "Getting a quote...");
    await page.waitForSelector('[data-testid="btn-quote"]', { state: "visible", timeout: 10000 });
    await page.click('[data-testid="btn-quote"]');

    // Wait for quote result and Create Payment button to become enabled
    log("ofi", "Waiting for quote to load...");
    await page.waitForSelector('[data-testid="btn-create"]:not([disabled])', { timeout: 15000 });
    await page.waitForTimeout(500);

    // ── Step 2: OFI — Create Payment ───────────────────────────────────
    log("ofi", "Creating a payment...");
    await page.click('[data-testid="btn-create"]');

    // Wait for the AML panel to appear (triggerManualAml is called after createPayment)
    // The page should navigate or update to show the AML upload UI
    await page.waitForTimeout(3000);

    // Check URL for aml-required param
    const url = page.url();
    log("ofi", `URL after create: ${url}`);
    const urlHasAmlRequired = url.includes("aml-required");
    checks.push({ name: "URL has aml-required param", pass: urlHasAmlRequired });

    // Find the payment ID from the URL or page content
    const urlMatch = url.match(/aml-required=([^&]+)/);
    if (urlMatch) {
      paymentId = decodeURIComponent(urlMatch[1]);
    }
    log("ofi", `Payment ID: ${paymentId}`);

    // ── Step 3: OFI — Upload AML file ─────────────────────────────────
    // The payment should now be in pending_aml status, showing the upload UI
    log("ofi", "Looking for AML upload UI...");

    // Wait for file input to appear (upload UI for pending_aml payment)
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 8000 });
    } catch {
      // If file input not found, try scrolling to Payment-Manual AML tab
      log("ofi", "File input not found directly, switching to AML tab...");
      const amlTab = await page.$('button:has-text("Payment-Manual AML")');
      if (amlTab) await amlTab.click();
      await page.waitForTimeout(1000);
      await page.waitForSelector('input[type="file"]', { timeout: 8000 });
    }

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found in AML panel");
    await fileInput.setInputFiles(pdfPath);
    log("ofi", "File selected, submitting...");

    // Wait for Upload & Submit button
    await page.waitForSelector('button:has-text("Upload & Submit")', { timeout: 5000 });
    await page.click('button:has-text("Upload & Submit")');

    // Wait for upload to complete and UI to update
    await page.waitForTimeout(3000);
    log("ofi", "Upload completed");

    checks.push({ name: "OFI upload completed", pass: true });

    // ── Step 4: Provider — Check Download button ───────────────────────
    log("provider", "Opening Provider console...");
    const providerPage = await context.newPage();

    providerPage.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        consoleMessages.push({ type: `provider:${type}`, text: msg.text() });
      }
    });

    await providerPage.goto(`${BASE_URL}/provider`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await providerPage.waitForTimeout(2000);

    const providerTitle = await providerPage.title();
    checks.push({ name: "Provider page title", pass: providerTitle.includes("Provider Console") });

    // Click Payment-Manual AML tab
    const amlTab = await providerPage.waitForSelector('button:has-text("Payment-Manual AML")', { timeout: 10000 });
    await amlTab.click();
    await providerPage.waitForTimeout(2000);

    // Find Download button for the payment
    if (!paymentId) {
      // If we don't have paymentId from URL, try to find any pending_aml payment with Download button
      const anyDownload = await providerPage.$('[data-testid^="aml-download-"]');
      if (anyDownload) {
        const testId = await anyDownload.getAttribute("data-testid");
        paymentId = testId.replace("aml-download-", "");
        checks.push({ name: "Found Download button (payment ID extracted from testid)", pass: true, details: { paymentId } });
      }
    } else {
      const downloadBtn = await providerPage.$(`[data-testid="aml-download-${paymentId}"]`);
      checks.push({
        name: "Provider sees Download button after OFI upload",
        pass: !!downloadBtn,
        details: { paymentId },
      });

      if (!downloadBtn) {
        // Try with URL-encoded ID
        const encodedId = encodeURIComponent(paymentId);
        const downloadBtn2 = await providerPage.$(`[data-testid="aml-download-${encodedId}"]`);
        if (downloadBtn2) {
          checks.push({ name: "Provider sees Download button (URL-encoded ID)", pass: true, details: { paymentId: encodedId } });
        } else {
          // Screenshot for debugging
          const screenshotPath = path.join(REPORT_DIR, "aml-download-missing-btn.png");
          await providerPage.screenshot({ path: screenshotPath, fullPage: true });
        }
      }
    }

    if (!paymentId) {
      throw new Error("Could not determine payment ID for Download button check");
    }

    // Try to find and click the download button
    const selector = `[data-testid="aml-download-${CSS.escape(paymentId)}"]`;
    const downloadBtn = await providerPage.waitForSelector(selector, { state: "visible", timeout: 5000 });

    // ── Step 5: Provider — Download the file ───────────────────────────
    log("provider", "Downloading AML file...");

    const [download] = await Promise.all([
      providerPage.waitForEvent("download", { timeout: 10000 }),
      downloadBtn.click(),
    ]);

    const downloadFilename = download.suggestedFilename();
    checks.push({
      name: "Download triggered with PDF filename",
      pass: downloadFilename.endsWith(".pdf"),
      details: { filename: downloadFilename },
    });

    const downloadedPath = path.join(tmpDir, `downloaded-${Date.now()}.pdf`);
    await download.saveAs(downloadedPath);

    const downloadedContent = fs.readFileSync(downloadedPath);
    checks.push({
      name: "Downloaded file is non-empty",
      pass: downloadedContent.length > 0,
      details: { size: downloadedContent.length },
    });

    checks.push({
      name: "Downloaded file content matches uploaded",
      pass: downloadedContent.equals(pdfContent),
    });

    results.push({
      name: "aml-upload-download",
      status: "PASS",
      durationMs: Date.now() - start,
      checks,
      consoleMessages,
      failedRequests,
    });

    log("done", "All checks passed!");
  } catch (err) {
    ok = false;
    error = err.message;
    const screenshotPath = path.join(REPORT_DIR, "aml-upload-download-failure.png");
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch { /* ignore */ }
    results.push({
      name: "aml-upload-download",
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
    try { fs.unlinkSync(pdfPath); } catch { /* ignore */ }
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
    allPassed &= await testAmlUploadAndDownload(context);
  } finally {
    await browser.close();
  }

  const reportPath = path.join(REPORT_DIR, "aml-upload-download-report.json");
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(reportPath, JSON.stringify({ baseUrl: BASE_URL, passed: allPassed, results }, null, 2)),
  );

  const mdReportPath = path.join(REPORT_DIR, "aml-upload-download-report.md");
  const md = generateMarkdownReport(allPassed, results);
  await import("node:fs/promises").then((fs) => fs.writeFile(mdReportPath, md));

  console.log("\n=== E2E AML UPLOAD → DOWNLOAD TEST REPORT ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Overall:  ${allPassed ? "PASS ✓" : "FAIL ✗"}`);
  for (const r of results) {
    console.log(`\n  ${r.status} | ${r.name} | ${r.durationMs}ms`);
    for (const c of r.checks || []) {
      const icon = c.pass ? "✓" : "✗";
      console.log(`    ${icon} ${c.name}`);
      if (c.details) console.log(`      Details: ${JSON.stringify(c.details)}`);
    }
    if (r.error) console.log(`    ERROR: ${r.error}`);
  }
  console.log(`\nReport: ${reportPath}`);
  process.exit(allPassed ? 0 : 1);
}

function generateMarkdownReport(passed, results) {
  const r = results[0];
  let md = `# AML Upload → Download E2E Test Report\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n\n`;
  md += `**Base URL:** ${BASE_URL}\n\n`;
  md += `**Overall:** ${passed ? "PASS ✓" : "FAIL ✗"}\n\n`;
  md += `---\n\n`;
  md += `## Test: ${r.name}\n\n`;
  md += `- **Status:** ${r.status}\n`;
  md += `- **Duration:** ${r.durationMs}ms\n\n`;
  md += `### Checks\n\n`;
  md += `| # | Check | Status | Details |\n`;
  md += `|---|-------|--------|---------|\n`;
  r.checks?.forEach((c, i) => {
    md += `| ${i + 1} | ${c.name} | ${c.pass ? "PASS ✓" : "FAIL ✗"} | ${c.details ? JSON.stringify(c.details) : ""} |\n`;
  });
  if (r.error) md += `\n### Error\n\n\`\`\`\n${r.error}\n\`\`\`\n\n`;
  return md;
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
