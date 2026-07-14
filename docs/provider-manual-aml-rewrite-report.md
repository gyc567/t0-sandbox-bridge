# AML 流程重做 — 测试报告（Phase 7）

## 1. 总结：PASS

按 `docs/provider-manual-aml-rewrite.md` 实施完毕。7 个 phase 全部完成，所有自动化检查 green。

## 2. 测试清单

| 测试文件 | 阶段 | 用例数 | 增量 |
|---------|------|--------|------|
| `src/lib/t0/t0.functions.aml.test.ts` | Phase 3 重写 | 15 | 重写（OFI-upload + Provider-review 双向覆盖） |
| `src/lib/t0/network.test.ts` | Phase 2 补充 | 52 | +6（`cancelManualAml` 3 + `recordAmlFile` 3） |
| `src/components/ofi/OfiManualAmlPanel.test.tsx` | Phase 5 重写 | 21 | 重写（11→21，+10） |
| `src/components/provider/ManualAmlPanel.test.tsx` | Phase 4 重写 | 20 | 重写（19→20，+1） |
| 其他 36 个测试文件 | — | 632 | 未触碰 |
| **全量合计** | — | **740** | **+8 净增** |

## 3. 覆盖率

### 3.1 全局阈值

| Metric | Baseline | After | Threshold | Status |
|--------|----------|-------|-----------|--------|
| Statements | 94.22% | **95.31%** | 95% | ✅ PASS |
| Branches | 89.02% | **90.73%** | 90% | ✅ PASS |
| Functions | 94.72% | **95.59%** | 90% | ✅ PASS |
| Lines | 94.60% | **95.73%** | 95% | ✅ PASS |

### 3.2 改动文件覆盖

| 文件 | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| `src/components/ofi/OfiManualAmlPanel.tsx` | **100%** | 98% | 100% | 100% |
| `src/components/provider/ManualAmlPanel.tsx` | **100%** | 100% | 100% | 100% |
| `src/lib/t0/network.ts` (含新增方法) | 95.31% | 91.42% | **100%** | 95.45% |
| `src/lib/t0/provider.ts` (含 `recordAmlFile`) | 88.69% | 84% | 81.81% | 90.81% |
| `src/lib/t0/t0.functions.ts` | n/a (excluded from coverage) | | | |

两个 panel 都到 100% 语句覆盖。新增的 `recordAmlFile` 和 `cancelManualAml` 函数在 `network.ts` 100% 函数覆盖；其余非覆盖行是 legacy 错误分支（pre-existing）。

### 3.3 Phase 7 锁定的新行为

| 行为 | 锁定测试 |
|------|---------|
| OFI 上传合法 PDF → 写入 `amlFile` 元数据，状态保持 `pending_aml` | `t0.functions.aml.test.ts: uploades a valid file...` |
| OFI 上传非法文件 → 抛错，**不**写入 `amlFile` | `t0.functions.aml.test.ts: throws on invalid file type without writing metadata`（+empty / oversized）|
| OFI 上传**不**触发 `completeManualAml` / `approvePaymentQuote`（决定权在 Provider） | `t0.functions.aml.test.ts: upload does NOT call completeManualAml...` |
| OFI 重新上传 → 覆盖旧元数据，状态保持 `pending_aml` | `t0.functions.aml.test.ts: OFI can re-upload to overwrite...` |
| Provider Approve → `accepted` + Last Look 刷新 quote TTL | `t0.functions.aml.test.ts: approve → status accepted + Last Look bumps...` |
| Provider Reject → `rejected`，**不**刷新 TTL，**不**写 OfiAmlEvent | `t0.functions.aml.test.ts: reject → status rejected, no Last Look...` |
| Provider Cancel AML ≡ Reject（命名入口不同，行为等价） | `t0.functions.aml.test.ts: cancel AML is equivalent to reject` |
| Provider 二次决定抛错（payment 已脱离 `pending_aml`） | `t0.functions.aml.test.ts: second call after approval throws` |
| Panel 只展示 OFI 上传的文件元信息，**不**含 Provider 文件 input | `ManualAmlPanel.test.tsx: does NOT expose any file input...` |
| Provider 三按钮：Approve / Reject / Cancel AML | `ManualAmlPanel.test.tsx: renders three buttons on a pending_aml row` |
| Cancel AML 弹窗：取消则不调用回调 | `ManualAmlPanel.test.tsx: clicking Cancel AML prompts confirm; on cancel → onReviewAml NOT called` |
| Cancel AML 弹窗：确认则调 `onReviewAml(id, 'reject')` | `ManualAmlPanel.test.tsx: clicking Cancel AML + confirming → onReviewAml(paymentId, 'reject')` |
| Legacy pending_aml（无 `amlFile`）显示警告，三个按钮仍可用 | `ManualAmlPanel.test.tsx: shows legacy warning...` |
| OFI 端按状态分流到三个 section | `OfiManualAmlPanel.test.tsx: renders all three sections...` |
| OFI 端正确过滤 `accepted`/`rejected`/`confirmed` 等终态 | `OfiManualAmlPanel.test.tsx: hides terminal-status payments entirely` |
| 文件大小格式化（B / KB / MB）边界 | `ManualAmlPanel.test.tsx: formats amlFile sizes in B / KB / MB units` + OFI 镜像 |

## 4. 自动化验证命令

全部已运行并通过：

```bash
# 全量测试
bun x vitest run
# → 40 files / 740 tests / all pass

# 覆盖率
bun x vitest run --coverage
# → Statements 95.31% / Branches 90.73% / Functions 95.59% / Lines 95.73%
# → 所有阈值通过

# 类型检查
bun run typecheck
# → tsc --noEmit clean (no errors)
```

## 5. Dev server 状态

`bun run dev` 已在 8080 端口启动，可以直接访问：

| URL | 内容 |
|-----|------|
| http://localhost:8080/ofi | OFI 控制台（Payment-Manual AML 标签页 = 09a 步） |
| http://localhost:8080/provider | Provider 控制台（Payment-Manual AML = 04 步） |

E2E 操作顺序：

1. `/ofi` → 创建 payment → 在 09a 步看到 "Trigger AML" 按钮 + 顶部 cyan banner 提示
2. 点击 Trigger AML → 切换到 "Awaiting your AML file upload" section
3. 选择文件 → 点击 "Upload & Submit" → 切换到 "Awaiting Provider review"
4. `/provider` → 04 步 → 看到文件元信息（"AML file (from OFI): report.pdf ..."）+ 三个按钮
5. 点 Cancel AML → confirm 弹窗 → 确认 → payment 状态 `rejected`
6. 也可以点 Approve → 走 Last Look；点 Reject → 直接 `rejected`

## 6. 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/lib/t0/types.ts` | 新增 `AmlFileMeta` 接口 + `Payment.amlFile?` 字段 |
| `src/lib/t0/provider.ts` | 新增 `recordAmlFile(paymentId, meta)` 方法 |
| `src/lib/t0/network.ts` | 新增 `recordAmlFile` 和 `cancelManualAml` 包装 |
| `src/lib/t0/t0.functions.ts` | 删除 `uploadAmlFileFn`；新增 `ofiUploadAmlFileFn` + `reviewAmlFileFn` |
| `src/components/provider/ManualAmlPanel.tsx` | 重写：三按钮 + Cancel AML 弹窗 + OFI 文件元信息展示 |
| `src/components/ofi/OfiManualAmlPanel.tsx` | 重写：三子状态 + 文件上传 UI + 滚动提示 banner |
| `src/routes/ofi.tsx` | 接 `ofiUploadAmlFileFn` + 滚动引导 useEffect |
| `src/routes/provider.tsx` | 接 `reviewAmlFileFn` + `onReviewAml` 回调 |

## 7. 不在范围（与上版保持一致）

- `unknown quote` external-quote bug — 独立 PR
- Quote management / Get Quote / Create Payment 主链路 — 未触碰
- Last Look 报价确认流程（OFI 端 step 09）— 未触碰
- payout 执行逻辑 — 未触碰
- Radix Dialog 替代 `window.confirm` — 后续可优化

## 8. 设计原则对照

| 原则 | 落实 |
|------|------|
| **KISS** | 一个 server-fn 拆两个，3 个 section 替代分散 UI；`runOfiUpload` / `classifyOfiRow` 等纯函数被单元测试覆盖，避免 UI 内联业务逻辑 |
| **高内聚** | 状态判断集中在 `network.ts`（`recordAmlFile` / `cancelManualAml` / `completeManualAml`）；UI 只展示 |
| **低耦合** | OFI / Provider 各自一个组件，**零直接通信**，通过 `Payment.amlFile` 字段作为契约；server-fn 通过纯函数 `applyAmlReview` 解耦 |
| **不影响无关功能** | 6 个无关文件（routes/ofi.tsx 大量代码、routes/provider.tsx 其他 tab、Quote management、payout 等）零改动；其余 36 个测试文件全部继续通过 |
| **100% 新功能覆盖** | 两个 panel 均 100% stmts/lines；新增网络层方法 100% 函数覆盖 |