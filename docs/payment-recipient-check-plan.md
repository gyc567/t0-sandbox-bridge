# Payment 收款人信息 + Provider 人工审核方案

> 状态：方案稿
>
> 需求：OFI 在 `Payment-Payment Continued` 创建 Payment 时提供当地代币收款人信息；Provider 在 `Payment-Payment Continued` 和 `Payment-Manual AML` 中对收款人信息进行人工审核，审核通过后继续 Last Look 流程。

---

## 1. 现状分析

### 1.1 相关文件映射

| 文件 | 角色 | 与本需求关系 |
|------|------|-------------|
| `src/routes/ofi.tsx` | OFI 控制台 | `Payment-Payment Continued` 有 `Create Payment` 表单 |
| `src/routes/provider.tsx` | Provider 控制台 | `Payment-Payment Continued` 有 `Execute Payout`；`Payment-Manual AML` 有 `ManualAmlPanel` |
| `src/lib/t0/network.ts` | SandboxNetwork | `createPayment` 接受 `CreatePaymentInput`，无收款人信息字段 |
| `src/lib/t0/types.ts` | 领域类型 | `Payment` 只有 `beneficiaryRef: string`，无结构化收款人信息 |
| `src/lib/t0/t0.functions.ts` | Server Fns | 已有 `reviewAmlFileFn`（Provider AML 审核），无收款人审核 |
| `src/components/provider/ManualAmlPanel.tsx` | AML 审核 UI | 三按钮（Approve/Reject/Cancel AML），**无收款人信息展示/审核** |

### 1.2 现有 Payment 类型

```typescript
// src/lib/t0/types.ts
interface Payment {
  id: string;
  quoteId: string;
  currency: Currency;
  usdAmount: number;
  localAmount: number;
  beneficiaryRef: string; // ← 现有唯一收款人字段，只是一个字符串标识符
  status: PaymentStatus;  // "pending" | "accepted" | "rejected" | "confirmed" | "pending_aml"
  createdAt: number;
  amlFile?: AmlFileMeta;
  rejectedReason?: "aml_denied" | "aml_not_needed";
  refundedAt?: number | null;
}
```

### 1.3 现有 CreatePaymentInput

```typescript
// src/lib/t0/network.ts
interface CreatePaymentInput {
  paymentClientId: string;
  quoteId: string;
  beneficiaryRef: string; // ← 唯一收款人相关字段
  usdAmount: number;
}
```

### 1.4 现有 AML 流程（Phase 7 已实现）

```
OFI: Get Quote → Create Payment（自动 triggerManualAml）→ URL 变 /ofi?aml-required=<id>
     → 切换到 Payment-Manual AML tab → 上传 AML 文件
Provider: Payment-Manual AML 标签 → ManualAmlPanel 显示 pending_aml payments
     → Approve/Reject/Cancel AML
     → Approve → completeManualAml(approved) → approvePaymentQuote (Last Look)
     → Reject/Cancel → completeManualAml(rejected) → 结束
```

### 1.5 现有 ManualAmlPanel 状态分类

```typescript
// 三类 payment 状态
pendingAmlPayments   = payments.filter(status === "pending_aml")   // 待审核
approvedPayments     = payments.filter(status === "accepted")       // AML 通过（Last Look 阶段）
refundablePayments   = payments.filter(status === "rejected" && refundedAt === undefined)
refundedPayments     = payments.filter(status === "rejected" && refundedAt !== undefined)
```

### 1.6 关键审计发现

**问题 1：Payment-Payment Continued 是两个不同的页面区域**

- OFI 的 `Payment-Payment Continued`：Create Payment 表单（step 07）
- Provider 的 `Payment-Payment Continued`：Payout Execution 列表（step 03）

用户需求"Provider 在 Payment-Payment Continued 中要对收款人信息进行 check"指的是 Provider 的这个 tab。

**问题 2：当前 Payment-Payment Continued 的 Payout Execution 没有收款人信息展示**

Provider 的 Payout Execution 按钮点击后直接 `executePayout`，没有展示/审核收款人信息的步骤。

**问题 3：收款人审核和 AML 审核是同一个 Provider 操作**

两者都在 ManualAmlPanel 中由 Provider 人工执行，不应该分成两个独立步骤。

**问题 4：现有 beneficiaryRef 不够用**

`beneficiaryRef` 只是 "BEN-DEMO-001" 这样的字符串，没有实际收款人信息。需要新增 `recipientInfo` 字段。

---

## 2. 设计方案

### 2.1 核心原则

1. **最小化改动**：复用现有 `ManualAmlPanel`，不新增 Provider tab
2. **向后兼容**：`beneficiaryRef` 保留，新的 `recipientInfo` 为可选
3. **不破坏现有 AML 流程**：收款人审核与 AML 审核作为同一个决策提交
4. **KISS**：先用 fallback 简单结构，IVMS101 完整结构作为后续扩展

### 2.2 类型定义

#### 2.2.1 新增 RecipientInfo 类型（`src/lib/t0/types.ts`）

```typescript
/**
 * 收款人信息 — OFI 在 Create Payment 时提供。
 * 优先使用 IVMS101 格式；如果 OFI 无法提供完整 IVMS101，使用 fallback 结构。
 *
 * 对齐 docs.t-0.network/docs/integration-guidance/api-reference/payment_intent_pay_in_provider/
 * 的 GetPaymentDetailsRequest.TravelRuleData 和 IVMS101 标准。
 */
export interface RecipientInfo {
  /**
   * IVMS101 格式的完整受益人信息。
   * 如果提供此字段，fallback 字段应为空。
   */
  ivms101?: Ivms101BeneficialOwner;

  /**
   * 简化格式：当 OFI 无法提供完整 IVMS101 时的备用方案。
   * 包含最基础的收款人银行账户信息。
   */
  fallback?: RecipientAccount;
}

/**
 * IVMS101 Beneficial Owner — 对齐 IVMS101 Travel Rule 标准。
 * 仅包含对 sandbox 演示必要的字段；完整 IVms101 结构可后续扩展。
 *
 * 结构参考: docs.t-0.network/docs/integration-guidance/api-reference/ivms_ivms101/
 */
export interface Ivms101BeneficialOwner {
  /** 自然人姓名 */
  name: Ivms101Name;
  /** 出生日期 ISO 8601 */
  birthDate?: string;
  /** 国籍 ISO 3166-1 alpha-2 */
  nationality?: string;
  /** 居住地址 */
  address?: Ivms101Address;
  /** 身份证件 */
  nationalId?: {
    identifier: string;
    country?: string; // ISO 3166-1 alpha-2
    type?: string;
  };
}

export interface Ivms101Name {
  primary: string;        // 主要姓名（全称）
  secondary?: string;     // 次要姓名
  identifierType?: string; // 如 "LEGL"（法人名称必填）
}

export interface Ivms101Address {
  street?: string;
  building?: string;
  postcode?: string;
  city?: string;
  country: string; // ISO 3166-1 alpha-2
}

/**
 * 简化格式收款人账户信息（fallback）。
 * 用于 OFI 无法提供完整 IVMS101 时的基础场景。
 */
export interface RecipientAccount {
  /** 账户持有人姓名 */
  accountHolderName: string;
  /** 账号/卡号/钱包地址 */
  accountNumber: string;
  /** 银行代码（如 IBAN, SWIFT/BIC） */
  bankCode?: string;
  /** 银行名称 */
  bankName?: string;
  /** 开户国家 ISO 3166-1 alpha-2 */
  country: string;
}
```

#### 2.2.2 扩展 Payment 类型（`src/lib/t0/types.ts`）

```typescript
export interface Payment {
  id: string;
  quoteId: string;
  currency: Currency;
  usdAmount: number;
  localAmount: number;
  beneficiaryRef: string;
  /** OFI 提供的收款人信息（可选，向后兼容） */
  recipientInfo?: RecipientInfo;
  /**
   * Provider 人工审核收款人信息的结果。
   * 初始为 undefined；Provider 审核 AML 时同步设置此字段。
   * - "approved": 收款人信息审核通过
   * - "rejected": 收款人信息审核拒绝（可与 AML 拒绝同时发生）
   */
  recipientCheckStatus?: "approved" | "rejected";
  /** 拒绝原因（当 recipientCheckStatus === "rejected" 时填写） */
  recipientCheckNote?: string;
  status: PaymentStatus;
  createdAt: number;
  amlFile?: AmlFileMeta;
  rejectedReason?: "aml_denied" | "aml_not_needed";
  refundedAt?: number | null;
}
```

#### 2.2.3 扩展 CreatePaymentInput（`src/lib/t0/network.ts`）

```typescript
import type { RecipientInfo } from "./types";

export interface CreatePaymentInput {
  paymentClientId: string;
  quoteId: string;
  beneficiaryRef: string;
  usdAmount: number;
  /** 当地代币收款人信息（可选；向后兼容不提供的 OFI） */
  recipientInfo?: RecipientInfo;
}
```

### 2.3 OFI 侧改动

#### 2.3.1 `Payment-Payment Continued` 表单增加收款人信息输入

在 OFI 的 `Payment-Payment Continued` tab 的 `Create Payment` 表单中，新增可选的收款人信息区块：

**UI 位置**：`src/routes/ofi.tsx` 的 `paymentContinuedContent` → `PanelCard step="07"` 的 Create Payment 表单

**新增字段**（都是可选的，向后兼容）：

| 字段 | 类型 | 说明 |
|------|------|------|
| country | Select (ISO 3166-1 alpha-2) | 收款人国家 |
| accountHolderName | Input string | 账户持有人姓名 |
| accountNumber | Input string | 账号/卡号/钱包地址 |
| bankCode | Input string (optional) | 银行代码 |
| bankName | Input string (optional) | 银行名称 |

**为什么不直接用 IVMS101**：完整 IVMS101 结构（naturalPerson/legalPerson + name identifiers + nationalIdentification + address + contacts）对 sandbox demo 过于复杂。先用 fallback 简单结构覆盖核心用例，IVMS101 完整支持作为后续扩展。

#### 2.3.2 createPayment 传递 recipientInfo

```typescript
// src/routes/ofi.tsx onCreatePayment
const input: CreatePaymentInput = {
  paymentClientId: clientId,
  quoteId,
  beneficiaryRef,
  usdAmount,
  // 新增：传递收款人信息（如果 OFI 填写了）
  ...(recipientInfo && { recipientInfo }),
};
```

#### 2.3.3 SandboxNetwork.acceptPaymentFromQuote 保存 recipientInfo

```typescript
// src/lib/t0/network.ts acceptPaymentFromQuote
private acceptPaymentFromQuote(quote: Quote, input: CreatePaymentInput, now: number): Payment {
  const payment: Payment = {
    id: input.paymentClientId,
    quoteId: quote.id,
    currency: quote.currency,
    usdAmount: quote.band,
    localAmount: quote.band * quote.rate,
    beneficiaryRef: input.beneficiaryRef,
    recipientInfo: input.recipientInfo, // ← 新增
    status: "accepted",
    createdAt: now,
  };
  this.provider.recordPayment(payment);
  return payment;
}
```

### 2.4 Provider 侧改动

#### 2.4.1 `Payment-Payment Continued` 展示收款人信息

**UI 位置**：`src/routes/provider.tsx` 的 `paymentContinuedContent` → `PanelCard step="03"`

在 "Execute Payout" 按钮的同一行或下方，新增收款人信息展示区：

```
┌─ Payment: baxs_xxx · EUR 920.00 · BEN-DEMO-001 ─────────────────────────┐
│  Quote: qt_xxx… · USD: $1,000                                           │
│  ┌─ 收款人信息 ────────────────────────────────────────────────────────┐ │
│  │ accountHolderName: 张三                                             │ │
│  │ accountNumber: DE89370400440532013000                                │ │
│  │ bankCode: COBADEFFXXX                                               │ │
│  │ bankName: Commerzbank                                               │ │
│  │ country: DE                                                         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  [Execute Payout]                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

如果 `recipientInfo` 为空，显示："收款人信息未提供（legacy payment）"

#### 2.4.2 `ManualAmlPanel` 增加收款人信息展示和审核

**UI 位置**：`src/components/provider/ManualAmlPanel.tsx` 的 `PaymentRow`

在 AML 文件元数据下方，新增收款人信息展示 + 勾选框：

```
┌─ AML file (from OFI): document.pdf (24.5 KB) at 2026/07/16 10:00 ────────┐
│  [Download]                                                              │
│  ┌─ 收款人信息（待人工审核） ───────────────────────────────────────────┐ │
│  │ accountHolderName: 张三                                             │ │
│  │ accountNumber: DE89370400440532013000                                │ │
│  │ bankCode: COBADEFFXXX                                               │ │
│  │ bankName: Commerzbank                                               │ │
│  │ country: DE                                                         │ │
│  │                                                                    │ │
│  │ ☑ 收款人信息已核实                                                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  [Approve] [Reject] [Cancel AML]                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**注意**：
- "☑ 收款人信息已核实" 是 Provider 勾选确认的复选框
- 如果 OFI 没有提供 `recipientInfo`，此区域显示为灰色禁用态，文字改为"收款人信息未提供（跳过人工核实）"
- Provider 必须同时确认 AML 文件和收款人信息，才能点击 Approve

#### 2.4.3 修改 reviewAmlFileFn 签名，支持收款人审核

```typescript
// src/lib/t0/t0.functions.ts
export const reviewAmlFileFn = createServerFn({ method: "POST" })
  .validator((d: {
    paymentId: string;
    decision: "approve" | "reject";
    reason?: "aml_denied" | "aml_not_needed";
    recipientCheckStatus?: "approved" | "rejected"; // 新增
    recipientCheckNote?: string;                    // 新增
  }) => d)
  .handler(async ({ data }) => {
    // 先更新收款人审核状态
    if (data.recipientCheckStatus) {
      sandboxNetwork.updateRecipientCheck(
        data.paymentId,
        data.recipientCheckStatus,
        data.recipientCheckNote,
      );
    }
    // 再执行 AML 审核
    applyAmlReview({
      paymentId: data.paymentId,
      approved: data.decision === "approve",
      reason: data.reason,
    });
  });
```

#### 2.4.4 新增 updateRecipientCheck 方法（`src/lib/t0/network.ts`）

```typescript
// src/lib/t0/network.ts SandboxNetwork
updateRecipientCheck(
  paymentId: string,
  status: "approved" | "rejected",
  note?: string,
): Payment {
  const payment = this.provider.snapshot().payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("unknown payment");
  payment.recipientCheckStatus = status;
  payment.recipientCheckNote = note;
  return payment;
}
```

### 2.5 审核决策逻辑

#### 2.5.1 Provider Approve 的前置条件

以下条件**同时满足**才能点击 Approve：
1. AML 文件已上传（`payment.amlFile` 存在）
2. Provider 已勾选"收款人信息已核实"（或收款人信息本为空）

#### 2.5.2 审核通过流程

```
Provider 点击 Approve（含 recipientCheckStatus: "approved"）
  → reviewAmlFileFn
    → sandboxNetwork.updateRecipientCheck("approved")
    → applyAmlReview({ approved: true })
      → sandboxNetwork.completeManualAml(paymentId, true)
        → provider.markPaymentStatus("accepted")
      → sandboxNetwork.approvePaymentQuote(paymentId, quoteId)
        → provider.refreshQuoteTtl(quoteId)
      → providerService.logOfiAmlEvent(paymentId, quoteId, "approved")
  → 后续流程不变（Last Look → Payout）
```

#### 2.5.3 审核拒绝流程

```
Provider 点击 Reject（含 recipientCheckStatus: "rejected" + reason）
  → reviewAmlFileFn
    → sandboxNetwork.updateRecipientCheck("rejected", reason)
    → applyAmlReview({ approved: false, reason })
      → sandboxNetwork.completeManualAml(paymentId, false, reason)
        → provider.markPaymentStatus("rejected")
        → payment.rejectedReason = reason
      → providerService.logOfiAmlEvent(paymentId, quoteId, "rejected")
  → 结束（Payment 状态为 rejected）
```

#### 2.5.4 收款人信息为空时的处理

如果 OFI 没有提供 `recipientInfo`：
- Provider 的 Payment-Payment Continued 显示"收款人信息未提供（legacy payment）"
- ManualAmlPanel 中收款人信息区显示为灰色禁用，勾选框默认勾选（跳过核实）
- Provider 仍可正常 Approve/Reject AML

### 2.6 UI 状态机

#### ManualAmlPanel 中的收款人信息区状态

| 条件 | 显示 | 交互 |
|------|------|------|
| `recipientInfo` 存在 | 正常展示收款人信息 | 可勾选"已核实" |
| `recipientInfo` 为空 | 灰色文案"收款人信息未提供" | 勾选框 disabled，默认勾选（跳过） |
| Provider 已审核过 | 展示审核结果（Approved/Rejected） | 不可修改 |

---

## 3. 流程图

```
OFI Side                          Network                          Provider Side
─────────────────────────────────────────────────────────────────────────────────

Get Quote
    │
    ▼
Create Payment
+ recipientInfo (fallback) ──────────────────────▶ SandboxNetwork.createPayment
                                                      ├── recordPayment(payment + recipientInfo)
                                                      ├── triggerManualAml (auto)
                                                      └── requestPayout

                                                              Payment-Payment Continued:
                                                              显示收款人信息 + Execute Payout
                                                              （仅展示，不拦截）

                                                              Payment-Manual AML:
                                                              ManualAmlPanel 显示:
                                                              - AML 文件
                                                              - 收款人信息 + 勾选框
                                                              - Approve/Reject/Cancel

Provider 勾选"已核实" + 点击 Approve
    │                    ───────────────────────────▶ reviewAmlFileFn
    │                                                 ├── updateRecipientCheck("approved")
    │                                                 └── applyAmlReview({ approved: true })
    │                                                        ├── completeManualAml(approved)
    │                                                        │   → status: "pending_aml" → "accepted"
    │                                                        ├── approvePaymentQuote (Last Look)
    │                                                        │   → quote TTL 刷新
    │                                                        └── logOfiAmlEvent("approved")
    │
    ▼
Payment 状态变为 "accepted"
    │
    ▼
Execute Payout ──────────────────────────────────▶ requestPayout
                                                      ├── PayoutAccepted
                                                      ├── PayoutSuccess
                                                      └── PaymentConfirmed
```

---

## 4. 变更范围

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/lib/t0/types.ts` (扩展) | 新增 `RecipientInfo`, `Ivms101BeneficialOwner`, `RecipientAccount` 类型 |
| `src/lib/t0/network.ts` (扩展) | 新增 `updateRecipientCheck` 方法 |

### 4.2 修改文件

| 文件 | 改动 |
|------|------|
| `src/lib/t0/network.ts` | `CreatePaymentInput` 增加 `recipientInfo`；`acceptPaymentFromQuote` 保存 `recipientInfo` |
| `src/lib/t0/t0.functions.ts` | `reviewAmlFileFn` validator 增加 `recipientCheckStatus` + `recipientCheckNote` |
| `src/routes/ofi.tsx` | `Payment-Payment Continued` 表单增加收款人信息输入字段；`onCreatePayment` 传递 `recipientInfo` |
| `src/routes/provider.tsx` | `Payment-Payment Continued` 列表展示收款人信息 |
| `src/components/provider/ManualAmlPanel.tsx` | `PaymentRow` 增加收款人信息展示 + 勾选框；`ReadOnlyRow` 增加审核结果展示 |

### 4.3 不建议修改

- `src/lib/t0/provider.ts`：状态写入通过 `SandboxNetwork` 代理，不直接改动
- `src/components/ofi/OfiManualAmlPanel.tsx`：AML 上传流程不受影响
- 现有 `approvePaymentQuote` / `completeManualAml` 的后续流程不变

---

## 5. 测试要求

### 5.1 单元测试

1. **types test**: `RecipientInfo` 可接受 `ivms101` 或 `fallback` 两种格式
2. **network test**: `createPayment` 正确保存 `recipientInfo`
3. **network test**: `updateRecipientCheck` 正确更新 `recipientCheckStatus`
4. **functions test**: `reviewAmlFileFn` 拒绝没有核实收款人的提交（如果实现了校验）

### 5.2 集成测试

1. OFI 填写收款人信息 → Create Payment → Provider 看到收款人信息
2. Provider 在 ManualAmlPanel 审核 AML + 勾选收款人 → Approve → Last Look 继续
3. Provider 拒绝收款人信息 → Reject → Payment 状态为 rejected
4. OFI 不提供 `recipientInfo` → Provider 显示 legacy 文案 → 仍可正常 Approve

---

## 6. 方案对比

| 维度 | 方案 A（推荐） | 方案 B（IVMS101 完整实现） |
|------|--------------|--------------------------|
| 复杂度 | 低：fallback 简单结构 | 高：完整 IVMS101 类型树 |
| 实施时间 | 1-2 天 | 1 周+ |
| 对齐 T-0 规范 | 部分对齐（fallback） | 完全对齐 |
| 向后兼容 | 好：字段可选 | 好 |
| 后续扩展 | 可平滑升级到 IVMS101 | 一次性到位 |
| sandbox 演示效果 | 足够 | 过于复杂，不适合 demo |

**选择方案 A**：sandbox 的目标是演示流程，完整 IVMS101 的字段数量（name identifiers, national identification, address, contacts 等）对 demo 没有额外价值。先用 fallback 结构快速落地，后续可平滑升级。

---

## 7. 实施顺序

```
Step 1: 类型定义（types.ts）
  - 新增 RecipientInfo, Ivms101BeneficialOwner, RecipientAccount
  - 扩展 Payment 接口

Step 2: Network 层（network.ts）
  - CreatePaymentInput 增加 recipientInfo
  - acceptPaymentFromQuote 保存 recipientInfo
  - 新增 updateRecipientCheck 方法

Step 3: OFI 侧 UI（ofi.tsx）
  - Payment-Payment Continued 表单增加收款人字段
  - onCreatePayment 传递 recipientInfo

Step 4: Provider 侧展示（provider.tsx）
  - Payment-Payment Continued 列表展示收款人信息

Step 5: ManualAmlPanel 改动（ManualAmlPanel.tsx）
  - PaymentRow 增加收款人信息展示 + 勾选框
  - ReadOnlyRow 增加审核结果展示

Step 6: Server Fn 改动（t0.functions.ts）
  - reviewAmlFileFn 增加 recipientCheckStatus/recipientCheckNote

Step 7: 测试覆盖
  - types.test.ts 新增类型测试
  - network.test.ts 新增 createPayment recipientInfo 测试
  - network.test.ts 新增 updateRecipientCheck 测试
```

---

## 8. 设计原则对照

| 原则 | 落实 |
|------|------|
| **KISS** | 复用现有 ManualAmlPanel，不新增 tab；fallback 简单结构，不用完整 IVMS101 |
| **高内聚** | 收款人审核与 AML 审核在同一个 Provider 决策中完成，不拆分成独立步骤 |
| **低耦合** | 新字段都是可选的，不提供的 OFI 不受影响；类型定义与 UI 组件分离 |
| **不影响无关功能** | Create Payment 主流程、Quote Management、Payout Execution 核心逻辑不变 |
| **向后兼容** | `beneficiaryRef` 保留；`recipientInfo` 可选；无 recipientInfo 时显示 legacy 文案 |
