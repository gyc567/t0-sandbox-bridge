import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("http://127.0.0.1:8080/ofi", { waitUntil: "networkidle", timeout: 15000 });

// Click Payment-Payment Continued tab
const tabs = await page.$$("button");
for (const b of tabs) {
  const t = await b.textContent();
  if (t && t.includes("Payment Continued")) {
    await b.click();
    break;
  }
}
await page.waitForTimeout(1000);

// Find all comboboxes
const comboboxes = await page.$$('role=combobox');
console.log("Combobox count:", comboboxes.length);
for (const cb of comboboxes) {
  const name = await cb.getAttribute("name");
  const ariaLabel = await cb.getAttribute("aria-label");
  const placeholder = await cb.getAttribute("placeholder");
  console.log(`  name=${name}, aria-label=${ariaLabel}, placeholder=${placeholder}`);
}

// Try to find the country select trigger by data-testid or other means
const selectTriggers = await page.$$("[data-testid*='recipient-country']");
console.log("\nrecipient-country testid elements:", selectTriggers.length);

// Try to find the currency select
const currencyTrigger = await page.$('[data-testid="currency-trigger"]');
console.log("\ncurrency-trigger:", !!currencyTrigger);
if (currencyTrigger) {
  const ariaLabel = await currencyTrigger.getAttribute("aria-label");
  console.log("  aria-label:", ariaLabel);
  // Click it
  await currencyTrigger.click();
  await page.waitForTimeout(500);
  const items = await page.$$('[data-radix-collection-item]');
  console.log("  Items after click:", items.length);
  for (const item of items.slice(0, 5)) {
    console.log("   -", await item.textContent());
  }
}

await browser.close();
