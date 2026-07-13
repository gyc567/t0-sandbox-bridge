const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const allConsole = [];
  page.on("console", (msg) => allConsole.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => allConsole.push({ type: "pageerror", text: err.message }));

  await page.goto("http://127.0.0.1:8080/provider", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  console.log("All console messages:");
  for (const msg of allConsole) {
    console.log(`[${msg.type}] ${msg.text.substring(0, 200)}`);
  }

  await browser.close();
})();
