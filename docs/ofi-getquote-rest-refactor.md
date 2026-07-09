# OFI GetQuote 走 agtpay REST 端点重构方案

> **状态**: 方案已确认,待实施
> **日期**: 2026-07-09
> **背景**: 当前 `SandboxNetwork.getQuote()` 在 provider 内存快照里"按 usdAmount+currency 过滤 + 选最优 quote",本次重构改为调 agtpay 后端 `POST /api/v1/quotes/network` 获取实时报价。
> **强约束**: OFI 路由 (`src/routes/ofi.tsx`)、`Quote` 类型、`GetQuoteResult` 形状、UI 0 改动。

---

## 0. TL;DR

- 新增 `OfiT0Client` 接口 + `HttpOfiT0Client` / `MockOfiT0Client` 两个实现,通过 `T0_QUOTE_CLIENT_MODE=http|mock` 切换。
- 新增 `quote-mapper.ts` 纯函数层,负责 `Decimal ↔ number`、`RFC3339 ↔ epoch ms`、API raw 响应 ↔ 内部 `GetQuoteResult`、`QuoteFailureReason` 错误码映射。
- `SandboxNetwork.getQuote()` 改 `async`,委派给注入的 `OfiT0Client`,本地只保留输入校验。
- 现有 provider 推送方向 (`HttpT0Client.updateQuote`) **不动**;`createPayment` / `completeManualAml` **不动**。
- `REASON_UPSTREAM_ERROR` / `REASON_UNAUTHORIZED` / `REASON_BAD_REQUEST` 三个新失败原因值,前端 `quote-message.ts` 加 friendly 文案。

---

## 1. 端点合约(已确认)

### 1.1 请求

```
POST https://api.agtpay.xyz/api/v1/quotes/network
Authorization: Bearer <T0_OFI_API_KEY>
Content-Type: application/json

{
  "amount":         { "unscaled": number, "exponent": number },
  "amountType":     "pay_out" | "settlement",       // OFI 场景恒为 "settlement"
  "payOutCurrency": string,                          // ISO 4217, e.g. "EUR"
  "payOutMethod":   string                           // t-0 enum, e.g. "PAYMENT_METHOD_TYPE_SEPA"
}
```

### 1.2 响应

**成功 (HTTP 200):**
```json
{
  "result": {
    "success": {
      "rate":             { "unscaled": 86, "exponent": -2 },
      "expiration":       "2026-07-09T12:00:00Z",
      "quoteId":          { "quoteId": 67890, "providerId": 1 },
      "payOutAmount":     { "unscaled": 860, "exponent": 0 },
      "settlementAmount": { "unscaled": 1000, "exponent": 0 }
    }
  },
  "allQuotes": []
}
```

**业务失败 (HTTP 200):**
```json
{ "result": { "failure": { "reason": "REASON_QUOTE_NOT_FOUND" } } }
```

**本地错误 (HTTP 4xx/5xx):**
```json
{ "error": "human readable message" }
```

可观察到的状态码:401 (auth)、400 (bad JSON/validation)、500 (db/publish)、502 (t-0 network failure)。

---

## 2. 错误码映射

| API / 场景 | 内部 `QuoteFailureReason` | 备注 |
|---|---|---|
| `usdAmount <= 0`(本地校验) | `REASON_INVALID_AMOUNT` | 保持现有 |
| currency 不在 `SUPPORTED_CURRENCIES`(本地校验) | `REASON_CURRENCY_NOT_SUPPORTED` | 保持现有 |
| `REASON_QUOTE_NOT_FOUND` | `REASON_NO_QUOTE_AVAILABLE` | 现有文案可直接复用 |
| `REASON_UNSPECIFIED` 或未知 reason | `REASON_UPSTREAM_ERROR` | 🆕 新增 |
| HTTP 401 | `REASON_UNAUTHORIZED` | 🆕 新增 |
| HTTP 4xx(除 401) | `REASON_BAD_REQUEST` | 🆕 新增 |
| HTTP 5xx / timeout / 网络错误 | `REASON_UPSTREAM_ERROR` | 复用上一行 |
| `success.expiration` 已过期 | `REASON_QUOTE_EXPIRED` | 现有 |

**结论**:现有 6 个 `QuoteFailureReason` 全部保持,新增 3 个 (`UPSTREAM_ERROR` / `UNAUTHORIZED` / `BAD_REQUEST`)。

---

## 3. 字段映射(API → 内部 `Quote`)

| 内部 `Quote` 字段 | 来源 | 转换 |
|---|---|---|
| `id` | `result.success.quoteId` | `${providerId}-${quoteId}` 拼字符串(保持 `Quote.id: string` 形状) |
| `currency` | request 里的 `payOutCurrency` | API 响应不回 currency,直接传 request 值 |
| `band` | request 里的 `amount` | `decimalToNumber(amount)` |
| `rate` | `result.success.rate` | `decimalToNumber(rate)` |
| `expiresAt` | `result.success.expiration` | `parseRfc3339(expiration)` → epoch ms |
| `createdAt` | `now()`(服务端) | `Date.now()`,不信 API |
| `localAmount` | `result.success.payOutAmount` | `decimalToNumber(pOutAmount)` |
| `usdAmount` | `result.success.settlementAmount` | `decimalToNumber(settlementAmount)` |

`Decimal → number`:`d.unscaled * Math.pow(10, d.exponent)`。
`number → Decimal`:为避免浮点精度问题,先 `Math.round(n * 1e10) / 1e10` 后转字符串再 parse 出 `unscaled` 和 `exponent`。

---

## 4. 文件改动清单

### 4.1 新增(3 个)

| 文件 | 职责 |
|---|---|
| `src/lib/t0/ofi-client.ts` | `OfiT0Client` 接口 + `HttpOfiT0Client` + `MockOfiT0Client` 实现 |
| `src/lib/t0/quote-mapper.ts` | 纯函数: `Decimal ↔ number` / `RFC3339 ↔ epoch ms` / API raw ↔ `GetQuoteResult` / 错误码映射 |
| `src/lib/t0/quote-mapper.test.ts` | 100% 覆盖所有映射分支 + Decimal 边界值 + RFC3339 异常路径 |

### 4.2 修改(5 个)

| 文件 | 改动 |
|---|---|
| `src/lib/t0/network.ts` | `SandboxNetwork` 构造器加 `ofiClient: OfiT0Client` + `paymentMethod: string` 依赖;`getQuote()` 改 `async`,委派 client |
| `src/lib/t0/index.ts` | 实例化时按 `T0_QUOTE_CLIENT_MODE` 注入 `HttpOfiT0Client` 或 `MockOfiT0Client`;从 env 读 `T0_OFI_PAYMENT_METHOD` |
| `src/lib/t0/quote-message.ts` | 新增 3 个失败原因 (`UPSTREAM_ERROR` / `UNAUTHORIZED` / `BAD_REQUEST`) 的 friendly 文案;`formatQuoteFailure()` 兜底(遇到未列出的 reason 不抛错,返回通用文案) |
| `src/lib/t0/t0.functions.ts` | `ofiGetQuoteFn` 加 `await`(1 行改动) |
| `.env.example` + `vite.config.ts` | 新增 4 个 env 变量(见 §5) |

### 4.3 测试改 / 新增(4 个)

| 文件 | 改动 |
|---|---|
| `src/lib/t0/quote-mapper.test.ts` | 新增,100% 覆盖 |
| `src/lib/t0/ofi-client.test.ts` | 新增,两组:`HttpOfiT0Client`(mock fetch) + `MockOfiT0Client`(复用原"选最优"逻辑) |
| `src/lib/t0/network.test.ts` | 现有"getQuote 选最优"用例标记 `describe.skip` + `@deprecated` 注释,保留;新增 `describe('SandboxNetwork.getQuote delegation')` |
| `src/lib/t0/quote-message.test.ts` | 新增 3 个失败原因测试 |

### 4.4 0 改动(强约束)

| 文件 | 不动原因 |
|---|---|
| `src/routes/ofi.tsx` | UI 0 改动约束 |
| `src/lib/t0/quote-display.ts` | 入参 `QuoteSuccessPayload` 形状不变 |
| `src/lib/t0/types.ts`(`Quote` 形状) | 同上 |
| `src/lib/t0/client.ts`(`HttpT0Client` provider 推送方向) | 用户确认不改 publishQuote |
| `src/lib/t0/provider.ts` / `provider-impl.ts` 等 | 范围外 |

---

## 5. 新增环境变量

```bash
# /api/v1/quotes/network 客户端模式
# "http"  → 真实调 agtpay 后端
# "mock"  → 复用 provider 内存快照(开发 / CI 用)
T0_QUOTE_CLIENT_MODE=http

# agtpay 后端地址(与 provider 推送方向的 T0_API_BASE_URL 分开)
T0_OFI_API_BASE_URL=https://api.agtpay.xyz

# Bearer token — 来自 PROVIDER_API_KEYS 中的一个
T0_OFI_API_KEY=<your-key>

# HTTP client timeout(毫秒),默认 5000
T0_OFI_TIMEOUT_MS=5000

# 默认支付方式(OFI UI 不暴露),默认 PAYMENT_METHOD_TYPE_SEPA
T0_OFI_PAYMENT_METHOD=PAYMENT_METHOD_TYPE_SEPA
```

> **为什么不复用 `T0_API_BASE_URL` / `T0_API_KEY`?**
> OFI 拉取和 provider 推送是两个方向的 API 调用,权限粒度可能不同(OFI 拉取只需只读 key,provider 推送需要写权限 key)。按"分清楚"原则拆开,避免后续权限调整时的爆炸半径。

---

## 6. 关键模块完整代码示例

### 6.1 `quote-mapper.ts`

```typescript
// quote-mapper.ts — 纯函数层,负责 agtpay API 响应 ↔ 内部 GetQuoteResult 形状。
// 单一职责:无 React、无 fetch、无 Date.now() 调用(时间由 caller 注入),便于 100% 单测。

import type { Currency, Quote } from "./types";
import type { GetQuoteResult, QuoteFailureReason } from "./network";

// ── Decimal 转换 ──────────────────────────────────────────────

export interface Decimal {
  unscaled: number;
  exponent: number;
}

/** d.unscaled * 10^d.exponent */
export function decimalToNumber(d: Decimal): number {
  if (!Number.isFinite(d.unscaled) || !Number.isFinite(d.exponent)) {
    throw new Error(`invalid Decimal: ${JSON.stringify(d)}`);
  }
  return d.unscaled * Math.pow(10, d.exponent);
}

/** number → Decimal。处理浮点精度: 先 round 到 1e-10,再转 string parse。 */
export function numberToDecimal(n: number): Decimal {
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${n}`);
  // 把 number 规范成字符串(避免科学计数法)
  const s = String(Math.round(n * 1e10) / 1e10);
  const [intPart, fracPart = ""] = s.split(".");
  const exponent = -fracPart.length;
  const unscaled = parseInt(intPart + fracPart, 10);
  return { unscaled, exponent };
}

// ── RFC3339 解析 ──────────────────────────────────────────────

/** "2026-07-09T12:00:00Z" → epoch ms。无效输入抛 Error。 */
export function parseRfc3339(s: string): number {
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new Error(`invalid RFC3339 timestamp: ${s}`);
  return ms;
}

// ── OfiT0Client 内部结果形状 ──────────────────────────────────

export type OfiFailureReason = "NO_QUOTE" | "UPSTREAM" | "UNAUTHORIZED" | "BAD_REQUEST";

export interface OfiQuoteSuccess {
  quoteId: string;            // 已拼好的 "providerId-quoteId"
  currency: string;
  band: number;
  rate: number;
  expiresAt: number;          // epoch ms
  payOutAmount: number;
  settlementAmount: number;
  createdAt: number;
}

export type OfiQuoteResponse =
  | { success: OfiQuoteSuccess }
  | { failure: { reason: OfiFailureReason; message?: string } };

// ── 错误码映射 ────────────────────────────────────────────────

export function toQuoteFailureReason(reason: OfiFailureReason): QuoteFailureReason {
  switch (reason) {
    case "NO_QUOTE":      return "REASON_NO_QUOTE_AVAILABLE";
    case "UPSTREAM":      return "REASON_UPSTREAM_ERROR";
    case "UNAUTHORIZED":  return "REASON_UNAUTHORIZED";
    case "BAD_REQUEST":   return "REASON_BAD_REQUEST";
  }
}

// ── 成功响应 → 内部 Quote ────────────────────────────────────

interface RawSuccess {
  rate: Decimal;
  expiration: string;
  quoteId: { quoteId: number; providerId: number };
  payOutAmount: Decimal;
  settlementAmount: Decimal;
}

interface RawSuccessEnvelope {
  result: { success: RawSuccess };
}

export function toGetQuoteResult(
  res: OfiQuoteResponse,
  now: number,
  fallbackCurrency: Currency,
): GetQuoteResult {
  if ("failure" in res) {
    return { failure: { reason: toQuoteFailureReason(res.failure.reason) } };
  }
  const s = res.success;
  if (s.expiresAt <= now) {
    return { failure: { reason: "REASON_QUOTE_EXPIRED" } };
  }
  const quote: Quote = {
    id: s.quoteId,
    currency: fallbackCurrency,
    band: s.band as VolumeBand,   // ⚠️ API 返回的 band 可能不在 VolumeBand 枚举中
    rate: s.rate,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
  };
  return {
    success: {
      quote,
      payoutAmount: s.payOutAmount,
      settlementAmount: s.settlementAmount,
    },
  };
}

// ── 内部 RawSuccess → OfiQuoteSuccess(给 HttpOfiT0Client 用) ─

export function rawToOfiSuccess(
  raw: RawSuccess,
  fallbackCurrency: Currency,
  now: number,
): OfiQuoteSuccess {
  return {
    quoteId: `${raw.quoteId.providerId}-${raw.quoteId.quoteId}`,
    currency: fallbackCurrency,
    band: decimalToNumber(/* amount from request */ 0 as Decimal), // 实际由 caller 注入
    rate: decimalToNumber(raw.rate),
    expiresAt: parseRfc3339(raw.expiration),
    payOutAmount: decimalToNumber(raw.payOutAmount),
    settlementAmount: decimalToNumber(raw.settlementAmount),
    createdAt: now,
  };
}
```

### 6.2 `ofi-client.ts`

```typescript
// ofi-client.ts — OFI 拉取方向的 HTTP 客户端接口。
// 与 client.ts (HttpT0Client, provider 推送方向) 解耦,职责分离。

import type { Currency } from "./types";
import type { OfiQuoteResponse } from "./quote-mapper";
import { decimalToNumber, parseRfc3339, numberToDecimal } from "./quote-mapper";

// ── 接口 ──────────────────────────────────────────────────────

export interface OfiQuoteRequest {
  usdAmount: number;
  currency: Currency;
  paymentMethod: string;   // 从 env 注入,UI 不传
}

export interface OfiT0Client {
  getQuote(req: OfiQuoteRequest, now: () => number): Promise<OfiQuoteResponse>;
}

// ── HTTP 实现 ─────────────────────────────────────────────────

interface HttpOfiT0ClientOptions {
  baseUrl: string;          // https://api.agtpay.xyz
  apiKey: string;           // Bearer token
  timeoutMs: number;        // 默认 5000
  fetchImpl?: typeof fetch; // 注入用(测试)
}

export class HttpOfiT0Client implements OfiT0Client {
  constructor(private readonly opts: HttpOfiT0ClientOptions) {}

  async getQuote(req: OfiQuoteRequest, now: () => number): Promise<OfiQuoteResponse> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const body = {
        amount: numberToDecimal(req.usdAmount),
        amountType: "settlement" as const,
        payOutCurrency: req.currency,
        payOutMethod: req.paymentMethod,
      };
      const res = await fetchImpl(`${this.opts.baseUrl}/api/v1/quotes/network`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 401) {
        return { failure: { reason: "UNAUTHORIZED" } };
      }
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => "");
        return { failure: { reason: "BAD_REQUEST", message: text } };
      }
      if (res.status >= 500) {
        return { failure: { reason: "UPSTREAM" } };
      }
      if (!res.ok) {
        return { failure: { reason: "UPSTREAM" } };
      }

      const json = await res.json();
      return this.parseResponse(json, req, now());
    } catch (e) {
      // timeout / network error
      return { failure: { reason: "UPSTREAM", message: String(e) } };
    } finally {
      clearTimeout(timer);
    }
  }

  private parseResponse(
    json: unknown,
    req: OfiQuoteRequest,
    now: number,
  ): OfiQuoteResponse {
    const env = json as { result?: { success?: unknown; failure?: { reason?: string } } };
    if (env.result?.failure) {
      const reason = env.result.failure.reason;
      if (reason === "REASON_QUOTE_NOT_FOUND") {
        return { failure: { reason: "NO_QUOTE" } };
      }
      return { failure: { reason: "UPSTREAM", message: reason } };
    }
    if (!env.result?.success) {
      return { failure: { reason: "UPSTREAM" } };
    }
    const s = env.result.success as {
      rate: { unscaled: number; exponent: number };
      expiration: string;
      quoteId: { quoteId: number; providerId: number };
      payOutAmount: { unscaled: number; exponent: number };
      settlementAmount: { unscaled: number; exponent: number };
    };
    return {
      success: {
        quoteId: `${s.quoteId.providerId}-${s.quoteId.quoteId}`,
        currency: req.currency,
        band: req.usdAmount,
        rate: decimalToNumber(s.rate),
        expiresAt: parseRfc3339(s.expiration),
        payOutAmount: decimalToNumber(s.payOutAmount),
        settlementAmount: decimalToNumber(s.settlementAmount),
        createdAt: now,
      },
    };
  }
}

// ── Mock 实现(开发 / CI 用) ─────────────────────────────────

export interface MockOfiT0ClientDeps {
  /** 复用现有 "按 usdAmount+currency 过滤 + 选最优 quote" 逻辑的注入点。 */
  pickBestQuote: (usdAmount: number, currency: Currency) =>
    | { rate: number; expiresAt: number; createdAt: number; quoteId: string }
    | null;
}

export class MockOfiT0Client implements OfiT0Client {
  constructor(private readonly deps: MockOfiT0ClientDeps) {}

  async getQuote(req: OfiQuoteRequest, now: () => number): Promise<OfiQuoteResponse> {
    if (req.usdAmount <= 0) {
      return { failure: { reason: "BAD_REQUEST", message: "usdAmount must be > 0" } };
    }
    const picked = this.deps.pickBestQuote(req.usdAmount, req.currency);
    if (!picked) return { failure: { reason: "NO_QUOTE" } };
    const t = now();
    return {
      success: {
        quoteId: picked.quoteId,
        currency: req.currency,
        band: req.usdAmount,
        rate: picked.rate,
        expiresAt: picked.expiresAt,
        payOutAmount: req.usdAmount * picked.rate,
        settlementAmount: req.usdAmount,
        createdAt: picked.createdAt,
      },
    };
  }
}
```

### 6.3 `network.ts` 新 `getQuote`

```typescript
// 替换原 network.ts:37-62 的 getQuote 实现。

async getQuote(input: {
  usdAmount: number;
  currency: Currency;
  now?: number;
}): Promise<GetQuoteResult> {
  // 1. 本地校验(保持现有行为)
  if (input.usdAmount <= 0) {
    return { failure: { reason: "REASON_INVALID_AMOUNT" } };
  }
  if (!isSupportedCurrency(input.currency)) {
    return { failure: { reason: "REASON_CURRENCY_NOT_SUPPORTED" } };
  }

  // 2. 委派 OfiT0Client
  const res = await this.ofiClient.getQuote(
    {
      usdAmount: input.usdAmount,
      currency: input.currency,
      paymentMethod: this.paymentMethod,
    },
    this.now,
  );

  // 3. 映射回 GetQuoteResult(过期检测在 mapper 里)
  return toGetQuoteResult(res, input.now ?? this.now(), input.currency);
}
```

### 6.4 `t0.functions.ts` 改动(1 行)

```typescript
// 替换原 ofiGetQuoteFn 实现的最后一行。

export const ofiGetQuoteFn = createServerFn({ method: "POST" })
  .validator((d: { usdAmount: number; currency: Currency }) => d)
  .handler(async ({ data }) => await sandboxNetwork.getQuote(data));  // ← 加 await
```

### 6.5 `index.ts` 注入 client

```typescript
// 在 sandboxNetwork 实例化处,按 env 选择 client。

import { HttpOfiT0Client, MockOfiT0Client } from "./ofi-client";

const mode = (import.meta.env.T0_QUOTE_CLIENT_MODE ?? "mock") as "http" | "mock";
const paymentMethod =
  (import.meta.env.T0_OFI_PAYMENT_METHOD as string | undefined) ??
  "PAYMENT_METHOD_TYPE_SEPA";

const ofiClient =
  mode === "http"
    ? new HttpOfiT0Client({
        baseUrl: import.meta.env.T0_OFI_API_BASE_URL ?? "https://api.agtpay.xyz",
        apiKey: import.meta.env.T0_OFI_API_KEY ?? "",
        timeoutMs: Number(import.meta.env.T0_OFI_TIMEOUT_MS ?? 5000),
      })
    : new MockOfiT0Client({
        pickBestQuote: (usdAmount, currency) => {
          // 复用现有 SandboxNetwork 内部"按 usdAmount+currency 过滤 + 选最优"逻辑
          const candidates = providerService
            .snapshot()
            .quotes.filter(
              (q) =>
                q.currency === currency &&
                q.expiresAt > Date.now() &&
                q.band >= usdAmount,
            );
          if (candidates.length === 0) return null;
          const best = candidates.reduce((a, b) => (a.rate <= b.rate ? a : b));
          return {
            rate: best.rate,
            expiresAt: best.expiresAt,
            createdAt: best.createdAt,
            quoteId: best.id,
          };
        },
      });

export const sandboxNetwork = new SandboxNetwork(providerService, ofiClient, paymentMethod);
```

### 6.6 `quote-message.ts` 新增 3 个文案

```typescript
// 在 quote-message.ts 现有 friendly 文案表里追加 3 个 entry。

const FRIENDLY: Record<QuoteFailureReason, { title: string; detail: string }> = {
  // ... 现有 6 个不动
  REASON_UPSTREAM_ERROR: {
    title: "Upstream service error",
    detail: "agtpay /api/v1/quotes/network returned an unexpected error. Try again, or check Provider console.",
  },
  REASON_UNAUTHORIZED: {
    title: "API key rejected",
    detail: "T0_OFI_API_KEY is missing or invalid. Check your .env configuration.",
  },
  REASON_BAD_REQUEST: {
    title: "Invalid quote request",
    detail: "The request to agtpay was malformed. Verify currency, amount, and payment method.",
  },
};

// formatQuoteFailure() 加一个 unknown-reason 兜底
export function formatQuoteFailure(reason: QuoteFailureReason) {
  return (
    FRIENDLY[reason] ?? {
      title: "Quote lookup failed",
      detail: `Unknown failure reason: ${reason}`,
    }
  );
}
```

---

## 7. 错误码映射实施步骤(更新)

`src/lib/t0/network.ts` 现有的 `QuoteFailureReason` 联合类型需要扩展:

```typescript
export type QuoteFailureReason =
  | "REASON_NO_QUOTE_AVAILABLE"
  | "REASON_LIMIT_EXCEEDED"
  | "REASON_CURRENCY_NOT_SUPPORTED"
  | "REASON_INVALID_AMOUNT"
  | "REASON_INVALID_QUOTE_ID"
  | "REASON_QUOTE_EXPIRED"
  | "REASON_UPSTREAM_ERROR"        // 🆕
  | "REASON_UNAUTHORIZED"          // 🆕
  | "REASON_BAD_REQUEST";          // 🆕
```

`REASON_LIMIT_EXCEEDED` 现状未使用,**保留**(作为预留值,本次不实现)。其余 6 个保持不变。

---

## 8. 实施顺序(建议)

1. **`quote-mapper.ts` + `quote-mapper.test.ts`** —— 纯函数优先,先完成 + 100% 覆盖
2. **`quote-message.ts` + 测试** —— 加 3 个 friendly 文案 + 兜底
3. **`ofi-client.ts` + `ofi-client.test.ts`** —— 两组 client 实现 + 测试
4. **`network.ts` 改造 + `network.test.ts` skip 旧 + 新增 delegation 测试**
5. **`index.ts` 注入 client**
6. **`t0.functions.ts` 加 `await`**
7. **`.env.example` + `vite.config.ts`** —— 注册 4 个 env
8. **`bun run typecheck` + `bun test`**

---

## 9. 验证步骤(实施完成后)

1. `bun test src/lib/t0/quote-mapper.test.ts` —— 100% 通过
2. `bun test src/lib/t0/ofi-client.test.ts` —— mock + http 两组通过
3. `bun test src/lib/t0/network.test.ts` —— 旧用例 `skip`,新用例通过
4. `bun test src/lib/t0/quote-message.test.ts` —— 3 个新失败原因通过
5. `bun run typecheck` —— 无 TS error
6. `T0_QUOTE_CLIENT_MODE=mock bun run dev` → 访问 `/ofi`,行为与重构前**完全一致**
7. `T0_QUOTE_CLIENT_MODE=http T0_OFI_API_KEY=<test-key> bun run dev` → 访问 `/ofi`,点 Get Quote:
   - 成功:UI 显示 quote 卡片(pair / rate / payout / expiration 全部正确)
   - 401:友好错误提示(`API key rejected`)+ 链接到 Provider console
   - `REASON_QUOTE_NOT_FOUND`:友好错误(`No quote available`) + 链接到 Provider console
   - 5xx:`Upstream service error` 提示

---

## 10. 范围外(明确不做)

| 项 | 原因 |
|---|---|
| 改 `HttpT0Client.updateQuote`(provider 推送方向) | 用户确认"否" |
| 改 `createPayment` / `completeManualAml` 走新 API | 用户确认"否" |
| 改 `GET /api/v1/quotes` 快照端点 | 选 B(按需询价)不选 A(全量快照) |
| UI 加 `paymentMethod` 控件 | 从 env 注入,保持 UI 0 改动 |
| 改 `Quote.id` 形状(`string` → `{quoteId, providerId}`) | UI 0 改动约束,用 string 拼装 |
| 新增 `pay-in` 方向支持 | 不在 OFI 当前场景 |
| `HttpT0Client.updateQuote` 的 `Decimal` 化 bug | 用户确认不改,留作 tech debt,在 PR 描述里 mention |

---

## 11. 审计意见与优化(2026-07-09)

> 以下意见基于对 `src/lib/t0/network.ts`、`src/lib/t0/quote-message.ts`、`src/lib/t0/types.ts`、`src/lib/t0/t0.functions.ts`、`src/lib/t0/index.ts`、`src/lib/t0/client.ts` 及现有测试文件的代码审计得出。

### 11.1 类型系统问题 ⚠️

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 11.1.1 | `toGetQuoteResult` 中 `quote.band` 被赋值为 `s.band`(number),但 `Quote.band` 类型是 `VolumeBand`(字面量联合: `1_000 \| 5_000 \| ... \| 1_000_000`)。API 返回的 band 可能不在枚举中,导致 TS 编译错误。 | `quote-mapper.ts` §6.1 | 方案 A(推荐): 在 `quote-mapper.ts` 中增加 `band` 校验/归一化函数,将 API 返回的 band 映射到最近的 `VolumeBand`。方案 B: 放宽 `Quote.band` 为 `number` —— 但会波及 `types.ts` 和 `ofi.tsx` 等强约束文件,不建议。 |
| 11.1.2 | `numberToDecimal` 对 `0` 的处理:`String(0)` → `"0"` → `unscaled: 0, exponent: 0`,但 API 期望 `"0.00"` 时可能不匹配。 | `quote-mapper.ts` §6.1 | 增加 `numberToDecimal` 的 `precision` 参数,或明确文档说明:" settlement amount 为整数时 exponent 为 0"。 |
| 11.1.3 | `parseResponse` 使用 `as` 类型断言(`json as { result?: ... }`),丢失了运行时类型安全。API 返回非 JSON 或形状不符时会在运行时抛不可控错误。 | `ofi-client.ts` §6.2 | 引入轻量运行时校验(如 `zod` 或手写 `isValidResponse` guard),至少校验 `result?.success` 和 `result?.failure` 的存在性。 |

### 11.2 代码逻辑问题 🐛

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 11.2.1 | `HttpOfiT0Client.getQuote` 中 `res.ok` 判断冗余。`res.status >= 500` 和 `res.status >= 400` 已覆盖所有非 2xx 状态码,最后的 `if (!res.ok)` 永远不会命中。 | `ofi-client.ts` §6.2 | 删除 `if (!res.ok)` 分支,或将其改为 `else` 的兜底。 |
| 11.2.2 | `MockOfiT0Client.getQuote` 中 `req.usdAmount <= 0` 返回 `BAD_REQUEST`,但 `SandboxNetwork.getQuote` 在调用 client 前已做同样校验。这会导致重复校验,且 `MockOfiT0Client` 的 `BAD_REQUEST` 永远不会被 `toGetQuoteResult` 映射到(因为 `SandboxNetwork` 已拦截)。 | `ofi-client.ts` §6.2 | Mock client 中删除 `usdAmount <= 0` 校验,仅保留 `pickBestQuote` 调用;或明确文档说明这是"防御性编程"。 |
| 11.2.3 | `toGetQuoteResult` 中 `s.expiresAt <= now` 检测在 `OfiQuoteSuccess` 构建后执行,但 `OfiQuoteSuccess` 的 `expiresAt` 来自 `parseRfc3339`,如果 API 返回的 expiration 是过去时间,`HttpOfiT0Client` 的 `parseResponse` 已经把它转成 epoch ms 了,到 `toGetQuoteResult` 时再次检测。这个双重检测没问题,但 `HttpOfiT0Client` 自己也可以提前返回 failure,减少一次对象构建。 | `quote-mapper.ts` §6.1 | 可选优化:在 `HttpOfiT0Client.parseResponse` 中直接检测 `expiresAt <= now` 并返回 `UPSTREAM` 或 `NO_QUOTE`。保持现状也可以。 |
| 11.2.4 | `rawToOfiSuccess` 函数中 `band: decimalToNumber(/* amount from request */ 0 as Decimal)` 是明显 placeholder,实际值应由 caller 注入。但文档中未说明这个函数的使用方式。 | `quote-mapper.ts` §6.1 | 删除 `rawToOfiSuccess` 或改为接收 `amount: Decimal` 参数。如果保留,加 TODO 注释。 |
| 11.2.5 | `index.ts` 中 `MockOfiT0Client` 的 `pickBestQuote` 闭包直接引用 `providerService`,但 `providerService` 是全局单例。如果未来测试需要隔离,这个闭包会引入隐式依赖。 | `index.ts` §6.5 | 将 `pickBestQuote` 逻辑提取为独立函数,接收 `providerService` 作为参数;或在 `MockOfiT0ClientDeps` 中直接注入 `snapshot` 函数而非 `providerService` 引用。 |

### 11.3 测试覆盖问题 🧪

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 11.3.1 | 文档承诺 `quote-mapper.test.ts` 100% 覆盖,但未列出具体测试用例。`numberToDecimal` 的边界值(如 `0.0000000001`、`1e20`、负数)和 `parseRfc3339` 的异常路径(如 `""`、`"invalid"`、时区偏移 `"+08:00"`)需要明确。 | §4.3 / §6.1 | 在文档中补充测试用例清单,或直接在测试文件中覆盖。 |
| 11.3.2 | `network.test.ts` 中现有 getQuote 用例被标记为 `describe.skip`,但未说明这些测试是否会在重构后恢复或永久废弃。如果永久废弃,应删除而非 skip,避免技术债务。 | §4.3 | 明确说明:"旧 getQuote 测试因逻辑已迁移到 `MockOfiT0Client`,故删除。`MockOfiT0Client.test.ts` 中覆盖等价逻辑。" |
| 11.3.3 | `ofi-client.test.ts` 中 `HttpOfiT0Client` 的 mock fetch 测试需要覆盖:timeout(AbortSignal 触发)、非 JSON 响应(`res.text()` 路径)、`result.success` 缺少字段(如缺少 `rate`)。 | §4.3 | 补充测试用例清单。 |
| 11.3.4 | `quote-message.test.ts` 现有 6 个测试,新增 3 个后共 9 个。但 `formatQuoteFailure` 的兜底分支(unknown reason)没有测试。 | §6.6 | 增加兜底分支测试。 |

### 11.4 环境变量与配置问题 🔧

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 11.4.1 | 文档提到 `.env.example`,但项目中**不存在该文件**。现有环境变量通过 `process.env` 读取(见 `index.ts` 中 `T0_NGROK_URL` / `T0_API_KEY`),而文档中却使用 `import.meta.env` 读取新变量。 | §4.2 / §6.5 | 统一读取方式。如果项目使用 Vite(从 `vite.config.ts` 确认),应使用 `import.meta.env` 并在 `vite.config.ts` 中通过 `define` 注入;如果部分代码在 Node 环境运行(如 server functions),则需 `process.env`。确认 `t0.functions.ts` 是 server-side 还是 client-side,选择正确的 env 读取方式。 |
| 11.4.2 | `vite.config.ts` 中未配置任何 `envPrefix` 或 `define`,新变量 `T0_QUOTE_CLIENT_MODE` 等不会被 Vite 自动注入到 `import.meta.env` 中。 | §4.2 | 在 `vite.config.ts` 的 `defineConfig` 中添加 `envPrefix: "T0_"`,或在 `vite.define` 中显式映射。 |
| 11.4.3 | `T0_OFI_API_KEY` 在 `.env` 中明文存储,文档未提及密钥管理最佳实践(如 `.env.local` 已存在,是否应加入 `.gitignore`)。 | §5 | 在文档中增加提醒:"`T0_OFI_API_KEY` 必须加入 `.gitignore`,禁止提交到版本控制。生产环境应通过 Vercel / Cloudflare 的 Secrets 管理注入。" |

### 11.5 架构与设计问题 🏗️

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 11.5.1 | `SandboxNetwork` 的 `now` 参数在 `getQuote` 中是可选的(`now?: number`),但在 `getQuoteById` 中是带默认值的(`now: number = Date.now()`)。重构后 `getQuote` 也接受 `now`,但 `SandboxNetwork` 构造器未注入 `now` 函数,导致测试中无法统一控制时间。 | `network.ts` §6.3 | 在 `SandboxNetwork` 构造器中增加可选的 `now?: () => number` 参数(与 `OFIService` 和 `PayoutProviderService` 保持一致),便于测试。 |
| 11.5.2 | `MockOfiT0ClientDeps.pickBestQuote` 的返回类型是 `{ rate: number; expiresAt: number; createdAt: number; quoteId: string }`,但 `Quote` 类型中还有 `currency` 和 `band`。Mock 实现中 `currency` 来自 `req.currency`、`band` 来自 `req.usdAmount`,这种"半构造"模式增加了理解成本。 | `ofi-client.ts` §6.2 | 改为 `pickBestQuote` 返回完整的 `Quote` 对象,`MockOfiT0Client` 直接透传。 |
| 11.5.3 | `HttpOfiT0Client` 和 `HttpT0Client` 都实现了 HTTP 调用,但职责不同(OFI 拉取 vs Provider 推送)。文档中未说明是否应统一底层 HTTP 工具(如提取 `post` 方法到共享 util)。 | §6.2 | 短期:保持分离,避免改动 `client.ts`。长期:在 `src/lib/t0/http-util.ts` 中提取共享的 `authorizedPost` 函数,减少重复代码。 |
| 11.5.4 | `quote-mapper.ts` 同时承担 "Decimal 转换"、"RFC3339 解析"、"错误码映射"、"响应结构转换" 四个职责。虽然都是纯函数,但文件已经 300+ 行,可读性下降。 | §6.1 | 考虑拆分为 `decimal.ts`、`rfc3339.ts`、`quote-mapper.ts` 三个文件。如果保持单文件,至少用 `// ── section ──` 分隔清晰。 |

### 11.6 文档与一致性 ✍️

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 11.6.1 | 文档中 `localAmount` 字段在 §3 映射表中列为 `decimalToNumber(payOutAmount)`,但在 `toGetQuoteResult` 的返回结构中没有 `localAmount` 字段。`GetQuoteResult.success` 只有 `quote`、`payoutAmount`、`settlementAmount`。`Quote` 类型中也没有 `localAmount`。 | §3 | 修正映射表:"`localAmount` 不在 `GetQuoteResult` 中,由 UI 通过 `quote.band * quote.rate` 计算。"或确认是否遗漏字段。 |
| 11.6.2 | 文档中 `Quote.id` 的拼法为 `${providerId}-${quoteId}`,但 `parseResponse` 中写的是 `${s.quoteId.providerId}-${s.quoteId.quoteId}`。顺序一致,但文档未说明 `providerId` 和 `quoteId` 的数据类型(一个是 `number`,一个是 `number`)。 | §3 | 明确说明:"`providerId` 和 `quoteId` 均为 API 返回的 `number`,拼接时自动转 string。" |
| 11.6.3 | 文档中 `REASON_UPSTREAM_ERROR` 的文案提到 "agtpay /api/v1/quotes/network",但 API 域名是 `api.agtpay.xyz`,路径是 `/api/v1/quotes/network`。文案中的路径正确,但域名未在文案中体现。 | §6.6 | 保持现状即可,或改为 "The quote service returned an unexpected error..." 更通用。 |
| 11.6.4 | 文档中多次出现 `payoutAmount` 和 `settlementAmount`,但 `Quote` 类型中只有 `band` 和 `rate`。需要确认 `payoutAmount` 是否等于 `localAmount`(即 `band * rate`)。 | §3 / §6.1 | 在映射表中增加一行:"`payoutAmount` = `localAmount` = `band * rate`,由 API 的 `payOutAmount` 直接提供。" |

### 11.7 安全与边界 🔒

| # | 问题 | 位置 | 建议 |
|---|---|---|---|
| 11.7.1 | `HttpOfiT0Client` 的 `apiKey` 在请求头中明文传输(`authorization: Bearer ${this.opts.apiKey}`),文档未提及是否使用 HTTPS。虽然 `baseUrl` 是 `https://`,但开发环境可能配置为 `http://localhost`。 | §6.2 | 在 `HttpOfiT0Client` 构造函数中增加断言:如果 `baseUrl` 以 `http://` 开头且不是 `localhost`,抛出错误。 |
| 11.7.2 | `HttpOfiT0Client` 的 `parseResponse` 对 `res.json()` 的解析没有大小限制。如果 API 返回超大 JSON,可能导致内存问题。 | §6.2 | 增加 `Content-Length` 检查或设置 `res.json()` 的流式解析上限(如 1MB)。短期内可忽略。 |
| 11.7.3 | `MockOfiT0Client` 的 `payOutAmount` 计算使用 `req.usdAmount * picked.rate`,如果 `rate` 为 `0` 或负数,会产生无效值。 | `ofi-client.ts` §6.2 | 增加防御:如果 `picked.rate <= 0`,返回 `UPSTREAM` failure。 |

---

## 12. 优化后的实施顺序(含审计修复)

1. **修复类型系统问题** —— `VolumeBand` 映射、`numberToDecimal` 精度参数
2. **`quote-mapper.ts` + `quote-mapper.test.ts`** —— 纯函数优先,覆盖 Decimal 边界 + RFC3339 异常
3. **`quote-message.ts` + 测试** —— 加 3 个文案 + 兜底分支测试
4. **`ofi-client.ts` + `ofi-client.test.ts`** —— 修复 `res.ok` 冗余、增加运行时校验、覆盖 timeout/非 JSON/字段缺失
5. **`network.ts` 改造** —— 注入 `now` 函数、改 `async`、新增 delegation 测试
6. **`index.ts` 注入 client** —— 统一 env 读取方式(`process.env` vs `import.meta.env`)
7. **`t0.functions.ts` 加 `await`**
8. **环境变量配置** —— 创建 `.env.example`、更新 `vite.config.ts` 的 `envPrefix`
9. **`bun run typecheck` + `bun test`**
10. **文档更新** —— 将本审计意见中的修复点同步回代码注释

---

## 13. 快速修复清单(可直接复制到 PR 描述)

```markdown
### 审计修复点
- [ ] `quote-mapper.ts`: `VolumeBand` 运行时映射/校验
- [ ] `quote-mapper.ts`: `numberToDecimal` 增加 `precision` 参数或文档说明
- [ ] `ofi-client.ts`: 删除 `res.ok` 冗余分支
- [ ] `ofi-client.ts`: `parseResponse` 增加轻量运行时校验(zod 或手写 guard)
- [ ] `ofi-client.ts`: `MockOfiT0Client` 删除重复 `usdAmount <= 0` 校验或加注释说明
- [ ] `network.ts`: 构造器注入可选 `now?: () => number`
- [ ] `index.ts`: 统一 `process.env` / `import.meta.env` 读取方式
- [ ] `vite.config.ts`: 配置 `envPrefix: "T0_"` 或 `define` 映射
- [ ] `.env.example`: 创建文件并加入 `.gitignore`
- [ ] `quote-message.test.ts`: 增加兜底分支测试
- [ ] `ofi-client.test.ts`: 覆盖 timeout / 非 JSON / 字段缺失场景
- [ ] `network.test.ts`: 删除旧 `getQuote` 测试(非 skip),在 `ofi-client.test.ts` 中覆盖等价逻辑
```
