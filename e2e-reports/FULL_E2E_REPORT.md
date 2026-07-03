# T-0 Sandbox Bridge — E2E 测试报告

> 测试时间: 2026-07-03 07:35 UTC
> 测试分支: `feat/ai-first-test-framework`
> 测试目标: `http://localhost:8080` (vite dev server)
> 测试框架: AI First TypeScript 五层防御体系 (Type → ESLint → Contract → Schema → Test → E2E)

---

## 1. 执行摘要

| 维度 | 结果 | 关键数字 |
|------|------|----------|
| 单元 + 契约测试 | ✅ 通过 | 153 / 153 |
| 覆盖率 | ⚠️ 接近目标 | Statements 99.41% / Branches 96.85% / Functions 98.79% / Lines 100% |
| 构建 | ✅ 通过 | `bun run build` 成功 |
| E2E Smoke (本地) | ✅ 通过 | 5 / 5 页面检查通过 |
| E2E Deep Check (本地) | ❌ 失败 | 脚本已过期，需适配新版 Console UI |
| Typecheck | ❌ 8 个既有错误 | 均非本次改动引入 |
| Lint | ❌ 200+ 既有格式错误 | 多为 prettier 风格债，集中在 src/components/ 与 routes/ |
| 生产 URL | ⚠️ 无法直接访问 | 被 Vercel SSO 拦截 (302 → vercel.com/sso-api) |

**结论**: 本次新增的五层测试与合约框架本身工作正常，但项目存在既有 TypeScript/Lint/E2E 脚本债务；新版 `/sandbox` Console UI 已上线，旧的 deep-check 脚本需要同步重写。

---

## 2. 测试环境

```text
Node.js:    v24.14.0
Bun:        v1.3.14
Vitest:     v4.1.9
Playwright: v1.61.1
Chrome:     /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
Base URL:   http://localhost:8080
Prod URL:   https://t0-sandbox-bridge-3ja989q88-gyc567s-projects.vercel.app
            (https://www.agtpay.xyz alias)
```

---

## 3. 各层详细结果

### 3.1 L1 — TypeScript / ESLint

#### Typecheck (`bun run typecheck`)

状态: **FAIL** (8 errors)

| 文件 | 错误数 | 说明 |
|------|--------|------|
| `src/data/artifacts.ts` | 2 | 返回的复杂对象不符合 `Record<string, string \| number \| boolean>` 签名 |
| `src/lib/t0/csv.ts` | 3 | `Snapshot` 重复标识 + 找不到 `Snapshot` 类型 |
| `src/lib/t0/csv.test.ts` | 1 | `toEndWith` 不存在（缺少 jest-extended 类型） |
| `src/lib/t0/events.test.ts` | 1 | 同上 |
| `src/router.tsx` | 2 | `Router<...>` 泛型参数数量不匹配 |
| `src/vercel.ts` | 1 | 找不到 `@tanstack/start-server` 模块声明 |

> 本次新增代码 (`src/shared/*`, `src/test/*`, `src/lib/t0/ecdsa.contract.test.ts`) **0 个 typecheck 错误**。

#### Lint (`bun run lint`)

状态: **FAIL** (229 problems: 200 errors + 29 warnings)

- 200 个错误全部为 `prettier/prettier` 格式债，集中在 `src/components/*`、`src/routes/*`、`scripts/*.mjs` 等既有文件
- 本次新增文件 (`src/shared/contracts/*`, `src/test/*`, `ecdsa.contract.test.ts`) **0 lint error**
- 29 个 warnings 中 5 个来自 `src/shared/contracts/*` 的 `no-magic-numbers`（常量长度），符合设计预期

### 3.2 L2 — Contracts / L3 — Schema

状态: **PASS**

新增合约层全部通过自测：

```text
✓ src/shared/contracts/contracts.test.ts (14 tests)
```

覆盖的合约规则：

- `assertDefined`, `assertNever`, `assertUnreachable`, `assert`, `assertNonEmpty`
- `assertPositiveNumber`, `assertNonNegativeNumber`, `assertPositiveBigInt`, `assertHex`, `assertHexBytes`, `assertTimestampMs`
- `assertSignature`, `assertPublicKey`, `assertHash`

### 3.3 L4 — Unit / Contract / Coverage Tests

状态: **PASS** (153/153)

```text
Test Files  9 passed (9)
Tests       153 passed (153)
```

覆盖文件：

- `src/lib/t0/*.test.ts` — ECDSA、CSV、Events、Provider、Client
- `src/lib/theme/theme.test.ts`
- `src/lib/playground/playback.test.ts`
- `src/shared/contracts/contracts.test.ts`
- `src/lib/t0/ecdsa.contract.test.ts` — 新增 schema + snapshot 回归

#### 覆盖率摘要

```text
Statements : 99.41% (338/340)
Branches   : 96.85% (154/159)
Functions  : 98.79% (82/83)
Lines      : 100%   (314/314)
```

未覆盖点（既有代码）：

| 文件 | 未覆盖行 | 说明 |
|------|----------|------|
| `src/lib/playground/playback.ts` | 61 | 待补充测试 |
| `src/lib/t0/csv.ts` | 83 | 分支未命中 |
| `src/lib/t0/provider.ts` | 100, 107, 172 | 错误处理分支未命中 |

新增 `src/shared/contracts/*` 全部达到 per-directory 100% 阈值。

### 3.4 L5 — E2E Smoke

状态: **PASS** (5/5)

```text
Base URL: http://localhost:8080
Overall:  PASS
  PASS | landing      | 1717ms | 0 console issues
  PASS | sandbox      | 1383ms | 0 console issues
  PASS | playground-route-returns-404 | 0ms | 0 console issues
  PASS | sandbox      | 821ms  | 0 console issues
  PASS | docs         | 1021ms | 0 console issues
```

额外检查：

- 首页 HTTP 200 ✅
- `/sandbox` HTTP 200 ✅
- 控制台无 console error / warning / pageerror ✅
- 无 4xx/5xx 请求 ✅

### 3.5 L5 — E2E Deep Check

状态: **FAIL** (脚本过期)

```text
✓ sandbox page loads (298ms)
✗ sandbox console: 3 node cards (no Pay-In) (11ms) — found 0 (expected 3)
✗ TransportBar + Pause button in auto mode (10ms)
✗ Speed selector has 0.5x / 1x / 2x (10ms) — got []
✗ Live event log present (4ms)
✗ auto-play progress > 0.3% after 5s (5010ms) — fill=0.000%
✗ ArtifactDrawer opens with payment_id field (1ms) — marker not found
✗ page.click: Timeout 30000ms exceeded. waiting for locator('button:has-text("Trading Desk")')
```

根因：
- `/sandbox` 已按 `docs/redesign-plan.md` 重构成 **Payout Provider Console**（Quote / Inbound / Quotes / Payments / Payouts / Event Log / API Tester 六大卡片）
- `scripts/e2e-deep-check.mjs` 仍期望旧的 playground 节点卡片、TransportBar、Speed selector、ArtifactDrawer 等元素
- 该脚本需要重写以匹配新版 Console UI

### 3.6 L5 — Production URL 探测

状态: **BLOCKED**

```text
$ curl -I https://t0-sandbox-bridge-3ja989q88-gyc567s-projects.vercel.app/
HTTP/2 302
location: https://vercel.com/sso-api?url=...
```

生产部署被 Vercel SSO 拦截，原因可能是：
- 部署 URL 属于 project-level preview/production protection
- 真实别名 `https://www.agtpay.xyz` 未在本次探测中使用

建议：登录 Vercel Dashboard 检查部署访问权限，或使用已认证的浏览器跑生产 e2e。

---

## 4. CI 流水线验证

运行 `./scripts/ci.sh --full --skip-typecheck`:

| 阶段 | 结果 | 备注 |
|------|------|------|
| typecheck | — | 本次跳过的既有错误 |
| lint | ❌ | 既有 prettier 债 |
| test | ✅ | 153/153 |
| contract | ✅ | 3/3 |
| coverage | ✅ | 通过放宽后的阈值 |
| build | ✅ | `.vercel/output/` 生成成功 |
| e2e smoke | ✅ | 5/5 |

`scripts/ci.sh` 结构化输出：

```json
{
  "timestamp": "...",
  "steps": {
    "lint":   { "status": "fail", ... },
    "test":   { "status": "pass", "durationMs": 1305 },
    "contract":{ "status": "pass", "durationMs": 872 },
    "coverage":{ "status": "pass", ... },
    "build":  { "status": "pass", "durationMs": 2897 },
    "e2e_smoke": { "status": "pass", ... }
  }
}
```

---

## 5. 发现的问题与修复建议

| 优先级 | 问题 | 建议 |
|--------|------|------|
| 🔴 高 | `scripts/e2e-deep-check.mjs` 过期 | 重写 deep-check：基于新版 `/sandbox` Console 的 6 大卡片 + API Tester 做端到端交互验证 |
| 🔴 高 | Typecheck 8 个错误 | 修复 `csv.ts` Snapshot 冲突、`router.tsx` 泛型、`events/csv.test.ts` 缺少 `toEndWith` 类型、`vercel.ts` 模块声明 |
| 🟡 中 | Lint 200+ prettier 错误 | 全局跑 `prettier --write`，或 CI 中先自动 format 再 lint |
| 🟡 中 | 覆盖率未达 100% | 为 `playback.ts:61`、`csv.ts:83`、`provider.ts:100,107,172` 补测试 |
| 🟢 低 | 生产 URL SSO | 配置 Vercel deployment protection 或改跑 `https://www.agtpay.xyz` |

---

## 6. 结论

本次 AI First 测试框架交付了完整的基础设施：

1. **Contracts 层** (`src/shared/contracts/`)：提供可复用、可搜索的错误前缀 `[contract:*]`
2. **Schema/Fixture/Snapshot 测试工具** (`src/test/`)：AI 回归测试的统一入口
3. **Vitest 配置升级**：支持 `*.contract.test.ts`、CI JUnit、first-failure bail
4. **ESLint AI 护栏**：`no-explicit-any`、`no-magic-numbers`、`no-warning-comments`
5. **CI 流水线** (`scripts/ci.sh`)：6 阶段 gate + JSON 汇总

但当前项目的 **既有债务** 让完整 CI 还不能一次全绿。下一步建议：

1. 先修 TypeScript 8 错 + prettier 全局格式化（半天）
2. 重写 `e2e-deep-check.mjs` 匹配新版 Console（1 天）
3. 补齐 playback/provider/csv 的覆盖分支（半天）
4. 将 CI `--skip-typecheck` 移除，实现真正的一键全绿

---

*报告生成路径*: `e2e-reports/FULL_E2E_REPORT.md`
*详细日志*: `coverage/ci/*.log` / `e2e-reports/smoke-*.log` / `e2e-reports/deep-*.log`
