# OFI GetQuote 走 agtpay REST 端点：审计修订版

> - **状态**：GetQuote REST 桥接已实现；端到端 OFI 流程审计未通过，暂不应标记为“完成”
> - **首次方案日期**：2026-07-09
> - **审计修订日期**：2026-07-10
> - **实现基线**：`83c1084 feat(t0): switch OFI GetQuote to real REST endpoint with Connect-RPC wire support`
> - **强约束**：不改 `/ofi` 页面交互和 `GetQuoteResult` 的运行时 JSON 形状；provider 推送方向保持独立

---

## 0. 执行结论

当前实现已经完成以下工作：

- `SandboxNetwork.getQuote()` 已改为异步，并委派给 `OfiT0Client`。
- `HttpOfiT0Client` 已接入 `POST /api/v1/quotes/network`，支持超时、HTTP 错误和业务失败映射。
- `MockOfiT0Client` 保留原来的本地快照选价逻辑，供开发和 CI 使用。
- 解析层同时兼容文档 JSON 和线上观察到的 Connect-RPC wire JSON。
- 新增的 mapper、client、network、message 目标测试当前为 **109/109 通过**。

但实现仍有一个阻断完整用户流程的 P0 问题：

```text
HTTP GetQuote 成功
  → 返回外部 quoteId，例如 "7-220299073"
  → 用户点击 Create Payment
  → SandboxNetwork.createPayment()
  → getQuoteById() 只查本地 provider.snapshot().quotes
  → 找不到外部 quoteId
  → REASON_INVALID_QUOTE_ID
```

审计期间已用当前代码复现：GetQuote 返回 success，紧接着用同一 `quoteId` 调 `createPayment()`，结果为 `REASON_INVALID_QUOTE_ID`。

因此本方案的准确状态应是：

- **GetQuote 单点桥接：已实现。**
- **GetQuote → Create Payment 完整流程：未完成。**
- **生产/演示放行：需先解决 P0 quote 连续性，并通过跨步骤回归测试。**

---

## 1. 审计范围与证据

### 1.1 已核对的实现

- `src/lib/t0/ofi-client.ts`
- `src/lib/t0/quote-mapper.ts`
- `src/lib/t0/network.ts`
- `src/lib/t0/index.ts`
- `src/lib/t0/ofi.ts`
- `src/lib/t0/t0.functions.ts`
- `src/lib/t0/quote-message.ts`
- `src/routes/ofi.tsx`
- 对应的 `*.test.ts`、live 脚本和 E2E 报告

### 1.2 新鲜验证结果

| 检查                            | 结果       | 说明                                                                                       |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| 目标单测                        | ✅ 109/109 | mapper、HTTP/mock client、network、OFI facade、错误文案                                    |
| HTTP quote → createPayment 复现 | ❌         | 稳定返回 `REASON_INVALID_QUOTE_ID`                                                         |
| `bun run typecheck`             | ❌         | 仓库存在多处 TS 错误；本功能直接相关错误包括 `src/lib/t0/ofi.ts:28` 的 Currency 类型不一致 |
| 全链路 UI 自动化                | ⚠️ 不充分  | 现有脚本重点验证 GetQuote；未证明 HTTP quote 可继续创建支付                                |

本审计不把“目标单测全绿”等同于“功能完成”。当前测试分层漏掉了最重要的跨模块用户路径。

---

## 2. What already exists（已有能力）

| 子问题                    | 已有实现                                  | 审计判断                                         |
| ------------------------- | ----------------------------------------- | ------------------------------------------------ |
| OFI 拉取报价接口          | `OfiT0Client`                             | 复用，边界清晰                                   |
| 真实 HTTP 调用            | `HttpOfiT0Client`                         | 复用并补强校验，不另造 client                    |
| 开发/CI 降级              | `MockOfiT0Client`                         | 保留，符合当前 sandbox 架构                      |
| Decimal / 时间 / DTO 映射 | `quote-mapper.ts`                         | 复用，不拆新文件                                 |
| 本地输入校验              | `SandboxNetwork.getQuote()`               | 补齐 finite/范围校验                             |
| 失败原因到 UI 文案        | `quote-message.ts`                        | 已覆盖 9 个已知 reason，并有 unknown 兜底        |
| provider 推送报价         | `HttpT0Client.updateQuote()`              | 与 OFI 拉取方向分离，继续不动                    |
| 本地 quote 存储           | `PayoutProviderService.snapshot().quotes` | 只包含本地发布 quote，不能代表外部 GetQuote 结果 |

关键结论：不需要再增加一套 HTTP 抽象，也不需要拆 mapper；真正缺失的是“外部 quote 从获取到消费的连续性”。

---

## 3. 当前架构与数据流

### 3.1 GetQuote 当前路径

```text
/ofi
  │ POST server function
  ▼
ofiGetQuoteFn
  ▼
SandboxNetwork.getQuote
  ├─ amount / currency 本地校验
  └─ OfiT0Client.getQuote
       ├─ mode=mock → provider snapshot → 选最优 quote
       └─ mode=http → POST /api/v1/quotes/network
                        ├─ HTTP 状态映射
                        ├─ spec/wire 双格式解析
                        └─ rawToOfiSuccess
  ▼
toGetQuoteResult
  ▼
GetQuoteResult → /ofi 展示
```

### 3.2 当前断点

```text
GetQuoteResult.success.quote.id
  │
  │ 用户原样提交 quoteId
  ▼
ofiCreatePaymentFn
  ▼
SandboxNetwork.createPayment
  ▼
getQuoteById
  └─ 仅查询 provider.snapshot().quotes
       ├─ mock quote：同一份本地对象，通常成功
       └─ HTTP quote：从未写入本地 snapshot，必然可能失败  ← P0
```

Mock 模式掩盖了这个问题，因为 Mock GetQuote 和 Create Payment 恰好共享本地 provider quote book；HTTP 模式没有这个隐含共享状态。

---

## 4. 端点合约：规范形状与实际 wire 形状

### 4.1 请求

```http
POST {T0_OFI_API_BASE_URL}/api/v1/quotes/network
Authorization: Bearer <T0_OFI_API_KEY>
Content-Type: application/json
```

```json
{
  "amount": { "unscaled": 1000, "exponent": 0 },
  "amountType": "settlement",
  "payOutCurrency": "EUR",
  "payOutMethod": "PAYMENT_METHOD_TYPE_SEPA"
}
```

### 4.2 响应兼容矩阵

当前 client 同时接受两类响应。两者都必须有契约测试，不能只保留其中一类。

| 语义              | 文档/规范形状                       | 已观察 wire 形状                     |
| ----------------- | ----------------------------------- | ------------------------------------ |
| result envelope   | `result.success` / `result.failure` | `Result.Success` / `Result.Failure`  |
| quote id          | `quoteId.quoteId` / `providerId`    | `quote_id.quote_id` / `provider_id`  |
| payout amount     | `payOutAmount`                      | `pay_out_amount`                     |
| settlement amount | `settlementAmount`                  | `settlement_amount`                  |
| expiration        | RFC3339 string                      | proto Timestamp `{ seconds, nanos }` |
| failure reason    | string enum                         | integer enum也可能出现               |

`reason=10 → NO_QUOTE` 是根据 live 行为加入的兼容规则，不是文档中已确认的稳定枚举。保留该规则时必须：

1. 用命名常量和注释记录来源；
2. 保留 regression test；
3. 在上游枚举确认后替换硬编码，避免未来把新业务错误误判成“无报价”。

---

## 5. 字段和失败原因映射

### 5.1 成功字段

| 内部字段           | 来源                       | 规则                                                   |
| ------------------ | -------------------------- | ------------------------------------------------------ |
| `quote.id`         | `providerId` + `quoteId`   | `${providerId}-${quoteId}`                             |
| `quote.currency`   | request                    | 响应不返回 currency，使用已校验请求值                  |
| `quote.band`       | request `usdAmount`        | 当前通过断言写入 `VolumeBand`，存在类型语义债务，见 P1 |
| `quote.rate`       | `success.rate`             | Decimal → number                                       |
| `quote.expiresAt`  | `success.expiration`       | RFC3339/proto Timestamp → epoch ms                     |
| `quote.createdAt`  | caller clock               | 由注入的 `now()` 产生                                  |
| `payoutAmount`     | `success.payOutAmount`     | Decimal → number                                       |
| `settlementAmount` | `success.settlementAmount` | Decimal → number                                       |

`localAmount` 不是 `Quote` 字段；在当前返回形状中对应 `GetQuoteResult.success.payoutAmount`。旧文档把它列为 `Quote` 字段是不准确的。

### 5.2 失败映射

| API / 场景                                        | 内部 `QuoteFailureReason`       |
| ------------------------------------------------- | ------------------------------- |
| `usdAmount <= 0` 或非 finite                      | `REASON_INVALID_AMOUNT`         |
| currency 不支持                                   | `REASON_CURRENCY_NOT_SUPPORTED` |
| `REASON_QUOTE_NOT_FOUND` / 已确认的 no-quote enum | `REASON_NO_QUOTE_AVAILABLE`     |
| HTTP 401                                          | `REASON_UNAUTHORIZED`           |
| HTTP 4xx（401 除外）                              | `REASON_BAD_REQUEST`            |
| HTTP 5xx、超时、网络错误、非 JSON、响应形状错误   | `REASON_UPSTREAM_ERROR`         |
| 成功 quote 已过期                                 | `REASON_QUOTE_EXPIRED`          |

无效 expiration 属于“上游响应非法”，应映射为 `REASON_UPSTREAM_ERROR`，不应伪装为已过期 quote。

---

## 6. 审计发现与优化建议

### 6.1 优先级总表

| ID  | 级别 | 发现                                     | 结论                                     |
| --- | ---- | ---------------------------------------- | ---------------------------------------- |
| A1  | P0   | HTTP quote 无法被 `createPayment()` 解析 | 阻断完整 OFI 流程，必须先修              |
| A2  | P1   | `Currency` 有两个不一致的来源            | 已造成相关 typecheck 错误，必须统一      |
| A3  | P1   | 任意 `usdAmount` 被断言为 `VolumeBand`   | 类型通过但语义不安全，必须显式决策       |
| A4  | P1   | 非法 expiration 被改写成 epoch           | 错误分类错误，测试还固化了该行为         |
| A5  | P1   | 缺少跨步骤 HTTP quote → payment 回归测试 | 单测全绿仍漏掉核心回归                   |
| A6  | P2   | env 配置缺少 fail-fast 校验              | 错误 mode/timeout 可能静默降级或立即超时 |
| A7  | P2   | 上游 `message` 在 mapper 边界丢失        | UI 有友好错误，但服务端排障信息不足      |
| A8  | P2   | `reason=10` 是未命名的线上兼容例外       | 需要契约来源和可移除边界                 |

### 6.2 A1：外部 quote 连续性（P0）

推荐在当前 sandbox 范围内采用最小修复：由 `SandboxNetwork` 维护一个有界、按 TTL 清理的 `recentOfiQuotes`，而不是把外部 quote 塞进 provider 的 quote book。

```text
SandboxNetwork.getQuote success
  └─ recentOfiQuotes.set(quote.id, quote)

SandboxNetwork.getQuoteById
  ├─ provider.snapshot().quotes.find(id)   # 本地 publish quote
  └─ recentOfiQuotes.get(id)               # 外部 GetQuote quote
       ├─ 不存在 → INVALID_QUOTE_ID
       ├─ 已过期 → QUOTE_EXPIRED + 删除
       └─ 有效 → success
```

设计约束：

- 不修改 `/ofi` 的请求/响应形状。
- 不把 OFI 拉取结果伪装成 provider 本地发布状态。
- cache 必须有最大容量和过期清理，避免常驻进程内存无限增长。
- 该方案只适用于当前单进程/内存型 sandbox。多实例生产部署必须改用共享存储，或直接调用真实 Create Payment API。

验收标准：

- HTTP client 返回的 quote 可直接用于下一步 `createPayment()`。
- 过期外部 quote 返回 `REASON_QUOTE_EXPIRED`。
- 未见过的 quote id 仍返回 `REASON_INVALID_QUOTE_ID`。
- 相同 `paymentClientId` 的幂等行为不变。
- mock 模式现有行为不变。

### 6.3 A2/A3：统一 Currency，并停止伪造 VolumeBand（P1）

当前存在两个 `Currency`：

- `src/lib/t0/types.ts`：只包含 8 个币种；
- `src/lib/t0/currencies.ts`：从 `SUPPORTED_CURRENCIES` 推导出更大的联合类型。

`OFIService.snapshot()` 返回完整币种列表，但 `Quote.currency` 仍使用窄联合，已导致 `src/lib/t0/ofi.ts:28` typecheck 失败。

推荐：

1. 以 `currencies.ts` 为唯一事实源；
2. `types.ts` 导入并 re-export 该 `Currency`，保持现有 import 路径兼容；
3. 为 `Quote.band` 做显式领域决策：
   - 最小改动：把 `Quote.band` 放宽为 `number`，provider 发布入口继续用 `VolumeBand` 限制；
   - 更干净但改动更大：拆分 `PublishedQuote` 与 `QuotedOffer`。

本仓库推荐最小改动。固定 band 是“发布报价”的输入约束，不应错误地限制“按任意金额询价”的结果。

### 6.4 A4：无效 expiration 必须返回 UPSTREAM（P1）

当前 `parseExpiration()` 的注释声称失败返回 `null`，实际却返回 `1970-01-01T00:00:00Z`。这会把非法响应变成一个“正常但已过期”的 quote，最终显示 `REASON_QUOTE_EXPIRED`。

推荐：

- 让 `parseExpiration()` 真正返回 `string | null`；
- 非法 string、非法 seconds、非法 nanos、越界日期全部返回 `null`；
- `parseResponse()` 将其映射为 `UPSTREAM`；
- 把当前“invalid seconds → epoch success”的测试改成“invalid seconds → UPSTREAM”。

### 6.5 A6/A7/A8：配置与可观察性（P2）

`buildOfiClient()` 在 `mode=http` 时应校验：

- `T0_OFI_API_KEY` 非空；
- `T0_OFI_TIMEOUT_MS` 是有限正数；
- `T0_OFI_API_BASE_URL` 可解析；非 localhost 的明文 HTTP 应拒绝；
- `T0_QUOTE_CLIENT_MODE` 只能是 `http` 或 `mock`，拼写错误不能静默落到 mock。

上游 failure 的原始 message 不应返回浏览器，但应在 server 端记录结构化、去敏后的诊断信息。禁止记录 Authorization header 和完整 API key。

---

## 7. 对旧审计建议的纠正

以下旧建议与当前代码事实不符，已从执行清单删除：

| 旧建议                                | 审计纠正                                                            |
| ------------------------------------- | ------------------------------------------------------------------- |
| 删除 `if (!res.ok)`，认为它永远不可达 | 不正确；它覆盖 3xx 等非 2xx、非 4xx、非 5xx 状态                    |
| 删除 Mock client 的 amount 防御校验   | 不建议；client 可被独立调用，边界防御有测试价值                     |
| 给 `SandboxNetwork` 注入 clock        | 已实现：构造器已有 `now: () => number`                              |
| 创建 `.env.example`                   | 已存在且已被提交                                                    |
| 给 Vite 配 `envPrefix: "T0_"`         | 不需要；该路径运行在 server side，当前使用 `process.env` 是正确方向 |
| 把 `.env.example` 加入 `.gitignore`   | 不正确；模板应跟踪，只有真实 `.env*` secret 文件应忽略              |
| 拆分 `quote-mapper.ts`                | 当前约 159 行且分区清楚，继续拆分属于过度设计                       |
| 把无效 expiration 当 epoch            | 不正确；应视为上游非法响应                                          |

---

## 8. 测试覆盖图与缺口

```text
CODE PATHS                                             USER FLOWS
[+] SandboxNetwork.getQuote                           [+] OFI 获取报价
  ├─ [★★★ TESTED] amount <= 0                           ├─ [★★ TESTED] mock quote 成功
  ├─ [★★★ TESTED] unsupported currency                  ├─ [★★ TESTED] HTTP live GetQuote
  └─ OfiT0Client                                        └─ [GAP] 非 finite / 超大 amount
       ├─ Mock
       │   ├─ [★★★ TESTED] no quote
       │   └─ [★★★ TESTED] best quote
       └─ HTTP                                        [+] OFI 创建支付
           ├─ [★★★ TESTED] 200 spec JSON                ├─ [★★★ TESTED] 本地 quote → payment
           ├─ [★★★ TESTED] Connect wire JSON             └─ [CRITICAL GAP] HTTP quote → payment
           ├─ [★★★ TESTED] 401/4xx/5xx/timeout
           ├─ [★★★ TESTED] invalid JSON/missing fields
           └─ [WRONG EXPECTATION] invalid expiration → epoch
```

图例：★★★ 包含错误/边界路径；★★ 仅证明主要成功路径；`CRITICAL GAP` 表示没有测试且当前实现已复现失败。

### 8.1 必须新增/修改的测试

| 优先级 | 测试                                                   | 断言                                                |
| ------ | ------------------------------------------------------ | --------------------------------------------------- |
| P0     | `HTTP quote → SandboxNetwork.getQuote → createPayment` | 同一外部 quote id 可创建支付并保持幂等              |
| P0     | 外部 quote 过期                                        | 返回 `REASON_QUOTE_EXPIRED`，并从 cache 清理        |
| P1     | 无效 expiration                                        | 返回 `REASON_UPSTREAM_ERROR`，不是 EXPIRED          |
| P1     | Currency 单一事实源                                    | `SUPPORTED_CURRENCIES` 的每个 code 都可构造 `Quote` |
| P1     | 任意合法 amount                                        | 不依赖 `VolumeBand` 断言仍可完成 GetQuote           |
| P2     | env 配置                                               | 非法 mode、空 key、NaN/0 timeout 均 fail fast       |
| P2     | cache 上限                                             | 超限时淘汰过期/最旧 quote，不无限增长               |

禁止再用 `describe.skip` 保留迁移前测试。迁移后的行为应转移到 Mock client 或跨步骤回归测试；无价值的旧测试直接删除。

---

## 9. 生产失败模式

| 路径                           | 现实故障                                | 当前测试            | 当前处理                   | 用户结果                                    |
| ------------------------------ | --------------------------------------- | ------------------- | -------------------------- | ------------------------------------------- |
| HTTP GetQuote → Create Payment | 外部 quote 不在本地 snapshot            | ❌                  | 返回 INVALID_QUOTE_ID      | 静默显示结果 JSON，完整流程失败             |
| expiration 解析                | 上游返回非法 Timestamp                  | ⚠️ 测试固化错误行为 | 改写为 epoch               | 错误显示为 quote expired                    |
| HTTP timeout                   | 上游超过超时                            | ✅                  | `UPSTREAM`                 | 友好错误                                    |
| HTTP 401                       | key 缺失/错误                           | ✅                  | `UNAUTHORIZED`             | 友好错误                                    |
| HTTP 4xx                       | method/currency/body 不符合合约         | ✅                  | `BAD_REQUEST`              | 友好错误                                    |
| HTTP 5xx/非 JSON               | 上游异常                                | ✅                  | `UPSTREAM`                 | 友好错误                                    |
| 非 finite amount               | NaN/Infinity 绕过 `<= 0`                | ❌                  | mapper 抛错后变成 UPSTREAM | 错误分类不准确                              |
| 多实例部署                     | GetQuote 与 Create Payment 落到不同实例 | ❌                  | 内存状态不共享             | quote 丢失；当前 sandbox 全局状态均有此限制 |

当前 critical gap 数：**1**（HTTP quote → payment）。

---

## 10. 优化后的实施顺序

### Phase 0：先锁回归

1. 新增失败的跨步骤测试：外部 quote 获取后立即创建支付。
2. 新增无效 expiration 应返回 UPSTREAM 的回归测试。
3. 保留当前 109 个目标测试作为行为基线。

### Phase 1：修 P0/P1

1. 在 `SandboxNetwork` 增加有界、TTL-aware 的外部 quote registry。
2. `getQuoteById()` 同时解析本地 provider quote 和外部 OFI quote。
3. 统一 `Currency` 单一事实源。
4. 解除 `Quote.band` 对任意询价金额的不安全断言。
5. 修复 expiration 非法值的错误分类。

### Phase 2：配置和诊断

1. 对 mode、base URL、API key、timeout 做启动时校验。
2. 记录去敏后的上游失败上下文。
3. 把 `reason=10` 提取为有来源说明的兼容常量。

### Phase 3：验证门禁

依次运行：

```bash
bun test src/lib/t0/quote-mapper.test.ts \
  src/lib/t0/ofi-client.test.ts \
  src/lib/t0/ofi.test.ts \
  src/lib/t0/network.test.ts \
  src/lib/t0/quote-message.test.ts

bun run typecheck
bun run lint
bun test
```

然后执行两条用户路径：

```text
mock: publish quote → Get Quote → Create Payment → payout success
http: live Get Quote → Create Payment → 明确的成功或上游业务失败
```

放行条件：

- 目标测试、全量测试、typecheck、lint 全部通过；
- HTTP quote → payment 的回归测试通过；
- live 验证报告覆盖 Create Payment，不再只覆盖 GetQuote；
- 文档状态再从“审计未通过”改为“已完成”。

---

## 11. 预计文件改动

| 文件                                          | 必要改动                                      |
| --------------------------------------------- | --------------------------------------------- |
| `src/lib/t0/network.ts`                       | 外部 quote registry、双来源解析、TTL/容量控制 |
| `src/lib/t0/network.test.ts` 或 `ofi.test.ts` | HTTP quote → payment 回归路径                 |
| `src/lib/t0/ofi-client.ts`                    | expiration、配置/响应校验、兼容常量           |
| `src/lib/t0/ofi-client.test.ts`               | 修正 invalid expiration 预期，补配置边界      |
| `src/lib/t0/types.ts`                         | 统一 Currency；明确 Quote amount 类型         |
| `src/lib/t0/currencies.ts`                    | 保持单一事实源，必要时只导出类型              |
| `src/lib/t0/quote-mapper.ts`                  | 删除不安全 cast 或适配新类型                  |
| `src/lib/t0/quote-mapper.test.ts`             | 任意 amount 与 currency 覆盖                  |
| `src/lib/t0/index.ts`                         | env fail-fast 校验                            |

该修复集中在同一 `t0` 模块并共享核心类型，建议顺序实施，不建议拆并行 worktree。

---

## 12. 环境变量

```bash
# mock（默认）或 http；其他值应报错
T0_QUOTE_CLIENT_MODE=mock

# OFI → agtpay 拉取方向
T0_OFI_API_BASE_URL=https://api.agtpay.xyz
T0_OFI_API_KEY=
T0_OFI_TIMEOUT_MS=5000
T0_OFI_PAYMENT_METHOD=PAYMENT_METHOD_TYPE_SEPA
```

规则：

- server-side 代码使用 `process.env`，不需要把 secret 暴露给 `import.meta.env`。
- `.env.example` 应提交，但不得包含真实 key。
- `.env`、`.env.local`、`.env.*.local` 必须保持在 `.gitignore`。
- 生产 secret 通过部署平台 secret 管理注入。

---

## 13. NOT in scope

| 项                                                     | 原因                                                     |
| ------------------------------------------------------ | -------------------------------------------------------- |
| 修改 provider → agtpay 的 `HttpT0Client.updateQuote()` | 与 OFI 拉取方向职责不同                                  |
| 重写 `/ofi` UI                                         | 本方案保持 UI 运行时交互和返回形状不变                   |
| 接入真实 Create Payment API                            | 端点合约尚未在本文确认；当前先修 sandbox 内 quote 连续性 |
| 引入 Redis/数据库                                      | 当前项目是内存型 sandbox；多实例生产化另立方案           |
| 抽共享 HTTP framework                                  | 目前只有两个小 client，抽象收益不足                      |
| 拆分 `quote-mapper.ts`                                 | 当前规模和分区可读性足够                                 |
| 处理仓库所有既有 typecheck 错误                        | 只要求本改动不新增错误；全仓清理另立任务                 |
| 大响应流式解析/1MB 限制                                | 当前 quote payload 很小，先不增加复杂度                  |

---

## 14. 审计完成摘要

- Step 0 Scope Challenge：保留现有 client/mapper 架构，范围收敛到 quote 连续性和类型边界。
- Architecture Review：1 个 P0、2 个 P1 架构问题。
- Code Quality Review：3 个需要修正的边界/配置问题。
- Test Review：已画覆盖图；发现 1 个 critical gap。
- Performance Review：HTTP payload 无明显瓶颈；新增 registry 时必须有 TTL 和容量上限。
- What already exists：已记录。
- NOT in scope：已记录。
- Parallelization：顺序实施，无可靠并行机会。
- 当前判定：**DONE_WITH_CONCERNS；GetQuote 可用，完整 OFI 流程未放行。**

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                       | Runs | Status      | Findings                    |
| ------------- | --------------------- | ------------------------- | ---: | ----------- | --------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy          |    0 | —           | 后端重构，无需单独产品审计  |
| Codex Review  | `/codex review`       | Independent 2nd opinion   |    0 | —           | 未运行                      |
| Eng Review    | `/plan-eng-review`    | Architecture & tests      |    1 | ISSUES OPEN | 8 项发现，1 个 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps                |    0 | —           | UI 不在本次范围             |
| DX Review     | `/plan-devex-review`  | Developer experience gaps |    0 | —           | 未运行                      |

- **UNRESOLVED**：HTTP quote 的后续消费仍未实现。
- **VERDICT**：ENG NOT CLEARED；完成 A1-A5 并通过门禁后再实施/放行。
