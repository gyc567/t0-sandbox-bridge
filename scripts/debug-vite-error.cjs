const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8080/provider", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  // Check for Vite error overlay
  const errorCheck = await page.evaluate(() => {
    const viteError = document.querySelector("vite-error-overlay");
    const backdrop = document.querySelector(".backdrop");
    return {
      hasViteOverlay: !!viteError,
      hasBackdrop: !!backdrop,
      viteOverlayText: viteError ? viteError.textContent?.substring(0, 500) : null,
    };
  });
  console.log("Vite error overlay:", errorCheck);

  // Take screenshot to see if there's an error overlay
  await page.screenshot({ path: "e2e-reports/provider-page-state.png", fullPage: true });
  console.log("Screenshot saved");

  await browser.close();
})();
