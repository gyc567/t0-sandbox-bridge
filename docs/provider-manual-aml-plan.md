# Provider Manual AML 方案

> 状态：方案稿
>
> 目标：当 `/ofi` 执行 `Create Payment` 后，`/provider` 的 `Payment-Manual AML` 视图必须能接住待审核 payment，支持上传 AML 文件，后端返回审核结果，并在审核通过后按 T-0 流程继续 `CompleteManualAmlCheck (Approved)` -> `ApprovePaymentQuotes`。

## 1. 需求目标

用户希望把 Manual AML 从“页面模拟”升级成“真实待办审核流程”。

必须满足：

1. `/ofi` 创建 payment 后，`/provider` 能看到对应的待 AML 审核 payment。
2. Provider 页面增加 AML 文件上传输入框和按钮。
3. 点击按钮后，把 AML 文件上传到后端，由后端返回审核结果。
4. 人工完成 Manual AML Check 后，后端继续向 T-0 Network 回传：
   - `CompleteManualAmlCheck (Approved)`
   - `ApprovePaymentQuotes`
5. 不再显示旧空态文案：
   - `No payments pending AML review. Trigger AML from the OFI console or wait for network-driven manual AML checks.`

## 2. 对齐的文档语义

以官方流程为准，Manual AML 的关键步骤是：

1. `UpdateQuote`
2. `Get Quote`
3. `Create Payment`
4. `Payout Request`
5. `Manual AML Check Response`
6. `CompleteManualAmlCheck (Approved)`
7. `ApprovePaymentQuotes`
8. `Payout Success`
9. `Payment Confirmed`

官方文档明确说明：

- `CompleteManualAmlCheck` 是 Payout Provider 在完成人工 AML 审核后发给 Network 的结果回传。
- `ApprovePaymentQuotes` 是后续的 Last Look / Quote Confirmation。
- 如果 AML 需要人工处理，payment 会先进入 pending AML review 状态。

参考：

- [Payment Manual AML Flow](https://docs.t-0.network/docs/network/payment-flow-aml/)
- [Payment Provider API](https://docs.t-0.network/docs/integration-guidance/api-reference/payment_provider/)
- [Payment Network API](https://docs.t-0.network/docs/integration-guidance/api-reference/payment_network/)

## 3. 现有实现现状

当前仓库里已经有一部分基础能力：

- `src/components/provider/ManualAmlPanel.tsx` 已经存在文件上传 UI。
- `src/lib/t0/t0.functions.ts` 已有 `uploadAmlFileFn`。
- `src/lib/t0/network.ts` 已有 manual AML / quote approval 相关编排函数。
- `src/lib/t0/provider-impl.ts` 已有 `ApprovePaymentQuotes` 的入口。

但还存在几个问题：

1. 空态文案仍然偏向“OFI 触发 AML”，和现在要的“Provider 手工审核”不完全一致。
2. 待审核 / 已拒绝 的状态语义还不够清晰，容易混淆。
3. 审核通过后，`CompleteManualAmlCheck` 和 `ApprovePaymentQuotes` 的顺序需要更明确地固化。

## 4. 推荐方案

### 4.1 Provider 页面改成真实待办队列

`Payment-Manual AML` 视图只展示 `pending_aml` payment。

每条 payment 保留：

- payment 基本信息
- AML 文件选择输入框
- 上传并审核按钮
- 审核结果反馈区域

页面不再强调“等 OFI 触发 AML”，因为这会误导操作人员。空状态可以保留，但文案要收敛成“当前没有待审核 payment”。

### 4.2 上传动作只做一件事

点击上传按钮后，后端执行：

1. 校验 AML 文件。
2. 调用 AML review service。
3. 返回审核结果给前端。

前端只负责展示结果，不直接决定协议状态。

### 4.3 审核通过后的协议回传

当审核结果为 approved 时，后端继续执行：

1. `CompleteManualAmlCheck (Approved)` 回传给 T-0 Network。
2. `ApprovePaymentQuotes` 作为 Last Look 继续往下走。
3. 后续 payout / payment confirmed 保持现有链路。

### 4.4 审核拒绝的处理

当审核结果为 rejected 时：

- 不调用 `ApprovePaymentQuotes`。
- 结束该 payment 的 AML 待办状态。
- 不能把“已拒绝”与“待审核”混在同一个状态里。

## 5. 状态语义

建议把 AML 状态分成三个清晰层次：

1. `pending_aml`：待人工审核。
2. `approved`：人工审核通过，准备进入 Network quote confirmation。
3. `rejected`：人工审核拒绝，流程终止。

这样可以避免把“待审核”与“已拒绝”都塞进 `rejected` 的旧语义里。

## 6. 调用链

### 6.1 OFI 创建 payment

```text
/ofi
  -> Create Payment
  -> SandboxNetwork.createPayment
  -> Payout request
  -> Manual AML check required
```

### 6.2 Provider 审核 AML

```text
/provider
  -> Upload AML file
  -> Backend AML review
  -> approved / rejected
```

### 6.3 审核通过

```text
Provider review approved
  -> CompleteManualAmlCheck (Approved)
  -> ApprovePaymentQuotes
  -> payout continues
  -> Payment Confirmed
```

## 7. 变更范围

### 7.1 可能修改的文件

- `src/components/provider/ManualAmlPanel.tsx`
- `src/lib/t0/t0.functions.ts`
- `src/lib/t0/network.ts`
- `src/lib/t0/provider-impl.ts`
- `src/lib/t0/provider.ts`
- `src/lib/t0/ofi.ts`
- `src/components/provider/ManualAmlPanel.test.tsx`
- `src/lib/t0/t0.functions.aml.test.ts`
- `src/lib/t0/network.test.ts`

### 7.2 不建议修改

- `/ofi` 页面结构
- `/provider` 里的 Quote management 主区
- 已经稳定的 payout 执行逻辑
- 已有的 quote 发布逻辑

## 8. 测试要求

新增实现后，至少要覆盖：

1. `/ofi` 创建 payment 后，Provider 的 AML 面板能看到待审核 payment。
2. 上传 AML 文件后，后端返回审核结果。
3. 审核通过时，会继续触发 `CompleteManualAmlCheck (Approved)`。
4. `CompleteManualAmlCheck` 后会继续触发 `ApprovePaymentQuotes`。
5. 审核拒绝时，不会继续后续 quote 确认。
6. 空态文案不再出现旧的 OFI 引导提示。

## 9. 实施顺序

1. 先补测试，锁住现有行为和新语义。
2. 再改 Provider AML 面板。
3. 再接后端上传和审核结果。
4. 最后串联 Network 回传链路。
5. 验证整个 Manual AML 流程不影响现有 Quote / Create Payment 逻辑。

## 10. 方案原则

- KISS：只改一条审核链路，不引入多余新层。
- 高内聚、低耦合：状态判断集中在 Network / Provider service，UI 只展示结果。
- 不影响无关功能：Quote management、Get Quote、Create Payment 主链路保持不变。
- 每个新增行为都有测试。

