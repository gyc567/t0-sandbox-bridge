# T0-Sandbox-Bridge 测试报告

> 生成日期: 2026-07-07（角色边界重构后）

## 重构概述

本次重构将 T-0 Network 协议的角色边界对齐至官方文档（https://docs.t-0.network/docs/network/payment-flow/）：

- **修复前**：`SandboxNetwork.createPayment` 调用 `PayoutProviderService.acceptPayment`，违反了协议中"Network 验证并接受支付"的语义；`completeManualAml`、`approvePaymentQuote`、`createPaymentIntent`、`confirmFunds` 等 OFI/Network 关注点错放在 Provider 端。
- **修复后**：Network 拥有"接受"逻辑与编排语义（CreatePayment accept、Manual AML、Last Look、Payment Intent、Confirm Funds、PayoutRequest 路由）；Provider 仅负责 Provider-side 状态（quote 推送、USDT 结算通知、信用通知、payout 执行）。

## 测试执行结果

```
Test Files  22 passed (22)
Tests       321 passed (321)
Duration    ~1.0s
```

## 覆盖率报告（`src/lib/t0/` 模块）

| 文件                       | % Stmts | % Branch | % Funcs | % Lines |
| -------------------------- | ------- | -------- | ------- | ------- |
| **All t0 files**           | 97.92   | 91.44    | 99.21   | 98.37   |
| `network.ts`               | **100** | **97.22**| **100** | **100** |
| `provider.ts`              | 98.85   | 94.44    | **100** | **100** |
| `sdk-adapter.ts`           | **100** | 91.66    | **100** | **100** |
| `sdk-client.ts`            | **100** | 83.33    | **100** | **100** |
| `csv.ts`                   | **100** | 95       | 90      | **100** |
| `t0-receiver.ts`           | 89.77   | 76.19    | **100** | 91.13   |
| **重构触及的四个核心文件** | —       | —        | —       | —       |
| `network.ts`               | **100** | 97.22    | **100** | **100** |
| `provider.ts`              | 98.85   | 94.44    | **100** | **100** |
| `provider-impl.ts`         | (同 t0-receiver)  |  |  |  |
| `t0.functions.ts`          | (静态源扫描覆盖) |  |  |  |

> 整体测试套件：98.24% statements / 93.86% branches / 99.4% functions / 98.76% lines across all sources.

## 重构后测试文件清单

| 文件                                          | 测试数 | 状态 | 说明 |
| --------------------------------------------- | ------ | ---- | ---- |
| `src/lib/t0/network.test.ts`                  | 25     | ✅ 新增 | Network 编排层全部方法覆盖（CreatePayment 接受 + PayoutRequest 路由、Manual AML、Last Look、Payment Intent、Confirm Funds、Request Payout、Ingress 翻译） |
| `src/lib/t0/provider-boundary.test.ts`        | 3      | ✅ 新增 | 角色边界防回归护栏（Provider 不能有 OFI/Network 方法；Network 必须有；OFI 必须通过 Network） |
| `src/lib/t0/t0.functions.boundary.test.ts`    | 3      | ✅ 新增 | server-fn 静态布线校验（Phase 8 / Request Payout 都走 Network；无 Provider-driven accept） |
| `src/lib/t0/provider.test.ts`                 | 14     | ✅ 保留+更新 | Provider 只测 Provider-side 职责（publishQuote、notify、executePayout、rekey、recordPayment） |
| `src/lib/t0/ofi.test.ts`                      | 19     | ✅ 保留 | OFI 测试已通过 Network 走；createPayment 期望值更新为"confirmed"（同步路由的副作用） |
| `src/lib/t0/provider-impl.test.ts`            | 16     | ✅ 保留+更新 | RPC handler 改为接 Network 而非 Provider；setupAcceptedPayment 改用 network.createPayment |
| `src/lib/t0/quote-message.test.ts`            | 6      | ✅ 未变 | 错误消息格式化 |
| `src/lib/t0/quote-display.test.ts`            | 21     | ✅ 未变 | 报价展示格式化 |
| `src/lib/t0/currencies.test.ts`               | 15     | ✅ 未变 | 货币支持列表 |
| `src/lib/t0/csv.test.ts`                      | 30     | ✅ 未变 | CSV 导出 |
| `src/lib/t0/client.test.ts`                   | 3      | ✅ 未变 | MockT0Client 行为 |
| `src/lib/t0/events.test.ts`                   | 17     | ✅ 未变 | SSE pub/sub |
| `src/lib/t0/ecdsa.test.ts`                    | 28     | ✅ 未变 | ECDSA 签名 |
| `src/lib/t0/ecdsa.contract.test.ts`           | 3      | ✅ 未变 | 合约测试 |
| `src/lib/t0/sdk-adapter.test.ts`              | 11     | ✅ 未变 | proto ↔ internal 转换 |
| `src/lib/t0/sdk-client.test.ts`               | 11     | ✅ 未变 | SDK 客户端 |
| `src/lib/t0/sdk-signer.test.ts`               | 10     | ✅ 未变 | SDK 签名器 |
| `src/lib/t0/t0-receiver.test.ts`              | 13     | ✅ 保留+更新 | receiver 现在以 Network 单例构建 |
| `src/lib/auth/service.test.ts`                | 24     | ✅ 未变 | 鉴权服务（独立模块，未受重构影响） |
| `src/lib/playground/playback.test.ts`         | 27     | ✅ 未变 | 演练场（独立模块） |
| `src/lib/theme/theme.test.ts`                 | 12     | ✅ 未变 | 主题（独立模块） |
| `src/shared/contracts/contracts.test.ts`      | 14     | ✅ 未变 | 共享合约（独立模块） |

**总计**：22 测试文件 / 321 测试（重构前 19 文件 / 300 测试）

## 角色边界回归护栏（新增）

`provider-boundary.test.ts` 验证三件事，反驳任何"方法泄漏回错误层"的修改：

1. `PayoutProviderService.prototype` 不再暴露 `acceptPayment`、`completeManualAml`、`approvePaymentQuote`、`createPaymentIntent`、`confirmFunds`、`processPayout`、`requestPayout`。
2. `SandboxNetwork.prototype` 暴露所有编排方法：`createPayment`、`completeManualAml`、`approvePaymentQuote`、`createPaymentIntent`、`confirmFunds`、`requestPayout`、`handleNetworkPayout`、`handleNetworkAccepted`、`handleManualAmlCheck`。
3. `OFIService.createPayment` 通过 `SandboxNetwork`（不在 Provider 端）。

`t0.functions.boundary.test.ts` 通过源扫描锁定 server-fn 布线：
- `requestPayoutFn` → `sandboxNetwork.requestPayout`
- `completeManualAmlFn` → `sandboxNetwork.completeManualAml`
- `approvePaymentQuoteFn` → `sandboxNetwork.approvePaymentQuote`
- `createPaymentIntentFn` → `sandboxNetwork.createPaymentIntent`
- `confirmFundsFn` → `sandboxNetwork.confirmFunds`
- 确认 `acceptPaymentFn` / `processPayoutFn` 不再作为 server function 暴露。

## 核心功能测试覆盖

### SandboxNetwork 编排层（network.ts）

- ✅ `createPayment` — 验证 quote 有效性、写 accepted Payment、同步驱动 PayoutRequest 到 Provider、幂等（Rule 1）
- ✅ `createPayment` 失败路径：未知 quote (`REASON_INVALID_QUOTE_ID`)、过期 quote (`REASON_QUOTE_EXPIRED`)
- ✅ `createPayment` 仅触发一次 executePayout（幂等防止重复 payout）
- ✅ `completeManualAml` — approve → accepted；reject → rejected；未知 payment 抛错
- ✅ `approvePaymentQuote` (Last Look) — 刷新 quote TTL +60_000 ms；未知 payment / quote 抛错
- ✅ `createPaymentIntent` — 创建 pi_-prefixed pending payment
- ✅ `confirmFunds` — pending → accepted
- ✅ `requestPayout` — 委托 provider.executePayout；转发 fail flag；幂等
- ✅ `handleNetworkPayout` (PayoutRequest ingress) — 委托 provider.executePayout
- ✅ `handleNetworkAccepted` (UpdatePayment.accepted ingress) — 写 accepted payment（无 quote 时抛错）
- ✅ `handleManualAmlCheck` (UpdatePayment.manualAmlCheck ingress) — 标记 rejected

### PayoutProviderService（provider.ts）

- ✅ `publishQuote` — 推送 quote、记录 QuotePublished 事件
- ✅ `publishQuote` — 自定义 TTL、rate ≤ 0 抛错
- ✅ `notifyUsdtSettlement` / `notifyCreditUsage` — 事件记录；bad usd 抛错
- ✅ `executePayout` — 完整 payout 生命周期（PayoutAccepted → PayoutSuccess → PaymentConfirmed）
- ✅ `executePayout` — fail option 路径，payment 保持 accepted
- ✅ `executePayout` — 未知 payment 抛错
- ✅ `executePayout` — 幂等（重复调用返回同一 payout）
- ✅ `executePayout` — 失败时仍然幂等
- ✅ `executePayout` — 非 accepted 状态抛错
- ✅ `recordPayment` — 幂等（重复 id 保留原值）
- ✅ `rekeyPayment` — 旧 id 不存在抛错；新 id 已被占用 no-op；dependent payouts 一并 rekey
- ✅ `rekeyQuote` — 旧 id 不存在抛错；新 id 已被占用 no-op

### OFIService（ofi.ts）

- ✅ `getQuote` / `getQuoteById` — oneof 语义、best-rate 选择
- ✅ `createPayment` — 端到端（OFI 端 createPayment 通过 Network）
- ✅ `completeManualAml` — 经 Network 转发（不直连 Provider）
- ✅ `snapshot` — 货币列表与发布状态独立

### 角色边界护栏（provider-boundary.test.ts）

- ✅ Provider 不暴露 OFI/Network 编排方法
- ✅ Network 暴露全部编排方法
- ✅ OFI 通过 Network 路由 createPayment

## 质量检查

- ✅ **321/321 tests passing**
- ✅ **`network.ts` 覆盖率 100%**
- ✅ **`provider.ts` 行/函数覆盖率 100%**（分支 94.44%）
- ✅ **构建成功** (`bun run build`)
- ✅ **类型检查无新增错误**（与重构前 baseline 27 个 pre-existing 错误一致）

## 已知遗留

- `t0-receiver.ts` 行覆盖率 91.13% / 分支 76.19% — 来自 ECDSA 验签的异常路径（mock Web Fetch platform 上难以触发的边界）。与本次重构无关。
- `currencies.ts` 错放在 `src/lib/t0/` 但被 `routes/login.tsx` 引用导致的若干类型不匹配错误均为 pre-existing，与本次重构无关。

## 下一步建议

1. Provider 端 `markPaymentStatus` / `lockPaymentRate` / `refreshQuoteTtl` 可以添加更多 edge-case 测试以把分支覆盖率推到 100%。
2. 若切换到真实 HTTP 网络客户端（替换 `MockT0Client`），需要新增 `HttpT0Client` 的端到端测试套件（当前 sdk-client 已有部分）。
3. `t0-receiver.test.ts` 可以补充 happy-dom 环境下的 Request body stream 异常路径。
