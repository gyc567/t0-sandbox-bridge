// scripts/repro-login.mjs — Reproduce the "Provider login doesn't navigate" issue.
import { chromium } from "playwright";

const URL = "http://localhost:8080/login?redirect=%2Fprovider";

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleMsgs = [];
const failed = [];
const allRequests = [];
const allResponses = [];

page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleMsgs.push({ type: "pageerror", text: e.message }));
page.on("requestfailed", (r) => failed.push({ url: r.url(), err: r.failure()?.errorText }));
page.on("request", (r) => {
  if (r.url().includes("localhost:8080")) {
    allRequests.push({ method: r.method(), url: r.url() });
  }
});
page.on("response", (r) => {
  if (r.url().includes("localhost:8080")) {
    allResponses.push({ status: r.status(), url: r.url(), location: r.headers()["location"] });
  }
});

console.log("Navigating to:", URL);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForSelector('input[name="email"]', { timeout: 5000 });
await page.waitForTimeout(3000);

console.log("\n--- Pre-submit requests ---");
for (const r of allRequests) {
  console.log(`${r.method} ${r.url}`);
}

console.log("\n--- Filling form ---");
await page.locator('input[name="email"]').fill("provider@baxs.demo");
await page.locator('input[name="password"]').fill("demo-provider-2026");

const formInfo = await page.evaluate(() => {
  const f = document.querySelector("form");
  if (!f) return null;
  return {
    action: f.getAttribute("action"),
    method: f.getAttribute("method"),
    emailValue: f.querySelector('input[name="email"]')?.value,
    passwordValue: f.querySelector('input[name="password"]')?.value,
    redirectValue: f.querySelector('input[name="redirect"]')?.value,
  };
});
console.log("form info:", JSON.stringify(formInfo));

console.log("\n--- Submitting ---");
const reqsBefore = allRequests.length;
const respsBefore = allResponses.length;

await page
  .locator('button[type="submit"]')
  .click({ noWaitAfter: true, timeout: 5000 })
  .catch((e) => console.log("click err:", e.message));
await page.waitForTimeout(8000);

console.log("\n--- New requests after click ---");
for (let i = reqsBefore; i < allRequests.length; i++) {
  console.log(JSON.stringify(allRequests[i]));
}

console.log("\n--- New responses after click ---");
for (let i = respsBefore; i < allResponses.length; i++) {
  console.log(JSON.stringify(allResponses[i]));
}

console.log("\n--- Failed requests ---");
for (const f of failed) {
  console.log(JSON.stringify(f));
}

console.log("\n--- Final state ---");
console.log("URL:", page.url());
try {
  const title = await page.title();
  console.log("title:", title);
} catch (e) {
  console.log("title err:", e.message);
}

console.log("\n--- Last 10 console messages ---");
for (const m of consoleMsgs.slice(-10)) {
  console.log(JSON.stringify(m));
}

await page.screenshot({ path: "e2e-reports/login-repro.png", fullPage: true });
console.log("\nScreenshot: e2e-reports/login-repro.png");

await browser.close();
