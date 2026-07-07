# 部署报告 - Vercel 生产环境

**部署时间**: 2026-07-06 12:30 (UTC+8)
**部署命令**: `bash scripts/deploy.sh production`
**项目**: t0-sandbox-bridge
**Vercel Org/Project**: team_CrV6muN0s3QNDJ3vrabttjLR / prj_ZDLhPZRxKGHZsrp0Y1IpUEeNwRwO
**登录用户**: gyc567
**Vercel CLI**: 50.3.2

---

## 🚀 部署 URL

```
https://t0-sandbox-bridge-byx1me7j2-gyc567s-projects.vercel.app
```

> 每次 deploy 都会生成新的 hash 标识；最新一次部署 hash 为 `byx1me7j2`，且 Vercel 会为该 URL 分配 `t0-sandbox-bridge.vercel.app` 别名（生产域名）。

---

## 1. Pre-flight (步骤 1/6) ✅

| 检查项              | 结果      |
| ------------------- | --------- |
| Vercel CLI 已安装   | ✅ 50.3.2 |
| 用户已登录          | ✅ gyc567 |
| 项目已 link         | ✅ t0-sandbox-bridge |

## 2. 依赖安装 (步骤 2/6) ✅

- 跳过完整安装：node_modules 已存在
- 增量验证通过：`bun install --frozen-lockfile`

## 3. 构建 (步骤 3/6) ✅

| 阶段         | 耗时      | 产物                |
| ------------ | --------- | ------------------- |
| Client       | 416ms     | 21 chunks (CSS/JS)  |
| SSR          | 218ms     | 36 chunks           |
| Nitro/Vercel | 193ms     | `__server.func/`    |
| **总计**     | **~830ms**| **static: 824K, functions: 3.0M** |

构建产物结构：
```
.vercel/output/
├── config.json
├── nitro.json
├── static/                  # 客户端资源 (824K)
│   └── assets/              # 21 个 .js/.css 资源
└── functions/
    └── __server.func/       # Nitro SSR 函数 (3.0M)
        ├── _ssr/            # 36 个 SSR 路由 chunks
        ├── _libs/           # 第三方依赖
        └── index.mjs        # 入口
```

**主要 chunk 大小**（gzip）：
- `index-Ce8Ctyxz.js` 283.14 kB → **89.15 kB**
- `docs-LBtZjD_g.js` 119.33 kB → 36.58 kB
- `integration-B8ZBHX1L.js` 41.91 kB → 11.08 kB
- `SiteLayout-DRHnwPGC.js` 37.81 kB → 12.57 kB
- `select-Bq0pMP6.js` 75.80 kB → 25.87 kB

## 4. 部署 (步骤 4/6) ✅

- 部署类型：**production**（已确认）
- 部署命令：`vercel deploy --prod --yes`
- 部署结果：✅ 成功

## 5. 健康检查 (步骤 5/6) ✅

- 首页 `/` → **HTTP 200**（用时 0s，部署立即就绪）

## 6. 端到端测试 (步骤 6/6) ✅

### 脚本内检查
| 测试项                          | 状态 |
| ------------------------------- | ---- |
| 首页 `/`                        | ✅ 200 |
| `/sandbox` 包含 "Sandbox"       | ✅ 200 |

### 独立验证（部署后手动 curl）
| 路径             | HTTP | 响应大小  |
| ---------------- | ---- | --------- |
| `/`              | 200  | 244862 B  |
| `/sandbox`       | 200  | 244897 B  |
| `/integration`   | 200  | 244917 B  |
| `/login`         | 200  | 244891 B  |
| `/ofi`           | 200  | 244881 B  |
| `/provider`      | 200  | 244898 B  |

### Security Headers
| Header                | 值                                            | 状态 |
| --------------------- | --------------------------------------------- | ---- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | ✅ |
| `X-Frame-Options`     | `DENY`                                        | ✅    |
| `X-Content-Type-Options` | (缺失，Vercel 默认未注入)                  | ⚠️   |

---

## 7. 汇总

| 项目        | 值                                                          |
| ----------- | ----------------------------------------------------------- |
| 环境        | **production**                                              |
| 部署 URL    | https://t0-sandbox-bridge-byx1me7j2-gyc567s-projects.vercel.app |
| 部署状态    | ✅ **成功**                                                  |
| 端到端测试  | ✅ **通过**                                                  |
| 访问 Dashboard | https://vercel.com/dashboard                              |

### 访问入口
- 🏠 首页: https://t0-sandbox-bridge-byx1me7j2-gyc567s-projects.vercel.app/
- 🧪 沙盒: https://t0-sandbox-bridge-byx1me7j2-gyc567s-projects.vercel.app/sandbox
- 🔌 集成: https://t0-sandbox-bridge-byx1me7j2-gyc567s-projects.vercel.app/integration
- 🔐 登录: https://t0-sandbox-bridge-byx1me7j2-gyc567s-projects.vercel.app/login

---

## 8. 已知问题 & 改进建议

### 已知问题
- ⚠️ **缺少 `X-Content-Type-Options: nosniff` header** — Vercel 默认未注入。可通过 `vercel.json` 添加 `headers` 规则修复。
- ⚠️ **SPA 404 fallback** — `/__nonexistent__` 返回 200（TanStack Router 默认行为，客户端 Router 显示 404 页面）。
- ⚠️ **Obsolete snapshot** — `src/lib/t0/__snapshots__/ecdsa.contract.test.ts.snap` 中 `ecdsa.toCurl shape 1` 条目已过期，运行 `vitest -u` 清理。

### 改进建议
1. 在 `vercel.json` 添加 `X-Content-Type-Options: nosniff`
2. 清理 obsolete snapshot
3. 为 `t0-receiver.ts` 未覆盖行（42, 93, 103, 113, 233-235）补充测试

---

**部署完成 · 2026-07-06**