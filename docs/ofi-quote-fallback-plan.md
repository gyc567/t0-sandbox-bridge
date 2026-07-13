# OFI Quote Fallback 方案

> 状态：方案稿
>
> 目标：当 `/provider` 已发布 Quote 时，`/ofi` 的 `Get Quote` 必须返回同一来源的报价；当 `/provider` 没有发布 Quote 时，`/ofi` 退回到外部汇率源，并且返回的 quote 仍然可以继续 `Create Payment`。

## 1. 问题定义

当前 OFI 询价链路有两类来源：

1. Provider 侧已发布报价。
2. 外部汇率源 fallback。

用户要求是：

- `https://www.agtpay.xyz/provider` 中发布了 `0.9203`，`http://localhost:8080/ofi` 中应得到 `0.9203`，不能被压成 `0.92`。
- 如果 Provider 没有发布 Quote，OFI 仍然要能拿到一个可下单的报价。

这意味着 fallback 不能只是“展示用汇率”，必须生成可继续使用的 quote identity，并进入现有的 `createPayment` 连续性链路。

## 2. 现有调用链

### 2.1 Provider 发布报价

```text
/provider
  -> publishQuote
  -> PayoutProviderService.publishQuote
  -> network.updateQuote
  -> T-0 / agtpay quote book
```

### 2.2 OFI 获取报价

```text
/ofi
  -> ofiGetQuoteFn
  -> SandboxNetwork.getQuote
  -> OfiT0Client.getQuote
  -> rawToOfiSuccess / toGetQuoteResult
  -> /ofi 页面展示
```

### 2.3 OFI 下单

```text
/ofi
  -> ofiCreatePaymentFn
  -> SandboxNetwork.createPayment
  -> getQuoteById
  -> acceptPaymentFromQuote
  -> requestPayout
```

当前设计里，`createPayment` 依赖 `quoteId` 可回查，因此 fallback quote 也必须被缓存。

## 3. 设计目标

- 保持 KISS：一个入口，两条来源，统一返回形状。
- 保持高内聚、低耦合：来源选择集中在网络层，不把逻辑扩散到 UI。
- 保持 quote 连续性：fallback quote 也必须可被 `getQuoteById()` 找到。
- 保持测试可验证：新增逻辑必须有回归测试。
- 不影响已有 Provider 发布和 OFI 下单语义。

## 4. 推荐方案

### 4.1 统一 QuoteSource

在 `SandboxNetwork` 内部引入一个很薄的 quote source 选择层：

- 优先查 Provider 已发布 quotes。
- 如果没有命中，再查询外部汇率源。

`/ofi` 不感知来源差异，只消费同一类 `GetQuoteResult.success`。

### 4.2 Fallback 来源

推荐使用：

- `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usdt.json`
- 备用：`https://latest.currency-api.pages.dev/v1/currencies/usdt.json`

要求：

- 无 API key。
- 无 rate limit。
- 日更即可。
- 只读，不写入外部系统。

### 4.3 Fallback 的 quote 连续性

Fallback 不只是返回汇率，还要生成可继续下单的 quote：

- 生成稳定的 `quoteId`
- 写入 `externalQuotes` 缓存
- `getQuoteById()` 能查回该 quote
- `createPayment()` 继续使用同一 quoteId

这样可以保留现有用户流程：

```text
Get Quote -> Select quote -> Create Payment
```

## 5. 精度规则

### 5.1 Provider 发布报价

Provider 侧输入的 rate 必须原样保留到足够精度，不能再按 2 位小数量化。

### 5.2 外部 fallback 汇率

外部汇率源返回多少位，就保留多少位，至少不要在进入 OFI 之前丢精度。

### 5.3 展示层

`/ofi` 页面可以做格式化展示，但展示格式不能影响内部 `quote.rate` 的真实数值。

## 6. 变更范围

### 6.1 允许修改

- `src/lib/t0/ofi-client.ts`
- `src/lib/t0/network.ts`
- `src/lib/t0/quote-mapper.ts` 或新的汇率解析 helper
- `src/lib/t0/ofi.test.ts`
- `src/lib/t0/ofi-client.test.ts`
- `src/lib/t0/network.test.ts`
- 新增 fallback 相关测试文件
- `docs/` 下新增测试报告或设计说明

### 6.2 不建议修改

- `/ofi` 页面交互结构
- `/provider` 页面交互结构
- 现有 createPayment 主流程语义
- 现有 publishQuote 主流程语义

## 7. 失败策略

fallback 也失败时，OFI 应返回明确错误，而不是伪造报价：

- 外部汇率源超时
- 返回非法 JSON
- 返回缺失货币
- 无法映射到目标货币

这些情况应该进入明确的 failure 分支，UI 继续展示友好错误信息。

## 8. 测试要求

新增或修改后，至少要覆盖：

1. Provider quote 命中时，不走 fallback。
2. Provider 无 quote 时，走 fallback。
3. fallback quote 的 rate 精度保留。
4. fallback quote 可以继续 `Create Payment`。
5. fallback 失败时返回明确错误。

## 9. 实施顺序

1. 先在 `docs` 固化方案。
2. 再补最小 failing tests。
3. 再实现 fallback 逻辑。
4. 最后补回归验证和测试报告。

## 10. 待确认点

- fallback quote 的定价是否需要固定为 `USDT -> target currency` 的单向映射，还是需要按 payment method / corridor 做细分。
- fallback quote 的有效期是否与外部汇率源日更节奏一致，还是需要额外加短 TTL。
- fallback quote 的 `quoteId` 生成规则是否需要与 Provider quote 区分前缀。

