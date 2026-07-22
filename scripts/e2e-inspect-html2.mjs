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

// Find the country section - look for "country" label
const countryLabel = await page.$("text=country");
console.log("Country label found:", !!countryLabel);
if (countryLabel) {
  const parent = await countryLabel.evaluateHandle(el => el.closest("div"));
  if (parent) {
    const html = await parent.evaluate(el => el.outerHTML);
    console.log("Country label parent HTML:", html.substring(0, 500));
  }
}

// Look for any Select components
const selectTriggers = await page.$$("button[class*='SelectTrigger'], [class*='select-trigger']");
console.log("\nSelect triggers with classes:", selectTriggers.length);

// Look for all buttons in the form area
const allBtns = await page.$$("button");
console.log("\nAll buttons:");
for (const b of allBtns) {
  const cls = await b.getAttribute("class");
  const dt = await b.getAttribute("data-testid");
  const text = await b.textContent();
  console.log(`  class=${cls?.substring(0, 50)}, dt=${dt}, text=${text?.substring(0, 30)}`);
}

// Look for Radix select content
const selectContents = await page.$$("[data-radix-content]");
console.log("\nRadix content elements:", selectContents.length);

// Look for the Select component - it uses radix
const radixSelect = await page.$("[data-radix-select-trigger]");
console.log("\nRadix select trigger:", !!radixSelect);

await browser.close();
