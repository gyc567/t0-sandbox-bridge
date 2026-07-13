const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8080/provider", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  // The real test: verify the page source contains the correct currencies
  const pageSource = await page.content();

  // Check for the currencies array in the source
  const expectedCurrencies = [
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CHF",
    "CAD",
    "AUD",
    "CNH",
    "CNY",
    "HKD",
    "SGD",
    "KRW",
    "INR",
    "IDR",
    "PHP",
    "THB",
    "MYR",
    "VND",
    "TWD",
    "AED",
    "SAR",
    "ILS",
    "TRY",
    "SEK",
    "NOK",
    "DKK",
    "PLN",
    "CZK",
    "ZAR",
    "EGP",
    "NGN",
    "KES",
    "BRL",
    "MXN",
    "ARS",
    "CLP",
    "COP",
  ];

  let foundCount = 0;
  const missing = [];
  for (const curr of expectedCurrencies) {
    // Look for the currency in SelectItem value attributes
    const found = pageSource.includes(`value="${curr}"`) || pageSource.includes(`>${curr}<`);
    if (found) foundCount++;
    else missing.push(curr);
  }

  console.log("Expected currencies:", expectedCurrencies.length);
  console.log("Found in source:", foundCount);
  console.log("Missing:", missing);

  // Check for bands
  const expectedBands = ["1000", "5000", "10000", "25000", "250000", "1000000"];
  let bandsFound = 0;
  const missingBands = [];
  for (const band of expectedBands) {
    const found = pageSource.includes(`value="${band}"`);
    if (found) bandsFound++;
    else missingBands.push(band);
  }

  console.log("Expected bands:", expectedBands.length);
  console.log("Found in source:", bandsFound);
  console.log("Missing bands:", missingBands);

  // Check that old hardcoded list is NOT present (if it was the old 8-currency list)
  const oldList = ["USD", "EUR", "GBP", "CNH", "MXN", "BRL", "NGN", "INR"];
  const hasOldPattern = oldList.every((c) => pageSource.includes(`value="${c}"`));
  console.log("Has old 8-currency pattern:", hasOldPattern);

  // Check for the new SUPPORTED_CURRENCIES import
  const hasImport = pageSource.includes("SUPPORTED_CURRENCIES");
  console.log("Has SUPPORTED_CURRENCIES in source:", hasImport);

  await browser.close();
})();
