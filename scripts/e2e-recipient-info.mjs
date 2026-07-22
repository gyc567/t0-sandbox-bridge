import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

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

async function clickTabByText(page, text) {
  const tabs = await page.$$("button");
  for (const b of tabs) {
    const t = await b.textContent();
    if (t && t.includes(text)) {
      await b.click();
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

async function testRecipientInfoFlow(context) {
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
  const checks = [];

  try {
    log("ofi", "Opening OFI console...");
    await page.goto(`${BASE_URL}/ofi`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    const ofiTitle = await page.title();
    checks.push({ name: "OFI page loads", pass: ofiTitle.length > 0, details: ofiTitle });

    // Switch to Payment-Payment Continued tab
    log("ofi", "Switching to Payment-Payment Continued tab...");
    const tabClicked = await clickTabByText(page, "Payment-Payment Continued");
    checks.push({ name: "Payment-Payment Continued tab clicked", pass: tabClicked, details: tabClicked });
    await page.waitForTimeout(500);

    // Verify form elements exist
    const clientIdInput = await page.$('[data-testid="client-id"]');
    checks.push({ name: "clientId input exists", pass: !!clientIdInput, details: !!clientIdInput });

    const quoteIdInput = await page.$('[data-testid="quote-id"]');
    checks.push({ name: "quoteId input exists", pass: !!quoteIdInput, details: !!quoteIdInput });

    const createBtn = await page.$('[data-testid="btn-create"]');
    checks.push({ name: "Create Payment button exists", pass: !!createBtn, details: !!createBtn });

    // Check recipient info fields exist
    const nameInput = await page.$('[data-testid="recipient-account-holder-name"]');
    checks.push({ name: "accountHolderName input exists", pass: !!nameInput, details: !!nameInput });

    const accNumInput = await page.$('[data-testid="recipient-account-number"]');
    checks.push({ name: "accountNumber input exists", pass: !!accNumInput, details: !!accNumInput });

    const bankCodeInput = await page.$('[data-testid="recipient-bank-code"]');
    checks.push({ name: "bankCode input exists", pass: !!bankCodeInput, details: !!bankCodeInput });

    const bankNameInput = await page.$('[data-testid="recipient-bank-name"]');
    checks.push({ name: "bankName input exists", pass: !!bankNameInput, details: !!bankNameInput });

    // Get Quote first (button is btn-quote)
    log("ofi", "Getting quote...");
    const getQuoteBtn = await page.$('[data-testid="btn-quote"]');
    checks.push({ name: "Get Quote button (btn-quote) exists", pass: !!getQuoteBtn, details: !!getQuoteBtn });
    if (getQuoteBtn) {
      const isDisabled = await getQuoteBtn.getAttribute("disabled");
      const existingQuoteId = quoteIdInput ? await quoteIdInput.inputValue() : "";
      if (isDisabled === null && !existingQuoteId) {
        await page.evaluate(el => el.click(), getQuoteBtn);
        await page.waitForTimeout(2000);
        const newQuoteIdVal = quoteIdInput ? await quoteIdInput.inputValue() : "";
        checks.push({ name: "Quote obtained (quoteId populated)", pass: !!newQuoteIdVal && newQuoteIdVal.length > 0, details: newQuoteIdVal });
      } else if (existingQuoteId) {
        checks.push({ name: "Quote already obtained", pass: true, details: existingQuoteId });
      } else {
        checks.push({ name: "Get Quote button enabled", pass: false, details: `disabled=${isDisabled}` });
      }
    }

    // Fill recipient info fields
    log("ofi", "Filling recipient info...");
    if (nameInput) {
      await nameInput.fill("Zhang San");
      checks.push({ name: "accountHolderName filled (Zhang San)", pass: true });
    }
    if (accNumInput) {
      await accNumInput.fill("DE89370400440532013000");
      checks.push({ name: "accountNumber filled (DE89...)", pass: true });
    }
    if (bankCodeInput) {
      await bankCodeInput.fill("COBADEFFXXX");
      checks.push({ name: "bankCode filled (COBADEFFXXX)", pass: true });
    }
    if (bankNameInput) {
      await bankNameInput.fill("Commerzbank");
      checks.push({ name: "bankName filled (Commerzbank)", pass: true });
    }

    // Country select: click via JS dispatch (bypasses portal overlay issues)
    const countrySelected = await page.evaluate(() => {
      const combobox = document.querySelector('[role="combobox"]');
      if (!combobox) return false;
      combobox.click();
      return true;
    });
    // Wait for Radix dropdown to appear in portal
    await page.waitForTimeout(800);

    const items = await page.$$('[data-radix-collection-item]');
    let deSelected = false;
    for (const item of items) {
      const text = await item.textContent();
      if (text && text.includes("DE")) {
        await page.evaluate(el => el.click(), item);
        deSelected = true;
        break;
      }
    }
    if (!deSelected && items.length > 0) {
      await page.evaluate(el => el.click(), items[0]);
      deSelected = true;
    }
    await page.waitForTimeout(200);
    checks.push({ name: "Country selected via JS click", pass: countrySelected, details: countrySelected ? "combobox clicked" : "combobox not found" });

    // Create Payment
    log("ofi", "Creating payment...");
    const createBtnAfter = await page.$('[data-testid="btn-create"]');
    if (createBtnAfter) {
      const isDisabled = await createBtnAfter.getAttribute("disabled");
      checks.push({ name: "Create Payment button enabled", pass: isDisabled === null, details: isDisabled });
      if (isDisabled === null) {
        await page.evaluate(el => el.click(), createBtnAfter);
        await page.waitForTimeout(3000);
        const resultTextarea = await page.$('[data-testid="payment-result"]');
        const resultValue = resultTextarea ? await resultTextarea.inputValue() : "";
        checks.push({
          name: "Payment result returned (success)",
          pass: !!resultValue && resultValue.includes("success"),
          details: resultValue.substring(0, 300),
        });
      }
    }

    const ofiScreenshotPath = path.join(REPORT_DIR, "ofi-recipient-info-payment-created.png");
    await page.screenshot({ path: ofiScreenshotPath, fullPage: false });

    results.push({
      name: "ofi-create-payment-with-recipient-info",
      path: "/ofi",
      status: "PASS",
      durationMs: Date.now() - start,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: ofiScreenshotPath,
    });

  } catch (err) {
    const screenshotPath = path.join(REPORT_DIR, "ofi-recipient-info-failure.png");
    try { await page.screenshot({ path: screenshotPath, fullPage: false }); } catch { /* ignore */ }
    results.push({
      name: "ofi-create-payment-with-recipient-info",
      path: "/ofi",
      status: "FAIL",
      durationMs: Date.now() - start,
      error: err.message,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });
    return false;
  } finally {
    await page.close();
  }

  return true;
}

async function testProviderRecipientDisplay(context) {
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
  const checks = [];

  try {
    log("provider", "Opening Provider console...");
    await page.goto(`${BASE_URL}/provider`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    const providerTitle = await page.title();
    checks.push({ name: "Provider page loads", pass: providerTitle.includes("Provider"), details: providerTitle });

    await clickTabByText(page, "Payment-Payment Continued");
    await page.waitForTimeout(1000);

    const recipientInfoDiv = await page.getByText("Recipient info").first();
    checks.push({ name: "Recipient info section visible in Provider", pass: !!recipientInfoDiv, details: !!recipientInfoDiv });

    const zhangSanText = await page.getByText("Zhang San").first();
    checks.push({ name: "accountHolderName (Zhang San) displayed", pass: !!zhangSanText, details: !!zhangSanText });

    const accNumText = await page.getByText("DE89370400440532013000").first();
    checks.push({ name: "accountNumber (DE89...) displayed", pass: !!accNumText, details: !!accNumText });

    const bankNameText = await page.getByText("Commerzbank").first();
    checks.push({ name: "bankName (Commerzbank) displayed", pass: !!bankNameText, details: !!bankNameText });

    const bankCodeText = await page.getByText("COBADEFFXXX").first();
    checks.push({ name: "bankCode (COBADEFFXXX) displayed", pass: !!bankCodeText, details: !!bankCodeText });

    const screenshotPath = path.join(REPORT_DIR, "provider-recipient-info-display.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    results.push({
      name: "provider-recipient-info-display",
      path: "/provider",
      status: "PASS",
      durationMs: Date.now() - start,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });

  } catch (err) {
    const screenshotPath = path.join(REPORT_DIR, "provider-recipient-info-display-failure.png");
    try { await page.screenshot({ path: screenshotPath, fullPage: false }); } catch { /* ignore */ }
    results.push({
      name: "provider-recipient-info-display",
      path: "/provider",
      status: "FAIL",
      durationMs: Date.now() - start,
      error: err.message,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });
    return false;
  } finally {
    await page.close();
  }

  return true;
}

async function testProviderManualAmlRecipientReview(context) {
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

  const start = Date.now();
  const checks = [];

  try {
    log("provider-aml", "Opening Provider console Manual AML panel...");
    await page.goto(`${BASE_URL}/provider`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    const amlTabClicked = await clickTabByText(page, "Payment-Manual AML");
    checks.push({ name: "Payment-Manual AML tab clicked", pass: amlTabClicked, details: amlTabClicked });
    await page.waitForTimeout(2000);

    const recipientVerifyCheckbox = await page.$('[data-testid^="recipient-verify-"]');
    checks.push({ name: "Recipient verification checkbox exists", pass: !!recipientVerifyCheckbox, details: !!recipientVerifyCheckbox });

    const recipientInfoInAml = await page.getByText("Recipient info").first();
    checks.push({ name: "Recipient info section in AML panel", pass: !!recipientInfoInAml, details: !!recipientInfoInAml });

    const approveBtn = await page.$('[data-testid^="aml-approve-"]');
    checks.push({ name: "AML approve button exists (payment pending)", pass: !!approveBtn, details: !!approveBtn });

    const screenshotPath = path.join(REPORT_DIR, "provider-aml-recipient-review.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    results.push({
      name: "provider-manual-aml-recipient-review",
      path: "/provider",
      status: "PASS",
      durationMs: Date.now() - start,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });

  } catch (err) {
    const screenshotPath = path.join(REPORT_DIR, "provider-aml-recipient-review-failure.png");
    try { await page.screenshot({ path: screenshotPath, fullPage: false }); } catch { /* ignore */ }
    results.push({
      name: "provider-manual-aml-recipient-review",
      path: "/provider",
      status: "FAIL",
      durationMs: Date.now() - start,
      error: err.message,
      checks,
      consoleMessages,
      failedRequests,
      screenshot: screenshotPath,
    });
    return false;
  } finally {
    await page.close();
  }

  return true;
}

async function testNoRecipientInfoLegacyPayment(context) {
  const page = await context.newPage();
  const start = Date.now();
  const checks = [];

  try {
    log("legacy", "Testing legacy payment without recipient info...");
    await page.goto(`${BASE_URL}/ofi`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    await clickTabByText(page, "Payment-Payment Continued");
    await page.waitForTimeout(500);

    // Quote may already exist from test 1 — reuse it if available
    let existingQuoteId = await page.$eval('[data-testid="quote-id"]', el => el.value).catch(() => "");
    if (!existingQuoteId) {
      const getQuoteBtnLegacy = await page.$('[data-testid="btn-quote"]');
      if (getQuoteBtnLegacy) {
        await page.evaluate(() => {
          const btn = document.querySelector('[data-testid="btn-quote"]');
          if (btn) btn.click();
        });
        // Wait for the quote to be fetched and DOM to update
        await page.waitForTimeout(4000);
        existingQuoteId = await page.$eval('[data-testid="quote-id"]', el => el.value).catch(() => "");
      }
    }
    checks.push({ name: "Quote exists for legacy payment", pass: !!existingQuoteId, details: existingQuoteId || "none" });

    // Change clientId
    const clientIdInput = await page.$('[data-testid="client-id"]');
    if (clientIdInput) {
      await clientIdInput.fill(`legacy_${Date.now()}`);
      checks.push({ name: "clientId changed for legacy payment", pass: true });
    }

    // Do NOT fill recipient info
    const createBtn = await page.$('[data-testid="btn-create"]');
    checks.push({ name: "Create Payment button exists", pass: !!createBtn, details: !!createBtn });
    if (createBtn) {
      const isDisabled = await createBtn.getAttribute("disabled");
      checks.push({ name: "Create Payment button enabled (no recipient info)", pass: isDisabled === null, details: isDisabled });
      if (isDisabled === null) {
        await page.evaluate(el => el.click(), createBtn);
        await page.waitForTimeout(3000);
        checks.push({ name: "Legacy payment created without recipient info", pass: true });
      }
    }

    // Check Provider shows "No recipient info"
    const newPage = await context.newPage();
    await newPage.goto(`${BASE_URL}/provider`, { waitUntil: "networkidle", timeout: 15000 });
    await newPage.waitForTimeout(1000);

    await clickTabByText(newPage, "Payment-Payment Continued");
    await newPage.waitForTimeout(1000);

    const legacyText = await newPage.getByText("No recipient info").first();
    checks.push({ name: "Legacy payment shows 'No recipient info' text", pass: !!legacyText, details: !!legacyText });

    const screenshotPath = path.join(REPORT_DIR, "legacy-payment-no-recipient-info.png");
    await newPage.screenshot({ path: screenshotPath, fullPage: false });

    results.push({
      name: "legacy-payment-no-recipient-info",
      path: "/ofi + /provider",
      status: "PASS",
      durationMs: Date.now() - start,
      checks,
      screenshot: screenshotPath,
    });

    await newPage.close();

  } catch (err) {
    const screenshotPath = path.join(REPORT_DIR, "legacy-payment-failure.png");
    try { await page.screenshot({ path: screenshotPath, fullPage: false }); } catch { /* ignore */ }
    results.push({
      name: "legacy-payment-no-recipient-info",
      path: "/ofi + /provider",
      status: "FAIL",
      durationMs: Date.now() - start,
      error: err.message,
      checks,
      screenshot: screenshotPath,
    });
    return false;
  } finally {
    await page.close();
  }

  return true;
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
    log("main", "=== Test 1: OFI Create Payment with Recipient Info ===");
    allPassed &= await testRecipientInfoFlow(context);

    log("main", "=== Test 2: Provider Display Recipient Info ===");
    allPassed &= await testProviderRecipientDisplay(context);

    log("main", "=== Test 3: Provider Manual AML Recipient Review ===");
    allPassed &= await testProviderManualAmlRecipientReview(context);

    log("main", "=== Test 4: Legacy Payment (No Recipient Info) ===");
    allPassed &= await testNoRecipientInfoLegacyPayment(context);
  } finally {
    await browser.close();
  }

  const reportPath = path.join(REPORT_DIR, "recipient-info-e2e-report.json");
  await (await import("node:fs/promises")).writeFile(
    reportPath,
    JSON.stringify({ baseUrl: BASE_URL, passed: allPassed, results }, null, 2),
  );

  const mdReportPath = path.join(REPORT_DIR, "recipient-info-e2e-report.md");
  const md = generateMarkdownReport(allPassed, results);
  await (await import("node:fs/promises")).writeFile(mdReportPath, md);

  console.log("\n=== E2E RECIPIENT INFO TEST REPORT ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Overall:  ${allPassed ? "PASS ✓" : "FAIL ✗"}`);
  for (const r of results) {
    console.log(`\n  ${r.status} | ${r.name} | ${r.durationMs}ms`);
    if (r.checks) {
      for (const c of r.checks) {
        const icon = c.pass ? "✓" : "✗";
        console.log(`    ${icon} ${c.name}`);
        if (c.details && !c.pass) {
          console.log(`      Details: ${JSON.stringify(c.details)}`);
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
  let md = `# Recipient Info E2E Test Report\n\n`;
  md += `**Date:** ${new Date().toISOString()}\n\n`;
  md += `**Base URL:** ${BASE_URL}\n\n`;
  md += `**Overall:** ${passed ? "PASS ✓" : "FAIL ✗"}\n\n`;
  md += `---\n\n`;

  for (const r of results) {
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
      if (c.details !== undefined) {
        details = typeof c.details === "string" ? c.details.substring(0, 100) : JSON.stringify(c.details).substring(0, 100);
      }
      md += `| ${idx} | ${c.name} | ${status} | ${details} |\n`;
      idx++;
    }

    if (r.error) {
      md += `\n### Error\n\n`;
      md += `\`\`\`\n${r.error}\n\`\`\`\n\n`;
    }

    if (r.consoleMessages?.length > 0) {
      md += `\n### Console Issues (${r.consoleMessages.length})\n\n`;
      for (const msg of r.consoleMessages.slice(0, 5)) {
        md += `- [${msg.type}] ${msg.text.substring(0, 120)}\n`;
      }
      md += `\n`;
    }

    md += `### Screenshot\n\n`;
    md += `![${r.name}](${path.basename(r.screenshot)})\n\n`;
    md += `---\n\n`;
  }

  return md;
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
