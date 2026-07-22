# ReFund 模块设计方案（v2）

**更新日期：2026-07-17**

---

## 一、目标

OFI 控制台左侧菜单 **"Funding & Capacity"** → 重命名为 **"ReFund"**，功能重新定义为：追踪 AML 人工审核拒绝后的退款全流程，展示每个被拒绝订单的完整时间线。**OFI 侧为只读视图**，退款由 Provider 发起。

---

## 二、展示内容

每个被拒绝订单展示以下信息：

| 字段 | 来源 | 说明 |
|------|------|------|
| Payment ID | `payment.id` | |
| Quote ID | `payment.quoteId` | 前 16 字符 + … |
| Currency / Local Amount | `payment.currency` + `payment.localAmount` | |
| USD Amount | `payment.usdAmount` | |
| Beneficiary Ref | `payment.beneficiaryRef` | |
| AML File | `payment.amlFile.filename` | 无文件时显示 "—" |
| AML Uploaded At | `payment.amlFile.uploadedAt` | 无文件时显示 "—" |
| Rejected Reason | `payment.rejectedReason` | `"aml_denied"` → "AML Denied"；`"aml_not_needed"` → "AML Not Needed" |
| Rejected At | `payment.rejectedAt` | 待退列表用；无数据时显示 "—" |
| Refunded At | `payment.refundedAt` | 已退列表用；无数据时显示 "—" |
| Refund Duration | `refundedAt - rejectedAt` | 仅已退列表显示，格式 "Xh Xm" |

**时间线（每行内展示）：**

```
[Created @ XX:XX] → [AML Uploaded @ XX:XX] → [Rejected @ XX:XX] → [Refunded @ XX:XX]
```

---

## 三、数据模型变更

### 3.1 `Payment` 新增 `rejectedAt`

```typescript
// src/lib/t0/types.ts
export interface Payment {
  // ...现有字段...
  /** Provider 拒绝 AML 的时间戳。completeManualAml(rejected) 时写入。 */
  rejectedAt?: number | null;
}
```

### 3.2 `completeManualAml` 写入 `rejectedAt`

```typescript
// src/lib/t0/network.ts — completeManualAml 方法
completeManualAml(paymentId, approved, reason?) {
  const payment = this.provider.snapshot().payments.find(p => p.id === paymentId);
  if (!payment) throw new Error("unknown payment");
  if (payment.status !== "pending_aml") {
    throw new Error(`payment must be in pending_aml state, got ${payment.status}`);
  }
  const updated = this.provider.markPaymentStatus(paymentId, approved ? "accepted" : "rejected");
  if (!approved) {
    updated.rejectedAt = this.now();      // ← 新增
    updated.rejectedReason = reason;
  }
  return updated;
}
```

> **实现说明**：`markPaymentStatus` 仅修改 `status` 字段，不承担 metadata 写入职责。`rejectedAt` 和 `rejectedReason` 都在 `completeManualAml` 的 `if (!approved)` 块中直接设置在 `updated` 对象上。

### 3.3 `cancelManualAml` 行为

`cancelManualAml` 内部调用 `completeManualAml(id, false)`，自动走 `!approved` 分支，**`rejectedAt` 会被设置**，无需额外代码。

### 3.4 存量数据兼容

本次变更前已存在的 `rejected` 状态 payment，`rejectedAt` 为 `undefined`。UI 展示 "—" 并标注 "（legacy）"。

---

## 四、ServerFn 变更

### 4.1 新增 `ofiListRejectedPaymentsFn`

```typescript
// src/lib/t0/t0.functions.ts
export const ofiListRejectedPaymentsFn = createServerFn({ method: "GET" })
  .handler(async () => sandboxNetwork.listRejectedPayments());
```

### 4.2 新增 `SandboxNetwork.listRejectedPayments()`

```typescript
// src/lib/t0/network.ts
listRejectedPayments(): Payment[] {
  return this.provider
    .snapshot()
    .payments.filter((p) => p.status === "rejected")
    .sort((a, b) => (b.refundedAt ?? b.rejectedAt ?? 0) - (a.refundedAt ?? a.rejectedAt ?? 0));
}
```

> **排序说明**：已退款优先（按退款时间降序），待退款其次（按拒绝时间降序）。`refundedAt` 非 null/undefined 时排在前面。

---

## 五、UI 变更

### 5.1 菜单重命名

```tsx
// src/components/ofi/OfiSidebarMenu.tsx
// value: "funding-capacity" → "refund"
// label: "Funding & Capacity" → "ReFund"
```

> **说明**：原有 `funding-capacity` tab value 改为 `"refund"`，label 同步更新。功能内容完全替换，不再引用原有 funding panel。

### 5.2 新增 `OfiReFundPanel` 组件

路径：`src/components/ofi/OfiReFundPanel.tsx`

**Props：**

```tsx
interface OfiReFundPanelProps {
  payments: Payment[]; // 仅含 status === "rejected" 的 payment
}
```

**内部数据结构：**

```tsx
const awaitingRefund = payments.filter(p => p.refundedAt == null);
const refunded = payments.filter(p => p.refundedAt != null);
```

**列表项（TimeLineRow）：**

```
Payment ID + Currency + Amount（头部一行）
Quote: QT_XXXX… | USD: $X,XXX | BenRef: XXXXX
AML: report.pdf · uploaded at 2026-07-17 10:30
Rejected: AML Denied @ 2026-07-17 11:00    ← Awaiting Refund
Refunded: ✓ 2026-07-17 11:30 (30m)         ← Refunded
```

**Empty states：**

| 分区 | 空状态文案 | data-testid |
|------|-----------|-------------|
| Awaiting Refund | `"No payments awaiting refund."` | `"refund-empty-awaiting"` |
| Refunded | `"No refunds processed yet."` | `"refund-empty-refunded"` |

**Badge 颜色：**

| 状态 | 颜色 | 文案 |
|------|------|------|
| Awaiting Refund | 橙色 `#ff9f0a` | "Awaiting Refund" |
| Refunded | 绿色 `#22c55e` | "Refunded ✓" |

### 5.3 路由 `ofi.tsx` 集成

- `ofiListRejectedPaymentsFn` GET 获取 rejected payments
- 移除原有的 `fundingContent` tab panel
- 新增 `refundContent` → `OfiReFundPanel`
- PanelCard step 沿用 "04"，title 改为 "ReFund"

```tsx
const refundContent = (
  <OfiReFundPanel payments={data.rejectedPayments} />
);
```

---

## 六、原有 `Funding & Capacity` 功能去向

| 功能 | 去向 | 说明 |
|------|------|------|
| Payout limit 展示 | 移除 | Sandbox 演示用，OFI 真实场景无此需求 |
| Submit funding | 移除 | Sandbox 演示用，OFI 真实场景走 Treasury |
| Ledger entries | 移除 | Sandbox 演示用 |
| Notifications | 移除 | Sandbox 演示用 |

> 如未来需要在 Provider Console 保留这些功能，单独作 TODO item 处理。本方案范围不含迁移。

---

## 七、TODO List

| # | 任务 | 文件 |
|---|------|------|
| 1 | `Payment.rejectedAt` 类型定义 | `src/lib/t0/types.ts` |
| 2 | `completeManualAml` 写入 `rejectedAt` | `src/lib/t0/network.ts` |
| 3 | `SandboxNetwork.listRejectedPayments()` | `src/lib/t0/network.ts` |
| 4 | `ofiListRejectedPaymentsFn` server function | `src/lib/t0/t0.functions.ts` |
| 5 | OFI route handler 获取 rejected payments | `src/routes/ofi.tsx` |
| 6 | `OfiReFundPanel` React 组件 | `src/components/ofi/OfiReFundPanel.tsx` |
| 7 | 菜单更名 `"funding-capacity"` → `"refund"` | `src/components/ofi/OfiSidebarMenu.tsx` |
| 8 | 单元测试：`completeManualAml(false)` 写入 `rejectedAt` | `src/lib/t0/t0.functions.aml.test.ts` |
| 9 | 单元测试：`listRejectedPayments` 返回正确子集和排序 | `src/lib/t0/network.test.ts` |
| 10 | 组件测试：`OfiReFundPanel` 渲染含空状态 | `src/components/ofi/OfiReFundPanel.test.tsx` |

---

## 八、验收标准

1. `completeManualAml(id, false)` 调用后，`payment.rejectedAt` 为当前时间戳，`rejectedReason === "aml_denied"`
2. `completeManualAml(id, true)` 调用后，`payment.rejectedAt` 仍为 `undefined`
3. `ofiListRejectedPaymentsFn` 返回列表中无 `status !== "rejected"` 的 payment
4. UI 两个分区各展示正确的空状态
5. Legacy payment（`rejectedAt === undefined`）在 Rejected At 字段显示 "—"
6. 退款耗时计算正确：`refundedAt - rejectedAt`，格式 `Xh Xm` 或 `Xm`
7. 所有新增代码 100% 测试覆盖
