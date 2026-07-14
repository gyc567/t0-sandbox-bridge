# AML 流程重做方案（修订版）— Provider 端手动审核

> 状态：方案稿
>
> 目标：保持现有 OFI / Provider 职责不变，只把 `Provider` 侧的 `Payment-Manual AML` 做成可用的手动审核流程。

## 1. 结论先行

这版方案要收敛到一个原则：**不改业务角色，不加新概念，不扩散到无关页面**。

审稿后，原方案中以下内容应删除或改写：

- `OFI 上传 AML 文件`：与当前需求不符，文件上传应由 `Provider` 端发起。
- `Cancel AML` 按钮：需求里没有这个动作，属于额外分支。
- `pending_aml + amlFile + legacy row` 这套新状态机：复杂度过高，且和现有流程不匹配。
- `uploadAmlFileFn` 拆成两个新 server-fn：不必要，保持一个入口更简单。
- `OFI 自动滚动引导`：不是这次需求的一部分，先不做。

## 2. 修订后的目标

### 用户目标

在 `http://localhost:8080/ofi` 创建 Payment 后，`https://www.agtpay.xyz/provider` 的 `Payment-Manual AML` 必须能看到待审核项，并支持：

1. 上传 AML 文件
2. 点击按钮提交到后端
3. 后端返回审核结果
4. 审核通过后，继续执行：
   - `CompleteManualAmlCheck (Approved)`
   - `ApprovePaymentQuotes`

### 业务约束

- `Provider` 负责上传和人工审核
- `OFI` 不新增额外操作入口
- 不影响 `Quote management`、`Get Quote`、`Create Payment`、`payout` 等无关功能
- 保持 KISS、高内聚、低耦合
- 新增/修改的代码必须有测试

## 3. 与官方文档的对齐

参考：

- [Payment Manual AML Flow](https://docs.t-0.network/docs/network/payment-flow-aml/)
- [Payment Provider API](https://docs.t-0.network/docs/integration-guidance/api-reference/payment_provider/)
- [Payment Network API](https://docs.t-0.network/docs/integration-guidance/api-reference/payment_network/)

对齐点只保留一个：

- 业务链路仍然是 `Manual AML Check -> CompleteManualAmlCheck -> ApprovePaymentQuotes`

不额外引入文档没有要求的新状态机，也不扩展出“取消 AML”等副动作。

## 4. 现状审计

当前仓库里已经有可复用的基础能力，优先复用，避免重写：

- `src/components/provider/ManualAmlPanel.tsx`
  - 已经承担 `Provider` 端 AML 列表展示职责
- `src/lib/t0/t0.functions.ts`
  - 已经有 `uploadAmlFileFn` / `triggerManualAmlFn` / `ofiCompleteManualAmlFn` 这类能力
- `src/lib/t0/network.ts`
  - 已经有 `triggerManualAml`、`completeManualAml`、`approvePaymentQuote`
- `src/lib/t0/provider-impl.ts`
  - 已经有 `ApprovePaymentQuotes` 对应链路

结论：这次不是“重新设计 AML”，而是“把现有链路补成可用且可测”。

## 5. 修订后的实现方案

### 5.1 Provider 页面

`src/components/provider/ManualAmlPanel.tsx` 保留为唯一的审核入口，改成：

- 展示待审核的 Payment 列表
- 每一条支持文件选择
- 点击按钮后把文件上传到后端
- 后端返回审核结果后，在 UI 上展示结果
- 空状态文案改掉，不能再显示“没有待审核项就等着触发”的旧提示

推荐的交互文案：

- 标题：`Payment-Manual AML`
- 空态：`No payments pending AML review.`
- 上传按钮：`Upload AML & Review`
- 审核结果：
  - `Approved`
  - `Rejected`

### 5.2 后端链路

保留一个上传入口，不拆分成多个 server-fn。建议延续并收敛现有 `uploadAmlFileFn`：

1. 接收 `paymentId + file`
2. 做基础校验
3. 交给现有 AML reviewer 做内容审核
4. 返回审核结果
5. 若审核通过：
   - 调用 `completeManualAml(paymentId, true)`
   - 再调用 `approvePaymentQuote(paymentId, quoteId)`
6. 若审核拒绝：
   - 调用 `completeManualAml(paymentId, false)` 或等价拒绝分支
   - 不继续 quote approval

这样做的好处是：

- 只有一个入口
- 逻辑集中
- UI 与状态机解耦
- 测试容易覆盖

### 5.3 状态设计

不要新增复杂状态机。只保留现有业务状态，并补一个最小的审核结果视图即可。

建议只区分三类展示态：

- `pending_aml`：待审核
- `approved`：审核通过
- `rejected`：审核拒绝

如果需要展示文件名/时间，优先使用只读元数据，不要把它变成新的业务状态。

### 5.4 路由接线

只改 `Provider` 侧对应的接线，不扩展 `OFI` 侧新交互。

如果现有路由已经把 `ManualAmlPanel` 挂上去了，就只需要把回调和数据流接通。

## 6. 文件改动范围

| 文件 | 改动 |
|---|---|
| `src/components/provider/ManualAmlPanel.tsx` | 保留现有组件，改成上传 + 审核结果展示 |
| `src/components/provider/ManualAmlPanel.test.tsx` | 补齐上传、批准、拒绝、空态测试 |
| `src/lib/t0/t0.functions.ts` | 收敛 `uploadAmlFileFn` 的行为，确保上传后能返回审核结果并驱动后续链路 |
| `src/lib/t0/t0.functions.aml.test.ts` | 更新/补充 server-fn 单测 |
| `src/lib/t0/network.ts` | 如需，补最小的状态推进封装；避免引入新状态 |
| `src/lib/t0/network.test.ts` | 补齐 manual AML 流转测试 |
| `src/routes/provider.tsx` | 接通 `ManualAmlPanel` 的新回调 |

不动这些文件：

- `src/routes/ofi.tsx`
- `src/components/ofi/*`
- `Quote management`
- `Get Quote`
- `Create Payment`
- payout 主链路

## 7. 测试策略

新增或修改的功能必须覆盖测试，重点是行为而不是实现细节。

### 必测项

1. Provider 列表能看到待审核 payment
2. 上传文件后能拿到审核结果
3. 审核通过后会继续走 `CompleteManualAmlCheck (Approved)`
4. 审核通过后会继续走 `ApprovePaymentQuotes`
5. 审核拒绝后不会继续 quote approval
6. 空态文案已经替换，不再显示旧提示

### 推荐验证顺序

1. 先跑 `t0.functions.aml.test.ts`
2. 再跑 `ManualAmlPanel.test.tsx`
3. 再跑 `network.test.ts`
4. 最后跑全量测试和 typecheck

## 8. 验收标准

这个方案完成后，应满足：

- `/provider` 的 `Payment-Manual AML` 能看到待审核项
- 能上传 AML 文件
- 后端能返回审核结果
- 审核通过时，链路继续到：
  - `CompleteManualAmlCheck (Approved)`
  - `ApprovePaymentQuotes`
- 审核拒绝时不继续后续 quote 流程
- 没有影响无关功能
- 所有新增/变更代码都有测试

## 9. 方案原则

- KISS：保留一个上传入口，不拆分出多个新概念
- 高内聚：AML 的状态推进集中在后端链路里
- 低耦合：UI 只负责展示和触发，不直接参与业务判断
- 不扩散：只改 Provider 侧，不碰无关页面
- 可验证：每个行为都有明确测试

## 10. 建议的实施顺序

1. 先收敛 `ManualAmlPanel` 的空态和上传交互
2. 再把 `uploadAmlFileFn` 的返回值和后续状态推进理顺
3. 再补 `network.test.ts` 和 `ManualAmlPanel.test.tsx`
4. 最后跑全量测试和 typecheck

