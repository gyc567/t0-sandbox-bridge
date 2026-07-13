// scripts/repro-login-trace.mjs — Trace every byte of the login flow
import { chromium } from "playwright";

const URL = "http://localhost:8080/login?redirect=%2Fprovider";

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
  args: ["--disable-features=IsolateOrigins,site-per-process"],
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const allRequests = [];
const allResponses = [];
const allErrors = [];

page.on("request", (r) => {
  allRequests.push({ phase: "REQ", method: r.method(), url: r.url(), headers: r.headers() });
});
page.on("response", (r) => {
  allResponses.push({
    phase: "RES",
    status: r.status(),
    url: r.url(),
    headers: r.headers(),
  });
});
page.on("requestfailed", (r) => {
  allErrors.push({ url: r.url(), err: r.failure()?.errorText });
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warn") {
    console.log(`[CONSOLE ${m.type()}]`, m.text());
  }
});

console.log("=== Loading ===");
await page.goto(URL, { waitUntil: "commit", timeout: 15000 });
await page.waitForSelector('input[name="email"]', { timeout: 5000 });
await page.waitForTimeout(2000);

console.log("\n=== Filling ===");
await page.locator('input[name="email"]').fill("provider@baxs.demo");
await page.locator('input[name="password"]').fill("demo-provider-2026");

console.log("\n=== Submit via form.submit() ===");
// Bypass React entirely
await page.evaluate(() => {
  const f = document.querySelector("form");
  if (f) f.submit();
});

await page.waitForTimeout(5000);

console.log("\nLast 10 requests:");
for (const r of allRequests.slice(-10)) {
  console.log(`${r.phase} ${r.method} ${r.url}`);
}

console.log("\nLast 10 responses:");
for (const r of allResponses.slice(-10)) {
  console.log(`${r.phase} ${r.status} ${r.url} location=${r.headers["location"] || ""}`);
}

console.log("\nErrors:");
for (const e of allErrors) {
  console.log(JSON.stringify(e));
}

console.log("\nURL now:", page.url());
try {
  const title = await page.title();
  console.log("title:", title);
} catch (e) {}

await browser.close();
