const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8080/provider", { waitUntil: "networkidle" });
  
  const comboboxes = await page.locator('button[role="combobox"]').all();
  console.log("Found", comboboxes.length, "combobox buttons");
  
  for (let i = 0; i < comboboxes.length; i++) {
    const text = await comboboxes[i].textContent();
    console.log("Combobox", i, ":", JSON.stringify(text?.trim()));
  }
  
  const labels = await page.locator("label").all();
  console.log("Found", labels.length, "labels");
  for (let i = 0; i < Math.min(labels.length, 10); i++) {
    const text = await labels[i].textContent();
    console.log("Label", i, ":", JSON.stringify(text?.trim()));
  }
  
  // Find Currency label and its sibling button
  const currencyLabel = await page.locator("label", { hasText: "Currency" }).first();
  if (await currencyLabel.count() > 0) {
    console.log("Found Currency label");
    const parent = await currencyLabel.locator("..").first();
    const btn = await parent.locator('button[role="combobox"]').first();
    console.log("Button found:", await btn.count() > 0);
    if (await btn.count() > 0) {
      console.log("Button text:", JSON.stringify(await btn.textContent()));
    }
  } else {
    console.log("Currency label NOT found");
  }
  
  await browser.close();
})();
