# OFI/Provider 双控制台对接 agtpay 中间件重构方案

> **状态**: 方案已确认,待实施
> **日期**: 2026-07-10
> **背景**: `agtpay.xyz/ofi` (OFI 控制台) 和 `agtpay.xyz/sandbox` (Provider 控制台,实际路由为 `/provider`) 当前只跑本地内存沙箱,需要全面对接 `https://api.agtpay.xyz/swagger/` 的 Quote Management 中间件,按 `docs.t-0.network/docs/network/payment-flow/` 的 16 步 lifecycle 实现完整的产品级控制台。
> **强约束**: UI 专业、易用(运维人员日常使用);OFI 和 Provider 在 agtpay 后端共享同一份真实状态,双页面必须能看到彼此动作的结果。

---

## 0. TL;DR

1. **`/ofi` 和 `/provider` 各自重写**: 去掉手工散落的 PanelCard,按 16 步 / 6 阶段的全 lifecycle 设计专业 UI。
2. **agtpay = 唯一权威**: 所有 Quote/Payment/Payout 状态读写全部走 agtpay API;本地**只持有** OFI/Provider 的视图状态与临时草稿。
3. **本地充当 Provider 的 RPC 回调**: 当 agtpay 推送 Quote Management 5 个端点时本地真的接;当 agtpay 调 `ProviderService/PayOut` 时,**本地 mock 一个响应**(返回 `manualAmlCheck` 或 `failed`),同时记录到 Provider 侧 event log。
4. **双控制台共享同一 agtpay 真实状态**: OFI 在 `/ofi` 创建一个 Payment,Provider 在 `/provider` 立刻能看到(同一个 agtpay key 读出来)。
5. **专业运维体验**: 每个 step 一个明确的"动作按钮 + 输入 + 期望结果";右侧实时显示 agtpay 真实响应;底部有 event log 滚动展示 lifecycle。
6. **实时同步**: SSE 推送(服务端事件总线 `eventLog`),OFI/Provider 两端 < 1s 看到对方动作。
7. **路由**: 保持现有 `/provider`(不重命名);新增 `/api/events/stream` SSE 端点。

---

## 1. 端到端架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Browser (professional operator)                │
│                                                                      │
│  ┌─────────────────────────┐    ┌──────────────────────────────┐   │
│  │  /ofi (OFI console)     │    │  /provider (Provider console)│   │
│  │  - 16-step lifecycle    │    │  - 4-tab control surface      │   │
│  │  - Quote → Settlement   │    │  - Quote Mgmt                 │   │
│  │    → CreatePayment      │    │  - PayOut callback handler   │   │
│  │    → Payout tracking    │    │  - Ledger & events            │   │
│  └──────────┬──────────────┘    └──────────┬───────────────────┘   │
│             │  HTTP (TanStack server fns)  │                        │
│             │  + SSE EventSource /api/events/stream                │
└─────────────┼─────────────────────────────┼──────────────────────────┘
              ▼                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Local server (TanStack Start, port 8080)                            │
│                                                                      │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐  │
│  │  OFIService (OFI-side)       │  │  ProviderService             │  │
│  │  - ofiGetQuoteFn → agtpay    │  │  - publishQuoteFn → agtpay   │  │
│  │  - createPaymentFn → agtpay  │  │  - executePayoutFn (mock)    │  │
│  │  - manualAmlFn (mock ack)    │  │  - ledger bookkeeping        │  │
│  │  - listMyPaymentsFn ← agtpay │  │  - listMyPayoutsFn (local)   │  │
│  └──────────┬───────────────────┘  └──────────┬───────────────────┘  │
│             │      HttpsToAgtpay (new client)    │                   │
│             │         URL: https://api.agtpay.xyz                        │
│             │         Auth: Bearer T0_OFI_API_KEY / T0_API_KEY          │
└─────────────┼─────────────────────────────────────┼─────────────────────┘
              ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│              agtpay middleware (api.agtpay.xyz)                       │
│                                                                      │
│   Quote Management  ───────► /api/v1/quotes/network (real)            │
│   (5 endpoints)             /api/v1/quotes                            │
│                             /api/v1/quotes/pay-out                    │
│                             /api/v1/quotes/pay-in                     │
│                             /api/v1/quotes/publish                   │
│                                                                      │
│   ProviderService RPC    ───► CALLBACK to local Provider              │
│   (5 endpoints, would-     (we DON'T run a callback server in this    │
│    invoke from N)           iteration — mock locally instead)        │
└──────────────────────────────────────────────────────────────────────┘
```

**单 auth key**: agtpay 那侧的 `PROVIDER_API_KEYS` 是同一个 key。OFI/Provider 在 **agtpay 视角下** 都用这把 key 调 Quote Management;区分靠 OAuth 里的 `role` 字段(agtpay 不区分,纯 key 维度),UI 层只读本地 role 来过滤显示。

---

## 2. 数据模型重构(必须先做)

### 2.1 `types.ts` 扩展

当前 `Payment`/`Payout`/`NetworkEvent` 都是 5-字段的"骨架",不足以支撑 16 步。

```ts
// ── 现有保留 ──
export type Currency = "USD" | ...;
export type VolumeBand = ...;
export interface Quote { ... }       // 不变
export type PaymentStatus =
  | "pending" | "accepted" | "rejected" | "confirmed" | "expired";
export type PayoutStatus =
  | "pending" | "accepted" | "success" | "failed" | "manual_aml";

// ── 新增 ──

// Step 13-14 credit lifecycle (per docs §6)
export type CreditLifecycleStatus =
  | "none"              // 没创建 credit record
  | "reserved"          // Step 9 创建 reservation, amount 锁住
  | "used"              // Step 15 成功后, reservation 转 use
  | "released";         // Step 12/失败路径, reservation 释放

export interface CreditRecord {
  id: string;                       // = quoteId or paymentId
  ownerId: string;                   // "ofi-demo" / "provider-demo"
  counterpartyId: string;
  payoutLimit: number;               // USD
  creditLimit: number;               // USD
  creditUsage: number;               // USD (used)
  reserve: number;                   // USD (reserved)
  updatedAt: number;
  status: CreditLifecycleStatus;
}

// Step 4-7 USDT settlement
export interface UsdtSettlement {
  txHash: string;                    // 0xabc...
  fromAddress: string;                // OFI whitelisted
  toAddress: string;                  // POP whitelisted
  amountUsd: number;
  confirmations: number;
  status: "pending" | "confirming" | "confirmed";
  detectedAt: number;
  confirmedAt?: number;
}

// Step 11 PayoutRequest payload
export interface PaymentDetails {
  beneficiaryName: string;
  beneficiaryAccount: string;
  beneficiaryBank?: string;            // for SEPA/SWIFT
  beneficiaryBic?: string;
  paymentMethod: string;                // "SEPA" / "SWIFT"
  ivms101: {
    originator: { fullName: string; dob?: string; address?: string; govtId?: string };
    beneficiary: { fullName: string; address?: string };
    transfer: { amountLocal: number; currency: string };
  };
}

// Step 12 manual_aml path
export interface ManualAmlTicket {
  paymentId: string;
  openedAt: number;
  closedAt?: number;
  approved?: boolean;
}

// Network event (replace the current oneof with timestamped real events)
export type NetworkEvent =
  | { type: "quote_requested"; currency: Currency; usdAmount: number; at: number }
  | { type: "quote_received"; quoteId: string; rate: number; at: number }
  | { type: "usdt_transfer_initiated"; txHash: string; amountUsd: number; at: number }
  | { type: "usdt_confirmed"; txHash: string; confirmations: number; at: number }
  | { type: "credit_usage"; ownerId: string; counterpartyId: string; used: number; at: number }
  | { type: "credit_released"; ownerId: string; amount: number; at: number }
  | { type: "payment_created"; paymentId: string; at: number }
  | { type: "payment_accepted"; paymentId: string; at: number }
  | { type: "payout_requested"; paymentId: string; at: number }
  | { type: "payout_accepted"; payoutId: string; at: number }
  | { type: "payout_success"; payoutId: string; receipt: string; at: number }
  | { type: "payout_failed"; payoutId: string; reason: string; at: number }
  | { type: "payment_confirmed"; paymentId: string; at: number }
  | { type: "manual_aml_check"; paymentId: string; at: number }
  | { type: "manual_aml_resolved"; paymentId: string; approved: boolean; at: number };
```

### 2.2 后端模块布局(新增)

```
src/lib/t0/
├── types.ts                  ← 扩展
├── network.ts                ← 改 async, 委派到 agtpay
├── ofi.ts                    ← OFIService facade
├── ofi-client.ts              ← 已存在
├── quote-mapper.ts            ← 已存在
├── client.ts                  ← 已存在 (Provider 推送报价)
├── provider.ts                ← PayoutProviderService in-memory
├── provider-impl.ts           ← ProviderService RPC handlers (Connect-RPC)
├── sdk-adapter.ts             ← 用于 agtpay 中间件格式适配 (Connect-RPC wire)
│
├── agtpay-client.ts           ★ 新增: 统一的 agtpay REST client
├── agtpay-mapper.ts           ★ 新增: agtpay wire-format mapper
├── agtpay-rpc-server.ts       ★ 新增: Connect-RPC server for /tzero.v1.payment.ProviderService/*
├── agtpay-callback.ts         ★ 新增: 模拟 agtpay → Provider 回调的内存事件总线
├── event-log.ts               ★ 新增: 跨 OFI/Provider 共享的 event log (in-memory + agtpay mirror)
├── t0.functions.ts            ← 加 5-10 个 server fn wrappers
└── auth/                       ← 现有不变
```

**关键设计**: `event-log.ts` 是双控制台共享状态的唯一通道 —— OFI 触发的事件("payment_created")通过 agtpay 写入后,立即从 agtpay 读回来;Provider 端只需 `GET /api/v1/quotes` + 调 ProviderService RPC 就能看到新 Payment(同一份 agtpay 真实数据)。

---

## 3. `/ofi` 页面设计(OFI 角色 16 步)

### 3.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: OFI Console  ·  ofi-demo  ·  [Disconnect]  ·  [Themed]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ LEFT RAIL (240px) ─┐  ┌─ MAIN AREA (flex-1) ──────────────┐  │
│  │  01 Get Quote       │  │  Header: Step title + status       │  │
│  │  ─────────────────  │  │                                   │  │
│  │  02 USDT Settle     │  │  ┌─────────────────────────────┐ │  │
│  │  ─────────────────  │  │  │ Step content                │ │  │
│  │  03 Create Payment  │  │  │  - inputs                    │ │  │
│  │  ─────────────────  │  │  │  - action buttons           │ │  │
│  │  04 Payout Track    │  │  │  - live result panel        │ │  │
│  │                     │  │  └─────────────────────────────┘ │  │
│  │                     │  │                                   │  │
│  │  Status badges:     │  │  ┌─ Lifecycle Timeline (sticky)┐│  │
│  │   ✓ step 1 done     │  │  │ ▶ 1 ✓ 2 → 3 ⏳ 4   (mini)    ││  │
│  │   ⏳ step 2 active   │  │  └─────────────────────────────┘│  │
│  │   · step 3 pending  │  │                                   │  │
│  │                     │  │  ┌─ Recent Events (bottom) ────┐│  │
│  │                     │  │  │ 11:23 payment_created       ││  │
│  │                     │  │  │ 11:23 quote_received         ││  │
│  │                     │  │  └─────────────────────────────┘│  │
│  └─────────────────────┘  └───────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 4 个 Step 块(collapsed sections)

#### Step 01 — Get Quote

```
┌─ Step 01 · Get Quote ────────────────────────────┐
│                                                  │
│  Inputs:                                         │
│   [ USD Amount ]  [ Currency ▾ EUR ]            │
│   [ Payment Method ▾ SEPA ]                     │
│   [ Optional: pin Quote ID ]                     │
│                                                  │
│  Actions:                                        │
│   [ Get Live Quote ]                              │
│                                                  │
│  Result Panel (after action):                     │
│   ┌─ Raw agtpay response ─────────────────────┐  │
│   │ {                                         │  │
│   │   "rate": 0.92,                           │  │
│   │   "quoteId": "1-12345",                   │  │
│   │   "expiresAt": "11:24:30 UTC",            │  │
│   │   "expiration": "in 60s"                  │  │
│   │ }                                         │  │
│   └───────────────────────────────────────────┘  │
│                                                  │
│   ┌─ Mapped to internal Quote ────────────────┐  │
│   │ Sell USDT → Buy EUR · 0.92 · €920        │  │
│   │ TTL: 60s · expiresAt 11:24:30 UTC         │  │
│   └───────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

#### Step 02 — USDT Pre-Settlement

```
┌─ Step 02 · Pre-Settlement (USDT) ────────────────┐
│                                                  │
│  Inputs:                                         │
│   [ Receiver Address (POP whitelisted) ]         │
│   [ Amount USD ]   [ Tx Hash (auto-fill or paste) ]│
│                                                  │
│  Actions:                                        │
│   [ Notify USDT Settlement ]                      │
│                                                  │
│  Result:                                         │
│   Tx: 0xabc... · Status: confirming (2 conf)    │
│   ⏳ waiting for n confirmations...               │
│   ✓ confirmed at 11:24:45 UTC                    │
│   → Credit Usage Notification sent                │
└──────────────────────────────────────────────────┘
```

#### Step 03 — Create Payment + 16 步 4-16 联动

```
┌─ Step 03 · Create Payment ──────────────────────┐
│                                                  │
│  Inputs (auto-filled from Step 01):              │
│   Quote ID: 1-12345   [refresh from Step 01]     │
│   USD Amount: 1000      [from quote]             │
│   Currency: EUR         [from quote]             │
│   Beneficiary: BEN-001                           │
│                                                  │
│  Travel Rule (IVMS101):                          │
│   [ Originator Name ] [ DOB ] [ Address ]         │
│   [ Beneficiary Name ] [ Address ]                │
│                                                  │
│  Actions:                                        │
│   [ Create Payment ]                             │
│                                                  │
│  After click → full 16-step pipeline auto-runs:  │
│   4-7: server-side auto (settlement detect)       │
│   8: CreatePayment → agtpay                       │
│   9-10: Network validation (status updated)        │
│   11-12: PayoutRequest → POP (manualAml check)   │
│   13-14: Credit usage → agtpay                    │
│   15-16: PayoutSuccess → FinalizePayout → agtpay │
│                                                  │
│  Result Panel (live):                            │
│   09:24:01  Payment Created (id=...)              │
│   09:24:02  Payment Accepted                      │
│   09:24:03  Payout Accepted                       │
│   09:24:04  Manual AML Check                      │
│   ⏳  waiting for AML operator...                  │
│                                                  │
│  [ View full lifecycle ] → switches to Step 04  │
└──────────────────────────────────────────────────┘
```

#### Step 04 — Payout Tracking & Lifecycle

```
┌─ Step 04 · Track & Lifecycle ────────────────────┐
│                                                  │
│  Timeline visualization (horizontal, scrollable): │
│   01 ●───────●──────●──────○──────○              │
│   Quote   Settle  Create  PayOut Confirm        │
│   [live]                                         │
│                                                  │
│  Per-step details (click any node):              │
│   Step 11: PayoutRequest sent at 11:24:03        │
│             amount=920 EUR, quote=1-12345         │
│             beneficiary=BEN-001                  │
│   Step 12: manualAmlCheck returned at 11:24:04    │
│             ticket opened: aml_abc                │
│             [Resolve AML] [Reject]                │
│                                                  │
│  All My Payments (table, sortable, filterable):  │
│   paymentId | status   | amount  | beneficiary    │
│   p_001     | manualAml| 920 EUR | BEN-001       │
│   p_002     | confirmed| 1500GBP | BEN-002       │
│                                                  │
│  All My AML Tickets:                              │
│   ticketId | paymentId | opened   | action        │
│   aml_abc  | p_001     | 11:24:04 | [Approve]     │
└──────────────────────────────────────────────────┘
```

### 3.3 OFI 端 server functions(t0.functions.ts 加 8 个)

```ts
// Existing kept
export const ofiGetQuoteFn           // 已有 → agtpay
export const ofiCreatePaymentFn       // 已有 → in-memory (改成 agtpay)
export const ofiCompleteManualAmlFn   // 已有

// New
export const ofiNotifyUsdtFn          // POST /api/v1/quotes/publish? 或 notify agtpay
export const ofiConfirmSettlementFn   // 等 N 确认 USDT
export const ofiListPaymentsFn        // 拉 agtpay 的 Payment 列表
export const ofiListAmlTicketsFn       // 拉 AML ticket 列表
export const ofiResolveAmlFn          // approve/reject AML → 触发 step 15
export const ofiGetPaymentByIdFn      // 单个 payment 详情
export const ofiGetLifecycleFn        // 单个 payment 的 16 步 timeline
```

---

## 4. `/provider` 页面设计(Provider 角色)

### 4.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Provider Sandbox  ·  provider-demo  ·  [Disconnect]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Top KPI strip (live, agtpay-synced):                           │
│   ┌──────────┬──────────┬──────────┬──────────┐                 │
│   │ Quotes   │ Pending  │ Confirmed│ Earnings│                 │
│   │   12    │ Payouts  │ Today    │ Today   │                 │
│   │         │    3     │   7      │ $487.50 │                 │
│   └──────────┴──────────┴──────────┴──────────┘                 │
│                                                                 │
│  ┌─ TAB ─────────────────────────────────────────────────┐    │
│  │  [Quote Mgmt] [Payout Queue] [Ledger] [Settings]      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [Active Tab Content]                                            │
│                                                                 │
│  Bottom: Server-side Event Log (scrollable, filterable)          │
│   11:24:04 payOut.callback → manualAmlCheck                    │
│   11:24:03 payOut.request received (paymentId=p_001)           │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 4 个 Tab

#### Tab 1 — Quote Management

- **Quote Publishing Form**(复用现有 Publish Quote 块,但拆成 "Publishing..." → "Publishing OK" → "Live on agtpay" 三态)
- **Live Snapshot from agtpay**(GET /api/v1/quotes,每 10s 轮询):每条 band 显示 "local cached" / "agtpay confirmed" / "stale"
- **Bulk Operations**: "Publish all to agtpay"、"Refresh from agtpay"、"Reset local cache"
- **Quote Lifecycle**: `quoteId` 旁边显示「local only」(未推 agtpay) /「published」(agtpay confirmed) /「expired」徽章

#### Tab 2 — Payout Queue(核心,跟 OFI 联动)

- **Pending Payouts Table** (payouts where `status='accepted'` 等待人工 AML 或自动执行)
- **每行操作**:
  - 「Resolve AML」→ 触发 `FinalizePayout` to agtpay (status=success/failed)
  - 「Force Failed」→ 触发 `UpdatePayment.failed` to agtpay
  - 「View Details」→ 弹出 drawer 显示 IVMS101 travel rule 数据 + 16 步 timeline
- **Auto-refresh every 5s** (从 agtpay 拉所有 payments/payouts)
- **Manual AML decision timer**: 每个 accepted payout 显示"已等 X 秒 / SLA 30 秒"

#### Tab 3 — Ledger

- **Credit Usage 表** (per docs §6 状态机):
  - reserved vs used vs released
  - owner / counterparty / amount / timestamp
- **Account Entries** (AppendixEntry entries via agtpay's `AppendLedgerEntries`)
- **Export CSV** (现有功能)

#### Tab 4 — Settings

- **API Connection**:
  - T0_API_BASE_URL / T0_API_KEY 显示 (masked)
  - "Test Connection" 按钮
  - "Rotate Key" 按钮
- **RPC Server**(本地):
  - Listening on port + ngrok URL
  - Last 5 inbound callbacks (with payload)
  - "Mock payOut response mode": `[Always success] [Always manualAml] [Always fail] [Random]`
  - 这种 **mock mode** 是本次任务最关键的:让 Provider 能配置对 agtpay 的 PayOut 回调返回什么 → OFI 端就能看到对应分支
- **Agile Trigger Simulator**: 「Auto-approve next AML in N seconds」开关,让 demo 流更连贯

---

## 5. 后端实现关键点

### 5.1 `agtpay-client.ts` — 统一的 agtpay REST 客户端

```ts
export class AgtpayClient {
  constructor(opts: { baseUrl: string; apiKey: string; timeoutMs?: number })

  // Quote Management 5 个端点(已部分在 ofi-client.ts 验证过)
  async getQuotes(): Promise<QuotesResponse>
  async updatePayOutQuotes(req: UpdateQuotesRequest): Promise<PublishResponse>
  async updatePayInQuotes(req: UpdateQuotesRequest): Promise<PublishResponse>
  async publishQuotes(): Promise<PublishResponse>
  async getNetworkQuote(req: GetNetworkQuoteRequest): Promise<GetQuoteResponse>

  // 新增:Provider/Network Service 调用 agtpay 时使用的端点
  async appendLedgerEntries(req: AppendLedgerEntriesRequest): Promise<void>
  async updateLimit(req: UpdateLimitRequest): Promise<void>

  // Health / introspection
  async ping(): Promise<boolean>
}
```

注意:所有 Connect-RPC 风格的 response(PascalCase)都通过 `agtpay-mapper.ts` 转成 camelCase 内部表示。

### 5.2 `event-log.ts` — 双控制台共享事件流

```ts
// 内存 + 可选 agtpay mirror
class EventLog {
  // 内部事件 (任意 server fn 可 push)
  push(event: NetworkEvent): void

  // 拉取(按角色 + 时间窗)
  listForOFI(opts: { sinceMs?: number }): NetworkEvent[]
  listForProvider(opts: { sinceMs?: number }): NetworkEvent[]

  // 拉取所有(设置/调试用)
  listAll(opts: { sinceMs?: number; types?: NetworkEvent['type'][] }): NetworkEvent[]

  // SSE 流(让 UI 实时刷新)
  subscribe(opts: { roles: ('ofi' | 'provider')[] }): AsyncIterable<NetworkEvent>
}
```

**关键**: OFI 在 `/ofi` 触发 `createPayment` → server fn 调 agtpay `CreatePayment` → 然后 push 到 `EventLog` → Provider 的 `/provider` 通过 SSE 流收到 → 自动刷新 UI。**两边都看得到对方动作的结果。**

### 5.3 `provider-impl.ts` — Provider RPC handlers(本地,不联调)

```ts
// 本地模拟 agtpay 调我们的 ProviderService
export const providerServiceImpl = {
  // agtpay → 我们:通知出金
  async PayOut(req: PayoutRequest): Promise<PayoutResponse> {
    const ticket = openManualAmlTicket(req.paymentId);
    eventLog.push({ type: 'payout_requested', ... });
    return { manualAmlCheck: { reason: '', details: ticket.id } };
  },

  // agtpay → 我们:通知支付状态
  async UpdatePayment(req: UpdatePaymentRequest): Promise<UpdatePaymentResponse> {
    // OFI 端 createPayment 时, agtpay 会回调这里通知 accepted/failed
    eventLog.push({ type: 'payment_accepted', ... });
    return {};
  },

  // ... 其他 3 个
}
```

**这些 handler 不挂 HTTP server**(按决策:"不联调 RPC 方向,本地 mock 所有 RPC 回调") —— 而是通过 `eventLog` 把状态变化广播到 UI。RPC 调用本身由 agtpay 那边发起(在生产里),我们这里只 mock 状态机。

### 5.4 `t0.functions.ts` server fn 编排

OFI 端 16 步在 UI 上是 4 个 section,但在 server fn 层是 ~10 个独立 fn:

```ts
// === Step 1: Discovery ===
export const ofiGetQuoteFn = createServerFn({...})
  .handler(async ({data}) => {
    const result = await sandboxNetwork.getQuote(data);
    if ('success' in result) eventLog.push({ type: 'quote_received', quoteId: result.success.quote.id });
    return result;
  });

// === Step 2-7: Settlement (USDT notify) ===
export const ofiNotifyUsdtFn = createServerFn({...})
  .handler(async ({data}) => {
    const settlement = await agtpayClient.notifyUsdtSettlement(data);
    eventLog.push({ type: 'usdt_transfer_initiated', ... });
    // 后台: 模拟 1-2 confirmation 等待 (server-side timer)
    scheduleConfirmationCheck(settlement.txHash);
    return settlement;
  });

// === Step 8: Create Payment ===
export const ofiCreatePaymentFn = createServerFn({...})
  .handler(async ({data}) => {
    const result = await sandboxNetwork.createPayment(data);
    eventLog.push({ type: 'payment_created', ... });
    return result;
  });

// === Step 12: Manual AML ===
export const ofiResolveAmlFn = createServerFn({...})
  .handler(async ({data: {paymentId, approved}}) => {
    if (approved) {
      // 模拟 POP 完成 AML 后 accept
      await agtpayClient.updatePayment({ paymentId, accepted: {...} });
      eventLog.push({ type: 'payout_accepted', ... });
      // 模拟 POP 成功出金
      await agtpayClient.updatePayment({ paymentId, confirmed: {...} });
      eventLog.push({ type: 'payment_confirmed', ... });
    } else {
      await agtpayClient.updatePayment({ paymentId, failed: {...} });
      eventLog.push({ type: 'payout_failed', ... });
    }
    return { ok: true };
  });
```

### 5.5 16 步在 UI 层的"模拟异步推进"

OFI 在 Step 03 点 "Create Payment" 后:
1. UI 立刻 optimistic 显示 "Step 8 done"
2. 后台 server fn 链式触发:
   - step 8 → agtpay createPayment
   - 模拟 step 9-10(server-internal validation)→ event log
   - 模拟 step 11-12(POP receive PayOut → manualAmlCheck)→ event log
   - **暂停** 等待 OFI 在 Step 04 Resolve AML
3. OFI Resolve AML → step 13-16 → event log

每一步的状态变化都 push 到 eventLog;OFI/Provider 各自通过 SSE 订阅,UI 实时刷新。

---

## 6. 视觉 / 交互设计细节(专业运维感)

### 6.1 视觉

- **暗色科技风**(沿用项目现有 `--background`/`--accent-cyan`/`--font-mono` 体系)
- **数字永远 mono + tabular**(价格/ID/时间戳)
- **状态用色彩徽章**: `pending=灰`, `accepted=青`, `confirmed=绿`, `failed=红`, `manual_aml=琥珀`
- **loading 用 skeleton + spinner**,不要黑屏
- **金额格式**: `$1,000.00` / `€920.00` / `¥92,000`(沿用 quote-display.ts 已有规则)

### 6.2 交互

- **乐观更新**:UI 立即反映,server 返回后 reconcile
- **不可逆操作二次确认**:Resolve AML Approve / Reject 用 Dialog
- **键盘快捷键**: `Cmd+Enter` 触发主要 action;`g` → Step 01,`c` → Step 03
- **复制友好**:每个 ID/Hash 旁边有 📋 按钮一键复制
- **错误重试 inline**:失败时在原 action 旁边显示原因 + Retry 按钮(不要弹 toast)
- **深链**:URL 携带 step ID(如 `/ofi?step=03&paymentId=p_001`),可分享/书签

### 6.3 实时性

- **SSE 流**:`/api/events/stream?roles=ofi` 服务端推送 → UI EventSource
- **轮询降级**:SSE 不可用时 fallback 5s 轮询 `/api/events/recent`
- **可见性指示**:每个 tab 标题旁有"● 12 new events"小圆点提示新事件

---

## 7. 路由 + 鉴权细节

```
/login               → 现有 (OFI/Provider demo accounts)
/ofi                 → OFI role only (beforeLoad redirect → /login)
/provider            → Provider role only (beforeLoad redirect → /login)
/api/events/stream   → SSE 端点, SSE EventSource
/api/events/recent   → 轮询 fallback
```

**已决策**:

- **保持 `/provider` 路由不重命名** —— 零成本,与现有路由一致。
- **OFI/Provider 各自 demo 身份、独立 auth** —— 沿用现有 `auth.service.ts` 双角色 demo 账号。

---

## 8. 测试策略

### 8.1 单元测试(vitest)

- `quote-mapper.test.ts` 已存在 → 扩展加 agtpay new endpoints (publish, ledger, limit)
- `network.test.ts` 改 async + mock agtpay client
- `event-log.test.ts` ★新增 — push / list / SSE 流
- `agtpay-mapper.test.ts` ★新增 — Connect-RPC wire format

### 8.2 集成测试(bun run scripts/)

- `scripts/test-ofi-getquote-live.mjs` 已存在 → 扩展覆盖 createPayment / payOut / finalize
- `scripts/test-ofi-payment-flow.mjs` ★新增 — 端到端走完 16 步
- `scripts/test-provider-e2e.mjs` ★新增 — Provider 端 publish + payOut callback

### 8.3 端到端(Playwright e2e-ofi-getquote.mjs 已存在 → 扩展)

- `/login` → OFI 身份 → 走 16 步 → Provider 端看到同一 payment
- 双页面同步刷新验证

---

## 9. 实施顺序(8 步)

1. **types.ts 扩展** + 现有测试兼容
2. **agtpay-client.ts + agtpay-mapper.ts + unit tests** —— 5 + 3 = 8 个端点的客户端
3. **event-log.ts + SSE stream endpoint** —— 跨页面事件总线
4. **t0.functions.ts 加 server fns** —— OFI/Provider 各 5-8 个新 fn
5. **network.ts / provider.ts 改造** —— 委派到 agtpayClient
6. **`/ofi` 页面重写** —— 4-section layout + 16-step pipeline
7. **`/provider` 页面重写** —— 4-tab layout + PayOut queue
8. **E2E + live 验证** —— Playwright 双页面同步测试 + bun scripts

预计工作量:中等(~3000-4000 行新代码 + 测试),工期长。

---

## 10. 范围外(明确不做)

| 不做 | 原因 |
|---|---|
| Provider 真实 HTTP server + ngrok | 决策 "不联调 RPC 方向" |
| 真实 USDT 链上交易确认 | 用 mock confirmation timer |
| USDT 多 confirmation 等待 | mock "1-2 minutes" 在后台 5s 后直接 confirm |
| 真实 travel rule 加密 (IVMS101) | UI 表单收集数据原样转发 |
| 跨会话 event 持久化 | 内存即可(demos 短会话) |
| `/provider` → `/sandbox` URL 重写 | 保持现有路由 |
| 真实 SSE 连接重试与 keepalive | 浏览器原生 EventSource 处理 |

---

## 11. 已确认决策汇总

| 问题 | 决策 |
|---|---|
| `/sandbox` 路由 | **保持 `/provider`**(零成本) |
| 双页面实时同步机制 | **SSE 实时推送** |
| 16 步 lifecycle 推进 | **服务端自动推进 8-12**,OFI 仅在 step 12 manualAml 介入 |
| agtpay 角色 | **权威 Network**,本地 = 控制器 + RPC server |
| Provider RPC 回调 | **不联调**,本地 mock 所有 RPC 调用 |
| 双页面关系 | **独立运营,共享 agtpay 后端真实状态** |
| 鉴权 | **OFI/Provider 各自 demo 身份、独立 auth** |

---

## 12. 需要你确认的关键决策

在我开始实施之前,需要你确认是否可以开始。

**预计工作量**: ~3000-4000 行新代码 + 测试。本次是产品级重构,比上一轮 GetQuote 重构大 3-5 倍。

请确认是否开始实施。

---

## 附录 A: agtpay Connect-RPC wire-format 适配备忘

基于上轮 OFI GetQuote 重构时实测的真实响应:

```json
// Request (camelCase via OpenAPI spec)
{
  "amount": { "unscaled": 1000, "exponent": 0 },
  "amountType": "settlement",
  "payOutCurrency": "EUR",
  "payOutMethod": "PAYMENT_METHOD_TYPE_SEPA"
}

// Response (PascalCase via Connect-RPC proto3 JSON)
{
  "Result": {
    "Success": {
      "rate":           { "unscaled": 86, "exponent": -2 },
      "expiration":     { "seconds": 1783589854, "nanos": 905710000 },
      "quote_id":       { "quote_id": 220299073, "provider_id": 7 },
      "pay_out_amount": { "unscaled": 860, "exponent": 0 },
      "settlement_amount": { "unscaled": 1000 }
    }
  },
  "all_quotes": []
}
```

**关键适配规则**:

1. Envelope: `result` ↔ `Result`
2. Fields: `quoteId` ↔ `quote_id`, `providerId` ↔ `provider_id`,
   `payOutAmount` ↔ `pay_out_amount`, `settlementAmount` ↔ `settlement_amount`
3. Time: RFC3339 string ↔ proto Timestamp `{ seconds, nanos }`
4. Reason: string enum ↔ integer enum(`1` + `10` 都是 NO_QUOTE)
5. 默认值为 0 的字段可能被 proto3 encoder 省略;`decimalToNumber` 容忍 `exponent` 缺失
6. 所有 ProviderService RPC 端点都需要 `X-Public-Key` + `X-Signature` + `X-Signature-Timestamp` 头

`HttpOfiT0Client.parseResponse` 已经在 `src/lib/t0/ofi-client.ts` 实现双格式解析;新加的 `AgtpayClient` 继承同一 mapper 模式。

---

## 附录 B: 16 步 lifecycle → server fn 映射

| 步 | 文档 | UI 入口 | OFI server fn | Provider 关联 |
|---|---|---|---|---|
| 1 | UpdateQuote | /sandbox Tab 1 | - | publishQuoteFn |
| 2 | Get Quote | /ofi Step 01 | ofiGetQuoteFn | - |
| 3 | Quote Response | /ofi Step 01 result | (side-effect of #2) | - |
| 4 | USDT Settlement Transfer | /ofi Step 02 | ofiNotifyUsdtFn | - |
| 5 | USDT Tx Notification | /ofi Step 02 | (side-effect) | - |
| 6 | Credit Usage → OFI | /ofi Step 02 result | (side-effect) | - |
| 7 | Credit Usage → POP | /sandbox Tab 1 | - | (broadcast) |
| 8 | Create Payment | /ofi Step 03 | ofiCreatePaymentFn | - |
| 9 | Payment Processed | /ofi Step 04 | (server-side) | - |
| 10 | Payment Accepted | /ofi Step 04 | (server-side) | - |
| 11 | Payout Request | /sandbox Tab 2 | - | providerServiceImpl.PayOut |
| 12 | Payout Accepted / Manual AML | /ofi Step 04 | ofiResolveAmlFn | - |
| 13 | Credit Usage → OFI | /ofi Step 04 | (side-effect of #12) | - |
| 14 | Credit Usage → POP | /sandbox Tab 3 | - | (broadcast) |
| 15 | Payout Success | /ofi Step 04 | (side-effect of #12) | - |
| 16 | Payment Confirmed | /ofi Step 04 + /sandbox Tab 3 | (side-effect) | (broadcast) |