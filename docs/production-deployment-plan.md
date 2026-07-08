# T-0 Network Payout Provider — 生产环境部署方案

> 目标：将 `publishQuote` 从本地 Mock/沙箱模式切换到生产环境，通过稳定的 REST API 端点向 T-0 Network 推送 Pay-out 报价。

---

## 1. 当前状态（已验证）

| 项目 | 状态 |
|------|------|
| 本地 `HttpT0Client` 直连 ngrok 端点 | ✅ 200 OK，已调通 |
| `providerService.publishQuote()` 链路 | ✅ 端到端可用 |
| 代码改动 | `src/lib/t0/client.ts` + `src/lib/t0/index.ts` |

---

## 2. 生产环境变量配置

在 Vercel Dashboard → Project Settings → Environment Variables 中配置以下变量（**Production 环境**）：

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `T0_NGROK_URL` | `https://api.t-0.network` | 生产 T-0 Network API 根地址（替换沙箱 ngrok） |
| `T0_API_KEY` | `prod_...` | T-0 Network 发放的生产 API Key |
| `T0_NETWORK_PUBLIC_KEY` | `0x...` | T-0 Network 生产公钥（用于 inbound 签名验证） |
| `T0_PRIVATE_KEY` | `0x...` | BAXS 生产私钥（用于 outbound 签名，如有） |
| `PUBLISH_PAY_OUT_DEFAULT` | `false` | 关闭默认 ticker 推送，避免覆盖前端报价 |

> **注意**：`T0_API_KEY` 和 `T0_PRIVATE_KEY` 属于敏感凭证，务必在 Vercel 中标记为 **Encrypted**，不要提交到 Git。

---

## 3. 代码改动说明

### 3.1 `src/lib/t0/client.ts`

- `HttpT0Client.updateQuote()` 现在发送 ngrok REST 格式：`POST /api/v1/quotes/pay-out`
- Body 结构为 `{ groups: [{ currency, payment_method, expiration_seconds, bands: [...] }] }`
- 自动注入 `Idempotency-Key: <uuid>` header，保证重试安全
- `emit()` 保持原有 `/v1/events` 路径不变（如有生产事件端点，需同步调整）

### 3.2 `src/lib/t0/index.ts`

- 根据 `T0_NGROK_URL` 和 `T0_API_KEY` 环境变量自动切换：
  - 两变量都存在 → `HttpT0Client`（真实网络）
  - 任一缺失 → `MockT0Client`（本地开发/测试）
- 零配置回退，本地开发不受影响

---

## 4. 部署步骤

```bash
# 1. 确认本地构建通过
bun run typecheck
bun run test
bun run build

# 2. 提交代码（已包含 client.ts 和 index.ts 改动）
git add src/lib/t0/client.ts src/lib/t0/index.ts
git commit -m "feat(t0): switch publishQuote to real REST endpoint with env-driven client"

# 3. 推送到触发 Vercel 部署的分支（通常是 main）
git push origin main

# 4. Vercel 自动构建部署，完成后验证
```

---

## 5. 部署后验证清单

| 检查项 | 方法 |
|--------|------|
| 环境变量已注入 | Vercel Dashboard → Deployments → 最新部署 → Environment Variables |
| `publishQuote` 返回 200 | 在 Provider 页面点击 "Publish Quote"，观察浏览器 Network 面板 |
| 报价到达 T-0 Network | 登录 T-0 Network 控制台，确认报价列表中出现新条目 |
| 幂等性生效 | 同一按钮快速点击两次，第二次应被 T-0 幂等处理（不报错） |
| 错误处理 | 断开网络或填错 key，观察前端是否友好提示而非白屏 |

---

## 6. 从 ngrok 迁移到生产域名

当前沙箱使用的是 ngrok 临时域名，生产环境需要替换为 T-0 Network 官方生产端点：

| 环境 | 端点 |
|------|------|
| 沙箱（当前） | `https://absurd-payphone-hankie.ngrok-free.dev` |
| 生产（目标） | `https://api.t-0.network` 或 T-0 提供的专属 Provider 端点 |

**迁移时只需修改 Vercel 环境变量 `T0_NGROK_URL`，无需改代码。**

---

## 7. 安全与运维

### 7.1 API Key 轮换
- 建议每 90 天轮换一次 `T0_API_KEY`
- 轮换流程：在 T-0 控制台生成新 key → 更新 Vercel 环境变量 → 重新部署 → 验证 → 废弃旧 key

### 7.2 监控
- 在 Vercel Dashboard → Monitoring 观察 `/api` 路由的 4xx/5xx 率
- 建议接入 Sentry/Vercel Analytics，捕获 `HttpT0Client` 抛出的异常：`T0 /api/v1/quotes/pay-out failed: ...`

### 7.3 回滚
- 若生产发布异常，快速回滚方式：
  1. 在 Vercel Dashboard 找到上一版本 → **Promote to Production**
  2. 或删除 `T0_NGROK_URL` 环境变量 → 自动回退到 `MockT0Client`（只影响 outbound 推送，不影响 inbound 回调）

---

## 8. 已知限制与后续优化

| 限制 | 优化方向 |
|------|----------|
| `payment_method` 硬编码为 `"SEPA"` | 根据 `currency` 动态映射（EUR→SEPA, GBP→FPS, USD→ACH 等） |
| 单条 quote 单 band | 支持同一 currency 多 band 批量推送 |
| `emit()` 仍指向 `/v1/events` | 确认 T-0 生产事件端点，或迁移到 T-0 官方事件回调机制 |
| 无重试/退避逻辑 | 在 `HttpT0Client.post()` 中添加指数退避重试（3 次） |

---

## 9. 最小可用验证命令（部署后）

```bash
# 直接在 Vercel Function 日志中验证
# 或通过本地调用生产环境 server function（需配置生产环境变量）
curl -X POST https://<your-vercel-app>/api/t0/provider/publish-quote \
  -H "Content-Type: application/json" \
  -d '{"currency":"EUR","band":1000,"rate":0.86,"ttlMs":30000}'
```

> 注意：TanStack Start 的 `createServerFn` 默认有 CSRF 保护，直接 curl 可能 403。建议通过前端 UI 或 Playwright E2E 测试验证。

---

**文档版本**: v1.0  
**最后更新**: 2026-07-08
