# Pre-Settlement 流程方案（审计修订版）

> 状态：方案评审完成，待实施
>
> 日期：2026-07-10
>
> 范围：OFI `/ofi`、Provider `/provider`、AGTPay Quote API、T-0 ProviderService 回调
>
> 目标：实现 T-0 Payment Flow 第 4–7 步，并安全衔接第 8 步 Create Payment
> 本文取代此前仅面向页面的 Pre-Settlement 初版方案，但不取代现有测试报告。

参考资料：

- [T-0 Payment Flow](https://docs.t-0.network/docs/network/payment-flow/)
- [Settlement with Counterparties](https://docs.t-0.network/docs/network/provider-settlement/)
- [T-0 Payment Provider API](https://docs.t-0.network/docs/integration-guidance/api-reference/payment_provider/)
- [T-0 Idempotency](https://docs.t-0.network/docs/integration-guidance/idempotency/)
- [T-0 Supported Chains](https://docs.t-0.network/docs/network/supported-chains/)
- [AGTPay Swagger](https://api.agtpay.xyz/swagger/index.html)

---

## 0. 结论

Pre-Settlement 应设计成独立的「资金容量管理」流程，而不是某一笔 Payment 的附属步骤。

推荐最终形态：

1. AGTPay 继续作为 Quote API 和面向前端的后端入口。
2. T-0 Network 的 `UpdateLimit` 是 payout capacity 的唯一权威来源。
3. T-0 Network 的 `AppendLedgerEntries` 是账务明细的唯一权威来源。
4. 链上交易状态只解释“钱是否在链上确认”，不能直接修改业务余额。
5. OFI 可以按缺口充值，也可以一次充值覆盖多笔后续 Payment。
6. Provider 生产页面只观察、核对和处理异常，不提供人工“确认到账”。
7. Sandbox 的人工确认必须放在独立 Demo Tools 区域，不能伪装成真实流程。
8. Create Payment 前端校验只是体验优化，最终额度校验仍由 T-0 Network 完成。

在 UI 开发前必须先完成三个 P0 修正：

- 持久化 `UpdateLimit` 和 `AppendLedgerEntries`，不能继续 ACK 后丢弃。
- 修正 reserve/available 重复扣减和 OFI/Provider 同方向余额问题。
- 扩展 Quote mapper，保留 `prefundingAmount`、`creditLimit`、`totalUsed` 等资金字段。

---

## 1. 审计范围与当前态

### 1.1 已经存在的能力

| 子问题                        | 已有实现                              | 复用结论                                          |
| ----------------------------- | ------------------------------------- | ------------------------------------------------- |
| Provider 发布报价             | `src/lib/t0/client.ts`、`provider.ts` | 复用，不再新建第二套 Quote client                 |
| OFI 获取真实报价              | `ofi-client.ts`、`quote-mapper.ts`    | 复用并扩展 settlement 字段映射                    |
| ProviderService RPC           | `provider-impl.ts`                    | 复用路由和 proto 边界，重写 limit/ledger 处理语义 |
| Sandbox settlement            | `settlement.ts`                       | 仅保留为 sandbox adapter，不作为生产账本          |
| OFI/Provider server functions | `t0.functions.ts`                     | 复用入口，按生产与 sandbox 分命名空间             |
| OFI 页面                      | `routes/ofi.tsx`                      | 增量加入 Funding Workspace                        |
| Provider 页面                 | `routes/provider.tsx`                 | 增量加入 Settlement Inbox 和 Balance View         |
| 测试体系                      | Vitest + Playwright 脚本              | 复用，补 contract/integration/E2E 场景            |

### 1.2 审计发现

|   # | 严重度 | 置信度 | 发现                                                                                                    | 修订结论                                                                  |
| --: | :----: | :----: | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
|   1 |   P0   | 10/10  | `provider-impl.ts` 的 `UpdateLimit` 和 `AppendLedgerEntries` 当前只返回空响应，真实账务通知会被静默丢弃 | 上 UI 前必须实现 durable inbox 和 read model                              |
|   2 |   P0   | 10/10  | `reserveCredit` 已从 available 扣减，`effectiveAvailable` 又减 reserved，造成重复扣减                   | 生产模型直接使用 T-0 的 `payout_limit`；sandbox 统一余额定义              |
|   3 |   P0   |  9/10  | OFI 与 Provider 当前同时正向增加 available，未表达双边账务的借贷方向                                    | 两端展示同一 ledger transaction 的不同账户视角，不复制同号余额            |
|   4 |   P0   |  9/10  | 任意 txHash、地址、金额都可被本地 `confirmByChain` 入账                                                 | 生产禁止人工确认；必须校验 chain、token、from、to、amount 和 Network 回调 |
|   5 |   P1   | 10/10  | AGTPay Swagger 只有 Quote Management，没有 settlement/limit/ledger/payment API                          | 明确列为后端契约扩展，不假设 API 已存在                                   |
|   6 |   P1   |  9/10  | Quote parser 丢弃 `allQuotes[].settlement`，无法展示 prefunding 缺口                                    | 以 quoteId 匹配选中报价并保留 settlement breakdown                        |
|   7 |   P1   |  9/10  | `confirmDelayMs` 没有驱动自动确认，当前只能手动调用确认                                                 | Sandbox 明确标记 manual simulation；生产由 T-0 回调推进                   |
|   8 |   P1   |  9/10  | SettlementRegistry 是进程内单例，多实例部署会产生分叉状态                                               | 生产 read model 必须持久化，内存 registry 只用于测试和演示                |
|   9 |   P1   |  8/10  | 金额广泛使用 JavaScript `number`                                                                        | 账务、API 和持久化统一 Decimal/string，禁止浮点累计                       |
|  10 |   P1   |  8/10  | SettlementState 只返回 pending 和 ledger，没有完整 confirmed/reorg/failed 交易列表                      | 新增可分页 settlement projection                                          |
|  11 |   P1   |  8/10  | 本地 TTL 会把未确认交易标成 EXPIRED，但真实交易仍可能晚到确认                                           | “追踪超时”与“链上终态”分离，不能因本地 TTL 否认真实入账                   |
|  12 |   P1   |  9/10  | `/ofi` 和 `/provider` 当前 open access                                                                  | Sandbox 可保留；生产必须加 RBAC、审计和环境隔离                           |
|  13 |   P2   |  8/10  | Quote 过期、Settlement 确认、Create Payment 三个时钟没有协调策略                                        | Settlement 独立继续；确认后自动重新 Quote，用户确认新价格                 |
|  14 |   P2   |  8/10  | 当前页面的 Simulate 按钮混在 Provider 正式操作区                                                        | 移至 Demo Tools，并通过环境标识、颜色和路由隔离                           |

### 1.3 审计后的范围收缩

上一版方案提出了较多新 REST endpoint 和新的事件基础设施。修订后采用最小可行边界：

- 不新建第二套 T-0 callback server，复用现有 ProviderService RPC。
- 不让前端或 bridge 自己推导权威余额，直接存储和展示 `UpdateLimit`。
- 不在第一阶段接钱包签名 SDK；先支持外部钱包转账后粘贴 txHash 进行追踪。
- 不在第一阶段自建链节点监听器；生产状态由 T-0 Network 回调驱动。
- 不新增消息队列。先用数据库 inbox + 事务提交；规模和可靠性需要时再引入队列。

---

## 2. 设计原则

### 2.1 权威来源单一

| 数据                    | 权威来源                     | 本地职责                     |
| ----------------------- | ---------------------------- | ---------------------------- |
| Quote、rate、expiration | AGTPay Quote API / T-0 Quote | 映射、缓存、展示             |
| 链上交易事实            | Blockchain + T-0 Network     | 追踪展示，不直接记账         |
| Payout capacity         | T-0 `UpdateLimit`            | 按 version 持久化最新快照    |
| Ledger                  | T-0 `AppendLedgerEntries`    | 按 transaction_id 幂等持久化 |
| Payment acceptance      | T-0 Create Payment 响应      | 展示，不提前承诺成功         |
| Sandbox 模拟数据        | 本地 SettlementRegistry      | 仅 sandbox 环境使用          |

### 2.2 资金状态与链状态分离

链上 confirmed 不等于 payout capacity 已更新。只有收到 Network 的 limit/ledger 通知，UI 才显示“可用于支付”。

### 2.3 余额不自行重算

官方公式为：

```text
payout_limit = credit_limit - credit_usage - reserve
```

前端可以用该公式做一致性检查，但展示值和 Create Payment gate 必须使用 Network 返回的 `payout_limit`。

### 2.4 显式区分生产和演示

```text
Production                       Sandbox
──────────────────────────       ──────────────────────────
Network detects chain            Operator simulates detection
No manual confirm button         Demo Tools: Confirm transaction
Durable limit/ledger store       In-memory SettlementRegistry
RBAC and audit                   Open access allowed if labeled
Real wallet allowlist            Fixed sandbox wallets
```

---

## 3. 目标架构

```text
┌──────────────────────────────── Browser ────────────────────────────────┐
│                                                                        │
│  /ofi                                      /provider                   │
│  Quote + Funding Workspace                Settlement Inbox             │
│  Payment capacity                         Counterparty Balances        │
│  Transfer tracking                        Ledger / Exceptions          │
│                                                                        │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ TanStack server functions / BFF
                                ▼
┌────────────────────────── Bridge application ──────────────────────────┐
│                                                                        │
│  Quote facade                  Settlement read facade                  │
│  - AGTPay REST                 - query durable projections             │
│  - settlement mapping         - SSE/polling event delivery             │
│                                                                        │
│  ProviderService RPC ingress                                           │
│  - PayOut                                                            │
│  - UpdatePayment                                                     │
│  - UpdateLimit ────────┐                                              │
│  - AppendLedgerEntries ├─ transaction → inbox → projections           │
│  - ApprovePaymentQuote ┘                                              │
│                                                                        │
└───────────────┬───────────────────────────┬────────────────────────────┘
                │                           │
                ▼                           ▼
┌──────────────────────────┐    ┌────────────────────────────────────────┐
│ AGTPay Quote API         │    │ Durable store                         │
│ /api/v1/quotes/*         │    │ callback_inbox                       │
│                          │    │ counterparty_limits                  │
│ Current Swagger boundary │    │ ledger_transactions                  │
└──────────────┬───────────┘    │ settlement_projections               │
               │                │ transfer_intents                     │
               ▼                │ audit_events                         │
┌──────────────────────────┐    └────────────────────────────────────────┘
│ T-0 Network              │
│ Quote + chain monitoring │
│ Limit + ledger callbacks │
└──────────────────────────┘
```

### 3.1 AGTPay 的角色

当前 Swagger 可以支持：

- Provider quote snapshots
- Provider publish/update quote
- OFI real-time network quote

当前 Swagger 不能支持：

- Settlement intent
- Settlement tracking
- Counterparty limit
- Ledger query
- Payment lifecycle

因此有两个部署选择：

1. 推荐：AGTPay 增加 settlement/limit/ledger read API，bridge 通过 AGTPay 读取。
2. 过渡：bridge 自己持久化 T-0 callback projection，但在 API 文档中明确这是 bridge read model，不属于当前 AGTPay Swagger。

不接受的做法：用当前 `/api/v1/quotes/*` 假装完成 settlement 写入。

---

## 4. 端到端流程

### 4.1 前置配置

在双方开始交易前，必须存在：

- OFI Provider ID
- Payout Provider ID
- Settlement model = `PRE_FUNDED`
- 双方白名单钱包地址
- 共同支持的 chain
- 对应 chain 的 USDT token contract
- T-0 Network callback endpoint 和验签配置
- Provider relationship 状态为 active

如果任何前置配置缺失，OFI 页面不得展示可执行的转账指令。

### 4.2 正常流程

```text
Provider             AGTPay/T-0             OFI               Blockchain
   │                      │                   │                    │
   │ publish quote        │                   │                    │
   ├─────────────────────►│                   │                    │
   │                      │◄── Get Quote ─────┤                    │
   │                      ├── quote +         │                    │
   │                      │   settlement info►│                    │
   │                      │                   │                    │
   │                      │                   │ capacity enough?   │
   │                      │                   ├── yes → payment    │
   │                      │                   │                    │
   │                      │                   ├── no: prepare fund │
   │                      │                   │── USDT transfer ──►│
   │                      │                   │◄──── txHash ───────│
   │                      │◄──── track tx ────┤                    │
   │                      │                   │                    │
   │                      │◄──── Network detects and confirms ─────│
   │◄── UpdateLimit ──────┤── UpdateLimit ───►│                    │
   │◄── Ledger entries ───┤── Ledger entries ►│                    │
   │                      │                   │                    │
   │                      │                   │ capacity available │
   │                      │                   ├── refresh quote if expired
   │                      │◄── CreatePayment ─┤
```

### 4.3 Quote 与 Settlement 的协调

```text
Settlement confirming
        │
        ├── Quote still valid ──► user confirms payment summary
        │
        └── Quote expired ──────► preserve payment draft
                                  fetch a new quote
                                  show rate/amount delta
                                  require user confirmation
```

禁止在 Settlement 确认过程中锁住旧 Quote 或自动接受新价格。

### 4.4 批量充值

默认金额为 `prefundingAmount`，用户可以提高充值金额：

```text
Required for current payment:     750 USDT
Suggested top-up:               5,000 USDT
Expected capacity after confirm: 5,250 USD
```

UI 必须说明：充值不是单笔 Payment 的托管资金，而是 OFI 与 Provider 之间的可用余额。

---

## 5. 角色体验

### 5.1 OFI Payment Operator

目标：尽快知道能否创建 Payment，不需要理解底层账本。

页面提供：

- Quote 金额、汇率、有效期
- 当前 payout limit
- 当前 reserve
- funding shortfall
- Funding 状态
- Create Payment 是否可用及原因

推荐 CTA：

| 状态                        | CTA                                         |
| --------------------------- | ------------------------------------------- |
| capacity 足够               | `Continue to payment`                       |
| capacity 不足               | `Fund {amount} USDT`                        |
| 已广播                      | `Track transfer`                            |
| 确认中                      | disabled `Waiting for Network confirmation` |
| ledger 未应用               | disabled `Applying payout capacity`         |
| Quote 过期                  | `Refresh quote`                             |
| Network 拒绝 Create Payment | `Review updated capacity`                   |

### 5.2 OFI Treasury

目标：安全完成 USDT 转账并保留审计证据。

Funding Drawer 展示：

- Provider legal/display name
- Chain
- USDT token contract
- From whitelisted wallet
- To whitelisted wallet
- Requested amount
- Optional higher batch amount
- Network fee 提示
- 地址全量值和复制按钮
- 二次确认摘要

第一阶段采用外部钱包：

1. 用户在外部钱包转账。
2. 返回页面粘贴 txHash。
3. 系统只创建 tracking record，不直接增加余额。

### 5.3 Provider Treasury / Reconciliation

目标：看到谁转来了多少钱、Network 是否入账、账本是否一致。

Provider 首页增加：

- Settlement Inbox
- Counterparty Balances
- Ledger Transactions
- Reconciliation Required

Provider 不能执行：

- 手工把链上交易标记为 confirmed
- 手工增加 payout limit
- 修改 ledger entry
- 把错误 token 当成 USDT 入账

允许执行：

- 添加内部备注
- 标记“已调查”
- 复制 support bundle
- 对异常发起重新同步请求

### 5.4 Compliance / Audit

只读访问：

- from/to 地址
- chain、token contract、txHash
- 原始 T-0 callback payload
- limit version
- ledger transaction ID
- 操作人和时间
- Payment/Quote 关联上下文

### 5.5 Support

Support bundle 必须脱敏并包含：

- settlement tracking ID
- chain + txHash
- counterparties
- 当前 chain/accounting 状态
- 最后一次 Network event 时间
- limit version
- correlation/request IDs
- 不包含 API key、完整个人信息或私钥材料

---

## 6. 页面信息架构

### 6.1 OFI Console

```text
┌──────────────────────────────────────────────────────────────────┐
│ OFI Console                              Network: connected       │
├──────────────────────────────────────────────────────────────────┤
│ 01 Get Quote                                                    │
│ Amount 1,000 USD → EUR     Rate 0.92     Expires in 41s          │
│ Settlement 1,000 USDT      Provider #23                         │
├──────────────────────────────────────────────────────────────────┤
│ 02 Funding & Capacity                                            │
│ Payout limit       $250       Reserved          $0                │
│ Required         $1,000       Funding shortfall $750              │
│ [ Fund 750 USDT ]                                               │
│                                                                  │
│ Transfer 0x12…ab · Tron                                         │
│ ✓ Broadcast  ✓ Detected  ● Confirming  ○ Capacity applied       │
│ 12/20 confirmations · View explorer · Copy support details       │
├──────────────────────────────────────────────────────────────────┤
│ 03 Create Payment                                                │
│ Disabled: waiting for payout capacity                            │
├──────────────────────────────────────────────────────────────────┤
│ 04 Payments                                                      │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Provider Console

```text
┌──────────────────────────────────────────────────────────────────┐
│ Provider Console                          Network: connected      │
├──────────────────────────────────────────────────────────────────┤
│ Summary: Pending settlements 2 · Reconciliation 1 · Payouts 4   │
├──────────────────────────────────────────────────────────────────┤
│ Settlement Inbox                                                 │
│ OFI-101 · 5,000 USDT · TRON · Confirming 12/20                  │
│ OFI-202 · 1,000 USDT · ETH  · Credit applied                    │
├──────────────────────────────────────────────────────────────────┤
│ Counterparty Balances                                            │
│ OFI       Payout limit   Credit usage   Reserve   Version        │
│ OFI-101   $24,000        -$5,000        $1,000    184            │
├──────────────────────────────────────────────────────────────────┤
│ Ledger · Exceptions · Demo Tools                                 │
└──────────────────────────────────────────────────────────────────┘
```

Demo Tools 默认折叠，并显示：

> SANDBOX ONLY · This action does not confirm a real blockchain transfer.

---

## 7. 状态模型

### 7.1 Transfer Intent

```text
DRAFT
  └──► AWAITING_EXTERNAL_TRANSFER
          └──► TX_SUBMITTED
                  ├──► TRACKING
                  ├──► ABANDONED
                  └──► INVALID_TX
```

Transfer Intent 是本地用户工作流，不是账本。

### 7.2 Chain Projection

```text
UNKNOWN
  └──► DETECTED
          └──► CONFIRMING
                  ├──► CONFIRMED
                  ├──► REORGED
                  └──► INVALID
```

规则：

- `TRACKING_TIMEOUT` 是 UI 提醒，不是链上终态。
- 交易晚到确认时仍可推进。
- Reorg 后不删除历史，记录 correction event。

### 7.3 Accounting Projection

```text
NOT_APPLIED
  └──► LIMIT_RECEIVED
          └──► LEDGER_RECEIVED
                  └──► RECONCILED

任意阶段发现不一致 ──► RECONCILIATION_REQUIRED
```

只有 `RECONCILED` 且 Network payout limit 足够时，UI 才显示资金可用。

### 7.4 Payment Gate

```text
UI advisory gate:
  latest payoutLimit >= requested settlementAmount

Authoritative gate:
  T-0 Network validates quote + credit at CreatePayment time
```

如果两者发生竞态，以 Network 拒绝为准，页面刷新 limit 并显示可恢复提示。

---

## 8. 数据模型

### 8.1 `counterparty_limits`

```text
provider_id
counterparty_id
version                 BIGINT
payout_limit            DECIMAL / canonical string
credit_limit            DECIMAL / canonical string
credit_usage            DECIMAL / canonical string
reserve                 DECIMAL / canonical string
received_at
raw_payload

UNIQUE(provider_id, counterparty_id, version)
INDEX(provider_id, counterparty_id, version DESC)
```

只接受更高 version 成为 latest projection；旧 version 仍保留用于审计。

### 8.2 `ledger_transactions`

```text
transaction_id          BIGINT UNIQUE
transaction_type        PAYOUT | PROVIDER_SETTLEMENT | FEE | ...
settlement_id           nullable
payment_id              nullable
entries_json
received_at
raw_payload
```

账本 append-only。修正通过新的 compensating transaction 完成，不更新旧记录。

### 8.3 `settlement_projections`

```text
id
chain
tx_hash
token_contract
from_provider_id
to_provider_id
from_address
to_address
amount
chain_status
accounting_status
network_settlement_id
ledger_transaction_id
limit_version
detected_at
confirmed_at
last_event_at

UNIQUE(chain, tx_hash)
```

### 8.4 `transfer_intents`

```text
id
idempotency_key         UNIQUE
ofi_provider_id
payout_provider_id
chain
from_address
to_address
requested_amount
quote_id                nullable, context only
quote_expires_at        nullable
tx_hash                 nullable
status
created_by
created_at
updated_at
```

### 8.5 `callback_inbox`

```text
event_key               UNIQUE
method                   UPDATE_LIMIT | APPEND_LEDGER_ENTRIES
payload
received_at
processed_at
processing_error
attempt_count
```

RPC handler 在同一个数据库事务中完成 inbox 去重和 projection 更新，再返回成功响应。

---

## 9. API 契约

### 9.1 当前 AGTPay API

直接复用：

| Method   | Path                             | 用途                     |
| -------- | -------------------------------- | ------------------------ |
| GET      | `/api/v1/quotes`                 | Provider quote snapshots |
| POST     | `/api/v1/quotes/network`         | OFI 获取真实 Quote       |
| PUT/POST | `/api/v1/quotes/pay-out`         | Provider 更新/推送报价   |
| POST     | `/api/v1/quotes/publish/pay-out` | 发布已保存报价           |

### 9.2 Quote response 扩展映射

内部 `GetQuoteResult.success` 增加：

```text
quote
payoutAmount
settlementAmount
settlement:
  amount
  creditLimit
  prefundingAmount
  totalUsed
  providerId
  capturedAt
```

如果 `result.success` 没有完整 settlement breakdown，从 `allQuotes` 中按完整 quote ID 匹配。匹配不到时：

- Quote 仍可展示。
- Funding recommendation 标记 unavailable。
- 不使用本地猜测值冒充 prefundingAmount。

### 9.3 建议新增的 AGTPay/read model API

| Method | Path                                          | 说明                           |
| ------ | --------------------------------------------- | ------------------------------ |
| POST   | `/api/v1/settlement-intents`                  | 创建用户追踪意图，不代表入账   |
| PUT    | `/api/v1/settlement-intents/{id}/transaction` | 关联 txHash，幂等              |
| GET    | `/api/v1/settlements`                         | 分页查询 settlement projection |
| GET    | `/api/v1/settlements/{id}`                    | Settlement 详情                |
| GET    | `/api/v1/counterparties/{id}/limit`           | 最新 Network limit             |
| GET    | `/api/v1/ledger-transactions`                 | 分页账本                       |
| GET    | `/api/v1/events`                              | `after` cursor 增量事件        |

注意：生产 API 不提供 `POST /settlements/{id}/confirm`。

### 9.4 Sandbox API 隔离

只有 sandbox 环境启用：

```text
POST /api/sandbox/settlements
POST /api/sandbox/settlements/{txHash}/detect
POST /api/sandbox/settlements/{txHash}/confirm
POST /api/sandbox/settlements/{txHash}/reorg
```

这些 endpoint 必须：

- 使用 `/api/sandbox/` namespace。
- 在生产构建中返回 404。
- 写入 `source=SANDBOX_SIMULATION`。
- UI 显示持续的 sandbox 标识。

---

## 10. 幂等、一致性和事件顺序

幂等表示重复请求只产生一次业务效果。

### 10.1 去重键

| 操作                   | 去重键                                  | 重复行为               |
| ---------------------- | --------------------------------------- | ---------------------- |
| Create transfer intent | `Idempotency-Key`                       | 返回原 intent          |
| Attach txHash          | `(chain, txHash)`                       | 返回已有 projection    |
| UpdateLimit            | `(providerId, counterpartyId, version)` | 返回原成功，不重复更新 |
| Ledger transaction     | `transaction_id`                        | 返回原成功，不重复入账 |
| Sandbox confirm        | `(chain, txHash, action)`               | 返回原状态             |
| Create Payment         | `paymentClientId`                       | 返回原 Payment 响应    |

### 10.2 乱序处理

允许以下顺序：

- Ledger 先于 Limit 到达。
- Limit 先于链上 tracker 检测到 tx。
- 页面先看到 confirmed，再看到 ledger applied。
- 重复 callback 在原 callback 完成前到达。

处理策略：

1. callback 先写 inbox。
2. 相同 event key 的并发请求等待或读取原结果。
3. projection 通过 stable IDs 关联。
4. 无法关联时进入 reconciliation queue，不丢弃 payload。
5. Limit 只允许更高 version 覆盖 latest pointer。

### 10.3 实时更新

推荐 SSE，轮询作为 fallback：

- SSE heartbeat：15 秒。
- 支持 `Last-Event-ID`。
- 断线后使用 cursor 补事件。
- SSE 不可用时每 3–5 秒轮询 active settlement。
- 页面切到后台后降低轮询频率。
- 收到事件后重新读取 read model，不直接信任事件 payload 更新余额。

---

## 11. 安全与合规

### 11.1 身份与权限

生产角色：

| Role                       | 权限                                     |
| -------------------------- | ---------------------------------------- |
| `ofi_payment_operator`     | Quote、查看 capacity、Create Payment     |
| `ofi_treasury`             | 创建 transfer intent、提交 txHash        |
| `provider_treasury`        | 查看 settlement、limit、ledger、异常备注 |
| `provider_payout_operator` | Payment/Payout 操作，不改 settlement     |
| `compliance_auditor`       | 只读审计                                 |
| `support`                  | 查看脱敏 support bundle                  |
| `sandbox_admin`            | 仅非生产环境模拟事件                     |

### 11.2 密钥与验签

- AGTPay Bearer key 只存在服务端。
- T-0 RPC 使用 SDK 的认证/验签机制。
- callback 验签失败不得写 inbox 或 projection。
- 日志禁止输出 Authorization、私钥、完整 travel-rule 数据。
- Explorer URL 由 `(chain, txHash)` 模板生成，不接受用户提供任意 URL。

### 11.3 交易校验

Tracking 层至少验证：

- chain 在双方允许列表中。
- token contract 是该 chain 的官方/配置 USDT。
- from/to 是双方登记钱包。
- amount > 0 且 decimal 合法。
- txHash 格式符合 chain。
- 同一 txHash 没有关联另一组 counterparties。

真正记账仍以 Network limit/ledger callback 为准。

---

## 12. 异常处理矩阵

| 场景                          | 系统处理                            | 用户体验                         | 自动恢复                     |
| ----------------------------- | ----------------------------------- | -------------------------------- | ---------------------------- |
| Quote 在确认期间过期          | Settlement 继续，保留 Payment draft | 展示价格已过期                   | 自动重新 Quote，用户确认差额 |
| txHash 重复提交               | 返回原 tracking record              | 跳转原详情                       | 是                           |
| txHash 不存在                 | 标记 `INVALID_TX`                   | 提示检查 hash/chain              | 用户修正                     |
| 错误 chain                    | 不创建有效 tracking                 | 明确显示期望 chain               | 用户重新提交                 |
| 错误 token                    | 不增加 capacity                     | “Transfer is not supported USDT” | 需要 support                 |
| 错误接收地址                  | 高危异常，不入账                    | 显示不可逆警告和 support         | 否                           |
| 确认时间过长                  | 标记 tracking delayed，不改链终态   | 显示最后检测时间                 | 后续确认仍可推进             |
| Chain reorg                   | `REORGED` + reconciliation          | 暂停 Create Payment              | 等 Network correction        |
| UpdateLimit 重复              | 按 version 去重                     | 无重复提示                       | 是                           |
| UpdateLimit 乱序              | 保留历史，不覆盖 latest             | 无感                             | 是                           |
| Ledger 无法关联 settlement    | reconciliation queue                | Provider 显示异常                | 人工调查/后续事件            |
| SSE 断线                      | cursor reconnect / polling          | 小型 reconnect 状态              | 是                           |
| Create Payment 因额度竞态失败 | 刷新最新 limit                      | 解释容量被其他支付占用           | 用户重试或充值               |
| AGTPay Quote API 超时         | 不创建虚假 Quote                    | Retry，保留输入                  | 是                           |
| T-0 callback store 失败       | RPC 返回可重试错误                  | UI 保持旧状态并显示延迟          | Network 重试                 |
| 多标签同时提交                | Idempotency-Key 合并                | 两页返回同一 intent              | 是                           |

---

## 13. 代码组织建议

优先复用现有模块，避免新建过多 facade：

```text
src/lib/t0/
├── ofi-client.ts             扩展 quote settlement mapping
├── quote-mapper.ts           Decimal + selected quote settlement
├── provider-impl.ts          持久化 UpdateLimit / Ledger callback
├── settlement.ts             仅保留 sandbox implementation
├── credit-policy.ts          修正 sandbox 语义
├── t0.functions.ts           页面 read/action functions
├── types.ts                  view models，不复制 proto 全量类型
└── read-model/               仅在确定持久化方案后新增
    ├── callback-inbox.ts
    ├── limits.ts
    ├── ledger.ts
    └── settlements.ts

src/routes/
├── ofi.tsx                   Funding Workspace
└── provider.tsx              Inbox / balances / ledger
```

建议在以下文件保留 ASCII 状态注释：

- `settlement.ts`：sandbox 状态转换。
- `provider-impl.ts`：callback → inbox → projection 事务边界。
- read-model limits/ledger：version 与 transaction_id 去重规则。
- E2E 测试：双控制台的跨页面事件顺序。

---

## 14. 分阶段实施计划

### Phase 0：契约与账务语义

目标：在 UI 之前建立不会误记账的基础。

1. 定义生产权威来源和 sandbox source 标记。
2. 修正 sandbox available/reserve 语义。
3. 用 T-0 官方字段替换双方同号 `providerCredit` 模型。
4. Quote mapper 保留 settlement breakdown。
5. 确认 AGTPay 是否承载 read model API；未确认前不实现虚假 endpoint。
6. 为 UpdateLimit/AppendLedgerEntries 定义持久化和去重 contract。

退出标准：余额公式、版本规则、账本方向和 API owner 均无未决项。

### Phase 1：Durable callback read model

1. 实现 callback inbox。
2. 持久化 UpdateLimit 历史和 latest pointer。
3. 持久化 ledger transaction。
4. 生成 settlement projection。
5. callback 失败返回可重试错误。
6. 增加 reconciliation queue。

退出标准：进程重启、多实例、重复和乱序 callback 均不丢数据。

### Phase 2：OFI Funding Workspace

1. Quote 显示 settlement breakdown。
2. Capacity summary 和 funding shortfall。
3. Transfer intent + txHash tracking。
4. Progress timeline。
5. Quote 过期后的 refresh/confirm。
6. Create Payment gate 和 Network rejection recovery。

退出标准：OFI 能从 Quote 完成充值追踪并安全进入 Create Payment。

### Phase 3：Provider Settlement Operations

1. Settlement Inbox。
2. Counterparty Balances。
3. Ledger 列表和详情。
4. Reconciliation Required queue。
5. Support bundle。
6. Demo Tools 隔离。

退出标准：Provider 能解释每次 limit 变化，并且没有生产人工入账入口。

### Phase 4：实时性、权限与上线准备

1. SSE + cursor fallback。
2. RBAC。
3. Audit events。
4. 分页和索引。
5. 指标、告警和 runbook。
6. Sandbox/production build guard。

退出标准：满足验收标准和生产失败演练。

---

## 15. 测试计划

### 15.1 覆盖图

```text
CODE PATHS                                             USER FLOWS

GetQuote                                               OFI asks for quote
├── success + settlement breakdown                     ├── capacity enough → payment
├── success but allQuotes mismatch                     ├── shortfall → funding drawer
├── malformed Decimal                                  ├── quote expires while confirming
└── timeout / unauthorized                              └── rate changes after refresh

Attach transaction                                     Treasury tracks transfer
├── valid chain + txHash                                ├── paste valid hash
├── duplicate hash                                     ├── double-click submit
├── wrong chain/token/address                          ├── navigate away and return
└── concurrent tabs                                    └── delayed confirmation

UpdateLimit callback                                   Both consoles update
├── new version                                        ├── OFI capacity becomes available
├── duplicate version                                  ├── Provider sees counterpart limit
├── stale version                                      └── SSE disconnect → polling fallback
└── database failure

AppendLedgerEntries callback                           Reconciliation
├── new transaction                                    ├── settlement linked correctly
├── duplicate transaction                              ├── unmatched entry visible
├── ledger-before-limit                                └── support bundle generated
└── unknown account/transaction type

CreatePayment                                          Payment transition
├── capacity sufficient                                ├── normal create
├── capacity changed concurrently                      ├── double submit
├── quote expired                                      └── clear recovery after rejection
└── upstream timeout
```

### 15.2 单元测试

必须覆盖：

- Decimal 无损转换、极大值、小数和负数拒绝。
- Quote ID 匹配 `allQuotes`。
- prefunding 字段缺失和 malformed payload。
- payout limit 公式一致性检查。
- version 比较和 stale update。
- ledger transaction 去重。
- chain/token/address/txHash validator。
- 状态机所有合法和非法转换。
- sandbox production guard。

### 15.3 Contract 测试

- 用固定 Swagger fixture 验证 AGTPay request/response。
- 用当前 Provider SDK schema 构造真实 `UpdateLimitRequest`。
- 用当前 Provider SDK schema 构造 `AppendLedgerEntriesRequest`。
- callback 返回成功时断言数据已经提交，而不是仅进入内存 promise。
- 未知 enum 采用 additive-compatible 策略：保留 raw payload，进入 unknown/reconciliation，而不是 crash。

### 15.4 Integration 测试

- callback → inbox → limit projection → OFI read API。
- callback → ledger → Provider settlement detail。
- ledger 先到、limit 后到。
- 同一 callback 并发两次。
- 数据库事务失败后 Network 重试。
- 进程重启后状态仍存在。

### 15.5 E2E

关键路径必须使用 E2E：

1. Provider 发布 Quote。
2. OFI 获取 Quote，看到 funding shortfall。
3. OFI 提交 txHash。
4. Sandbox 工具模拟 detected/confirmed。
5. OFI 和 Provider 两页看到同一 settlement。
6. Limit/ledger 更新后 Create Payment 解锁。
7. 原 Quote 过期时重新报价并展示差额。
8. 重复确认不重复增加容量。
9. Provider 正式区域没有人工确认按钮。
10. 生产环境 sandbox endpoint 返回 404。

### 15.6 失败模式测试

| 失败模式                   | 测试 |              错误处理              |  用户可见性   |
| -------------------------- | :--: | :--------------------------------: | :-----------: |
| AGTPay timeout             | 必须 |          retryable result          |     明确      |
| malformed Quote settlement | 必须 |    degrade without fake amount     |     明确      |
| callback DB failure        | 必须 |      non-OK for Network retry      |   运维告警    |
| duplicate callback         | 必须 |       stored original result       |     无感      |
| stale limit version        | 必须 | keep history, ignore latest update |     无感      |
| unknown ledger type        | 必须 |   preserve raw + reconciliation    | Provider 可见 |
| SSE disconnect             | 必须 |           reconnect/poll           |    轻提示     |
| chain reorg                | 必须 |        suspend availability        |   双方明确    |
| quote/capacity race        | 必须 |     refresh limit and explain      |   OFI 明确    |

不得存在“无测试、无错误处理、用户也看不到”的静默失败。

---

## 16. 性能、可观察性与运维

### 16.1 性能

- Settlement、ledger 必须分页，禁止每次 snapshot 返回全部历史。
- Active settlement 单独索引，避免扫描已完成记录。
- Limit latest pointer 使用索引读取，不在应用层排序全历史。
- SSE 事件只传 ID 和变更类型，客户端随后读取 projection。
- Quote 不缓存超过 expiration。
- 不对链上确认进度进行高频全局轮询。

### 16.2 指标

```text
t0_callback_received_total{method}
t0_callback_duplicate_total{method}
t0_callback_processing_failures_total{method}
t0_callback_processing_duration_ms{method}
t0_limit_stale_update_total
t0_ledger_unmatched_total
settlement_tracking_active
settlement_tracking_delayed_total{chain}
settlement_reconciliation_required_total
sse_connections_active
sse_reconnect_total
```

### 16.3 告警

- callback 持续失败超过 5 分钟。
- inbox oldest unprocessed age 超阈值。
- unmatched ledger transaction 持续增长。
- limit version 长时间无更新但有活跃支付。
- production 收到 sandbox API 请求。
- 同一 txHash 关联不同 counterparties。

### 16.4 Runbook

至少包含：

- T-0 callback 重试排查。
- Settlement confirmed 但 limit 未更新。
- Ledger 与 limit 不一致。
- Chain reorg。
- AGTPay Quote API 不可用。
- SSE 大面积断线。
- 如何安全重放 inbox，不产生重复入账。

---

## 17. 并行实施策略

### 17.1 依赖表

| Step                         | 模块                       | 依赖             |
| ---------------------------- | -------------------------- | ---------------- |
| A. Domain contract + Decimal | `src/lib/t0/`              | 无               |
| B. Callback inbox/read model | `src/lib/t0/`, persistence | A                |
| C. Quote settlement mapping  | `src/lib/t0/`              | A                |
| D. OFI Funding UI            | `src/routes/`, components  | B + C            |
| E. Provider settlement UI    | `src/routes/`, components  | B                |
| F. E2E/QA                    | tests, scripts             | D + E            |
| G. Observability/RBAC        | server, routes             | B，可与 D/E 并行 |

### 17.2 Lanes

```text
Lane A: Domain contract → callback read model
Lane B: Quote settlement mapping

合并 A + B 后：

Lane C: OFI Funding UI
Lane D: Provider Settlement UI
Lane E: Observability + RBAC

最后：Lane F E2E + failure drills
```

冲突提示：Lane C 和 D 都可能修改共享 console components；若组件接口未先冻结，保持顺序实施。

---

## 18. NOT in scope

- 内置钱包签名和自动广播：第一阶段使用外部钱包，降低私钥和 wallet SDK 风险。
- 自建 Ethereum/BSC/Tron 节点监听器：T-0 已负责链监控，避免重复基础设施。
- 自动兑换或 gas 代付：与 Pre-Settlement 余额流程无直接关系。
- Post-settlement credit 模型：本方案聚焦 pre-funded，但数据模型保留官方 credit fields。
- 跨 Provider 自动资金调拨：需要独立 treasury/risk 方案。
- 链上资金追回：错误地址转账不可逆，只提供预防和 support 流程。
- 修改 T-0 官方 ledger：本地只保存 projection 和内部备注。
- 在当前 Quote API 中塞入 settlement 写操作：API 语义错误，明确不做。

---

## 19. 验收标准

### 19.1 业务

- OFI 能清楚区分 settlement amount、payout limit、reserve 和 funding shortfall。
- OFI 可进行批量 top-up，不被强制绑定单一 Payment。
- Provider 能解释每次 payout limit 变化对应的 Network version 和 ledger transaction。
- Quote 过期不会丢失 Settlement 或 Payment draft。
- Network 拒绝 Create Payment 时，用户得到可恢复原因。

### 19.2 账务

- 同一 txHash 永远不会重复增加 capacity。
- 同一 ledger transaction 永远不会重复入账。
- stale UpdateLimit 永远不会覆盖新 version。
- Provider 和 OFI 不再使用同号复制余额。
- 所有账务金额使用 Decimal，不使用浮点累计。
- 生产余额只由 Network callback 更新。

### 19.3 可靠性

- callback 数据库写失败时返回可重试错误。
- 重复、乱序和并发 callback 有自动化测试。
- 进程重启和多实例不会丢状态。
- SSE 中断时自动恢复或降级轮询。
- chain reorg 会暂停相关 capacity，而不是静默继续支付。

### 19.4 安全

- 浏览器看不到 AGTPay/T-0 secret。
- Production 不存在人工 settlement confirm 操作。
- Production sandbox API 返回 404。
- 地址、chain、token 和 txHash 均验证。
- 所有运营行为有 audit event。

### 19.5 UX

- OFI 在一个页面内看懂“为什么不能 Create Payment”。
- Provider 正式操作与 Sandbox 模拟视觉和权限隔离。
- 所有等待状态显示当前阶段、最后更新时间和恢复动作。
- 所有异常都能生成脱敏 support bundle。

---

## 20. 外部依赖与实施前决策

以下不是产品选择，而是实施前必须确认的外部契约：

1. AGTPay 是否愿意新增 settlement/limit/ledger read API。
2. 如果暂不新增，bridge 使用哪种持久化存储承载 callback projection。
3. 当前部署收到 T-0 ProviderService callback 的公开地址和认证方式。
4. T-0 对各 chain 的 confirmation/reorg 状态是否通过独立事件暴露。
5. AGTPay 实际 wire response 中 `allQuotes[].settlement` 的 casing 和 Decimal 形状。
6. 数据保留期和审计导出要求。

这些契约未确认前，可以实现 Sandbox UI，但不能宣称生产 Pre-Settlement 完成。

---

## 21. 工程评审摘要

- Step 0 Scope Challenge：已收缩为复用 ProviderService RPC、扩展 Quote mapper、增加 durable projection，不新建平行网络层。
- Architecture Review：发现 6 个核心问题，全部纳入修订。
- Code Quality Review：发现 5 个语义/边界问题，全部纳入 Phase 0/1。
- Test Review：补充 9 类关键缺口及 E2E 路径。
- Performance Review：加入分页、索引、SSE payload 和 active settlement 约束。
- Failure modes：没有保留“无测试 + 无错误处理 + 静默失败”的路径。
- NOT in scope：已明确。
- What already exists：已明确复用点。
- Outside voice：按“直接更新方案”的要求未启动交互式外部评审。
- Parallelization：2 个前置 lane，3 个 UI/运维并行 lane，最终统一 E2E。
- Lake Score：10/10，选择完整处理账务、异常、测试和生产边界，而非只补页面 happy path。

## GSTACK REVIEW REPORT

| Review        | Trigger               |                     Why | Runs | Status  | Findings                                                 |
| ------------- | --------------------- | ----------------------: | ---: | ------- | -------------------------------------------------------- |
| CEO Review    | `/plan-ceo-review`    |        Scope & strategy |    0 | NOT RUN | 可选，当前由本方案直接锁定范围                           |
| Codex Review  | `/codex review`       | Independent 2nd opinion |    0 | SKIPPED | 用户要求直接更新方案                                     |
| Eng Review    | `/plan-eng-review`    |    Architecture & tests |    1 | CLEAR   | 14 findings incorporated, 0 unresolved product decisions |
| Design Review | `/plan-design-review` |              UI/UX gaps |    0 | NOT RUN | 实施 UI 前可再进行屏幕级评审                             |
| DX Review     | `/plan-devex-review`  |    Developer experience |    0 | NOT RUN | 非本阶段必需                                             |

- **UNRESOLVED:** 0 个产品设计决策；6 个外部接口事实需要实施前确认。
- **VERDICT:** ENG CLEARED，完成外部契约确认后可进入 Phase 0。
