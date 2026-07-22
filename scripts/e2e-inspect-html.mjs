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

// Get the full HTML structure around the recipient fields
const html = await page.content();

// Find relevant section
const idx = html.indexOf("recipient-account-holder-name");
if (idx > 0) {
  console.log("HTML around recipient fields:");
  console.log(html.substring(Math.max(0, idx - 500), idx + 1000));
}

await browser.close();
