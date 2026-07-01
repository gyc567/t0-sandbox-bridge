# TanStack Start 部署到 Vercel 完整方案

> 本方案指导如何将基于 TanStack Start 的 t0-sandbox-bridge 项目部署到 Vercel 平台。

## 目录

- [背景分析](#背景分析)
- [技术挑战](#技术挑战)
- [解决方案架构](#解决方案架构)
- [实施步骤](#实施步骤)
- [验证部署](#验证部署)
- [已知限制](#已知限制)
- [故障排查](#故障排查)

---

## 背景分析

### 当前项目架构

```
t0-sandbox-bridge
├── 技术栈
│   ├── TanStack Start (SSR 全栈框架)
│   ├── Nitro (服务端运行时)
│   ├── React 19 + TypeScript
│   ├── TanStack Router v1
│   └── Vite (构建工具)
│
├── 核心模块
│   ├── src/server.ts          # SSR 服务入口
│   ├── src/router.tsx         # 路由配置
│   ├── src/lib/t0/            # T-0 业务逻辑
│   │   ├── provider.ts        # PayoutProviderService
│   │   ├── client.ts          # T0Client (Mock/Http)
│   │   └── t0.functions.ts    # Server Functions
│   └── src/routes/            # 页面路由
│
└── 构建配置
    └── vite.config.ts         # 使用 @lovable/dev/vite-tanstack-config
```

### 部署目标

| 目标 | 说明 |
|------|------|
| **平台** | Vercel |
| **运行环境** | Vercel Edge Functions / Node.js |
| **期望** | SSR 页面正常渲染，API Functions 可用 |

---

## 技术挑战

### 1. 运行时不兼容

| 组件 | 当前配置 | Vercel 要求 |
|------|----------|-------------|
| **Nitro 预设** | Cloudflare Workers (默认) | Vercel Edge / Node.js |
| **服务端入口** | `src/server.ts` | 需要适配 Vercel 格式 |
| **环境变量** | `VITE_*` 前缀 | Vercel 环境变量系统 |
| **状态管理** | 内存存储 | 无状态 (需要外部存储) |

### 2. 数据持久化问题

当前 `PayoutProviderService` 使用内存存储：

```typescript
// src/lib/t0/provider.ts
export class PayoutProviderService {
  private quotes = new Map<string, Quote>();
  private payments = new Map<string, Payment>();
  private payouts = new Map<string, Payout>();
  private events: NetworkEvent[] = [];
  // ...
}
```

**问题**: Vercel Serverless Functions 无状态，每次请求可能访问不同的实例。

**解决方案**: 使用 Vercel KV 或其他外部存储，或接受每次部署重置状态（沙盒场景可接受）。

---

## 解决方案架构

### 方案概述

采用 **Nitro Vercel 预设 + 服务端适配层** 的方式，实现最小改动部署。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel Edge Network                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Static     │    │   SSR Edge   │    │  API Route   │       │
│  │   Assets     │    │   Function   │    │  Functions   │       │
│  │  (/_next/*)  │    │  (HTML 页)   │    │  (/api/*)    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         └───────────────────┼───────────────────┘                │
│                             ▼                                    │
│                   ┌──────────────────┐                          │
│                   │   Nitro Server   │                          │
│                   │  (Vercel 适配)   │                          │
│                   └──────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心改动文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `vite.config.ts` | 修改 | 添加 Vercel Nitro 预设 |
| `src/vercel.ts` | 新建 | Vercel 服务端入口 |
| `src/router.tsx` | 修改 | 添加 router named export |
| `vercel.json` | 新建 | Vercel 构建配置 |
| `.vercelignore` | 新建 | 排除文件列表 |

---

## 实施步骤

### 步骤 1: 安装依赖

```bash
# 安装 Vercel CLI (可选，用于本地测试)
bun add -D vercel

# 可选: 安装 KV 存储 (如需状态持久化)
bun add @vercel/kv
```

### 步骤 2: 更新 Vite 配置

更新 `vite.config.ts`，启用 Node 预设（Vercel 兼容）：

```typescript
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Vercel deployment configuration
  nitro: {
    preset: "node",
    output: {
      dir: ".output",
      publicDir: ".output/public",
    },
  },
});
```

> **注意**: 使用 `node` 预设而非 `vercel-edge`，因为 Nitro 的 vercel 预设需要额外的 `@vercel/nitro-preset` 包。

### 步骤 3: 创建 Vercel 服务端入口

创建 `src/vercel.ts`:

```typescript
/**
 * Vercel 服务端入口
 *
 * 将 TanStack Start 适配到 Vercel Edge Functions
 */

import { createStartHandler } from "@tanstack/start-server";
import { getRouter } from "./router";

export default createStartHandler({
  createRouter: () => getRouter(),
});
```

### 步骤 4: 更新 Router 导出

更新 `src/router.tsx`，添加 named export：

```typescript
import { QueryClient } from "@tanstack/react-query";
import { createRouter, type Router } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

let routerInstance: Router | undefined;

export const getRouter = (): Router => {
  if (!routerInstance) {
    const queryClient = new QueryClient();

    routerInstance = createRouter({
      routeTree,
      context: { queryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
    });
  }

  return routerInstance;
};

// Alias for TanStack Start
export const router = getRouter();
```

### 步骤 5: 创建 Vercel 配置文件

创建 `vercel.json`:

```json
{
  "version": 2,
  "buildCommand": "bun run build",
  "installCommand": "bun install",
  "framework": null,
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ],
  "env": {
    "VITE_API_BASE_URL": "@vite-api-base-url",
    "VITE_T0_SANDBOX_URL": "@vite-t0-sandbox-url",
    "T0_API_KEY": "@t0-api-key"
  },
  "functions": {
    ".output/server/**/*.mjs": {
      "runtime": "nodejs22.x",
      "maxDuration": 30
    }
  }
}
```

> **重要**: 使用 `functions` 配置指向 `.output/server/**/*.mjs`，这是 Nitro Node 预设生成的 Serverless Functions。

### 步骤 6: 创建 .vercelignore

创建 `.vercelignore`:

```
# Dependencies
node_modules/
.pnp/
.pnp.js

# Build output
.output/
dist/
build/
.nitro/
.serverless/

# Development
.env
.env.local
.env.development
.env.*.local

# Testing
coverage/
*.test.ts
*.test.tsx

# Docs
docs/

# IDE
.vscode/
.idea/

# OS
.DS_Store

# Logs
*.log
bun-debug.log*

# Misc
bun.lockb
pnpm-lock.yaml
package-lock.json
```

---

## 部署流程

### 方式一: Vercel CLI 部署

```bash
# 登录 Vercel
vercel login

# 预览部署
vercel

# 生产部署
vercel --prod
```

### 方式二: Git 集成部署

1. 将代码推送到 GitHub/GitLab
2. 在 Vercel Dashboard 中导入项目
3. 配置构建命令: `bun run build`
4. 配置输出目录: `.output/public`
5. 设置环境变量
6. 点击 Deploy

---

## 验证部署

### 1. 构建验证

```bash
bun run build
```

预期输出:
```
✓ built in 12.3s
✓ generated .output/public
✓ generated .output/server
```

### 2. 本地预览

使用 Vercel CLI 本地预览:

```bash
vercel dev
```

### 3. 功能验证清单

| 功能 | 验证方式 | 预期结果 |
|------|----------|----------|
| 首页加载 | 访问 `/` | SSR 渲染的 HTML |
| 沙盒页面 | 访问 `/sandbox` | 控制台页面正常显示 |
| 发布报价 | 调用 `POST /api/snapshot` | 返回 quotes 列表 |
| API 调用 | 浏览器 Network 面板 | 无 5xx 错误 |

### 4. 健康检查

```bash
curl -I https://your-project.vercel.app/sandbox
```

预期:
```
HTTP/2 200
content-type: text/html; charset=utf-8
```

---

## 已知限制

### 1. Serverless 冷启动

| 问题 | 影响 | 缓解措施 |
|------|------|----------|
| 冷启动延迟 | 首次请求慢 | Vercel 付费版预热 |
| 函数超时 | 长时间请求 | 增加超时配置 |

### 2. 状态持久化

| 问题 | 影响 | 解决方案 |
|------|------|----------|
| 内存状态丢失 | 数据不持久 | 使用 Vercel KV / Redis |
| 多实例不一致 | 状态分散 | 集中式存储 |

> **注意**: 对于沙盒测试场景，每次部署重置状态是可接受的。如需持久化，可集成 Vercel KV。

### 3. WebSocket/SSE

| 问题 | 影响 | 解决方案 |
|------|------|----------|
| 不支持长连接 | 实时功能受限 | 改用轮询 / Vercel Polls |

---

## 故障排查

### 常见错误

#### 1. 构建失败: Nitro preset 不兼容

```
Error: Unsupported nitro preset: vercel-edge
```

**解决**: 确保已正确配置 `nitro.preset: "vercel-edge"`。

#### 2. 运行时错误: Module not found

```
Error: Cannot find module '@tanstack/start-server'
```

**解决**: 检查依赖是否正确安装:

```bash
bun install
```

#### 3. 环境变量未定义

```
Error: Environment variable VITE_API_BASE_URL is not set
```

**解决**: 在 Vercel Dashboard 中设置环境变量。

#### 4. SSR 渲染失败

```
Error: Hydration mismatch
```

**解决**: 确保客户端和服务端的 router 实例一致，参考 `src/router.tsx` 的实现。

### 调试技巧

1. **启用 Vercel 日志**:
   ```bash
   vercel logs your-project
   ```

2. **使用 Edge Functions 日志**:
   ```typescript
   // 在函数中添加日志
   console.log("Debug info:", data);
   ```

3. **本地模拟**:
   ```bash
   vercel dev --debug
   ```

---

## 替代方案

### 方案 B: Cloudflare Pages (零改动)

当前 Nitro 配置已支持 Cloudflare Workers，零改动部署:

```bash
# 安装 Wrangler
bun add -D wrangler

# 部署到 Cloudflare Pages
wrangler pages deploy .output/public
```

### 方案 C: 迁移到 Next.js

长期方案，完全兼容 Vercel:

| 改动项 | 工作量 |
|--------|--------|
| 路由迁移 | 中等 |
| Server Functions → API Routes | 小 |
| SSR 适配 | 小 |
| 状态管理 | 无需改动 |

---

## 总结

| 项目 | 状态 | 说明 |
|------|------|------|
| 技术可行性 | ✅ 可行 | Nitro `node` 预设兼容 Vercel |
| 改动量 | 小 | 4 个文件改动 + 2 个新文件 |
| 状态持久化 | ⚠️ 需处理 | 沙盒场景可接受内存存储 |
| 实时功能 | ⚠️ 受限 | 不支持 WebSocket |

### 已完成

| 文件路径 | 状态 |
|----------|------|
| `src/vercel.ts` | ✅ 已创建 |
| `vercel.json` | ✅ 已创建 |
| `.vercelignore` | ✅ 已创建 |
| `vite.config.ts` | ✅ 已修改 |
| `src/router.tsx` | ✅ 已修改 |
| `docs/vercel-deployment.md` | ✅ 已创建 |

### 构建验证

```bash
bun run build
# ✓ built in ~700ms
# ✓ Generated .output/public (静态资源)
# ✓ Generated .output/server (Serverless Functions)
```

### Vercel 部署

1. 将代码推送到 GitHub
2. 在 Vercel Dashboard 导入项目
3. 配置环境变量：
   - `VITE_API_BASE_URL`
   - `VITE_T0_SANDBOX_URL`
   - `T0_API_KEY`
4. 点击 Deploy

---

*文档版本: 1.1.0*
*更新日期: 2026-07-01*