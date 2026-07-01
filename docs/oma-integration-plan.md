# Open Multi-Agent 融合方案

> 日期: 2026-07-01
> 目标: 将 `@open-multi-agent/core` 融入 T-0 Sandbox Bridge，用于自动规划并跑完整 sandbox 测试流。

## 结论

第一版采用“OMA 规划与判定，代码执行白名单动作”的方式。

OMA 不直接修改业务状态，不开放 `bash`、`file_write`、`file_edit`。真实状态变化只通过项目已有的 `PayoutProviderService` 完成，避免把 LLM 放进资金状态机。

## 约束

1. 自动跑完整测试流。
2. 使用 OpenAI-compatible provider。
3. 第一版不允许 agent 执行写操作。

## OMA 角色边界

OMA 负责:

1. 将用户目标拆成测试 DAG。
2. 输出可审计的 sandbox 测试步骤。
3. 读取最终 snapshot/events。
4. 判断测试是否通过，并给出原因。

代码执行器负责:

1. 校验 agent 输出是否在白名单内。
2. 顺序执行 sandbox steps。
3. 调用现有 `PayoutProviderService`。
4. 返回结构化执行结果。

## Provider 配置

```ts
const orchestrator = new OpenMultiAgent({
  defaultProvider: "openai",
  defaultModel: process.env.OMA_MODEL,
  defaultBaseURL: process.env.OPENAI_BASE_URL,
});
```

环境变量:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
OMA_MODEL=your-model
```

暂不接 Gemini、Bedrock、MCP、Vercel AI SDK、Redis/Postgres checkpoint。

## Agent Team

第一版只保留 3 个 agent:

| Agent | 职责 | 工具 |
|---|---|---|
| `scenario-planner` | 将目标拆成 T-0 sandbox steps | 无写工具 |
| `t0-analyst` | 读取 snapshot/events，判断状态 | `get_snapshot` |
| `verifier` | 对执行结果给出 pass/fail verdict | `get_snapshot` |

## 白名单步骤

执行器只接受以下动作:

```ts
type SandboxStep =
  | { action: "publishQuote"; currency: Currency; band: VolumeBand; rate: number; ttlMs?: number }
  | { action: "notifyUsdtSettlement"; txHash: string; usd: number }
  | { action: "notifyCreditUsage"; counterparty: string; used: number }
  | { action: "acceptPayment"; quoteRef: string; beneficiaryRef: string }
  | { action: "processPayout"; paymentRef: string; fail?: boolean };
```

引用规则:

1. `quoteRef` 只能引用前面 `publishQuote` 的结果。
2. `paymentRef` 只能引用前面 `acceptPayment` 的结果。
3. 不接受任意函数名、任意路径、任意代码。

## 自动测试流

示例目标:

> 跑一条 EUR quote 到 payout success 的 happy path。

流程:

1. 用户输入目标。
2. OMA `planOnly` 生成 DAG。
3. 代码将 DAG 转成 `SandboxStep[]`。
4. 执行器校验步骤。
5. 执行器按顺序调用 `PayoutProviderService`。
6. OMA 读取最终 snapshot/events。
7. OMA 输出 verdict。
8. UI 展示 plan、执行步骤、事件日志、最终结论。

## 文件计划

新增:

| 文件 | 用途 |
|---|---|
| `src/lib/oma/client.ts` | 创建 OMA orchestrator |
| `src/lib/oma/team.ts` | agent 配置 |
| `src/lib/oma/schema.ts` | `SandboxStep` 和结果类型 |
| `src/lib/oma/executor.ts` | 白名单步骤执行器 |
| `src/lib/oma/oma.functions.ts` | TanStack server functions |
| `src/components/agent-test-flow.tsx` | `/sandbox` 的 Agent Test Flow 面板 |

修改:

| 文件 | 修改 |
|---|---|
| `package.json` | 增加 `@open-multi-agent/core` |
| `src/routes/sandbox.tsx` | 嵌入 Agent Test Flow 面板 |
| `src/lib/t0/provider.ts` | 确保事件广播与幂等逻辑可被自动测试验证 |

## Server Function 设计

```ts
export const runAgentTestFlowFn = createServerFn({ method: "POST" })
  .inputValidator((d: { goal: string }) => d)
  .handler(async ({ data }) => runAgentTestFlow(data.goal));
```

返回结构:

```ts
interface AgentTestFlowResult {
  goal: string;
  plan: unknown;
  steps: SandboxStep[];
  execution: Array<{ step: SandboxStep; ok: boolean; result?: unknown; error?: string }>;
  snapshot: Snapshot;
  verdict: {
    passed: boolean;
    summary: string;
    failures: string[];
  };
}
```

## 实施顺序

1. 收敛当前基线: 确认 `provider.ts` 调用事件广播，避免已有 `events.ts` 闲置。
2. 安装 `@open-multi-agent/core`。
3. 实现 `schema.ts` 和 `executor.ts`，先不用 OMA，直接用固定 steps 跑通 happy path。
4. 接入 OMA `planOnly`，让 agent 只产出计划。
5. 加转换与校验，把计划映射到 `SandboxStep[]`。
6. 加最终 verifier，读取 snapshot/events 并输出 verdict。
7. 在 `/sandbox` 增加 Agent Test Flow 面板。
8. 增加最小测试: happy path、payout fail、非法 step 被拒绝。

## 验收

1. 输入 happy path 目标后，系统自动完成 quote -> settlement -> payment -> payout success -> confirmed。
2. UI 展示 OMA plan 和每一步执行结果。
3. 最终 verdict 为 passed。
4. 输入非法动作时执行器拒绝，不触发业务状态变化。
5. agent 没有 `bash/file_write/file_edit` 权限。

## 暂不做

1. 不做持久化 run history。
2. 不做 MCP。
3. 不做 agent 文件读写。
4. 不做多 provider UI。
5. 不做 checkpoint/resume，等测试流需要跨进程恢复时再加。
