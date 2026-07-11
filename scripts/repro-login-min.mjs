// scripts/repro-login-min.mjs — minimal repro: bypass React entirely
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined,
});
const ctx = await browser.newContext();
const page = await ctx.newPage();

const responses = [];
page.on("response", (r) => {
  if (r.url().includes("localhost:8080")) {
    responses.push({ status: r.status(), url: r.url(), location: r.headers()["location"] });
  }
});

// Navigate first to set Origin properly
await page.goto("http://localhost:8080/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

// Method 1: Native fetch with redirect: 'follow' (browser default for form POST)
console.log("\n=== Method 1: fetch POST ===");
const r1 = await page.evaluate(async () => {
  const body = new URLSearchParams({ email: "provider@baxs.demo", password: "demo-provider-2026", redirect: "/provider" }).toString();
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual",
    });
    return { status: res.status, location: res.headers.get("location"), body: await res.text() };
  } catch (e) {
    return { error: e.message };
  }
});
console.log(JSON.stringify(r1, null, 2));

await page.waitForTimeout(2000);
console.log("\n--- responses captured ---");
for (const r of responses.slice(-5)) console.log(JSON.stringify(r));

await browser.close();