# 分析报告：ngrok 域名用途与 Create Payment 调用链

## 一、absurd-payphone-hankie.ngrok-free.dev 是什么

### 结论
`absurd-payphone-hankie.ngrok-free.dev` **不是项目代码中配置的域名**，而是用户本地开发环境中通过 **ngrok** 隧道暴露的临时公网域名。

### 详细分析

#### 1. 代码中完全没有这个域名
- 在 `src/` 目录中 grep 搜索 `absurd-payphone-hankie` 和 `ngrok-free.dev` — **零匹配**
- `.env` 文件中 `T0_NGROK_URL=` 为空
- `.env.example` 中 `T0_NGROK_URL=` 也是空的

#### 2. ngrok 的作用
ngrok 是一个隧道工具，将本地端口（如 `localhost:8080`）暴露到公网，生成一个临时域名（如 `*.ngrok-free.dev`）。

用户可能的使用场景：
- 通过 ngrok 将本地 dev server 暴露到公网，方便外部访问（如手机测试、分享给同事）
- 或者通过 ngrok 将本地服务暴露给 agtpay 后端做 webhook 回调测试

#### 3. 错误发生的上下文

```
T0 /v1/events failed: 403 Blocked request.
This host ("absurd-payphone-hankie.ngrok-free.dev") is not allowed.
```

这个错误来自 **Vite dev server** 的 `allowedHosts` 安全检查。当用户通过 ngrok 域名访问本地 dev server 时，Vite 5+ 默认拒绝非 `localhost` 的请求。

#### 4. 修复方式
在 `vite.config.ts` 中添加：
```ts
server: {
  allowedHosts: ["absurd-payphone-hankie.ngrok-free.dev"],
}
```

**注意**：这个域名是 ngrok 免费版自动分配的，每次重启 ngrok 可能会变化。如果域名变了，需要重新更新配置。

---

## 二、Create Payment 按钮的完整调用链

### 时序图

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  OFI UI     │     │  Server Function      │     │  SandboxNetwork       │     │  ProviderService│
│  (ofi.tsx)  │     │  (t0.functions.ts)    │     │  (network.ts)         │     │  (provider.ts)  │
└──────┬──────┘     └──────────┬──────────┘     └──────────┬──────────┘     └────────┬────────┘
       │                       │                           │                         │
       │  1. 点击 Create       │                           │                         │
       │     Payment           │                           │                         │
       │                       │                           │                         │
       │  2. onCreatePayment() │                           │                         │
       │ ─────────────────────>│                           │                         │
       │                       │                           │                         │
       │                       │  3. createPayment({data})   │                         │
       │                       │ ─────────────────────────>│                         │
       │                       │                           │                         │
       │                       │                           │  4. 检查 idempotency    │
       │                       │                           │     (paymentClientId    │
       │                       │                           │      是否已存在)        │
       │                       │                           │                         │
       │                       │                           │  5. 检查 Pre-Settlement │
       │                       │                           │     credit gate         │
       │                       │                           │                         │
       │                       │                           │  6. getQuoteById()      │
       │                       │                           │     查找 quote          │
       │                       │                           │                         │
       │                       │                           │  7. acceptPaymentFromQuote│
       │                       │                           │     创建 Payment 对象   │
       │                       │                           │                         │
       │                       │                           │  8. recordPayment(p)    │
       │                       │                           │ ───────────────────────>│
       │                       │                           │                         │
       │                       │                           │  9. reserveCredit()     │
       │                       │                           │     锁定信用额度        │
       │                       │                           │                         │
       │                       │                           │  10. requestPayout()    │
       │                       │                           │     同步执行 payout     │
       │                       │                           │                         │
       │                       │                           │  11. provider.executePayout
       │                       │                           │ ───────────────────────>│
       │                       │                           │                         │
       │                       │                           │                         │  12. 创建 Payout 对象
       │                       │                           │                         │
       │                       │                           │                         │  13. client.emit()
       │                       │                           │                         │     PayoutAccepted
       │                       │                           │                         │
       │                       │                           │                         │  14. client.emit()
       │                       │                           │                         │     PayoutSuccess
       │                       │                           │                         │
       │                       │                           │                         │  15. client.emit()
       │                       │                           │                         │     PaymentConfirmed
       │                       │                           │                         │
       │                       │                           │  16. settleCredit()     │
       │                       │                           │     或 releaseCredit()    │
       │                       │                           │                         │
       │                       │  17. 返回结果             │                         │
       │                       │ <─────────────────────────│                         │
       │                       │                           │                         │
       │  18. 显示 paymentResult │                           │                         │
       │ <───────────────────────│                           │                         │
       │                       │                           │                         │
```

### 代码层面的调用链

#### 第 1 层：UI 事件处理
**文件**：`src/routes/ofi.tsx:240-255`
```tsx
const onCreatePayment = () =>
  run(async () => {
    if (!quoteId) {
      setError("Run Get Quote first.");
      return;
    }
    const input: CreatePaymentInput = {
      paymentClientId: clientId,
      quoteId,
      beneficiaryRef,
      usdAmount,
    };
    const r = await createPayment({ data: input });  // ← 调用 server function
    setPaymentResult(r);
    await refresh();
  });
```

#### 第 2 层：Server Function
**文件**：`src/lib/t0/t0.functions.ts:82-84`
```ts
export const ofiCreatePaymentFn = createServerFn({ method: "POST" })
  .validator((d: CreatePaymentInput) => d)
  .handler(async ({ data }) => sandboxNetwork.createPayment(data));
```

#### 第 3 层：SandboxNetwork.createPayment()
**文件**：`src/lib/t0/network.ts:196-270`

关键步骤：
1. **Idempotency 检查**（line 205-212）：如果 `paymentClientId` 已存在，直接返回已有结果
2. **Pre-Settlement 信用门控**（line 217-222）：检查 OFI 是否有足够 USDT 信用额度
3. **Quote 查找**（line 224-225）：通过 `getQuoteById()` 查找 quote
4. **创建 Payment**（line 229）：调用 `acceptPaymentFromQuote()`
5. **信用预留**（line 233-239）：`reserveCredit()` 锁定额度
6. **同步执行 Payout**（line 244）：`requestPayout()` — 这是 sandbox 的简化设计，生产环境是异步 RPC
7. **信用结算/释放**（line 247-267）：根据 payout 结果 `settleCredit()` 或 `releaseCredit()`

#### 第 4 层：PayoutProviderService.executePayout()
**文件**：`src/lib/t0/provider.ts:155-193`

```ts
async executePayout(paymentId: string, opts: { fail?: boolean } = {}): Promise<Payout> {
  // 1. 检查幂等性
  // 2. 验证 payment 存在且状态为 accepted
  // 3. 创建 Payout 对象
  // 4. await this.client.emit({ type: "PayoutAccepted", ... })  ← 这里调用 HttpT0Client
  // 5. 模拟 payout 执行（成功/失败）
  // 6. await this.client.emit({ type: "PayoutSuccess", ... })
  // 7. payment.status = "confirmed"
  // 8. await this.client.emit({ type: "PaymentConfirmed", ... })
}
```

#### 第 5 层：HttpT0Client.emit() — 错误发生点
**文件**：`src/lib/t0/client.ts:77-79`
```ts
emit(event: NetworkEvent) {
  return this.post("/v1/events", event);  // ← POST 到 ngrok URL
}
```

**文件**：`src/lib/t0/client.ts:50-68`
```ts
private async post(path: string, body: unknown, opts?: { idempotencyKey?: string }) {
  const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`T0 ${path} failed: ${res.status} ${text}`);  // ← 403 错误在这里抛出
  }
}
```

### 错误根因分析

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        错误传播路径                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. executePayout() 调用 client.emit({type: "PayoutAccepted"})              │
│                                                                             │
│  2. HttpT0Client.post("/v1/events", event)                                   │
│     → fetch("https://absurd-payphone-hankie.ngrok-free.dev/v1/events")    │
│                                                                             │
│  3. 请求到达 Vite dev server (localhost:8080)                              │
│     → Vite 检查 Host header: "absurd-payphone-hankie.ngrok-free.dev"      │
│     → 不在 allowedHosts 列表中                                              │
│     → 返回 403 Blocked request                                              │
│                                                                             │
│  4. fetch 收到 403 → post() 抛出 Error                                     │
│     → "T0 /v1/events failed: 403 Blocked request..."                       │
│                                                                             │
│  5. Error 向上传播：executePayout() → createPayment() → server fn → UI    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 关键发现：为什么 HttpT0Client 被激活了？

**文件**：`src/lib/t0/index.ts:9-13`
```ts
const ngrokUrl = process.env.T0_NGROK_URL;     // ← 从 .env 读取
const apiKey = process.env.T0_API_KEY;

export const t0Client =
  ngrokUrl && apiKey ? new HttpT0Client(ngrokUrl, apiKey) : new MockT0Client();
```

正常情况下：
- `.env` 中 `T0_NGROK_URL=` 为空 → `ngrokUrl` 为 falsy → 使用 `MockT0Client`
- `MockT0Client.emit()` 只是内存操作，不会发网络请求

**但用户的实际环境中**：
- `T0_NGROK_URL` 被设置为了 `https://absurd-payphone-hankie.ngrok-free.dev`
- `T0_API_KEY` 也被设置了
- 所以 `HttpT0Client` 被激活，尝试向 ngrok 域名发送请求

**可能原因**：
1. `.env.local` 文件中有这些配置（被 gitignore 了，不在代码库中）
2. 或者用户通过其他方式（如 ngrok 的本地代理）设置了环境变量

### 为什么 ngrok 域名指向了 Vite dev server？

最可能的场景：
```
用户运行了 ngrok 隧道：
  ngrok http 8080
  
ngrok 输出：
  Forwarding: https://absurd-payphone-hankie.ngrok-free.dev -> http://localhost:8080

然后用户在 .env.local 中设置了：
  T0_NGROK_URL=https://absurd-payphone-hankie.ngrok-free.dev
  T0_API_KEY=some-key

当 executePayout() 调用 client.emit() 时：
  HttpT0Client 向 https://absurd-payphone-hankie.ngrok-free.dev/v1/events 发送 POST
  
请求通过 ngrok 隧道到达 localhost:8080
Vite dev server 收到请求，检查 Host header
Host 是 absurd-payphone-hankie.ngrok-free.dev，不在 allowedHosts 中
→ 403 Blocked request
```

### 修复方案总结

| 方案 | 操作 | 效果 |
|------|------|------|
| **A** | 在 `vite.config.ts` 添加 `allowedHosts` | 允许 ngrok 域名访问 dev server |
| **B** | 清空 `.env.local` 中的 `T0_NGROK_URL` | 回退到 `MockT0Client`，不发送真实请求 |
| **C** | 使用 `T0_QUOTE_CLIENT_MODE=mock` | 确保 OFI 侧也使用 mock 模式 |

**已实施的修复**（方案 A）：
```ts
// vite.config.ts
vite: {
  server: {
    allowedHosts: ["absurd-payphone-hankie.ngrok-free.dev"],
  },
}
```

---

## 三、架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BAXS Sandbox Bridge                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐ │
│  │   OFI UI     │    │  Provider UI │    │        T-0 Network           │ │
│  │  /ofi        │    │  /provider   │    │   (agtpay / real network)    │ │
│  └──────┬───────┘    └──────┬───────┘    └──────────────────────────────┘ │
│         │                    │                           ▲                   │
│         │ useServerFn        │ useServerFn             │                   │
│         │                    │                         │                   │
│  ┌──────▼────────────────────▼─────────────────────────┴────────────────┐  │
│  │                        Server Functions                              │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │  │
│  │  │ ofiCreatePaymentFn│ │ publishQuoteFn  │  │ completeManualAmlFn │ │  │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │  │
│  │           │                    │                      │            │  │
│  │  ┌────────▼────────────────────▼──────────────────────▼────────┐   │  │
│  │  │                    SandboxNetwork (Orchestrator)              │   │  │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │   │  │
│  │  │  │ getQuote() │  │createPayment│  │ approvePaymentQuote()│  │   │  │
│  │  │  └─────┬──────┘  └─────┬──────┘  └──────────┬───────────┘  │   │  │
│  │  │        │               │                    │              │   │  │
│  │  │  ┌─────▼───────────────▼────────────────────▼──────────┐   │   │  │
│  │  │  │              PayoutProviderService                 │   │   │  │
│  │  │  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  │   │   │  │
│  │  │  │  │ quotes │  │payments│  │payouts │  │ events   │  │   │   │  │
│  │  │  │  └────────┘  └────────┘  └────────┘  └──────────┘  │   │   │  │
│  │  │  └─────────────────────┬───────────────────────────────┘   │   │  │
│  │  │                        │                                   │   │  │
│  │  │              ┌─────────▼──────────┐                      │   │  │
│  │  │              │    T0Client          │                      │   │  │
│  │  │              │  ┌──────────────┐    │                      │   │  │
│  │  │              │  │HttpT0Client  │ ←── 当 T0_NGROK_URL 设置时 │   │  │
│  │  │              │  │MockT0Client  │ ←── 默认（无 ngrok URL）  │   │  │
│  │  │              │  └──────────────┘    │                      │   │  │
│  │  │              └──────────┬───────────┘                      │   │  │
│  │  │                         │                                  │   │  │
│  │  └─────────────────────────┼──────────────────────────────────┘   │  │
│  │                            │                                      │  │
│  └────────────────────────────┼──────────────────────────────────────┘  │
│                               │                                         │
│                               ▼                                         │
│                    ┌─────────────────────┐                              │
│                    │   ngrok 隧道          │                              │
│                    │   *.ngrok-free.dev   │                              │
│                    │   → localhost:8080   │                              │
│                    └─────────────────────┘                              │
│                               │                                         │
│                               ▼                                         │
│                    ┌─────────────────────┐                              │
│                    │   Vite Dev Server   │                              │
│                    │   (localhost:8080)  │                              │
│                    └─────────────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 四、总结

| 问题 | 答案 |
|------|------|
| ngrok 域名是什么 | 用户本地 ngrok 隧道生成的临时公网域名，用于将 localhost:8080 暴露到公网 |
| 为什么出现 403 | Vite 5+ 的 `allowedHosts` 安全机制阻止了非 localhost 的 Host header |
| Create Payment 调用链 | ofi.tsx → ofiCreatePaymentFn → SandboxNetwork.createPayment() → executePayout() → client.emit() → HttpT0Client.post() → fetch(ngrok URL) → Vite dev server → 403 |
| 为什么 HttpT0Client 被激活 | 用户环境中 `T0_NGROK_URL` 被设置为 ngrok 域名（可能在 .env.local 中） |
| 修复方式 | 在 vite.config.ts 中添加 `allowedHosts` 允许该域名 |
