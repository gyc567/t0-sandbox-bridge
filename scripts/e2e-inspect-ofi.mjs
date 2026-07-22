import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("http://127.0.0.1:8080/ofi", { waitUntil: "networkidle", timeout: 15000 });

const els = await page.$$('[data-testid]');
console.log("=== data-testid elements on /ofi ===");
for (const el of els) {
  console.log(await el.getAttribute("data-testid"));
}

// Also look for buttons
const buttons = await page.$$("button");
console.log("\n=== buttons ===");
for (const b of buttons) {
  const t = await b.textContent();
  if (t && t.trim()) console.log(await b.textContent());
}

// Check if currency select works
console.log("\n=== Looking for currency select ===");
const selects = await page.$$("select");
console.log("Select count:", selects.length);

// Check the form structure
const inputs = await page.$$("input");
console.log("\n=== input count ===", inputs.length);

await browser.close();
