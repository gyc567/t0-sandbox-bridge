# T-0 Sandbox Bridge 方案审计与优化版

> 文档版本: v1.1
> 更新日期: 2026-07-01
> 状态: 审计后待实施

本文基于当前代码库和 `src/docs/baxs_t0_integration_guide.md` 审计原 v1.0 方案。目标不是重做一个大而全的控制台，而是把现有 T-0 sandbox 做到协议可信、演示闭环、实现最小。

---

## 一、审计结论

### 1.1 必须修正的问题

| 优先级 | 问题 | 影响 | 优化意见 |
|---|---|---|---|
| P0 | “WebSocket 实时推送”与实现里的 SSE 混用 | 文档误导实现和验收 | 统一命名为 SSE。除非需要双向通信，不做 WebSocket |
| P0 | 签名示例存在 API 与格式不确定性 | 认证演示可能产出错误签名 | 用 `@noble/secp256k1` 或已验证的项目依赖实现 `v+r+s`，补一个固定向量测试 |
| P0 | 原计划新增大量组件和页面 | 工期膨胀，偏离 sandbox 核心 | 复用现有 `src/components/ui/*`，只新增业务组件 |
| P0 | CSV 导出没有处理逗号、引号、换行、空值 | 导出数据会损坏 | 用一个小的 `csvCell()` 转义函数，不引入依赖 |
| P1 | API 端点设计与 TanStack Start server functions 并存 | 两套调用方式会增加维护成本 | 优先沿用 `createServerFn`；只有 SSE/CSV 这种浏览器原生下载或流式能力才加 HTTP endpoint |
| P1 | 幂等性只写原则，没有落到现有 `PayoutProviderService` | 重复 payout 可能重复执行 | 在服务层按业务 id 做去重，不在 UI 层补丁 |
| P1 | 支持货币列表与当前 `Currency` 类型不一致 | UI 可选项和类型不匹配 | 第一版只支持现有 `USD/EUR/GBP/CNH/MXN/BRL/NGN/INR`，扩币种先改类型和测试 |
| P2 | 计划包含 Landing、交易详情、独立报价页等 | 对核心闭环价值低 | 首页只替换空白占位；主控制台先承载完整流程 |

### 1.2 可以删除或推迟

| 项目 | 处理 |
|---|---|
| `zustand` | 暂不新增。私钥输入只需组件局部 state，刷新丢失符合“仅内存”要求 |
| 独立 `/sandbox/quotes` 页面 | 暂不做。当前 `/sandbox` 已覆盖报价管理 |
| 独立 `/sandbox/transactions` 列表页 | 暂不做。除非交易量大到主控制台不可读 |
| 自定义 `StatusBadge/StatsCard/CodeBlock` 基础 UI | 不新增基础 UI。先复用已有 `badge/card/table/textarea/input/button` |
| WebSocket server | 不做。SSE 足够覆盖服务端事件推送 |
| PDF 再转换 | 已存在 `src/docs/baxs_t0_integration_guide.md`，无需重复转换 |

---

## 二、优化后的目标范围

### 2.1 第一版必须完成

1. 首页替换 Lovable 空白占位，提供进入 `/sandbox` 和 `/docs` 的入口。
2. `/sandbox` 保留单页控制台，完成 quote → inbound notification → payment → payout → confirmed 的闭环。
3. 增加 API Tester 区块或页面，用于演示请求体签名、header 生成、cURL 复制。
4. 增加 ECDSA 签名模块，输出 `X-Signature`、`X-Public-Key`、`X-Signature-Timestamp`。
5. 增加 SSE 事件流，只推送 `NetworkEvent`。
6. 增加 CSV 导出，导出 payments/payouts/events 的快照。
7. 增加 `/docs` 文档页，渲染现有 Markdown。

### 2.2 明确不做

1. 不做生产密钥存储。
2. 不做多 Provider。
3. 不做数据库持久化。
4. 不做移动端深度适配，仅保证基本可读。
5. 不新增状态库，除非局部 state 已经明显不可维护。

---

## 三、架构调整

```
Browser (React)
├── Routes
│   ├── /                 Landing，替换空白页
│   ├── /sandbox          主控制台 + API Tester
│   └── /docs             Markdown 文档页
├── Existing UI
│   └── src/components/ui/* 复用 shadcn/Radix 组件
├── T-0 Domain
│   ├── src/lib/t0/provider.ts       单一内存状态源
│   ├── src/lib/t0/t0.functions.ts   普通操作走 Server Functions
│   ├── src/lib/t0/ecdsa.ts          签名与验签演示
│   ├── src/lib/t0/csv.ts            CSV 导出
│   └── src/lib/t0/events.ts         SSE 订阅/广播
└── HTTP-only endpoints
    ├── GET /api/events              SSE
    └── GET /api/export.csv          文件下载
```

原则：现有 `PayoutProviderService` 继续做唯一业务状态源。UI、SSE、CSV 都读取它，不复制一份状态。

---

## 四、协议与安全审计

### 4.1 ECDSA 签名

对齐本地集成文档：

1. 请求体 bytes 追加 8 字节 little-endian Unix 毫秒时间戳。
2. 对拼接结果做 Keccak-256。
3. 用 secp256k1 私钥签名。
4. Header 输出：
   - `X-Signature`: `0x` + 65 bytes hex，顺序为 `v + r + s`
   - `X-Public-Key`: `0x` + 压缩公钥 33 bytes hex
   - `X-Signature-Timestamp`: Unix 毫秒

实现要求：

1. 不在文档里保留半成品代码片段。代码以测试为准。
2. 增加一个固定私钥、固定 body、固定 timestamp 的测试，断言签名长度、公钥长度、时间戳编码顺序和验签结果。
3. UI 明确标注“测试密钥，不要用于生产”。私钥不写 localStorage。

### 4.2 幂等性

幂等性应落在 `PayoutProviderService`：

| 操作 | 幂等 key | 行为 |
|---|---|---|
| `acceptPayment` | `quoteId + beneficiaryRef` 或未来接入的 `payment_client_id` | 重复请求返回同一 payment |
| `processPayout` | `paymentId` | 已有 payout 时返回原 payout，不重复执行 |
| inbound notification | `txHash` | 重复 tx 不重复写事件 |

第一版至少修 `processPayout(paymentId)`，因为重复付款风险最高。

### 4.3 SSE

使用 SSE，不使用 WebSocket：

1. 只需要服务端向浏览器推送事件，SSE 是浏览器原生能力。
2. 事件源来自 `providerService.log()`。
3. 连接关闭必须清理 subscriber。
4. 发送失败时删除 subscriber。
5. 页面初始化仍然通过 `snapshotFn()` 获取快照，SSE 只增量追加事件；断线后直接重新拉快照。

### 4.4 CSV

CSV 不需要依赖：

```typescript
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
```

验收点：

1. 空值导出为空字符串。
2. 逗号、引号、换行不会破坏列。
3. 文件名包含日期，例如 `t0-sandbox-2026-07-01.csv`。

---

## 五、页面方案

### 5.1 首页 `/`

替换当前 `data-lovable-blank-page-placeholder`。不要做复杂营销页，只放：

1. 产品名：`T-0 Sandbox Bridge`
2. 一句话说明：Provider sandbox for quote, settlement, payment, payout flows.
3. 两个入口：`Open Sandbox`、`Read Docs`

### 5.2 控制台 `/sandbox`

保留单页，但把当前纵向 demo 整理成三块：

1. **Flow Controls**：发布报价、模拟 USDT settlement、模拟 credit usage、接受 payment、执行 payout。
2. **Current State**：quotes/payments/payouts 表格。
3. **Event Log**：snapshot + SSE 增量事件。

控件优先使用已有 `Button/Input/Select/Table/Card/Badge`。

### 5.3 API Tester

第一版可以作为 `/sandbox` 内的一个区块，避免新增路由：

1. 私钥输入/生成。
2. JSON body textarea。
3. 签名预览：timestamp、hash、signature、公钥、headers。
4. 复制 cURL。

当页面明显过长时再拆到 `/sandbox/api-tester`。

### 5.4 文档页 `/docs`

直接渲染 `src/docs/baxs_t0_integration_guide.md`。不再做 PDF 转换任务。

---

## 六、文件变更计划

### 6.1 新增文件

| 文件 | 用途 |
|---|---|
| `src/lib/t0/ecdsa.ts` | 签名、验签、密钥生成 |
| `src/lib/t0/ecdsa.test.ts` | 固定向量测试 |
| `src/lib/t0/csv.ts` | CSV 序列化 |
| `src/lib/t0/csv.test.ts` | CSV 转义测试 |
| `src/lib/t0/events.ts` | SSE subscriber 与 broadcast |
| `src/routes/docs.tsx` | Markdown 文档页 |

### 6.2 修改文件

| 文件 | 修改 |
|---|---|
| `src/routes/index.tsx` | 替换空白占位 |
| `src/routes/sandbox.tsx` | 复用 UI 组件，加入 API Tester 和 SSE 事件 |
| `src/lib/t0/provider.ts` | 增加幂等保护和事件广播 hook |
| `src/lib/t0/t0.functions.ts` | 视需要补充导出用 snapshot |
| `src/lib/t0/index.ts` | 导出新增模块 |
| `src/server.ts` | 只在需要时挂 `/api/events` 和 `/api/export.csv` |
| `package.json` | 只新增签名必需依赖；不新增 `zustand` |

---

## 七、依赖策略

当前项目已经有 `clsx`、`lucide-react`、`@tanstack/react-query` 和完整 UI 组件，不需要重复添加。

只允许新增签名确实需要的依赖：

| 依赖 | 原因 |
|---|---|
| `@noble/secp256k1` | secp256k1 签名/验签，浏览器和 Node 都可用 |
| `@noble/hashes` | Keccak-256 与 bytes 工具 |

如果改用已有可用库，则不加新依赖。不要为了 CSV、状态管理、代码块展示增加包。

---

## 八、实施顺序

### Phase 1: 协议可信

1. [ ] 实现 `ecdsa.ts`
2. [ ] 增加固定向量测试
3. [ ] 在 API Tester 展示 header 和 cURL

### Phase 2: 服务层正确性

4. [ ] `processPayout(paymentId)` 幂等
5. [ ] `txHash` 去重
6. [ ] 为上述逻辑补最小测试

### Phase 3: UI 收敛

7. [ ] 替换首页空白占位
8. [ ] `/sandbox` 改用已有 UI 组件
9. [ ] 增加 CSV 下载按钮

### Phase 4: 实时与文档

10. [ ] 实现 SSE
11. [ ] 页面断线后重新拉 snapshot
12. [ ] 增加 `/docs` Markdown 页面

预计工时：4-5 小时。原方案的 6 小时估算偏乐观，因为签名和 SSE 需要测试兜底；删掉多页面和状态库后总体风险更低。

---

## 九、验收清单

| 项目 | 验收方式 |
|---|---|
| 首页 | 不再出现 Lovable placeholder，入口可跳转 |
| 主流程 | 从发布报价到 payout success 可完整走通 |
| 幂等性 | 重复 `processPayout(paymentId)` 不新增第二个 payout |
| 签名 | 固定向量测试通过，header 长度正确 |
| CSV | 含逗号/引号/换行的数据导出仍是合法 CSV |
| SSE | 新事件不用刷新即可出现在 Event Log |
| 文档 | `/docs` 可阅读现有集成指南 |
| 构建 | `npm run build` 通过 |

---

## 十、剩余待确认

1. T-0 官方签名是否严格要求 `v+r+s`，还是接受常见的 `r+s+v`。实现前必须用测试固定格式。
2. TanStack Start 当前部署目标是否方便在 `src/server.ts` 直接处理 SSE。若不方便，先用轮询刷新 snapshot，SSE 推迟。
3. 是否需要支持 `CAD/HKD/SGD`。如果需要，先扩 `Currency` 类型和用例，再开放 UI 选项。

---

## 十一、最终建议

先做“协议可信的单页 sandbox”。不要先铺多页面、状态库和自定义 UI 基础组件。这个项目的关键风险不是页面不够多，而是签名、幂等、事件流和导出是否可靠。
