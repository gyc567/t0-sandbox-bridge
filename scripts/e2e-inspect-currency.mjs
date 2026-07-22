import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("http://127.0.0.1:8080/ofi", { waitUntil: "networkidle", timeout: 15000 });

// Check currency trigger text
const currencyTrigger = await page.$('[data-testid="currency-trigger"]');
if (currencyTrigger) {
  console.log("currency-trigger found:", await currencyTrigger.textContent());
}

// Try text search for EUR (since it starts with EUR ·)
const eurText = await page.locator("text=EUR · Euro").first();
console.log("EUR · Euro text found:", await eurText.count());

// Try locator with role=combobox
const allCb = await page.locator("role=combobox").all();
console.log("All comboboxes:", allCb.length);
for (const cb of allCb) {
  console.log("  text:", await cb.textContent());
}

// Try EUR button
const eurBtn = await page.$("text=EUR");
console.log("EUR button:", !!eurBtn);

await browser.close();
