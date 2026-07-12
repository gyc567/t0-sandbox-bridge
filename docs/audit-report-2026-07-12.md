# T-0 Sandbox Bridge — 模块审计与流程验证报告

> 审计日期: 2026-07-12
> 审计范围: `/ofi` (OFI Console) + `/provider` (Provider Console)
> 参考文档:
> - [Payment Flow](https://docs.t-0.network/docs/network/payment-flow/)
> - [Payment Intent Flow](https://docs.t-0.network/docs/network/payment-intent-flow/)
> - [Payment Manual AML Flow](https://docs.t-0.network/docs/network/payment-flow-aml/)
> 测试状态: 655 tests passing, 0 failing

---

## 1. 执行摘要

| 维度 | 结果 | 说明 |
|------|------|------|
| 单元/契约测试 | ✅ 655/655 通过 | 覆盖 `src/lib/t0/` 全部核心模块 |
| 角色边界 | ✅ 已对齐 | Network 拥有编排，Provider 只负责 payout 执行 |
| 标准 Payment Flow | ⚠️ 部分实现 | 同步 payout 驱动（非 async RPC），缺少真正的 PayoutRequest 延迟 |
| Manual AML Flow | ⚠️ 可实现但状态语义混乱 | `rejected` 同时表示"待 AML 审核"和"已拒绝" |
| Payment Intent Flow | ⚠️ 骨架存在，流程未贯通 | `createPaymentIntent` + `confirmFunds` 有代码，但 UI 未提供完整入口 |
| 数据持久化 | ⚠️ 仅内存状态 | 重启后数据丢失；无数据库/文件持久化 |
| E2E 验证 | ❌ deep-check 脚本过期 | 需重写以匹配新版 Console UI |

**结论**: 代码结构正确，角色边界清晰，但三种流程的 UI 贯通度和状态语义存在差异。Payment Intent Flow 尚未在 UI 上完整打通。

---

## 2. 架构与角色边界审计

### 2.1 角色职责划分（✅ 已对齐文档）

| 角色 | 职责 | 对应代码 |
|------|------|----------|
| **OFI (Payout Requester)** | GetQuote → CreatePayment → 资金结算 → 接收确认 | `src/routes/ofi.tsx`, `OFIService` |
| **Network (Orchestrator)** | 验证 quote、路由 payout、管理状态机、信用控制 | `SandboxNetwork` |
| **Provider (Payout Provider)** | 发布 quote、执行 payout、AML 审核 | `PayoutProviderService`, `src/routes/provider.tsx` |
| **Pay-In Provider** | 接收法币、确认资金（仅 Payment Intent） | 当前 sandbox 中未独立建模 |

### 2.2 关键边界护栏（✅ 已验证）

```
provider-boundary.test.ts:
  ✅ PayoutProviderService 不暴露 acceptPayment/completeManualAml/approvePaymentQuote
  ✅ SandboxNetwork 暴露全部编排方法
  ✅ OFIService.createPayment 通过 Network 路由

t0.functions.boundary.test.ts:
  ✅ requestPayoutFn → sandboxNetwork.requestPayout
  ✅ completeManualAmlFn → sandboxNetwork.completeManualAml
  ✅ approvePaymentQuoteFn → sandboxNetwork.approvePaymentQuote
  ✅ createPaymentIntentFn → sandboxNetwork.createPaymentIntent
  ✅ confirmFundsFn → sandboxNetwork.confirmFunds
```

---

## 3. 流程映射与审计

### 3.1 标准 Payment Flow（文档 16 步）

```
文档步骤                          代码实现状态
─────────────────────────────────────────────────────────────────
1. UpdateQuote (Provider)        ✅ providerService.publishQuote()
2. GetQuote (OFI)                ✅ sandboxNetwork.getQuote() → MockOfiT0Client
3. Quote Response               ✅ 返回 quote + payoutAmount + settlementAmount
4. USDT Settlement Transfer      ✅ OFI 提交 settlement (Submit Settlement)
5. USDT Transaction Notification   ✅ providerService.notifyUsdtSettlement()
6. Credit Usage (OFI)            ✅ CreditUsageNotification 事件
7. Credit Usage (Provider)       ✅ CreditUsageNotification 事件
8. Create Payment                ✅ sandboxNetwork.createPayment()
9. Payment Request Processed     ✅ 同步驱动（KISS sandbox）
10. Payment Accepted             ✅ payment.status = "accepted"
11. Payout Request               ✅ 同步调用 provider.executePayout()
12. Payout Accepted              ✅ PayoutAccepted 事件
13. Credit Usage (OFI)           ✅ 预留信用 (reserveCredit)
14. Credit Usage (Provider)      ✅ 预留信用通知
15. Payout Success               ✅ PayoutSuccess 事件
16. Payment Confirmed            ✅ PaymentConfirmed 事件
```

**差异点**:
- 文档中的 Payout Request (步骤 11) 是 Network 通过 RPC 异步推送给 Provider；sandbox 中是 `createPayment` 同步调用 `requestPayout` 完成。这在 `network.ts:244` 有明确注释说明是 KISS 设计。
- 文档中的 Payout Accepted (步骤 12) 是 Provider 在 30 秒内响应；sandbox 中是立即响应。
- 文档中的 fee 是 5 bps 每方（共 10 bps）；sandbox 中未实现 fee 扣除逻辑。

### 3.2 Manual AML Flow（文档 14 步）

```
文档步骤                              代码实现状态
─────────────────────────────────────────────────────────────────
1. UpdateQuote                        ✅ 同标准流程
2. Get Quote                          ✅ 同标准流程
3. Create Payment                     ✅ 同标准流程
4. Payment Accepted                   ✅ 同标准流程
5. Payout Request                     ✅ 同标准流程（同步）
6. Manual AML Check Response          ⚠️ handleManualAmlCheck 标记为 "rejected"
7. CompleteManualAmlCheck (Approved)  ✅ sandboxNetwork.completeManualAml(approved=true)
8. ApprovePaymentQuotes (Last Look)   ✅ sandboxNetwork.approvePaymentQuote()
9. Quote Confirmation Response          ✅ OFI 页面 Approve Quote / Reject Quote 按钮
10. Quote Confirmation to Provider     ✅ QuoteConfirmation 事件
11. Payout Success                     ✅ 同标准流程
12. Payment Confirmed                  ✅ 同标准流程
```

**关键问题**:
- `handleManualAmlCheck` 将 payment 标记为 `"rejected"`，但 `"rejected"` 也是 AML 拒绝后的最终状态。这导致：
  - Provider 的 "Pending AML Review" 列表会显示所有 `rejected` 的 payment，包括真正已拒绝的
  - 状态语义不清晰，无法区分 "待审核" vs "已拒绝"
- **已修复**: `provider.tsx` 的过滤条件从 `status === "pending" || status === "rejected"` 改为 `status === "rejected"`，按钮 disabled 逻辑也相应调整。
- 但根本问题仍在：`"rejected"` 不应同时表示两种状态。建议引入 `"pending_aml"` 或 `"review"` 状态。

### 3.3 Payment Intent Flow（文档 6 阶段）

```
文档阶段                              代码实现状态
─────────────────────────────────────────────────────────────────
Phase 1: Quote Discovery (Optional)   ✅ GetQuote 已存在
Phase 2: Create Payment Intent        ✅ sandboxNetwork.createPaymentIntent()
Phase 3: End-User Payment             ❌ 未在 UI 中建模
Phase 4: Confirm Funds Received       ✅ sandboxNetwork.confirmFunds()
Phase 5: Settlement Notification        ⚠️ 事件系统存在，但 UI 未展示
Phase 6: Settlement (Async)           ⚠️ 同标准流程的 settlement
```

**关键问题**:
- `createPaymentIntent` 和 `confirmFunds` 在 `network.ts` 和 `t0.functions.ts` 中都有实现，但 **OFI UI 中没有入口**。
- OFI 页面当前只有 "Create Payment"（直接走标准流程），没有 "Create Payment Intent" 按钮。
- 这意味着 Payment Intent Flow 在 UI 上完全不可见，代码是"死代码"。

---

## 4. 数据持久化审计

### 4.1 当前状态存储

| 数据类型 | 存储方式 | 持久化 | 重启后 |
|----------|----------|--------|--------|
| Quotes | `Map<string, Quote>` (内存) | ❌ 无 | 丢失 |
| Payments | `Map<string, Payment>` (内存) | ❌ 无 | 丢失 |
| Payouts | `Map<string, Payout>` (内存) | ❌ 无 | 丢失 |
| Events | `NetworkEvent[]` (内存) | ❌ 无 | 丢失 |
| Settlement Ledger | `SettlementRegistry` (内存) | ❌ 无 | 丢失 |
| Read Model | `InMemoryStore` (内存) | ❌ 无 | 丢失 |
| Callback Inbox | `CallbackInbox` (内存) | ❌ 无 | 丢失 |

### 4.2 Demo Seed 数据

`src/lib/t0/index.ts:142-158` 在模块加载时自动注入：
- 5000 USD 的 settlement（已确认）
- EUR/1000/0.92 的 quote（5 分钟 TTL）

这使得 fresh start 也能立即跑通 CreatePayment，但所有用户操作数据在重启后丢失。

### 4.3 建议

- 短期: 添加 `JsonFileStore` 实现（已有 `read-model/json-file-store.ts`），将关键数据写入磁盘
- 长期: 接入 PostgreSQL/SQLite 等真实数据库

---

## 5. UI 功能模块审计

### 5.1 OFI Console (`/ofi`) — 功能清单

| 模块 | 功能 | 状态 | 文档对应 |
|------|------|------|----------|
| **Funding & Capacity** | 显示 T-0 回调的 limit + projections | ✅ 工作 | Pre-Settlement §4-§7 |
| **USDT Settlement Transfer** | 提交 USDT settlement | ✅ 工作 | §4 USDT Settlement |
| **Credit Usage & Ledger** | 显示信用和账本 | ✅ 工作 | §6-§7 Credit Usage |
| **Get Quote** | 询价 | ✅ 工作 | §2 Get Quote |
| **Create Payment** | 创建支付（直接走标准流程） | ✅ 工作 | §8 Create Payment |
| **Payment Lifecycle** | 显示 PayoutAccepted/Success/Confirmed | ✅ 工作 | §11-§16 |
| **My Payments** | 显示所有 payment + Approve/Reject | ⚠️ 按钮存在但流程不清 | Manual AML |
| **Payout Requests** | 显示 accepted payment + Approve Quote/Reject Quote | ✅ 工作 | Last Look |
| **Quote Confirmations** | 显示 OfiAmlEvent | ✅ 工作 | Last Look |
| **Payment Confirmed** | 显示 confirmed payment | ✅ 工作 | §16 |
| **Create Payment Intent** | ❌ 缺失 | ❌ 未实现 | Payment Intent Phase 2 |
| **Confirm Funds** | ❌ 缺失 | ❌ 未实现 | Payment Intent Phase 4 |

### 5.2 Provider Console (`/provider`) — 功能清单

| 模块 | 功能 | 状态 | 文档对应 |
|------|------|------|----------|
| **Publish Quote** | 发布 quote | ✅ 工作 | §1 UpdateQuote |
| **Credit Usage Notifications** | 显示信用使用通知 | ✅ 工作 | §6-§7, §13-§14 |
| **Payout Execution** | 执行 payout | ✅ 工作 | §15 Payout Success |
| **Payouts** | 显示所有 payout | ✅ 工作 | §15 |
| **Payout & Credit Notifications** | 事件日志 | ✅ 工作 | §11-§16 |
| **AML Documents Upload** | 模拟上传 KYC/AML 文档 | ⚠️ 仅本地状态 | Manual AML |
| **Pending AML Review** | 显示待审核 payment + Approve AML/Reject AML | ✅ 已修复 | Manual AML §6-§7 |
| **Quote Confirmations** | 显示 QuoteConfirmation 事件 | ✅ 工作 | Last Look §10 |

---

## 6. 关键金额与订单信息追踪

### 6.1 当前追踪能力

| 信息 | 存储位置 | 可查看位置 |
|------|----------|----------|
| Payment ID | `Payment.id` | OFI/Provider 的 payment 列表 |
| Quote ID | `Payment.quoteId` | OFI/Provider 的 payment 详情 |
| Currency | `Payment.currency` | 同上 |
| USD Amount | `Payment.usdAmount` | 同上 |
| Local Amount | `Payment.localAmount` | 同上 |
| Rate | `Quote.rate` | Provider quote 列表 / OFI quote 显示 |
| Beneficiary Ref | `Payment.beneficiaryRef` | 同上 |
| Payout ID | `Payout.id` | Provider payouts 列表 |
| Payout Status | `Payout.status` | 同上 |
| Settlement txHash | `Settlement.txHash` | OFI Funding & Capacity |
| Credit Available | `CreditState.available` | OFI Credit Usage & Ledger |
| Credit Reserved | `CreditState.reserved` | 同上 |
| Ledger Entries | `LedgerEntry[]` | OFI Credit Usage & Ledger |

### 6.2 缺失的追踪信息

| 信息 | 文档要求 | 当前状态 |
|------|----------|----------|
| Network Fee (5/10 bps) | 文档 §16 | ❌ 未计算/未显示 |
| Payment Intent ID | Payment Intent Flow | ❌ 未使用（标准流程用 paymentClientId） |
| External Reference | Payment Intent `external_reference` | ❌ 未使用 |
| Travel Rule Data | IVMS101 KYC 数据 | ❌ 未收集/未显示 |
| Transaction Reference | 支付轨道原生 ID | ❌ 未收集 |
| Settlement Amount | Payment Intent 结算金额 | ❌ 未计算 |

---

## 7. 发现的问题汇总

### 🔴 高优先级

| # | 问题 | 影响 | 建议修复 |
|---|------|------|----------|
| 1 | **Payment Intent Flow 未在 UI 贯通** | 用户无法体验完整的 Payment Intent 流程 | 在 OFI 页面添加 "Create Payment Intent" + "Confirm Funds" 按钮和面板 |
| 2 | **状态语义混乱: `rejected` = 待 AML + 已拒绝** | Provider 无法区分真正需要 AML 审核的 payment 和已拒绝的 | 引入 `"pending_aml"` 状态，或至少确保 `handleManualAmlCheck` 和 `completeManualAml(rejected)` 使用不同状态 |
| 3 | **数据无持久化** | 重启后所有数据丢失 | 接入 `JsonFileStore` 或 SQLite |
| 4 | **E2E deep-check 脚本过期** | 无法自动验证 UI 流程 | 重写 `scripts/e2e-deep-check.mjs` 匹配新版 Console |

### 🟡 中优先级

| # | 问题 | 影响 | 建议修复 |
|---|------|------|----------|
| 5 | **同步 payout 驱动 vs 文档异步 RPC** | 与真实 T-0 网络行为不一致 | 添加注释说明这是 sandbox 简化；长期可添加 async 模拟 |
| 6 | **Network Fee 未实现** | 无法验证费用计算 | 在 `executePayout` 成功后添加 fee 扣除逻辑 |
| 7 | **Travel Rule / KYC 数据未收集** | 无法验证合规流程 | 在 CreatePayment 表单中添加 sender/recipient 信息字段 |
| 8 | **Typecheck 8 个既有错误** | 构建警告 | 修复 `csv.ts`, `router.tsx`, `events.test.ts` 等 |

### 🟢 低优先级

| # | 问题 | 影响 | 建议修复 |
|---|------|------|----------|
| 9 | **Prettier/Lint 200+ 错误** | 代码风格不一致 | 全局跑 `prettier --write` |
| 10 | **Provider 的 AML Upload 仅本地状态** | 上传的文档不持久 | 接入文件存储或至少写入磁盘 |
| 11 | **OFI 的 Approve/Reject 按钮在 My Payments 中语义不清** | 用户可能混淆 AML 审批和 Quote 审批 | 添加更清晰的标签和状态说明 |

---

## 8. 流程验证步骤（手动测试指南）

### 8.1 标准 Payment Flow

```
1. Provider 页面 → Publish Quote (EUR, 1000, 0.92)
2. OFI 页面 → Get Quote (1000, EUR)
3. OFI 页面 → Submit Settlement (5000, TRON) [如需要]
4. OFI 页面 → Create Payment (填写 clientId, beneficiaryRef, quoteId)
5. Provider 页面 → 观察 Payout Execution 出现新 payment
6. Provider 页面 → 点击 Execute Payout
7. OFI 页面 → 观察 Payment Confirmed
```

### 8.2 Manual AML Flow

```
1-4. 同标准流程步骤 1-4
5. Provider 页面 → Pending AML Review 出现 payment
6. Provider 页面 → 点击 Approve AML
7. OFI 页面 → Payout Requests 出现 payment
8. OFI 页面 → 点击 Approve Quote
9. Provider 页面 → 点击 Execute Payout
10. OFI 页面 → 观察 Payment Confirmed
```

### 8.3 Payment Intent Flow（当前不可行）

```
1. Provider 页面 → Publish Quote
2. OFI 页面 → Get Quote
3. ❌ 缺少 "Create Payment Intent" 按钮
4. ❌ 缺少 "Confirm Funds" 按钮
5. ❌ 缺少 End-user 支付模拟
```

---

## 9. 结论与建议

### 9.1 当前状态评估

| 流程 | 实现度 | 可用性 |
|------|--------|--------|
| 标准 Payment Flow | 85% | ✅ 可手动跑通 |
| Manual AML Flow | 75% | ⚠️ 可跑通但状态语义混乱 |
| Payment Intent Flow | 30% | ❌ UI 未贯通 |

### 9.2 下一步建议（按优先级）

1. **修复状态语义** (1-2h): 引入 `"pending_aml"` 状态替代 `"rejected"` 表示待审核
2. **贯通 Payment Intent Flow** (1-2d): 在 OFI 页面添加 Create Payment Intent + Confirm Funds 面板
3. **添加数据持久化** (1-2d): 接入 `JsonFileStore` 或 SQLite
4. **重写 E2E Deep Check** (1d): 匹配新版 Console UI
5. **实现 Network Fee** (2-4h): 在 payout 成功后计算并显示 fee
6. **添加 Travel Rule 数据收集** (1d): 在 CreatePayment 表单中添加 KYC 字段

### 9.3 关键文件清单

| 文件 | 职责 | 审计状态 |
|------|------|----------|
| `src/lib/t0/network.ts` | Network 编排层 | ✅ 已审计 |
| `src/lib/t0/provider.ts` | Provider 服务 | ✅ 已审计 |
| `src/lib/t0/ofi.ts` | OFI 服务 | ✅ 已审计 |
| `src/lib/t0/t0.functions.ts` | Server Functions | ✅ 已审计 |
| `src/routes/ofi.tsx` | OFI UI | ✅ 已审计 |
| `src/routes/provider.tsx` | Provider UI | ✅ 已审计 |
| `src/lib/t0/settlement.ts` | Settlement Registry | ✅ 已审计 |
| `src/lib/t0/types.ts` | Domain Types | ✅ 已审计 |
| `src/data/flows.ts` | Flow 动画定义 | ✅ 已审计 |
| `src/lib/t0/provider-impl.ts` | RPC 实现 | ✅ 已审计 |

---

_报告生成路径_: `docs/audit-report-2026-07-12.md`
