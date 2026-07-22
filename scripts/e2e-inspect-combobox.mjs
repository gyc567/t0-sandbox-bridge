import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("http://127.0.0.1:8080/ofi", { waitUntil: "networkidle", timeout: 15000 });

const tabs = await page.$$("button");
for (const b of tabs) {
  const t = await b.textContent();
  if (t && t.includes("Payment Continued")) {
    await b.click();
    break;
  }
}
await page.waitForTimeout(1000);

// Find combobox with label "country"
const countryCombobox = await page.locator("role=combobox", { hasText: "country" }).first();
console.log("country combobox found:", await countryCombobox.count());

const currencyCombobox = await page.locator("role=combobox", { hasText: "Currency" }).first();
console.log("currency combobox found:", await currencyCombobox.count());

// Try label-based locator
const labelCountry = await page.getByLabel(/country/i).first();
console.log("getByLabel(country) found:", await labelCountry.count());

// Try locator with text
const selectByText = await page.locator("button", { hasText: "country" }).first();
console.log("button with 'country' text found:", await selectByText.count());

// Try using the label text
const labelTextCountry = await page.locator("label", { hasText: /^country$/i }).first();
if (labelTextCountry) {
  const id = await labelTextCountry.getAttribute("for");
  console.log("country label for:", id);
  if (id) {
    const input = await page.$(`#${id}`);
    console.log("input#", id, "found:", !!input);
  }
}

// Try clicking via text content of the selecttrigger
const countryTrigger = await page.locator("button", { hasText: /^country$/ }).first();
console.log("button with exact 'country' text:", await countryTrigger.count());

// Try getting the SelectValue
const selectValue = await page.locator("text=Select country").first();
console.log("'Select country' text found:", await selectValue.count());

// Find all buttons with role=combobox
const allComboboxes = await page.locator("role=combobox").all();
console.log("\nAll comboboxes:", allComboboxes.length);
for (const cb of allComboboxes) {
  const html = await cb.evaluate(el => el.outerHTML.substring(0, 200));
  console.log(" -", html);
}

await browser.close();
