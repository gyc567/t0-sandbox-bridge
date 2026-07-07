# T-0 业务桥重构方案 (v3.1 · 用户已确认 4 个决定)

> **定位**: T0 业务重构方案。与 `docs/redesign-plan.md`(视觉重设计)正交。
> **状态**: 草案 v3.1,基于完整的 `proto/tzero/v1/**/*.proto` + `proto/ivms101/v1/ivms/ivms101.proto` + `node/starter/template/**` 逐文件审计,以及用户输入(20 人左右 / Vercel 部署 / ETH+BSC 链 / 4 个决定已确认)。
> **日期**: 2026-07-06
> **v3.1 相对 v3 的变化**: 用户已确认 4 个开放问题(派生路径格式、IVMS101 zod 简化、`client_quote_id` 反查方案、Excel 3 步导入),`docs/.plan/` 中的实施 task list 已并入本文 §11;补充 ivms101 真实字段结构;补充现有 `src/lib/auth` 模块扩展(非重建);补充 `vercel.json` 加 crons。

---

## 0. TL;DR(基于新事实全面重写)

- **核心角色对齐**: 会议说的「Off-ramp / Provider / 兑付方」**对应 T0 Network 协议里的 `pay-out provider` 角色**。不是 3 个角色,是 2 个:`pay-out`(我方)和 `pay-in`(对端)。`payment_intent` 是独立的 beneficiary 流,我方 MVP **不实现**。
- **协议核心动作**(从 `node/starter/template/src/service.ts` 校准):
  - 我方: `updateQuote`(报价)→ 收 `payOut`(T0 推过来)→ 返 `accepted` 或 `manual_aml_check`→ 运营 AML 通过 → 调 `approvePaymentQuotes` 锁价 → 运营点击付款 + 链上 USDT 确认 → 调 `finalizePayout(success/failure)`
  - 不再有 `updatePayment.confirmed` 由我方主动接受——starter 完全不实现这个 handler
- **保留**: SDK 适配层、签名接收(`t0-receiver`)、`currencies`、`csv`、`ecdsa`、`events`、`quote-message`(改名)。
- **重写**: `provider.ts`(状态机,基于 proto `PayoutResponse` 三态)、`network.ts` → `__test__/fake-network.ts`、`provider-impl.ts`(语义大改,见 §3.2)、`t0.functions.ts`。
- **新增**: 持久层(SQLite + Drizzle)、应用层(`ProviderWorkflow` + `ManualAmlService` + `WalletAddressPool`)、worker(`QuotePublisher`)、控制台(`/console/*`)、Excel 流水线、**运营角色分权 + audit_log**(20 人需要)。
- **关键修正 v2 → v3**:
  1. AML 数据**已经在 RPC body 里**(IVMS101 originator + beneficiary)——不是下载附件
  2. `payOut` 是异步协议——我方先 accept,自己异步完成,**主动** finalizePayout 回 T0,不要等 confirmed
  3. `updateQuote` 是**全量替换**,并发更新会丢报价——`QuotePublisher` 必须串行
  4. 20 人规模 → 必须有 admin / operator 二级以上权限 + 完整 audit_log,Vercel 部署限制 → 不要 SQLite,改 **Vercel Postgres + Drizzle**(v2 的 D1 必须改)

---

## 1. 关键事实校准(基于真实文档,不是猜测)

### 1.1 网络协议全貌(从 proto + starter 推导出)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       T-0 Network                                    │
│                                                                     │
│   pay-out provider (我方)              pay-in provider (对端)        │
│        ▲                                       │                     │
│        │ PublishQuote                          │ PublishPayInQuote  │
│        │ (updateQuote, 全量)                  │ (updateQuote)      │
│        ▼                                       ▼                     │
│   ┌─────────────────────────────────────────────────────────┐        │
│   │  T0 Network 核心                                        │        │
│   │  - quote 编排:GetQuote 返回 all_quotes[] 让 OFI 挑     │        │
│   │  - CreatePayment:pay-in 发,锁 pay-out provider,       │        │
│   │    拿 quote_id → 转发 payOut() RPC                     │        │
│   │  - ApprovePaymentQuotes:pay-out 锁价                   │        │
│   │  - FinalizePayout:pay-out 主动回报成功/失败             │        │
│   │  - CompleteManualAmlCheck:pay-out 主动回报 AML 结果     │        │
│   │  - UpdatePayment:T0 通知 pay-out 状态(confirmed/failed)│        │
│   └─────────────────────────────────────────────────────────┘        │
│        ▲                                       │                     │
│        │ payOut(req)                          │ payOut(req)         │
│        │ (我方接受,可能返 accepted/aml_check) │                     │
└────────┼───────────────────────────────────────┼─────────────────────┘
         │                                       │
   我方 Application                              对端
   (pay-out provider)
```

### 1.2 我方必须实现的 4 个 RPC 入站(`service.ts`)

```ts
// 由 T0 主动调用我方
- PayOut(PayoutRequest) → PayoutResponse{accepted|manual_aml_check|failed}
- UpdatePayment(UpdatePaymentRequest) → UpdatePaymentResponse{}
- UpdateLimit(UpdateLimitRequest) → UpdateLimitResponse{}
- ApprovePaymentQuotes(ApprovePaymentQuoteRequest) → ApprovePaymentQuoteResponse{accepted|rejected}
- AppendLedgerEntries(AppendLedgerEntriesRequest) → AppendLedgerEntriesResponse{}
```

### 1.3 我方必须实现的 3 个 RPC 出站(`networkClient`)

```ts
// 我方主动调用 T0
- networkClient.updateQuote({ payOut: [...] })    // 全量替换!!
- networkClient.finalizePayout({ paymentId, result })   // 异步回调
- networkClient.completeManualAmlCheck({ paymentId, result: approved|rejected })

// 我方可选择(debug / 健康检查)
- networkClient.getQuote({ ... })
- networkClient.createPayment({ ... })    // 自测用
```

### 1.4 `updateQuote` 全量替换陷阱(关键)

从 `node/starter/template/src/publish_quotes.ts:11-12` 注释(原样):
> "Every update quote request discard all previous quotes that were published before. So if you want to publish multiple quotes, you need to combine them into a single request. Otherwise, if you send multiple requests, only the quotes from the last one will be available."

**含义**:
- 我方推送报价前,**必须先聚合所有活跃 quote 进一个数组**,一次性 updateQuote
- 如果用 `setInterval(tick, N)` 在 worker 里跑,每次都要从 `QuoteRepo` 把所有 active quote 聚合
- 并发 worker 之间需要**串行化**或用乐观锁,否则会丢报价
- 推空数组 = 撤回全部报价

### 1.5 `payOut` 真实语义(async / accept-then-finalize)

从 `service.ts:28-58` 注释 + starter 实现可推断:

```
T0 ─── payOut(req) ───▶ 我方
                       │
                       ├─ 立即返回:
                       │   result.case = "accepted"        → 我方承诺会执行
                       │   result.case = "manual_aml_check" → 我方先要 AML,通过后再 completeManualAmlCheck
                       │   result.case = "failed"           → 我方这次拒了
                       │
                       └─ (运营 AML 通过 + 链上 USDT 到账 + 法币已发) 后,我方主动:
                          networkClient.finalizePayout({ paymentId, result: success|failure })
                          // ↑ 这一步必须做,否则 T0 不知道 payment 状态
```

**修正 v2**:v2 把 `processPayout` 拆 `requestPayout`/`confirmPayout`,语义对,但**漏了 finalizePayout 调 T0 这一回调动作**——这是协议硬要求。

### 1.6 AML 数据**不需要下载**(v2 错误假设)

`PayoutRequest.travel_rule_data` 包含完整的:
- `repeated ivms101.Person originator`(≥1)— 谁付的钱
- `repeated ivms101.Person beneficiary`(≥1)— 收款人
- `optional ivms101.Person originator_provider` — 付款方机构的法律实体

**完整地** 以结构化 protobuf 给了我们。**运营审核时是看这些字段** + 我们的内部白名单匹配 / 风险打分,**不是下载附件**。

`v2 §1` 把「下载附件」列为必备功能是误读。**修正**:evidence 表继续保留(我们内部的链上 USDT 凭证+人工审核笔记+导出快照),但不是"下载 OFI 文件"。

### 1.7 我决定的 `updatePayment.confirmed` 语义

**事实**:`UpdatePaymentRequest.Confirmed { paid_out_at: Timestamp; receipt: PaymentReceipt }` 表示「T0 想通知我方:这个 payment 已经从你侧成功放款」。但 starter 没实现 handler——因为 pay-out 自己是发起 finalizePayout 的一方,T0 不再需要回传。

**我的决定**:**MVP 不消费 `updatePayment.confirmed`**,handler 返回 `{}`,不推进状态机。理由:
- 我方主动 `finalizePayout(success)` 就是 confirmed 的发起者,再被 T0 回传 confirmed 是重复语义
- 如果 T0 因任何原因认为此次 finalizePayout 没生效(网络重试等),T0 会再次 `updatePayment.confirmed`——我们必须有 idempotent handler,但状态机里这个 case 应该走到 `payment_confirmed_by_network` 而不是再次推进
- P5 阶段如果发现 T0 实际发 confirmed 不止于此种情况,再扩 handler

`UpdatePayment.failed` 必须处理:把 payment 标 `failed` 终态,触发 audit_log。

### 1.8 IVMS101 真实字段结构(完整 proto 已读,基于 `proto/ivms101/v1/ivms/ivms101.proto`)

`Person` 是 oneof(必须二选一):
- `NaturalPerson` — 自然人:`name`(primary + secondary identifier,必填)+ `geographic_addresses`(repeated,可选)+ `national_identification` + `customer_identification` + `date_and_place_of_birth` + `country_of_residence`(ISO 3166-1 alpha-2)+ `phone` + `email`
- `LegalPerson` — 法人:商业名称 + 商业地址 + 注册号(CUIT/CNPJ/LEI 等)+ 行业代码 + 国籍

`PayoutRequest.travel_rule_data` 必传(`buf.validate.field.required = true`):
- `repeated ivms101.Person originator`(≥1)— 付款人(自然人或法人)
- `repeated ivms101.Person beneficiary`(≥1)— 收款人
- `optional ivms101.Person originator_provider` — 付款方机构法律实体

**我方内部存储策略**:
- 完整 proto 字节 base64 存 `payments.travel_rule_json` (jsonb)— 用于审计 + 完整重现
- 同时用 zod schema 解析出简化视图(`TravelRuleSnapshot`):
  ```
  TravelRuleSnapshot = {
    originators: Array<{ kind: "natural", fullName: string, country?: string, nationalId?: string } |
                           { kind: "legal", name: string, registrationNumber?: string, country?: string }>,
    beneficiaries: Array<...同上...>,
    originatorProvider?: { name: string, country: string, registrationNumber?: string },
  }
  ```
- 运营审核面板展示简化视图 + "查看完整 IVMS101" 抽屉(可折叠 JSON)
- 真实数据丢失风险:**0**(完整字节在 jsonb 里,UI 只过滤展示字段)

### 1.9 现有 `src/lib/auth` 模块的扩 vs 重建

**重要发现**:代码库里 `src/lib/auth/{types,store,service,auth.functions,singleton,index}.ts` **已经存在** 2-role(`ofi` / `provider`)鉴权实现。`src/lib/auth/auth.functions.ts` 已经用 cookie session,`src/routes/login.tsx` 已经用 `guardRole` 守路由。

**v3.1 决定**:**扩展**(非重建)。具体改动:
- `Role` 由 2 扩为 3:`"operator" | "compliance_lead" | "super_admin"`
- `InMemoryUserStore` → `DualUserStore`(生产用 `PgUserStore` 基于 Drizzle,dev/test 用 in-memory)
- 密码 hash 从 SHA-256 换 `bcryptjs`
- 加 5 次失败 lockout 15min
- 双 cookie(session 30min 短 + refresh 8h 长)
- `guardRole` 升级为支持角色层级(operator < compliance_lead < super_admin)
- `routeFromRole("super_admin")` 跳 `/console`,`routeFromRole("operator")` 跳 `/console/inbox`
- `/ofi` 路由删除(MVP 不实现 OFI 视图),`/login` 保留但加 super_admin / compliance_lead / operator 三个种子

**保留**:`singleton.ts` 的 `globalThis` 缓存模式(Vite SSR 模块图重评估问题)

### 1.10 链选择:ETH + BSC

`DecimalSchema` 本身没有 chain 字段(只描述金额)。链选择体现在:
- `WalletBinding.chain` 选择 `ETH` 或 `BSC`
- USDT 在两条链都有合约地址(走 `<stablecoin_id, blockchain_id>` 维度,跟官方常见方案一致)

**MVP 决策**(用户已确认):**两条链都派生,OFI 自选 / 运营分配**;P3 阶段再考虑路由优化。派生路径:
- ETH: `m/44'/60'/OFI_IDX'/0/0`
- BSC: 同 ETH 派生路径(链 ID 56 在签名时不参与 EIP-155 之外的计算;v3.1 暂以同一索引派生两条链,wallet 表用 `(chain, ofi_id, idx)` 复合键唯一)

USDT 合约地址常量:
- ETH mainnet: `0xdAC17F958D2ee523a2206206994597C13D831ec7`(6 decimals)
- BSC mainnet: `0x55d398326f99059fF775485246999027B3197955`(18 decimals)
- ⚠️ decimals 不同,运营/前端必须显示

### 1.11 20 人运营 + Vercel 部署的含义

**20 人**:
- 单一密码 hash **不够**,必须分角色:`super_admin`(1-2,管账 + 配)+ `compliance_lead`(2-3,管 AML)+ `operator`(15+,执行)
- `audit_log` 表是**必须**,运营点任何按钮都必须写入
- Excel 双通道是**省人力的关键**——不需要 20 人同时在线,导出 → 离线复核 → 回导
- Web 控制台可加「待办池」分配:operator A 看不完转给 B

**Vercel 部署**:
- SQLite **不能用**(Vercel Functions 文件系统不持久)→ **必须 Vercel Postgres + Drizzle**
- 后台 worker 在 Vercel 上要 **Vercel Cron**(`vercel.json` 的 `crons`),不是 `setInterval`
- 单进程内存(`let counter`)仍然**不安全**,完全靠 Postgres 的 ULID/序列

---

## 2. 状态机(基于 proto 真实字段,正式版)

### 2.1 Payment 状态(终态集: `payout_success` / `payout_failed` / `cancelled`)

```
[quote_published]
      │ OFI 调 GetQuote 拿到 quote_id → CreatePayment (我方从 updatePayment.received 收到)
      ▼
[payment_received]                  ← network 已把 payment 推到我们这边
      │ (内部事件:network sent PayoutRequest)
      │ 同时我方已立即返回 manual_aml_check 或 accepted
      ▼
[awaiting_manual_aml]                ← 状态机在等运营,卡住
      │ operator.approve OR reject
      ▼
   ┌──┴──────────────────┐
   ▼                     ▼
[aml_passed]       [aml_rejected] → [payout_failed]    (调 finalizePayout(failure))
   │
   │ 运营点"确认报价" → 调 approvePaymentQuotes
   ▼
[quote_confirmed]
   │
   │ 运营点"完成付款"+ 链上 USDT 到账
   ▼
[confirming_payout]                  ← 短暂态,内部记账
   │ (后台: 调 finalizePayout(success))
   ▼
[payout_success]                      ← 终态
```

**主动转换**(我方触发):
- `manualAml.approve` → `[awaiting_manual_aml] → [aml_passed]`
- `manualAml.reject` → `[awaiting_manual_aml] → [aml_rejected] → [payout_failed]`
- `quoteConfirm` → `[aml_passed] → [quote_confirmed]`
- `payoutConfirm` → `[quote_confirmed] → [confirming_payout]` → 后台 finalizePayout → `[payout_success]`
- `completeManualAmlCheck(t0)` → 上述状态的副产物,**T0 内部一致**

**被动转换**(T0 推过来):
- `updatePayment.failed` → 任意非终态 → `[payout_failed]`(例如 OFI 主动 cancel / 限额超)
- `updatePayment.accepted` → 我方在 `[payment_received]` 时已经处理,**重复 idp skip**

每个 setter **必须**走 `stateMachine.transition(payment, event)`,**非法转换抛 `InvalidTransitionError`**(测试覆盖)。`stateVersion` 乐观锁。

### 2.2 字段(扩 v2)

```ts
interface Payment {
  id: string;                  // 业务主键,ULID
  networkPaymentId: bigint;   // T0 分配的 uint64(从 PayoutRequest.payment_id 转)
  paymentClientId: string;     // OFI 侧的 client_id(从 CreatePayment)
  ofiId: string;
  currency: Currency;
  amountUsd: number;
  amountLocal: number;        // 推算: amountUsd * rate
  rate: number;                // 报价时锁定
  quoteId?: bigint;            // T0 分配的 quote_id(从 PayoutRequest 透出)
  clientQuoteId?: string;      // 我方报出去的 quote 的 client_quote_id(用于 ApprovePaymentQuotes)
  status: PaymentStatus;
  travelRuleData: TravelRuleSnapshot;  // 来自 PayoutRequest.travel_rule_data
  payoutDetails: PaymentDetailsSnapshot;  // OFI 收款方式(SEPA IBAN 等)
  finalizeAttempts: FinalizeAttempt[];   // 重试 finalizePayout 的历史
  operatorActions: OperatorAction[];     // 审计
  createdAt: number;
  updatedAt: number;
  stateVersion: number;
}

interface TravelRuleSnapshot {
  originators: Array<{ natural: true; firstName?: string; lastName?: string; ... } | { legal: true; name: string; lei?: string; ... }>;
  beneficiaries: Array<{ natural: true; ... } | { legal: true; ... }>;
  originatorProvider?: { ... };
  // 来自 ivms101.Person,简化内部表示(不存 proto 字节)
}

interface FinalizeAttempt {
  attemptAt: number;
  success: boolean;
  error?: string;
  receipt?: unknown;
}
```

---

## 3. 实现缺口(对照现状,基于新事实重写)

### 3.1 SDK 适配层 — 全部保留

- `sdk-adapter/sdk-client/sdk-signer` 已经基于 `@t-0/provider-sdk`,改:
  - 在 `sdk-client.ts` 加 `publishQuotes(bands[])` 多 band 支持(已有大概率是单)
  - 加 `finalizePayout(paymentId, result)` / `completeManualAmlCheck(paymentId, result)` 显式 API
- `t0-receiver.ts` 继续验签 + Web Fetch 分发,**保留现有实现**(`networkPublicKey` 从 env 读,已对接)

### 3.2 `provider-impl.ts` — 必须大改(原来问题更大)

| 现状 | v3 修正 |
|---|---|
| `payOut` 立即 `processPayout` 然后回 accepted | 改为:`payOut` 收到 → 写 `payment_received` → **返 `manual_aml_check`**(默认,我们做 AML)→ 异步由 AML 通过触发 approvePaymentQuotes |
| `payOut` 缺 `travel_rule_data` 持久化 | 完整存到 `payment.travelRuleData` |
| `payOut` 缺 `payout_details` 持久化 | 存到 `payment.payoutDetails`,运营审核时可见收款 IBAN/账号 |
| `updatePayment.accepted` 把 `quoteId` 误传成 `paymentId` | 删掉这个分支逻辑(我方已经是 `accepted` 触发方,不该再处理) |
| `updatePayment.manualAmlCheck` 自动 reject | **完全删除这个分支**(我方是发 AML 的一方,不是被动接收方) |
| `updatePayment.failed` 是 no-op | **改为**: 非终态 → `[payout_failed]` + 写 audit_log |
| `approvePaymentQuote` hardcode 改 quote.expiresAt | 完全重写: 接受 pay_out_quote_id/rate/amount/fix,**只校验 payment 状态为 `[awaiting_manual_aml]`,通过则状态推进到 `[quote_confirmed]`** |
| `processPayout` 同步永真 | **完全删除**;最终化走 `ProviderWorkflow.confirmPayout(paymentId, settlement)` → 后台调 `networkClient.finalizePayout` |
| 没注册 `SystemService.Health` | 加,响应 SDK 内置 health check |
| Network pubkey 从 env 读 | 保留 |

**新文件骨架**(伪代码):
```ts
export function createProviderServiceImpl(deps: { workflow: ProviderWorkflow; finalizer: Finalizer }) {
  return {
    async payOut(req, ctx) {
      const paymentId = await deps.workflow.receivePayment({  // 写 payment_received + 等运营
        networkPaymentId: req.paymentId,
        paymentClientId: ..., // OFI 在 CreatePayment 时给
        currency: req.currency,
        amountUsd: req.amount,
        clientQuoteId: req.clientQuoteId,
        beneficiaryProviderId: req.payInProviderId,
        travelRule: req.travelRuleData,
        payoutDetails: req.payoutDetails,
        receivedAt: ctx.time,
      });
      return create(PayoutResponseSchema, {
        result: { case: "manual_aml_check", value: create(PayoutResponse_ManualAmlCheckSchema, {}) },
      });
    },

    async updatePayment(req, ctx) {
      switch (req.result.case) {
        case "failed":
          await deps.workflow.markFailedByNetwork(req.paymentId, req.result.value);
          break;
        case "confirmed":  // MVP no-op 见 §1.7
        case "accepted":
        case "manual_aml_check":
          // ignored: 我方是发起方,不会从这里收到
          break;
      }
      return create(UpdatePaymentResponseSchema, {});
    },

    async approvePaymentQuotes(req, ctx) {
      // 校验 payment 状态为 awaiting_manual_aml,通过则推进到 quote_confirmed
      const ok = await deps.workflow.confirmQuote(req.paymentId, {
        clientQuoteId: req.clientQuoteId,  // ← req 字段实际没有,要本地映射
        rate: req.payOutRate,
        amount: req.payOutAmount,
        fix: req.payOutFix,
      });
      return create(ApprovePaymentQuoteResponseSchema, {
        result: ok
          ? { case: "accepted", value: create(ApprovePaymentQuoteResponse_AcceptedSchema, {}) }
          : { case: "rejected", value: create(ApprovePaymentQuoteResponse_RejectedSchema, {}) },
      });
    },

    // ...
  };
}
```

⚠️ `ApprovePaymentQuoteRequest` 没有 `client_quote_id`(只有 `pay_out_quote_id`),运营阶段需要**从 `network_payment_id` 反查**我方内部 `client_quote_id`。这是协议上的小别扭,要写注释提醒后续开发者。

### 3.3 `provider.ts` — 状态机重写 + `processPayout` 拆 `finalizePayout`

新方法:

```ts
class ProviderWorkflow {
  constructor(private deps: { paymentRepo, quoteRepo, t0Client, clock, logger }) {}

  // 入站:我方收到 PayoutRequest
  async receivePayment(input): Promise<string>  // returns internal paymentId
  // AML
  async manualAmlApprove(paymentId, operatorId): Promise<void>
  async manualAmlReject(paymentId, operatorId, reason): Promise<void>
  // 出站:运营点"确认报价"
  async confirmQuote(paymentId, proposedQuote): Promise<boolean>
  // 出站:运营点"完成付款"
  async requestPayoutFinalize(paymentId, operatorId, txHash): Promise<void>
  // 内部:后台 worker 调 T0
  async finalizePayout(paymentId, attemptN): Promise<FinalizeAttempt>
  // 入站:被 T0 通知失败
  async markFailedByNetwork(paymentId, reason): Promise<void>
  // 入站:被 pay-in OOB 触发(可选)
  async reconcileOnStartup(): Promise<void>
}
```

每个 setter 走 `stateMachine.transition(...)`。

**删除**:`completeManualAml` (接受 boolean 的旧 API), `rekeyPayment` / `rekeyQuote`(应该用 ULID,不需要这种 hack), `let counter`(模块级)。

### 3.4 删 / 移

| 文件 | 处理 |
|---|---|
| `client.ts` | **删**,唯一功能(`emit`)被 `t0Client` 吸收 |
| `network.ts` | **迁到 `__test__/fake-t0-client.ts`**,只供测试 mock |
| `ofi.ts` | **保留接口迁到 `app/__internal__/ofi-mock.ts`**,MVP 不接路由,仅供前端调试 |

### 3.5 工具 / 库

| 文件 | 处理 |
|---|---|
| `quote-message.ts` | **改名 `quote-failure-message.ts`**(误导)。新增 `app/quote.ts`(多 band、过期判断、T0 quote_id 映射) |
| `csv.ts` | **保留**,脚本消费 |
| `excel.ts` | **新建**(`exceljs`) |
| `currencies.ts` | **保留**,SSoT |
| `ecdsa.ts` / `events.ts` | **保留** |
| `t0.functions.ts` | **重写**,全部 zod,合并 dashboard 数据接口 |
| `types.ts` | **大改**,加 `Payment`/`TravelRuleSnapshot`/`OperatorAction` 等 |

### 3.6 路由 / 控制台

| 路径 | 处理 |
|---|---|
| `src/routes/api/t0/provider/$.ts` | **保留**(已实现 `t0-receiver`),只需补 NetworkService 双注册 |
| `src/routes/api/` 其它 | **新建**:`/excel-export/[report]`, `/excel-import/[type]`, `/settlement/notify`(webhook), `/healthz` |
| `src/routes/console/*` | **新建**,见 §5 |
| `src/routes/ofi.tsx` | **删** MVP 不实现 |
| `src/routes/provider.tsx` | **重命名为 `/console`** 或保留作 alias |

---

## 4. 部署 / 持久层(v3 核心修正)

### 4.1 Vercel 决定 → 必须 Postgres

- Vercel Functions **写不持久**(`/tmp` 重启丢失),SQLite file 不能用
- **Vercel Postgres + Drizzle**:
  - Neon Postgres(`@neondatabase/serverless`)→ Drizzle 友好、Vercel 集成、HTTP driver 适合 edge
  - 备选:Supabase Postgres
  - Drizzle 配 `drizzle-orm/neon-http`,无需 long-lived connection
- **❌ 不能 Vercel KV 做账目**(key-value 强 schema 弱,账目需要事务)

### 4.2 Cron + 后台 worker

- 用 Vercel Cron(`vercel.json:crons`)调度:
  - `*/1 * * * *` 推报价(= updateQuote 全量替换)
  - `*/15 * * * *` reconcile(从 T0 pull 状态纠正本地)
  - `*/1 * * * *` finalize 重试队列(失败 finalizePayout 重发)
- 不再用 `setInterval`(在 Vercel 上被函数生命周期限制)
- 推报价的并发安全:每次 cron tick 内部**持有 advisory lock**(`pg_try_advisory_lock`)

### 4.3 Schema (Drizzle)

```ts
quotes       (id, ofi_id, currency, bands_json, payment_method, published_at, expires_at, status)
payments     (id, network_payment_id BIGINT UNIQUE, payment_client_id, ofi_id, currency,
              amount_usd NUMERIC(20,2), amount_local NUMERIC(20,2), rate NUMERIC(20,8),
              quote_id BIGINT, client_quote_id, payout_provider_id, pay_in_provider_id,
              status, travel_rule_json, payout_details_json,
              state_version INT, created_at, updated_at)
events       (id, payment_id FK, type, payload_json, created_at)
wallet_bindings (id, ofi_id, address, chain, token, derivation_path, allocated_at, note)
operators    (id, username UNIQUE, password_hash, role, active, created_at)
audit_log    (id, operator_id FK, action, target_type, target_id, payload_json, created_at)
finalize_queue (payment_id FK PK, attempt INT, last_error TEXT, next_retry_at, locked_until)
```

`network_payment_id` 必须 UNIQUE(T0 不重复)+ 索引。
`state_version` 实现乐观锁。
`finalize_queue` 用 `SKIP LOCKED` 机制支持并发 worker。

### 4.4 Excel 流水线(ExcelJS,流式)

- **导出**(operator_compliance role 限定):
  - `aml-queue-YYYYMMDD.xlsx`:payment_id, ofi_id, currency, amount_usd, travelRule 摘要, 操作列(运营审批/拒)
  - `payouts-YYYYMMDD.xlsx`:完整字段 + tx_hash + FinalizeAttempt 历史
  - `wallet-bindings.xlsx`:所有 OFI ↔ 链 ↔ 地址映射
- **导入**(super_admin role 限定,必须二次确认 dry-run):
  - 批量替换 wallet-bindings(上传 CSV/TXT,提示影响范围)
  - 批量报价配置(冷启动场景)

⚠️ import 必须**预览 → 确认** 两步,不能一步写库。

---

## 5. 控制台信息架构(基于 20 人规模)

```
/console (登录, super_admin / compliance_lead / operator 三级)
│
├── /inbox                 分配给我的待办(AML、报价即将过期、Payout 卡住)
│   ├── /unassigned        (compliance_lead 看)待分配池
│   └── /:id               单笔详情
│       ├── evidence       链上 USDT 凭证 + 内部备注
│       ├── travel-rule    IVMS101 originator/beneficiary 详情
│       └── history        完整事件流
│
├── /quotes
│   ├── /active            当前报价(下次 cron 倒计时)
│   ├── /history           历史报价 + 错误率
│   └── /sources           报价源配置(MVP 手动;未来接外部)
│
├── /payments              所有 payment 表(operator 限定自己 ofi_id)
│   └── /:id               完整时间线
│
├── /wallets
│   ├── /bindings          OFI ↔ 地址绑定表(导出 .xlsx)
│   └── /deposits          USDT 入账记录
│
├── /evidence
│   └── /:hash             按 tx_hash 查 evidence
│
├── /excel
│   ├── /export            导出向导(选 report → 生成 .xlsx)
│   └── /import            导入向导(选 type → 上传 → 预览 → 确认)
│
└── /settings
    ├── /operators         (super_admin only)
    ├── /audit-log         (compliance_lead) 全审计
    └── /system            (super_admin only)
```

⚠️ 必须强制:
- operator **只能看 assigned or unassigned-to-me** 的 payment——他看别人 OFI 的不算合规
- 二次确认 destructive 操作(`payout failed` / `cancel`)
- audit_log 写入必须是**server function 拦的最外层 middleware**,业务代码不直接写

---

## 6. 决策记录(v3)

| # | 决定 | 反方 / 风险 |
|---|---|---|
| D1 | 持久化 **Vercel Postgres + Drizzle (Neon HTTP driver)** | Vercel KV / 外部 Supabase(自管麻烦) |
| D2 | 钱包 **HD 派生 ETH+BSC 双链**,mnemonic 走 secret manager | (A) 上 T0 验证后切方案 (C) 外部服务 |
| D3 | **不实现链上监听**;SettlementSource 接外部 webhook `/api/settlement/notify` | 自己用 ethers 多链 polling(工程质量高,Vercel Cron 不适合) |
| D4 | Excel 用 **`exceljs`**(流式、多 sheet) | `xlsx-populate`(只读) |
| D5 | 鉴权 **`bcryptjs` + server-side cookie session** + 3 级角色 | Auth.js / Vercel SSO(20 人不需要) |
| D6 | **保 SDK 适配层**,重写 provider-impl + 加 register SystemService.Health | 整层推倒(SDK 适配已测透) |
| D7 | **MVP 不实现 OFI 视图**、`payment_intent` 流 | 多 OFI 之后 / 业务分摊时再加 |
| D8 | 鉴权**双层 cookie**:session(短)+ refresh(长);登录失败 5 次 lockout 15min | 单 cookie(简单但越权风险) |
| D9 | `UpdatePayment.confirmed` **MVP no-op**(见 §1.7);`failed` 必须处理 | 都实现(P4 再做) |
| D10 | 推报价用 **Vercel Cron + Neon advisory lock** 串行化 | 不用锁 / 推 queue 后台 worker(过重) |

---

## 7. 阶段(基于 v3 修订)

> 每阶段结束:`bun run typecheck` + `vitest` + `bun run build` + E2E

**P0 · 数据 + 状态机地基(2-3 天)**
- Vercel Postgres + Drizzle 接入(含本地 docker-compose Postgres for dev)
- schema + 迁移文件
- `PaymentStateMachine`(合法转换矩阵 + 单测,**非法转换必须抛 err 测试覆盖**)
- `ProviderWorkflow` 骨架(状态转换 + 乐观锁)
- 修 `provider-impl.ts` 的语义反掉的 3 处 bug

**P1 · 协议侧对接(2-3 天)**
- `t0-receiver` 已实现,扩 `SystemService.Health` 注册
- 重写 `provider-impl.ts`(基于 proto 真实字段)
- `QuotePublisher` worker(Vercel Cron + Neon lock)
- `FakeT0Client` 给单测

**P2 · 鉴权 + 控制台骨架(2-3 天)**
- 登录页 + 三级角色 + 双 cookie session
- `/console/*` 全部 5+ 页面 + 服务端函数 zod
- 中间件强制 audit_log 写入

**P3 · AML + Payout(2-3 天)**
- `ManualAmlService`(approve / reject)
- IVMS101 详情渲染(简化展示,完整数据存 JSON)
- `finalizePayout` 后台 worker + 重试队列

**P4 · Excel + 控制台打磨(2 天)**
- `excel.ts`(导出 4 个 report + 导入 2 个)
- 空 / 错 / loading 状态
- AML 看板统计

**P5 · E2E + 文档(1-2 天)**
- Playwright E2E(已有 `scripts/e2e-*.mjs` 改造)
- `RUNBOOK.md`(给运营:日常 8 步、异常 12 步)
- `ARCHITECTURE.md`(给后续开发者)

---

## 8. v2 → v3 修订对照(新增/删/改)

| v2 章节 | v3 改动 |
|---|---|
| §0 现状 | 重写为协议真相(2 角色非 3) |
| §1.1 状态机存在但绕过 | 改为:状态机推断出真实转换 + v2 漏 AML,AML 数据已有 |
| §1.3 processPayout 拆 + 链上确认 | 改为:`processPayout` 删除,改 `requestPayoutFinalize` + 后台 `finalizePayout(success)` 调 T0(协议硬要求) |
| §1.6 evidence 下载附件 | **删除**:数据已在 RPC body;evidence 只存链上 USDT 凭证 |
| §1.8 quote-message.ts 改名 + 新增 | 保留 |
| §2.2 Quote 多 band | 保留,加 `fix`(proto Band.fix 字段) |
| §2.4 Wallet ETH+BSC 双链 | 落地为 `chain in {ETH, BSC}`,OFI 自选 |
| §3 后台 worker | 重写:Vercel Cron + Neon lock,不用 setInterval |
| §4.1 SQLite → Vercel | **核心修正**:SQLite 全部删除,改 Vercel Postgres + Neon |
| §5 控制台 5 页 | 扩为 6 区 + 强制分权 + audit_log |
| §6 处理清单 | 按 P0-P5 重排 |
| §8 P0-P5 阶段 | 重写时间分配 |
| §10 决策 | +D8/D9/D10 |
| (新) §1.7 | `updatePayment.confirmed` 决定:no-op |
| (新) §1.9 | 20 人 + Vercel 含义推导 |
| (新) §3.2 | `provider-impl.ts` 改写前后伪代码 |

---

## 9. 已确认的开放问题(用户 2026-07-06 输入)

| # | 开放问题 | 用户决定 | 落地点 |
|---|---|---|---|
| 1 | ETH+BSC 派生路径格式 | `m/44'/60'/OFI_IDX'/0/0`(OFI IDX 是 0-based 索引) | `HdWalletProvider.allocate` §5.3 |
| 2 | IVMS101 完整字段映射 | 用 zod schema 简化内部表示,完整 proto 字节存 `travel_rule_json` (jsonb),UI 只展示简化视图(姓名 + 国家 + 证件号) | `app/ivms101-schema.ts` + `components/console/Ivms101View.tsx` |
| 3 | `ApprovePaymentQuoteRequest` 没 `client_quote_id`,怎么对应我方 `clientQuoteId` | 通过 `network_payment_id` 反查本地 `payment` 表 → `clientQuoteId` | `ProviderWorkflow.confirmQuote(paymentId, ...)` 内部 join |
| 4 | Excel 导入的安全/审计边界 | 3 步:上传 → 预览 → 确认。`super_admin` 才能 confirm。所有操作走 `audit_log` | `console/excel/import.tsx` + `excelImportDryRunFn` / `excelImportConfirmFn` |

## 10. v3 → v3.1 修订对照(新增/改)

| v3 章节 | v3.1 改动 |
|---|---|
| §0 头 | 升 v3.1,标 4 个决定已确认 |
| (新) §9 | 加 4 个已确认决定的落地点表 |
| (新) §11 | 实施 task list 25 个任务 |
| §8 阶段 | 时长细化到具体工作日 + 每阶段验收 |
| §3.2 伪代码 | (无变化,但确认: `clientQuoteId` 从 `payment` 表反查) |
| §5 控制台 | 强调 3 步导入 + super_admin 限定 |
| §4 部署 | 加 `vercel.json:crons` 具体配置(quotes 1min, finalize 5min) |
| §1.7 | (无变化,`updatePayment.confirmed` MVP no-op 维持) |

## 11. 实施 task list(25 个任务,P0-P5)

> 每阶段结束:`bun run typecheck` + `vitest` + `bun run build` + 对应阶段的 E2E
> 总时长:**10-15 个工作日(单人)**;每个任务有明确的"修改/新建文件"和"验收"标准。

### 11.1 P0 · 数据 + 状态机地基(2-3 天)

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| 2.1 | 添加依赖 + 配置 Vercel Postgres | `package.json` / `drizzle.config.ts`(新建)/ `vercel.json` / `.env.local.example`(新建) | `bun run db:generate` 成功 |
| 2.2 | Drizzle schema + 迁移 | `src/lib/t0/store/schema.ts`(新建) | migration 文件可双向生成 |
| 2.3 | Repo 接口 + in-memory 实现 | `src/lib/t0/app/ports.ts`(新建)/ `src/lib/t0/store/{in-memory,pg}/`(新建) | 单测通过 |
| 2.4 | `PaymentStateMachine` | `src/lib/t0/app/state-machine.ts`(新建) / `state-machine.test.ts`(新建) | ≥ 95% 覆盖,所有非法转换测到 |
| 2.5 | 修 `provider-impl.ts` 三个语义 bug | `src/lib/t0/provider-impl.ts` / `provider-impl.test.ts`(新建) | 现有测试不回归 + 新测试通过 |

**P0 关键决策**:
- `payments.network_payment_id` 用 Drizzle `bigint({ mode: "number" })` **UNIQUE**
- `state_version` 乐观锁,每个 setter 都校验
- `audit_log` append-only,无 update/delete 路径

### 11.2 P1 · 协议侧对接(2-3 天)

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| 3.1 | 重写 `provider-impl.ts` 完整版(基于真实 proto) | `src/lib/t0/provider-impl.ts`(大改) | 5 个 RPC 全部 happy + 关键 error path 测过 |
| 3.2 | `sdk-client.ts` + `sdk-adapter.ts` 加 `finalizePayout` / `completeManualAmlCheck` | 同(扩展) | 现有测试不回归 + 新增方法单测 |
| 3.3 | `client.ts` 迁 `__test__/fake-t0-client.ts` | 移文件 | `import "./client"` 全部更新 |
| 3.4 | `network.ts` 迁 `__test__/fake-network.ts` | 移文件 | 同上 |
| 3.5 | `QuotePublisher` worker + Vercel Cron | `src/lib/t0/workers/quote-publisher.ts`(新建) / `src/routes/api/cron/publish-quotes.ts`(新建) | 单测覆盖全量替换语义 + 沙盒 e2e 收到 updateQuote |

**P1 关键决策**:
- `payOut` 默认返 `manual_aml_check` — 我方默认做人工 AML
- 持久化 `req.travelRuleData` (IVMS101 → `TravelRuleSnapshot`) + `req.payoutDetails` (proto oneof → `PaymentDetailsSnapshot`)
- ⚠️ **PayoutRequest 没有 `paymentClientId`**:在 `CreatePayment` 时给,先存为 nullable,P0 schema 加 `payment_client_id` 字段
- 删除 `asLegacyT0Client` 适配(被 `ProviderWorkflow` 取代)
- `vercel.json` cron 配置:
  ```json
  "crons": [
    { "path": "/api/cron/publish-quotes", "schedule": "* * * * *" },
    { "path": "/api/cron/finalize-queue", "schedule": "*/5 * * * *" }
  ]
  ```

### 11.3 P2 · 鉴权 + 控制台骨架(2-3 天)

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| 4.1 | 扩 `auth` 模块(2 role → 3 role + bcryptjs) | `src/lib/auth/{types,store,service,auth.functions,singleton}.ts` | 3 种子账户可登录;失败 5 次 lockout 15min;httpOnly cookie |
| 4.2 | `OperatorRepo` + `AuditLog` + 中间件 | `src/lib/t0/app/ports.ts`(扩展)/ `src/lib/t0/store/pg/{operator,audit-log}.ts`(新建) / `src/start.ts`(改) | `bun run typecheck` 通过 |
| 4.3 | 控制台 14 个路由 | `src/routes/console/**`(新建) | 3 role 各自访问矩阵正确,无权跳首页 |
| 4.4 | 控制台 server functions(全部 zod) | `src/lib/t0/console.functions.ts`(新建) | 100% zod;每个 fn 单测 happy+越权+参数错 |
| 4.5 | 共享 `console` 组件 | `src/components/console/**`(新建/扩) | `console.test.tsx` 通过 |

**P2 关键决策**:
- Role 扩为 `"operator" | "compliance_lead" | "super_admin"`
- 密码 hash 从 SHA-256 换 `bcryptjs`(`hashSync(password, 10)`)
- `SESSION_COOKIE_MAX_AGE` 30min(短)+ `REFRESH_COOKIE` 8h(长)双 cookie
- operator 看不到 `/console/settings/*`
- `/console/excel/import` 仅 super_admin

### 11.4 P3 · AML + Payout(2-3 天)

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| 5.1 | `ManualAmlService` + 状态机联动 | `src/lib/t0/app/manual-aml.ts`(新建) / `manual-aml.test.ts`(新建) | approve/reject 测过,非法状态抛错,audit_log 写入 |
| 5.2 | `Finalizer` worker + 重试队列 | `src/lib/t0/workers/finalizer.ts`(新建) | 指数退避;PG 用 `SELECT ... FOR UPDATE SKIP LOCKED` |
| 5.3 | `WalletAddressPool` (HD 派生) | `src/lib/t0/app/wallet-pool.ts`(新建) | 派生测试 vector 一致;`SettlementSource` interface |
| 5.4 | IVMS101 简化 zod schema | `src/lib/t0/app/ivms101-schema.ts`(新建) | zod schema 通过;UI 展示真实数据 |

**P3 关键决策**:
- 派生路径 `m/44'/60'/OFI_IDX'/0/0`(用户决定 #1)
- `HdWalletProvider` 接受 `chain: "ETH" | "BSC"`,OFI 分配时选
- `SettlementSource` MVP 用 webhook(`POST /api/settlement/notify`)
- IVMS101 简化字段:NaturalPerson(primary_identifier + secondary_identifier + country_of_residence + national_identification);LegalPerson(name + lei + country)

### 11.5 P4 · Excel 流水线 + 控制台打磨(2 天)

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| 6.1 | `excel.ts`(导出 4 + 导入 2) | `src/lib/t0/excel/{export,import,types}.ts`(新建) | 4 个 report 内容正确;3 步导入;zod 二次校验 |
| 6.2 | `useDrizzle` 集成 + PG client 工厂 | `src/lib/t0/store/pg/client.ts`(新建) / `src/lib/t0/index.ts`(改) | `bun run dev` 起服务能 query |
| 6.3 | 控制台状态/错误/loading | `src/components/console/{ErrorBoundary,EmptyState,LoadingSkeleton}.tsx`(新建) | E2E 走 3 种状态 |

**P4 关键决策**:
- 导出:`aml-queue-YYYYMMDD.xlsx` / `payouts-YYYYMMDD.xlsx` / `wallet-bindings-YYYYMMDD.xlsx` / `audit-log-YYYYMMDD.xlsx`
- 导入:`wallet-bindings.xlsx` / `quotes-config.xlsx`,3 步强制(用户决定 #4)
- 导入 dry-run 返回 zod 校验后的 diff,不写库
- super_admin 才能 confirm

### 11.6 P5 · E2E + 文档(1-2 天)

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| 7.1 | Playwright E2E 改造 | `tests/e2e/**.spec.ts`(新建) | `bun run test:e2e:smoke` 跑通 |
| 7.2 | `RUNBOOK.md` + `ARCHITECTURE.md` | `docs/RUNBOOK.md` / `docs/ARCHITECTURE.md`(新建) | 运营培训可上手,新开发者 2 天内跑通 |
| 7.3 | 终审 + 覆盖检查 | `bun run verify` | 全绿;覆盖 ≥ 90%;单测 ≥ 200 |

**P5 验收**:
- `bun run verify` 全绿
- `vitest --coverage` ≥ 90%(新代码 100%)
- 完整端到端验证剧本(沙盒跑):
  1. 推 ETH USDT 地址到 wallet-bindings
  2. 触发 `QuotePublisher` 跑一次
  3. 沙盒 dashboard 看到报价
  4. 触发 mock payOut
  5. operator 角色看 IVMS101 详情
  6. AML 通过 → 确认报价 → 完成付款
  7. 验证 `finalizePayout` 调 T0
  8. 导出 `payouts-YYYYMMDD.xlsx` 验证

### 11.7 实施顺序图

```
P0 (2-3天)            P1 (2-3天)              P2 (2-3天)
┌──────┐              ┌──────────┐             ┌──────────┐
│ 2.1  │ deps + vercel│ 3.1      │ provider-impl│ 4.1      │ auth 3 roles
│ 2.2  │ schema       │ 完整重写 │             │          │
│ 2.3  │ repo ports   │          │             │          │
│ 2.4  │ state machine├──────────┤             │ 4.2      │ OperatorRepo
│ 2.5  │ 修 provider- │ 3.2      │ sdk-client   │          │ + audit_log
│      │ impl bug     │ +adapter │ finalize/aml│ 4.3      │ console 路由
└──┬───┘              │ 3.3      │ client→__test__│       │
   │                  │ 3.4      │ network→__test__│ 4.4  │ console.fn
   │                  │ 3.5      │ QuotePublisher│       │
   │                  └────┬─────┘             │ 4.5      │ console 组件
   │                       │                   └────┬─────┘
   ▼                       ▼                        ▼
P3 (2-3天)              P4 (2天)                 P5 (1-2天)
┌──────────┐             ┌──────────┐             ┌──────────┐
│ 5.1      │ ManualAml  │ 6.1      │ excel.ts    │ 7.1      │ Playwright
│ 5.2      │ Finalizer  │ 6.2      │ Drizzle     │ 7.2      │ RUNBOOK
│ 5.3      │ WalletPool │ 6.3      │ 状态/错误  │          │ +ARCH
│ 5.4      │ IVMS101    │          │             │ 7.3      │ verify
└──────────┘             └──────────┘             └──────────┘
```

### 11.8 关键风险 + 监控

| 风险 | 监控 |
|---|---|
| `updateQuote` 并发丢报价 | `quote_publish_total` / `quote_publish_failures_total` |
| `finalizePayout` 重试堆积 | `finalize_queue_depth` / `finalize_retry_429_total` |
| Sandbox pubkey 误用 | 启动时校验 hex 长度 + sandbox vs prod 路径分流 |
| Mnemonic 泄露 | 启动时检查 `T0_HD_MNEMONIC` 是否在 secret manager |
| 运营误操作 | 二次确认 + audit_log 强制 |
| Vercel Postgres 连接 | 启动时连接探活 + 失败 fail-fast |

### 11.9 显式不做的范围(避免蔓延)

- ❌ OFI 视图(`/ofi/*` 路由)— 单一 OFI,不上
- ❌ Payment Intent 流(`payment_intent_*` 三个 proto 文件)— 我方是 pay-out 不实现
- ❌ 外部报价源(MVP 手动)
- ❌ 链上监听(MVP webhook)
- ❌ 真实外部 wallet provider(MVP HD 派生)
- ❌ 多语言 i18n
- ❌ 移动端响应式优化

---

## 附录 A · 关键 proto 引文(来源 `proto/tzero/v1/`)

```proto
// payment/provider.proto — ProviderService
service ProviderService {
  rpc PayOut(PayoutRequest) returns (PayoutResponse);  // IDEMPOTENT
  rpc UpdatePayment(UpdatePaymentRequest) returns (UpdatePaymentResponse);  // IDEMPOTENT
  rpc UpdateLimit(UpdateLimitRequest) returns (UpdateLimitResponse);  // IDEMPOTENT
  rpc AppendLedgerEntries(AppendLedgerEntriesRequest) returns (AppendLedgerEntriesResponse);  // IDEMPOTENT
  rpc ApprovePaymentQuotes(ApprovePaymentQuoteRequest) returns (ApprovePaymentQuoteResponse);  // IDEMPOTENT
}

message PayoutResponse {
  oneof result {
    Accepted accepted = 20;              // 我方承诺执行
    Failed failed = 30;                  // 我方拒
    ManualAmlCheck manual_aml_check = 40; // 我方要先 AML
  }
}

message UpdatePaymentRequest {
  oneof result {
    Accepted accepted = 20;
    Failed failed = 30;
    Confirmed confirmed = 40;            // MVP no-op
    ManualAmlCheck manual_aml_check = 50; // MVP 不会收到
  }
  message Failed {
    enum Reason {
      REASON_UNSPECIFIED = 0;
      REASON_NO_QUOTE_AFTER_AML_APPROVAL = 1;
      REASON_QUOTE_REJECTED_AFTER_AML_APPROVAL = 2;
      REASON_AML_RISK_CHECK_FAILED = 3;
      REASON_CREDIT_LIMIT_EXCEEDED_AFTER_AML_APPROVAL = 4;
      REASON_REJECTED_BY_BENEFICIARY = 5;
      REASON_FINALIZE_FAILURE = 6;
    }
  }
}

message ApprovePaymentQuoteRequest {
  uint64 payment_id = 10;
  int64 pay_out_quote_id = 20;
  Decimal pay_out_rate = 30;
  Decimal pay_out_amount = 40;
  Decimal settlement_amount = 50;
  Decimal pay_out_fix = 60;  // 我方决策时考虑这个
}

// payment/network.proto — NetworkService (我方作为客户端)
service NetworkService {
  rpc UpdateQuote(UpdateQuoteRequest) returns (UpdateQuoteResponse);  // 全量替换!!
  rpc GetQuote(GetQuoteRequest) returns (GetQuoteResponse);
  rpc CreatePayment(CreatePaymentRequest) returns (CreatePaymentResponse);
  rpc FinalizePayout(FinalizePayoutRequest) returns (FinalizePayoutResponse);  // 我方主动
  rpc CompleteManualAmlCheck(CompleteManualAmlCheckRequest) returns (CompleteManualAmlCheckResponse);  // 我方主动
}
```
