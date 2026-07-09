// scripts/test-ofi-getquote-live.mjs — Live end-to-end OFI getQuote against
// api.agtpay.xyz with the real PROVIDER_API_KEYS key. Mirrors the runtime
// behavior of HttpOfiT0Client + toGetQuoteResult + SandboxNetwork.getQuote
// in production.
//
// Run:   node scripts/test-ofi-getquote-live.mjs

const BASE_URL = "https://api.agtpay.xyz";
const API_KEY = "419fd08e039e5e1e5b11d29f57ad0d7b299ce0094d457ff582441d5dee53e4f4";
const TIMEOUT_MS = 20000;

// ── Mirror of decimalToNumber / parseRfc3339 / parseRfc3339 → Number(ms)
// from src/lib/t0/quote-mapper.ts (kept identical to avoid drift)
//
// Connect-RPC omits default-valued fields from the wire format, so a Decimal
// with exponent=0 may arrive as { unscaled: 500 } (no exponent key). Treat
// missing exponent as 0 to be lenient with the live server.
function decimalToNumber(d) {
  const unscaled = d.unscaled;
  const exponent = d.exponent ?? 0;
  if (!Number.isFinite(unscaled) || !Number.isFinite(exponent)) {
    throw new Error("invalid Decimal");
  }
  return unscaled * Math.pow(10, exponent);
}

function numberToDecimal(n) {
  if (!Number.isFinite(n)) throw new Error("invalid number");
  const s = String(Math.round(n * 1e10) / 1e10);
  const [intPart, fracPart = ""] = s.split(".");
  const exponent = fracPart.length === 0 ? 0 : -fracPart.length;
  const unscaled = parseInt(intPart + fracPart, 10);
  return { unscaled, exponent };
}

function parseRfc3339(s) {
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new Error("invalid RFC3339 timestamp");
  return ms;
}

// ── Mirror of HttpOfiT0Client + SandboxNetwork.getQuote delegation.
async function getQuoteLive(req) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/v1/quotes/network`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        amount: numberToDecimal(req.usdAmount),
        amountType: "settlement",
        payOutCurrency: req.currency,
        payOutMethod: req.paymentMethod,
      }),
      signal: controller.signal,
    });
    if (res.status === 401) return { failure: { reason: "UNAUTHORIZED" } };
    if (res.status >= 400 && res.status < 500) {
      return { failure: { reason: "BAD_REQUEST", message: await res.text() } };
    }
    if (res.status >= 500) return { failure: { reason: "UPSTREAM" } };
    if (!res.ok) return { failure: { reason: "UPSTREAM" } };

    const json = await res.json();
    return parseConnectRpcResponse(json, req);
  } catch (e) {
    return { failure: { reason: "UPSTREAM", message: String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

function parseConnectRpcResponse(json, req) {
  // Connect-RPC wire format: { Result: { Success: {...} } } or { Result: { Failure: { reason } } }
  const env = json;
  const result = env.Result ?? env.result;
  const failure = result?.Failure ?? result?.failure;
  if (failure) {
    const reason = failure.reason;
    if (reason === "REASON_QUOTE_NOT_FOUND" || reason === 1 || reason === 10) {
      return { failure: { reason: "NO_QUOTE" } };
    }
    return {
      failure: {
        reason: "UPSTREAM",
        message: typeof reason === "string" ? reason : `unknown reason code: ${reason}`,
      },
    };
  }
  const success = result?.Success ?? result?.success;
  if (!success) return { failure: { reason: "UPSTREAM" } };

  const rate = success.rate;
  const expiration = parseExpiration(success.expiration);
  const quoteIdRaw = success.quoteId ?? success.quote_id;
  const payOutAmount = success.payOutAmount ?? success.pay_out_amount;
  const settlementAmount = success.settlementAmount ?? success.settlement_amount;

  if (!rate || !quoteIdRaw || !payOutAmount || !settlementAmount) {
    return { failure: { reason: "UPSTREAM", message: "missing fields in success payload" } };
  }

  const providerId =
    typeof quoteIdRaw.providerId === "number"
      ? quoteIdRaw.providerId
      : quoteIdRaw.provider_id;
  const quoteId =
    typeof quoteIdRaw.quoteId === "number" ? quoteIdRaw.quoteId : quoteIdRaw.quote_id;
  if (typeof providerId !== "number" || typeof quoteId !== "number") {
    return { failure: { reason: "UPSTREAM", message: "invalid quoteId object" } };
  }

  return {
    success: {
      quoteId: `${providerId}-${quoteId}`,
      currency: req.currency,
      band: req.usdAmount,
      rate: decimalToNumber(rate),
      expiresAt: parseRfc3339(expiration),
      payOutAmount: decimalToNumber(payOutAmount),
      settlementAmount: decimalToNumber(settlementAmount),
      createdAt: Date.now(),
    },
  };
}

function parseExpiration(exp) {
  if (typeof exp === "string") return exp;
  if (exp && typeof exp === "object") {
    const t = exp;
    const sec = typeof t.seconds === "string" ? Number(t.seconds) : t.seconds;
    if (typeof sec === "number" && Number.isFinite(sec)) {
      const ms = sec * 1000 + Math.floor((t.nanos ?? 0) / 1_000_000);
      if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
    }
  }
  return "1970-01-01T00:00:00Z";
}

const results = [];

function pass(name, detail = {}) {
  results.push({ name, status: "PASS", ...detail });
  console.log(`[pass] ${name} ${JSON.stringify(detail)}`);
}

function fail(name, error, detail = {}) {
  results.push({ name, status: "FAIL", error, ...detail });
  console.log(`[fail] ${name}: ${error} ${JSON.stringify(detail)}`);
}

async function main() {
  console.log(`Target: ${BASE_URL}`);
  console.log(`Key (last 8): ...${API_KEY.slice(-8)}`);

  // ── 1. GBP SWIFT — known working (verified in earlier test) ─────
  console.log("\n[1] GBP SWIFT — known working pair");
  const r1 = await getQuoteLive({
    usdAmount: 500,
    currency: "GBP",
    paymentMethod: "PAYMENT_METHOD_TYPE_SWIFT",
  });
  if ("success" in r1) {
    const s = r1.success;
    const validShape =
      typeof s.quoteId === "string" &&
      s.quoteId.includes("-") &&
      typeof s.rate === "number" &&
      s.rate > 0 &&
      typeof s.payOutAmount === "number" &&
      typeof s.settlementAmount === "number" &&
      s.settlementAmount === 500 &&
      s.expiresAt > Date.now();
    if (validShape) {
      pass("01-gbp-swift-success", {
        quoteId: s.quoteId,
        rate: s.rate,
        payOutAmount: s.payOutAmount,
        settlementAmount: s.settlementAmount,
        ttlMs: s.expiresAt - Date.now(),
      });
    } else {
      fail("01-gbp-swift-success", "shape invalid", s);
    }
  } else {
    fail("01-gbp-swift-success", `unexpected failure`, r1);
  }

  // ── 2. GBP SWIFT again — same provider, different quote id ──────
  console.log("\n[2] GBP SWIFT — fresh quote (different id)");
  const r2 = await getQuoteLive({
    usdAmount: 500,
    currency: "GBP",
    paymentMethod: "PAYMENT_METHOD_TYPE_SWIFT",
  });
  if ("success" in r1 && "success" in r2) {
    if (r1.success.quoteId !== r2.success.quoteId) {
      pass("02-gbp-swift-fresh-quote-id", {
        firstId: r1.success.quoteId,
        secondId: r2.success.quoteId,
      });
    } else {
      fail("02-gbp-swift-fresh-quote-id", "expected different quoteId", {
        first: r1.success.quoteId,
        second: r2.success.quoteId,
      });
    }
  }

  // ── 3. EUR SEPA — known to return reason=10 (NO_QUOTE) ────────
  console.log("\n[3] EUR SEPA — known NO_QUOTE result (reason=10)");
  const r3 = await getQuoteLive({
    usdAmount: 1000,
    currency: "EUR",
    paymentMethod: "PAYMENT_METHOD_TYPE_SEPA",
  });
  if ("failure" in r3 && r3.failure.reason === "NO_QUOTE") {
    pass("03-eur-sepa-no-quote", { reason: r3.failure.reason });
  } else {
    fail("03-eur-sepa-no-quote", `expected NO_QUOTE failure`, r3);
  }

  // ── 4. Unsupported payment method — likely UPSTREAM/NO_QUOTE ──
  console.log("\n[4] GBP UNKNOWN_METHOD — likely NO_QUOTE");
  const r4 = await getQuoteLive({
    usdAmount: 100,
    currency: "GBP",
    paymentMethod: "PAYMENT_METHOD_TYPE_UNKNOWN",
  });
  if ("failure" in r4) {
    pass("04-gbp-unknown-method-handled", { failure: r4.failure });
  } else {
    fail("04-gbp-unknown-method-handled", "expected failure", r4);
  }

  // ── 5. Larger amount (1000 USD) on working corridor ────────────
  console.log("\n[5] GBP SWIFT 1000 USD — larger amount");
  const r5 = await getQuoteLive({
    usdAmount: 1000,
    currency: "GBP",
    paymentMethod: "PAYMENT_METHOD_TYPE_SWIFT",
  });
  if ("success" in r5) {
    const s = r5.success;
    if (s.settlementAmount === 1000 && s.payOutAmount > 0) {
      pass("05-gbp-swift-large", {
        rate: s.rate,
        payOutAmount: s.payOutAmount,
      });
    } else {
      fail("05-gbp-swift-large", "wrong amounts", s);
    }
  } else {
    fail("05-gbp-swift-large", `unexpected`, r5);
  }

  // ── Report ─────────────────────────────────────────────────────
  const passed = results.every((r) => r.status === "PASS");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const fileURLToPath = (await import("node:url")).fileURLToPath;
  const REPORT_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "e2e-reports",
  );
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const ts = new Date().toISOString();
  const report = {
    timestamp: ts,
    baseUrl: BASE_URL,
    apiKeyLast8: API_KEY.slice(-8),
    purpose: "live OFI getQuote end-to-end via the post-fix HttpOfiT0Client wire-format parser",
    passed,
    results,
  };
  await fs.writeFile(
    path.join(REPORT_DIR, "ofi-getquote-live-report.json"),
    JSON.stringify(report, null, 2),
  );

  let md = `# Live OFI Get Quote Report (post wire-format fix)\n\n`;
  md += `**Timestamp**: ${ts}\n`;
  md += `**Base URL**: ${BASE_URL}\n`;
  md += `**API Key** (...${API_KEY.slice(-8)}): Bearer token\n`;
  md += `**Overall**: ${passed ? "✅ PASS" : "❌ FAIL"}\n\n`;
  md += `## Live call results (HttpOfiT0Client wire-format parser)\n\n`;
  md += `| # | Status | Step |\n|---|---|---|\n`;
  for (const [i, r] of results.entries()) {
    const tag = r.status === "PASS" ? "✅" : "❌";
    md += `| ${i + 1} | ${tag} | \`${r.name}\` |\n`;
  }
  md += `\n## Detail\n\n`;
  for (const r of results) {
    md += `### ${r.name}\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\`\n\n`;
  }
  await fs.writeFile(path.join(REPORT_DIR, "ofi-getquote-live-report.md"), md);

  console.log("\n=========== LIVE OFI GETQUOTE REPORT ===========");
  console.log(`Overall: ${passed ? "✅ PASS" : "❌ FAIL"}`);
  for (const r of results) {
    const tag = r.status === "PASS" ? "✅" : "❌";
    console.log(`  ${tag} ${r.name.padEnd(38)} ${r.error ?? ""}`);
  }
  console.log(`\nReport: ${path.join(REPORT_DIR, "ofi-getquote-live-report.json")}`);
  console.log(`Markdown: ${path.join(REPORT_DIR, "ofi-getquote-live-report.md")}`);

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});