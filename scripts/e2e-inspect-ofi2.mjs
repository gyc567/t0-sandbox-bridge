import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("http://127.0.0.1:8080/ofi", { waitUntil: "networkidle", timeout: 15000 });

// Click Payment-Payment Continued tab
const tabs = await page.$$("button");
for (const b of tabs) {
  const t = await b.textContent();
  if (t && t.includes("Payment Continued")) {
    console.log("Clicking:", t);
    await b.click();
    break;
  }
}
await page.waitForTimeout(1000);

const els = await page.$$('[data-testid]');
console.log("=== data-testid after tab click ===");
for (const el of els) {
  console.log(await el.getAttribute("data-testid"));
}

const inputs = await page.$$("input");
console.log("\n=== input count after tab click ===", inputs.length);
for (const inp of inputs) {
  const dt = await inp.getAttribute("data-testid");
  const ph = await inp.getAttribute("placeholder");
  console.log(`  testid=${dt}, placeholder=${ph}`);
}

// Check for SelectTrigger (Radix Select)
const triggers = await page.$$('[data-radix-collection-item]');
console.log("\n=== Radix select items ===", triggers.length);

// Try to click currency trigger
const currencyTrigger = await page.$('[data-testid="currency-trigger"]');
console.log("\n=== currency-trigger found:", !!currencyTrigger);
if (currencyTrigger) {
  await currencyTrigger.click();
  await page.waitForTimeout(500);
  const items = await page.$$('[data-radix-collection-item]');
  console.log("Items after click:", items.length);
  for (const item of items.slice(0, 5)) {
    console.log(" -", await item.textContent());
  }
}

// Check for the recipient info fields
const recipientCountry = await page.$('[data-testid="recipient-country"]');
console.log("\n=== recipient-country found:", !!recipientCountry);

await browser.close();
