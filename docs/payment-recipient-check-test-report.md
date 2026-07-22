# Payment 收款人信息 + Provider 人工审核 — 测试报告

## 1. 总结

| 指标 | 结果 |
|------|------|
| Test Files | 43 passed |
| Tests | 802 passed |
| TypeScript | ✓ tsc --noEmit clean |
| 新增测试覆盖 | `network.ts` `updateRecipientCheck` + `recipientInfo`; `t0.functions.aml.test.ts` combined flow; `ManualAmlPanel.test.tsx` 更新 |

---

## 2. 新增测试用例

### 2.1 `src/lib/t0/network.test.ts`

#### `createPayment` recipientInfo 测试（2 个）

| 测试 | 描述 |
|------|------|
| `createPayment saves recipientInfo.fallback on the Payment` | 验证 `createPayment` 时传入 `recipientInfo.fallback` → payment.recipientInfo 正确保存 |
| `createPayment without recipientInfo leaves recipientInfo undefined` | 验证不传 `recipientInfo` 时字段为 `undefined`（向后兼容） |

#### `updateRecipientCheck` 测试（4 个）

| 测试 | 描述 |
|------|------|
| `sets recipientCheckStatus to approved` | 验证 `updateRecipientCheck(id, "approved")` 正确设置状态 |
| `sets recipientCheckStatus to rejected with a note` | 验证 `updateRecipientCheck(id, "rejected", "note")` 同时设置 note |
| `is idempotent: second call overwrites the previous decision` | 验证重复调用覆盖旧值 |
| `throws on unknown payment` | 验证未知 payment 抛错 |

#### `createPaymentIntent` recipientInfo 测试（1 个）

| 测试 | 描述 |
|------|------|
| `createPaymentIntent saves recipientInfo when provided` | 验证 `createPaymentIntent` 也支持 `recipientInfo` |

#### `handleNetworkAccepted` 参数更新（3 处调用更新）

原调用 `handleNetworkAccepted(id, ref, clock)` → 更新为 `handleNetworkAccepted(id, ref, undefined, clock)`（新增 `recipientInfo` 可选参数）。

### 2.2 `src/lib/t0/t0.functions.aml.test.ts`

#### Provider review + recipient check 组合流程测试（4 个）

| 测试 | 描述 |
|------|------|
| `approve + recipientCheckStatus approved → status accepted + recipientCheckStatus set` | Provider 同时 approve AML 和收款人信息 → payment accepted + recipientCheckStatus approved |
| `reject + recipientCheckStatus rejected with note → status rejected + recipientCheckStatus set` | Provider 拒绝 AML + 拒绝收款人信息 → payment rejected + 记录 note |
| `approve + recipientCheckStatus rejected still sets recipientCheckStatus but rejects payment` | Provider 拒绝 AML（即使同时设置 recipientCheckStatus rejected）→ payment 仍为 rejected |
| `approve with no recipientInfo + recipientCheckStatus approved (skip verification)` | OFI 未提供 recipientInfo 时，Provider 发送 approved（跳过核实）→ payment accepted |

### 2.3 `src/components/provider/ManualAmlPanel.test.tsx`

#### 新增测试（0 个，直接更新现有测试）

现有 28 个测试全部保留，只需更新 mock 签名以匹配新的 `onReviewAml` 类型：

**签名变更**：
```typescript
// 旧
onReviewAml(paymentId, decision, reason?)

// 新
onReviewAml(paymentId, decision, recipientCheckStatus, reason?, recipientCheckNote?)
```

**受影响的测试**：
- `ManualAmlPanel` describe block（静态渲染测试）：更新全局 mock 签名
- `ManualAmlPanel — handler interactions` describe block：更新全局 mock 签名
- `ManualAmlPanel — refund section` describe block：更新全局 mock 签名
- `clicking Approve invokes onReviewAml(paymentId, 'approve', 'approved')`：更新断言（JS 丢弃尾随 undefined，传入 3 个而非 4 个参数）
- `clicking Reject invokes onReviewAml(paymentId, 'reject', 'aml_denied', 'approved')`：更新断言顺序
- `clicking Cancel AML + confirming → onReviewAml(paymentId, 'reject', 'approved', 'aml_not_needed')`：更新断言

---

## 3. 变更文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/lib/t0/types.ts` | 新增类型 | `RecipientInfo`, `Ivms101BeneficialOwner`, `RecipientAccount` 等 |
| `src/lib/t0/network.ts` | 逻辑新增 | `CreatePaymentInput.recipientInfo`; `acceptPaymentFromQuote` 保存; `updateRecipientCheck` 方法; `createPaymentIntent`/`handleNetworkAccepted` 支持 recipientInfo |
| `src/lib/t0/t0.functions.ts` | 逻辑修改 | `reviewAmlFileFn` 增加 `recipientCheckStatus` + `recipientCheckNote`; `createPaymentIntentFn` validator 更新 |
| `src/routes/ofi.tsx` | UI 新增 | `Payment-Payment Continued` 表单增收款人信息字段（country, accountHolderName, accountNumber, bankCode, bankName） |
| `src/routes/provider.tsx` | UI 新增 | `Payment-Payment Continued` 列表增收款人信息展示区; `onReviewAml` 签名更新 |
| `src/components/provider/ManualAmlPanel.tsx` | UI 新增 | `PaymentRow` 增收款人信息展示 + "已核实"勾选框; `ReadOnlyRow` 显示审核结果 |
| `src/lib/t0/network.test.ts` | 测试新增 | `updateRecipientCheck` 4 个测试; `createPayment` recipientInfo 2 个测试; `createPaymentIntent` recipientInfo 1 个测试 |
| `src/lib/t0/t0.functions.aml.test.ts` | 测试新增 | Provider review + recipient check 组合流程 4 个测试 |
| `src/components/provider/ManualAmlPanel.test.tsx` | 测试更新 | mock 签名更新 + 断言更新 |

---

## 4. 覆盖率

| File | Stmts | Branch | Funcs | Lines |
|------|-------|--------|-------|-------|
| `lib/t0/network.ts` | 94.77% | 90.47% | 100% | 94.57% |
| `lib/t0/types.ts` | 97.69% | 85.71% | 100% | 97.36% |
| `components/provider/ManualAmlPanel.tsx` | 97.77% | 69.64% | 95.45% | 97.50% |

覆盖率未达全局阈值（statements 94.82% < 95%，branches 89.11% < 90%）是因为 pre-existing 的未覆盖路径（settlement registry throw paths, `submitUsdtSettlement`/`receiveSettlementConfirmation` 的 `!settlementRegistry` 分支），与本次改动无关。

---

## 5. 测试命令

```bash
# 全量测试
bun x vitest run

# 类型检查
bun run typecheck

# 覆盖率
bun x vitest run --coverage
```
