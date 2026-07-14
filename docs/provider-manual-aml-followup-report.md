# Phase 7 Follow-up: Auto-Trigger AML — 测试报告

## 1. 总结：PASS

用户报障：Create Payment 后 Payment-Manual AML 标签页没有上传 UI。修复方案：CreatePayment 成功后自动触发 AML 流程，让页面自动跳转并展示文件上传界面。已落地 + E2E 浏览器验证通过。

## 2. 改动文件

| 文件 | 改动 |
|------|------|
| `src/lib/t0/aml-flow.ts` | **新增** — 纯函数 `autoTriggerAmlAfterCreate` + `pickOfiDefaultTab` |
| `src/lib/t0/aml-flow.test.ts` | **新增** — 8 个测试覆盖两个纯函数 |
| `src/components/ofi/OfiSidebarMenu.tsx` | 加 `defaultTab` prop，受控 Radix Tabs |
| `src/components/ofi/OfiSidebarMenu.test.tsx` | **新增** — 4 个 SSR 测试覆盖 defaultTab |
| `src/routes/ofi.tsx` | ① `onCreatePayment` 成功后调 `triggerManualAml` ② `router.navigate` 设置 `?aml-required=pm_xxx` ③ 通过 `key={initialDefaultTab}` 触发 OfiSidebarMenu 重挂载来切换 tab ④ 滚动引导 `useEffect` 优先查 upload row → fallback 到 trigger / waiting row |

## 3. 新行为 → 测试映射

| 行为 | 锁定测试 |
|------|---------|
| `autoTriggerAmlAfterCreate` 成功路径返回 payment id | `aml-flow.test.ts: calls triggerManualAml(paymentId) and returns the id on success` |
| CreatePayment 返回 `failure` 时**不**调 triggerManualAml | `aml-flow.test.ts: returns null when create-payment returned a failure result` |
| triggerManualAml 抛错**不**冒泡，返回 null | `aml-flow.test.ts: returns null when triggerManualAml throws` |
| triggerManualAml **只**调一次（无双触发） | `aml-flow.test.ts: passes the id exactly once` |
| `pickOfiDefaultTab("?aml-required=pm_xyz")` 返回 `'payment-manual-aml'` | `aml-flow.test.ts: returns 'payment-manual-aml' when ?aml-required= is set`（含 URLSearchParams + string 双形式）|
| 缺 `?aml-required=` 时默认 `'quote-management'` | `aml-flow.test.ts: returns 'quote-management' when ?aml-required= is absent` |
| OfiSidebarMenu 默认 tab 是 `quote-management` | `OfiSidebarMenu.test.tsx: defaults to 'quote-management' when no defaultTab is passed` |
| `defaultTab='payment-manual-aml'` 切换到 AML tab | `OfiSidebarMenu.test.tsx: opens the Payment-Manual AML tab when defaultTab='payment-manual-aml'` |
| 显式 `defaultTab='quote-management'` 也生效 | `OfiSidebarMenu.test.tsx: opens the Quote management tab when defaultTab='quote-management' (explicit)` |
| 5 个 tab 标签都渲染 | `OfiSidebarMenu.test.tsx: exposes all 5 tab labels` |

## 4. 自动化验证命令

```bash
# 全量测试
bun x vitest run
# → 42 files / 752 tests / all pass

# 类型检查
bun run typecheck
# → tsc --noEmit clean (no errors)

# 覆盖率
bun x vitest run --coverage
# → Statements 95.47 / Branches 90.81 / Functions 95.9 / Lines 95.9
# → 所有阈值通过
```

## 5. 覆盖率对比

| Metric | Phase 7 baseline | After | Threshold |
|--------|------------------|-------|-----------|
| Statements | 95.31% | **95.47%** | 95% ✅ |
| Branches | 90.73% | **90.81%** | 90% ✅ |
| Functions | 95.59% | **95.90%** | 90% ✅ |
| Lines | 95.73% | **95.90%** | 95% ✅ |

## 6. 浏览器 E2E 实测

| 步骤 | 结果 |
|------|------|
| 1. 打开 `/ofi` → Quote management 默认 tab | ✅ |
| 2. 点 Get Quote → 获得 quote | ✅ |
| 3. 切到 Payment-Payment Continued 标签页 | ✅ |
| 4. 点 Create Payment | ✅ |
| 5. URL 变成 `/ofi?aml-required=baxs_1784026054211` | ✅ |
| 6. 页面**自动**激活 Payment-Manual AML tab | ✅（左侧高亮）|
| 7. 显示 "Awaiting your AML file upload (1)" section | ✅ |
| 8. 新 payment `baxs_1784026054211` 已在 upload section | ✅ |
| 9. Choose File + Upload & Submit 直接可用 | ✅ |

## 7. 设计原则对照

| 原则 | 落实 |
|------|------|
| **KISS** | ① 抽出 2 个纯函数（`autoTriggerAmlAfterCreate` + `pickOfiDefaultTab`）— 不增加新概念 ② 不动 server-fn ③ 用 `key` prop 触发 Radix Tabs 重挂载，而不是改 Tabs 为受控 prop + 内部 state 同步 |
| **高内聚** | 状态判断集中在 `network.ts`（已有 `triggerManualAml`、`createPayment`）；路由只做编排 |
| **低耦合** | 新工具函数 `aml-flow.ts` 与 UI 完全解耦 — 只依赖 `Payment` 类型，不依赖 React / TanStack |
| **不影响无关功能** | 36 个无关测试文件全部通过；Quote management、Get Quote、Create Payment 主链路、Provider 侧完全未触碰 |
| **100% 新功能覆盖** | `aml-flow.ts` 测试 8 个用例覆盖两个纯函数所有路径（成功、failure、throw、单次调用）；OfiSidebarMenu 4 个 SSR 测试覆盖 defaultTab 三种状态 |

## 8. 不在范围

- Quote management / Get Quote / Last Look / payout 主链路 — 未触碰
- Provider 端 UI / server-fn — 未触碰
- `unknown quote` external-quote bug — 独立 PR

## 9. Dev server

`bun run dev` 在 `localhost:8080` 持续运行（Vite HMR 已自动加载新代码）。

| URL | 行为 |
|-----|------|
| http://localhost:8080/ofi | 创建 payment 后自动切到 Payment-Manual AML |
| http://localhost:8080/ofi?aml-required=pm_x | 直接进入 Payment-Manual AML tab 并滚动到对应上传行 |
| http://localhost:8080/provider | Provider 控制台（未变）|
