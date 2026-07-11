// scripts/test-e2e-open-access.mjs — End-to-end verification that /ofi and
// /provider render without authentication (audit 2026-07-10).
//
// Pre-refactor, /ofi and /provider redirected (307) to /login. This script
// locks the open-access posture by:
//
//   1. Probing each route directly with no cookie.
//   2. Asserting the response body contains the role-specific content.
//   3. Confirming /login still renders and accepts any input (now a picker).

const BASE = process.env.BASE_URL || "http://localhost:8080";

const results = [];
function pass(name, detail = {}) {
  results.push({ name, status: "PASS", ...detail });
  console.log(`  ✓ ${name}`);
}
function fail(name, err) {
  results.push({ name, status: "FAIL", error: String(err) });
  console.log(`  ✗ ${name}: ${err}`);
  process.exitCode = 1;
}

async function probe(path, expect) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  if (res.status !== 200) {
    fail(path, `expected 200, got ${res.status}`);
    return null;
  }
  const html = await res.text();
  if (expect && !html.includes(expect)) {
    fail(path, `body missing "${expect}"`);
    return null;
  }
  pass(path, { status: res.status });
  return html;
}

const loginHtml = await probe("/login", "Pick your console");
if (loginHtml?.includes("Choose role")) pass("/login has Choose role header");
else fail("/login has Choose role header", "missing");

const ofiHtml = await probe("/ofi", "OFI Console");
if (ofiHtml?.includes("OFI role · open-access sandbox")) pass("/ofi footer open-access");
else fail("/ofi footer open-access", "missing");

const provHtml = await probe("/provider", "Provider");
if (provHtml?.includes("Provider role · open-access sandbox")) pass("/provider footer open-access");
else fail("/provider footer open-access", "missing");

// Legacy /api/login POST should now be a friendly 303 → /login, not 404.
const legacyPost = await fetch(`${BASE}/api/login`, {
  method: "POST",
  redirect: "manual",
});
if (legacyPost.status === 303 && legacyPost.headers.get("location") === "/login") {
  pass("/api/login POST → /login", { status: 303 });
} else {
  fail("/api/login POST → /login", `got ${legacyPost.status} location=${legacyPost.headers.get("location")}`);
}

// Legacy /api/login GET should be 200 with notice.
const legacyGet = await fetch(`${BASE}/api/login`);
if (legacyGet.status === 200) pass("/api/login GET → 200", { status: 200 });
else fail("/api/login GET → 200", `got ${legacyGet.status}`);

// /login?redirect=%2Fprovider — confirm safeRedirect logic in the picker.
const redirectHtml = await probe("/login?redirect=%2Fprovider", "/provider");
if (redirectHtml) {
  if (redirectHtml.includes("After picking a role you will land on")) {
    pass("/login?redirect shows hint");
  } else {
    fail("/login?redirect shows hint", "missing");
  }
}

// /login?redirect=//evil — open-redirect protection.
const evilHtml = await probe("/login?redirect=//evil.example.com/x", "Pick your console");
if (evilHtml && !evilHtml.includes("After picking a role you will land on")) {
  pass("/login rejects //evil redirect");
} else {
  fail("/login rejects //evil redirect", "hint was shown for unsafe redirect");
}

console.log("\n", results.length, "checks");
const failed = results.filter((r) => r.status === "FAIL").length;
console.log("Failed:", failed);
if (failed > 0) process.exit(1);