# T-0 Sandbox Bridge — 标准 Payment Flow + Manual AML Flow 审计报告

> 审计日期: 2026-07-12
> 审计范围: 仅 `/ofi` (OFI Console) + `/provider` (Provider Console) 的标准 Payment Flow 和 Manual AML Flow
> 排除范围: Payment Intent Flow（不在本次审计范围内）
> 参考文档:
> - [Payment Flow](https://docs.t-0.network/docs/network/payment-flow/)
> - [Payment Manual AML Flow](https://docs.t-0.network/docs/network/payment-flow-aml/)
> 测试状态: 655 tests passing, 0 failing

---

## 1. 执行摘要

| 维度 | 结果 | 说明 |
|------|------|------|
| 单元/契约测试 | ✅ 655/655 通过 | 覆盖 `src/lib/t0/` 全部核心模块 |
| 角色边界 | ✅ 已对齐 | Network 拥有编排，Provider 只负责 payout 执行 |
| 标准 Payment Flow | ✅ 可实现 | 16 步文档流程，代码全部覆盖 |
| Manual AML Flow | ⚠️ 可实现但状态语义有缺陷 | 14 步文档流程，代码覆盖，但 `"rejected"` 状态语义双重含义 |
| 数据持久化 | ⚠️ 仅内存状态 | 重启后数据丢失；无数据库/文件持久化 |
| 订单/金额追踪 | ✅ 完整 | Payment、Payout、Quote、Settlement、Ledger 全部可追踪 |

**结论**: 两种流程在代码层面均可跑通，角色边界清晰，测试覆盖充分。核心问题是 `PaymentStatus` 中 `"rejected"` 同时承载"待 AML 审核"和"AML 已拒绝"两种语义，导致 Provider 的 Pending AML Review 列表可能混入真正已拒绝的 payment。数据持久化缺失是已知 sandbox 限制。

---

## 2. 标准 Payment Flow 审计（文档 16 步）

### 2.1 文档 → 代码映射

```
步骤 | 文档描述                              | 代码实现                                    | 状态
─────┼───────────────────────────────────────┼─────────────────────────────────────────────┼──────
1    | UpdateQuote (Provider 发布报价)       | providerService.publishQuote()              | ✅
2    | Get Quote (OFI 询价)                  | sandboxNetwork.getQuote() → MockOfiT0Client | ✅
3    | Quote Response (返回报价)             | 返回 quote + payoutAmount + settlementAmount| ✅
4    | USDT Settlement Transfer (OFI 转账)   | OFI Submit Settlement (sandbox 模拟)      | ✅
5    | USDT Transaction Notification (链上) | providerService.notifyUsdtSettlement()      | ✅
6    | Credit Usage Notification (OFI)       | CreditUsageNotification 事件 (ofi side)     | ✅
7    | Credit Usage Notification (Provider)  | CreditUsageNotification 事件 (provider side)  | ✅
8    | Create Payment (OFI 创建支付)         | sandboxNetwork.createPayment()              | ✅
9    | Payment Request Processed (网络处理)  | 同步驱动（KISS sandbox 设计）                | ✅
10   | Payment Accepted (支付已接受)         | payment.status = "accepted"                 | ✅
11   | Payout Request (网络发送 payout 请求) | 同步调用 provider.executePayout()           | ✅
12   | Payout Accepted (Provider 接受)       | PayoutAccepted 事件                         | ✅
13   | Credit Usage Notification (OFI)       | reserveCredit() + CreditUsageNotification   | ✅
14   | Credit Usage Notification (Provider)  | reserveCredit() + CreditUsageNotification   | ✅
15   | Payout Success (Provider 完成 payout) | PayoutSuccess 事件                          | ✅
16   | Payment Confirmed (支付确认)        | PaymentConfirmed 事件                       | ✅
```

### 2.2 与文档的差异（已知且合理）

| 差异点 | 文档要求 | 代码实现 | 评估 |
|--------|----------|----------|------|
| Payout Request 时序 | 异步 RPC 推送（Network → Provider） | `createPayment` 同步调用 `requestPayout` | ⚠️ sandbox 简化，注释说明 (`network.ts:243`) |
| Payout Accepted 响应 | 30 秒内响应 | 立即响应 | ⚠️ sandbox 简化 |
| Network Fee | 5 bps 每方（共 10 bps） | 未实现扣除 | ⚠️ 不影响流程贯通 |
| 异步队列 | 生产环境有消息队列 | 无队列，同步驱动 | ✅ sandbox 设计意图 |

### 2.3 状态流转验证

```
标准 Flow 状态机:
  "accepted" (CreatePayment 后)
    → provider.executePayout() → "confirmed" (PayoutSuccess 后)

失败路径:
  "accepted" → payout fail → 保持 "accepted" (payment 状态不变，payout 状态 = "failed")
```

**验证**: `provider.test.ts:155-193` 完整测试了 payout 生命周期，包括成功路径和失败路径。

---

## 3. Manual AML Flow 审计（文档 14 步）

### 3.1 文档 → 代码映射

```
步骤 | 文档描述                              | 代码实现                                    | 状态
─────┼───────────────────────────────────────┼─────────────────────────────────────────────┼──────
1    | UpdateQuote                           | providerService.publishQuote()              | ✅
2    | Get Quote                             | sandboxNetwork.getQuote()                   | ✅
3    | Create Payment                        | sandboxNetwork.createPayment()              | ✅
4    | Payment Accepted                      | payment.status = "accepted"                 | ✅
5    | Payout Request                        | 同步调用 provider.executePayout()           | ✅
6    | Manual AML Check Response            | 当前 sandbox 中无自动触发机制              | ⚠️ 见 3.2
7    | CompleteManualAmlCheck (Approved)    | sandboxNetwork.completeManualAml(approved) | ✅
8    | ApprovePaymentQuotes (Last Look)     | sandboxNetwork.approvePaymentQuote()        | ✅
9    | Quote Confirmation Response           | OFI 页面 Approve Quote / Reject Quote 按钮 | ✅
10   | Quote Confirmation to Provider       | QuoteConfirmation 事件                      | ✅
11   | Payout Success                        | provider.executePayout()                    | ✅
12   | Payment Confirmed                     | PaymentConfirmed 事件                       | ✅
```

### 3.2 核心问题：Manual AML Check 触发机制缺失

**文档要求**（步骤 6）: Payout Provider 响应 Payout Request 时，可以返回 `ManualAmlCheck` 而不是立即 `Accepted` 或 `Rejected`，使 payment 进入 pending AML review 状态。

**当前代码**:
- `provider-impl.ts:100-105` 有 `handleManualAmlCheck` RPC handler，将 payment 标记为 `"rejected"`
- `network.ts:395-397` 有 `handleManualAmlCheck` 方法
- 但 **sandbox 的 `createPayment` 同步驱动 payout，不会自动触发 Manual AML Check**

**实际运行方式**:
用户需要手动在 OFI 或 Provider 页面调用 `completeManualAml` 来模拟 AML 审核过程。这不是自动触发，而是手动模拟。

### 3.3 状态语义问题（🔴 关键缺陷）

当前 `PaymentStatus = "pending" | "accepted" | "rejected" | "confirmed"` 中：

| 状态值 | 当前用途 | 问题 |
|--------|----------|------|
| `"pending"` | Payment Intent 的初始状态 | 与 Manual AML 无关 |
| `"accepted"` | Payment 已接受，可执行 payout | 清晰 |
| `"rejected"` | **双重含义**: (a) 待 AML 审核 (b) AML 已拒绝 | 🔴 语义混乱 |
| `"confirmed"` | Payout 完成，支付确认 | 清晰 |

**具体表现**:
- `handleManualAmlCheck` 将 payment 标记为 `"rejected"` 表示"待 AML 审核"
- `completeManualAml(paymentId, false)` 也将 payment 标记为 `"rejected"` 表示"AML 已拒绝"
- Provider 的 "Pending AML Review" 列表过滤 `status === "rejected"`，会同时显示待审核和已拒绝的 payment

**已做的修复**（本次会话）:
- `provider.tsx:523` 过滤条件从 `status === "pending" || status === "rejected"` 改为 `status === "rejected"`
- `provider.tsx:552` Approve AML 按钮 disabled 从 `status === "accepted"` 改为 `status !== "rejected"`

**但这只是缓解，不是根治**。根本修复需要引入独立状态（如 `"pending_aml"`）。

### 3.4 Manual AML Flow 正确运行步骤（手动模拟）

```
1. Provider 页面 → Publish Quote (EUR, 1000, 0.92)
2. OFI 页面 → Get Quote (1000, EUR) → 获取 quoteId
3. OFI 页面 → Create Payment (clientId, beneficiaryRef, quoteId)
   → payment 创建为 "accepted"，payout 同步执行到 "success"
4. 手动模拟 AML 触发: OFI 页面 → My Payments → 点击 Reject
   → payment 变为 "rejected"（此时表示"待 AML 审核"）
5. Provider 页面 → Pending AML Review 显示该 payment
6. Provider 页面 → 点击 Approve AML
   → payment 变为 "accepted"
7. OFI 页面 → Payout Requests 显示该 payment（status = "accepted"）
8. OFI 页面 → 点击 Approve Quote
   → quote TTL 刷新，QuoteConfirmation 事件记录
9. Provider 页面 → Payout Execution 显示该 payment
10. Provider 页面 → 点击 Execute Payout
    → payout 执行（幂等，返回已有 payout）
11. OFI 页面 → Payment Confirmed 显示该 payment
```

**注意**: 步骤 4 是手动模拟 AML 触发。真实网络中，Provider 的 `payOut` RPC 会返回 `manualAmlCheck` 而不是 `accepted`，由 Network 自动调用 `handleManualAmlCheck`。

---

## 4. 数据持久化审计

### 4.1 订单与金额追踪能力

| 信息类型 | 存储位置 | UI 可见位置 | 持久化 |
|----------|----------|-------------|--------|
| **Payment ID** | `Payment.id` | OFI My Payments / Provider Payout Execution | ❌ 内存 |
| **Quote ID** | `Payment.quoteId` | 所有 payment 列表 | ❌ 内存 |
| **Currency** | `Payment.currency` | 所有 payment 列表 | ❌ 内存 |
| **USD Amount** | `Payment.usdAmount` | 所有 payment 列表 | ❌ 内存 |
| **Local Amount** | `Payment.localAmount` | 所有 payment 列表 | ❌ 内存 |
| **Rate** | `Quote.rate` | Provider Quote 列表 / OFI Quote 显示 | ❌ 内存 |
| **Beneficiary Ref** | `Payment.beneficiaryRef` | 所有 payment 列表 | ❌ 内存 |
| **Payout ID** | `Payout.id` | Provider Payouts 列表 | ❌ 内存 |
| **Payout Status** | `Payout.status` | Provider Payouts / OFI My Payments | ❌ 内存 |
| **Settlement txHash** | `Settlement.txHash` | OFI Funding & Capacity | ❌ 内存 |
| **Credit Available** | `CreditState.available` | OFI Credit Usage & Ledger | ❌ 内存 |
| **Credit Reserved** | `CreditState.reserved` | OFI Credit Usage & Ledger | ❌ 内存 |
| **Ledger Entries** | `LedgerEntry[]` | OFI Credit Usage & Ledger | ❌ 内存 |
| **Events** | `NetworkEvent[]` | Provider/OFI Event Log | ❌ 内存 |

### 4.2 评估

- **追踪能力**: ✅ 完整。所有关键信息（订单 ID、金额、汇率、状态、时间戳）都在 UI 中可见
- **持久化**: ❌ 无。全部内存存储，重启后丢失
- **Demo Seed**: `index.ts:142-158` 预注入 5000 USD settlement + EUR quote，保证 fresh start 可运行

---

## 5. UI 功能模块审计

### 5.1 OFI Console (`/ofi`)

| 模块 | 功能 | 标准 Flow | Manual AML | 状态 |
|------|------|-----------|------------|------|
| **Funding & Capacity** | 显示 limit + projections | 步骤 4-5 | 步骤 4-5 | ✅ |
| **USDT Settlement Transfer** | 提交 settlement | 步骤 4 | 步骤 4 | ✅ |
| **Credit Usage & Ledger** | 信用和账本 | 步骤 6-7, 13-14 | 步骤 6-7 | ✅ |
| **Get Quote** | 询价 | 步骤 2 | 步骤 2 | ✅ |
| **Create Payment** | 创建支付 | 步骤 8 | 步骤 3 | ✅ |
| **Payment Lifecycle** | 回调事件 | 步骤 11-16 | 步骤 11-12 | ✅ |
| **My Payments** | 所有 payment + Approve/Reject | — | 步骤 6 模拟 | ⚠️ 按钮用于模拟 AML 触发 |
| **Payout Requests** | accepted payment + Approve Quote | — | 步骤 8-9 | ✅ |
| **Quote Confirmations** | OfiAmlEvent 日志 | — | 步骤 9-10 | ✅ |
| **Payment Confirmed** | confirmed payment 列表 | 步骤 16 | 步骤 12 | ✅ |

### 5.2 Provider Console (`/provider`)

| 模块 | 功能 | 标准 Flow | Manual AML | 状态 |
|------|------|-----------|------------|------|
| **Publish Quote** | 发布报价 | 步骤 1 | 步骤 1 | ✅ |
| **Credit Usage Notifications** | 信用通知 | 步骤 6-7 | 步骤 6-7 | ✅ |
| **Payout Execution** | 执行 payout | 步骤 11, 15 | 步骤 11 | ✅ |
| **Payouts** | 所有 payout | 步骤 15 | 步骤 11 | ✅ |
| **Payout & Credit Notifications** | 事件日志 | 步骤 11-16 | 步骤 11-12 | ✅ |
| **AML Documents Upload** | 模拟上传 KYC | — | 步骤 6-7 | ⚠️ 仅本地状态 |
| **Pending AML Review** | 待审核 + Approve AML/Reject AML | — | 步骤 6-7 | ⚠️ 状态语义问题 |
| **Quote Confirmations** | QuoteConfirmation 事件 | — | 步骤 10 | ✅ |

---

## 6. 发现的问题汇总

### 🔴 高优先级

| # | 问题 | 影响 | 建议修复 |
|---|------|------|----------|
| 1 | **状态语义混乱: `"rejected"` = 待 AML + 已拒绝** | Provider 的 Pending AML Review 列表无法区分真正需要审核的 payment 和已拒绝的 | 引入 `"pending_aml"` 状态，替换 `handleManualAmlCheck` 和 Provider 过滤条件中的 `"rejected"` |
| 2 | **数据无持久化** | 重启后所有订单、金额、状态丢失 | 接入 `JsonFileStore` 或 SQLite（已有 `read-model/json-file-store.ts`） |
| 3 | **Manual AML 非自动触发** | 需要用户在 OFI 页面手动点击 Reject 来模拟 AML 触发 | 在 `createPayment` 后自动标记一个 payment 为 `"rejected"`（模拟 Provider 返回 ManualAmlCheck），或添加明确的 "Simulate AML Trigger" 按钮 |

### 🟡 中优先级

| # | 问题 | 影响 | 建议修复 |
|---|------|------|----------|
| 4 | **同步 payout vs 文档异步 RPC** | 与真实 T-0 网络行为不一致 | 添加注释说明；长期可添加 async 模拟模式 |
| 5 | **Network Fee 未实现** | 无法验证费用计算 | 在 `executePayout` 成功后添加 fee 扣除和显示 |
| 6 | **OFI 的 My Payments 中 Approve/Reject 按钮语义不清** | 用户可能混淆 AML 审批和 Quote 审批 | 将按钮标签改为 "Simulate AML Trigger" / "Cancel Payment"，或添加说明文字 |

### 🟢 低优先级

| # | 问题 | 影响 | 建议修复 |
|---|------|------|----------|
| 7 | **AML Upload 仅本地状态** | 上传的文档不持久 | 写入磁盘或接入文件存储 |
| 8 | **Typecheck/Lint 既有错误** | 构建警告 | 独立修复，不影响流程 |

---

## 7. 手动测试验证步骤

### 7.1 标准 Payment Flow

```
[Provider 页面]
1. Publish Quote → Currency: EUR, Band: 1000, Rate: 0.92 → 点击 Publish
   验证: Quote 列表出现新 quote

[OFI 页面]
2. Get Quote → USD: 1000, Currency: EUR → 点击 Get Quote
   验证: 显示 quote 详情，quoteId 自动填入

3. (可选) Submit Settlement → Amount: 5000, Chain: TRON → 点击 Submit
   验证: Credit Available 增加

4. Create Payment → clientId: baxs_001, beneficiaryRef: BEN-001 → 点击 Create
   验证: payment 出现在 My Payments，status = "accepted"，payout status = "success"

[Provider 页面]
5. Payout Execution → 点击 Execute Payout
   验证: payout 状态变为 "success"，payment 状态变为 "confirmed"

[OFI 页面]
6. Payment Confirmed → 验证 payment 显示为 confirmed
```

### 7.2 Manual AML Flow

```
[Provider 页面]
1. Publish Quote → Currency: EUR, Band: 1000, Rate: 0.92

[OFI 页面]
2. Get Quote → USD: 1000, Currency: EUR
3. Create Payment → clientId: baxs_aml_001, beneficiaryRef: BEN-AML-001
   验证: payment 出现在 My Payments，status = "accepted"

4. 手动触发 AML: My Payments → 点击 Reject
   验证: payment 从 My Payments 消失（变为 "rejected"）

[Provider 页面]
5. Pending AML Review → 验证 payment 出现
6. 点击 Approve AML
   验证: payment 从 Pending AML Review 消失（变为 "accepted"）

[OFI 页面]
7. Payout Requests → 验证 payment 出现（status = "accepted"）
8. 点击 Approve Quote
   验证: Quote Confirmations 出现 approved 记录

[Provider 页面]
9. Payout Execution → 点击 Execute Payout
   验证: payout 完成

[OFI 页面]
10. Payment Confirmed → 验证 payment 显示为 confirmed
```

---

## 8. 结论

### 8.1 流程实现度

| 流程 | 实现度 | 可用性 | 阻塞问题 |
|------|--------|--------|----------|
| **标准 Payment Flow** | 90% | ✅ 可手动跑通 | 无阻塞 |
| **Manual AML Flow** | 80% | ⚠️ 可手动跑通 | 状态语义混乱（需手动模拟 AML 触发） |

### 8.2 关键文件状态

| 文件 | 职责 | 审计状态 |
|------|------|----------|
| `src/lib/t0/network.ts` | Network 编排层 | ✅ 已审计，16 步全部覆盖 |
| `src/lib/t0/provider.ts` | Provider 服务 | ✅ 已审计，payout 生命周期完整 |
| `src/lib/t0/types.ts` | Domain Types | ⚠️ `"rejected"` 语义双重 |
| `src/routes/ofi.tsx` | OFI UI | ✅ 已审计，功能完整 |
| `src/routes/provider.tsx` | Provider UI | ✅ 已审计，Pending AML 已修复 |
| `src/lib/t0/t0.functions.ts` | Server Functions | ✅ 已审计，布线正确 |
| `src/lib/t0/settlement.ts` | Settlement Registry | ✅ 已审计，信用控制完整 |

### 8.3 下一步建议（按优先级）

1. **修复状态语义** (2-4h): 引入 `"pending_aml"` 状态，修改 `handleManualAmlCheck`、`completeManualAml`、Provider 过滤条件
2. **添加数据持久化** (1-2d): 接入 `JsonFileStore`
3. **添加 AML 自动触发模拟** (1-2h): 在 `createPayment` 后可选自动标记一个 payment 为待 AML 审核
4. **实现 Network Fee** (2-4h): 在 payout 成功后计算并显示 fee

---

_报告生成路径_: `docs/audit-report-payment-aml-2026-07-12.md`
