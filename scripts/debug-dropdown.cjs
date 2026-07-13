const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8080/provider", { waitUntil: "networkidle" });

  // Find and click currency dropdown
  const currencyLabel = page.locator("label", { hasText: "Currency" }).first();
  const currencyTrigger = currencyLabel
    .locator("xpath=..")
    .first()
    .locator('button[role="combobox"]')
    .first();

  console.log("Before click - count:", await currencyTrigger.count());
  await currencyTrigger.click();
  await page.waitForTimeout(500);

  // Check for listbox
  const listbox = await page.$('[role="listbox"]');
  console.log("listbox found:", !!listbox);

  // Check for radix popper
  const popper = await page.$("[data-radix-popper-content-wrapper]");
  console.log("popper found:", !!popper);

  // Check aria-expanded
  const expanded = await currencyTrigger.getAttribute("aria-expanded");
  console.log("aria-expanded:", expanded);

  // Try pressing Space to open
  await currencyTrigger.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);

  const listbox2 = await page.$('[role="listbox"]');
  console.log("listbox after Space:", !!listbox2);

  await browser.close();
})();
