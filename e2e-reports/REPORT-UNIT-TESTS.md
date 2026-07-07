# 单元测试报告

**生成时间**: 2026-07-06
**运行命令**: `bun x vitest run --coverage`
**运行时长**: 741ms (transform 501ms, setup 0ms, import 1.25s, tests 323ms, env 3.40s)
**环境**: happy-dom · vitest 4.1.9 · Node process via bun x

---

## 1. 总览

| 项目              | 数值       | 阈值                  | 状态 |
| ----------------- | ---------- | --------------------- | ---- |
| Test Files        | 18 / 18    | —                     | ✅    |
| Tests             | 279 / 279  | —                     | ✅    |
| Snapshots         | 0 active   | —                     | ✅    |
| Snapshots obsolete| 1          | (待清理)              | ⚠️    |
| Statements        | **97.47%** | 95%                   | ✅    |
| Branches          | **91.79%** | 90%                   | ✅    |
| Functions         | **99.33%** | 90%                   | ✅    |
| Lines             | **98.52%** | 95%                   | ✅    |

> 全局阈值（lines/functions/branches/statements）均通过；新模块（`src/shared/contracts`）按规则要求 100% lines / statements 达标。

---

## 2. 各文件测试结果

| #  | 测试文件                                | 通过 / 总数 | 耗时  |
| -- | --------------------------------------- | ----------- | ----- |
| 1  | `src/lib/t0/events.test.ts`             | 17 / 17     | 5ms   |
| 2  | `src/lib/t0/csv.test.ts`                | 30 / 30     | 4ms   |
| 3  | `src/lib/t0/currencies.test.ts`         | 15 / 15     | 4ms   |
| 4  | `src/lib/t0/provider.test.ts`           | 20 / 20     | 7ms   |
| 5  | `src/lib/auth/service.test.ts`          | 24 / 24     | 7ms   |
| 6  | `src/lib/t0/ofi.test.ts`                | 19 / 19     | 5ms   |
| 7  | `src/lib/playground/playback.test.ts`   | 27 / 27     | 41ms  |
| 8  | `src/lib/t0/ecdsa.contract.test.ts`     | 3 / 3       | 38ms  |
| 9  | `src/lib/t0/sdk-adapter.test.ts`        | 11 / 11     | 4ms   |
| 10 | `src/lib/t0/provider-impl.test.ts`      | 16 / 16     | 4ms   |
| 11 | `src/lib/t0/ecdsa.test.ts`              | 28 / 28     | 145ms |
| 12 | `src/lib/t0/sdk-client.test.ts`         | 11 / 11     | 20ms  |
| 13 | `src/lib/t0/t0-receiver.test.ts`        | 13 / 13     | 25ms  |
| 14 | `src/shared/contracts/contracts.test.ts`| 14 / 14     | 4ms   |
| 15 | `src/lib/t0/client.test.ts`             | 3 / 3       | 4ms   |
| 16 | `src/lib/t0/sdk-signer.test.ts`         | 10 / 10     | 3ms   |
| 17 | `src/lib/theme/theme.test.ts`           | 12 / 12     | 3ms   |
| 18 | `src/lib/t0/quote-message.test.ts`      | 6 / 6       | 2ms   |
| **总计** | —                                | **279 / 279** | **741ms** |

---

## 3. 覆盖率（v8）

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-----------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-----------------------
All files          |   97.47 |    91.79 |   99.33 |   98.52 |
 lib/playground    |    98.7 |    96.87 |     100 |     100 |
  playback.ts      |    98.7 |    96.87 |     100 |     100 | 61
 lib/t0            |   96.88 |     88.2 |   99.09 |   98.01 |
  csv.ts           |     100 |       95 |      90 |     100 | 83
  network.ts       |     100 |       92 |     100 |     100 | 34,97
  provider.ts      |   95.28 |    88.63 |     100 |   98.88 | 159
  sdk-adapter.ts   |     100 |    91.66 |     100 |     100 | 167
  sdk-client.ts    |     100 |    83.33 |     100 |     100 | 75
  t0-receiver.ts   |   89.77 |     73.8 |     100 |   91.13 | 42,93,103,113,233-235
-------------------|---------|----------|---------|---------|-----------------------

Statements   : 97.47% ( 579/594 )
Branches     : 91.79% ( 246/268 )
Functions    : 99.33% ( 150/151 )
Lines        : 98.52% ( 534/542 )
```

---

## 4. 重点观察

### ✅ 全部通过
- 18 个测试文件全部 PASS
- 279 个测试用例全部 PASS
- 无失败、无跳过（除 1 个 obsolete snapshot 提示）

### ⚠️ 需要清理
- **`ecdsa.contract.test.ts.snap` 存在 1 个 obsolete snapshot**
  - 引用: `ecdsa.toCurl shape 1`
  - 原因: 之前快照结构变更后未删除旧条目
  - 影响: 仅冗余条目，不影响测试结果
  - 处理建议: 运行 `vitest -u` 或手动删除该快照

### 📊 覆盖率分布
- **100% 覆盖**: `csv.ts` (lines), `network.ts`, `sdk-adapter.ts`, `sdk-client.ts`, `playback.ts`
- **≥ 95% lines**: `provider.ts` (98.88%), `csv.ts` (100%)
- **< 95% lines**: `t0-receiver.ts` (91.13%) — 仍有 5 行未覆盖（行 42, 93, 103, 113, 233-235）

### 🔍 未覆盖行分析
- `t0-receiver.ts:42,93,103,113,233-235` — 可能是错误处理或网络异常分支，建议添加对应测试用例
- `provider.ts:159` — 单行未覆盖
- `csv.ts:83` — 分支未覆盖
- `playback.ts:61` — 单行未覆盖

---

## 5. 结论

| 项目                | 结果 |
| ------------------- | ---- |
| 所有测试通过         | ✅    |
| 满足覆盖率阈值       | ✅    |
| 满足全局阈值         | ✅    |
| 满足新模块 100% 阈值 | ✅ (shared/contracts) |

**测试阶段通过，可以进入部署阶段。**

---

## 6. 后续建议

1. **清理 obsolete snapshot**: 删除 `src/lib/t0/__snapshots__/ecdsa.contract.test.ts.snap` 中过期的 `ecdsa.toCurl shape 1` 条目
2. **补充 t0-receiver.ts 覆盖率**: 当前 91.13% lines，建议添加对未覆盖行（42, 93, 103, 113, 233-235）的测试用例
3. **监控 provider.ts:159**: 持续关注该行是否需要测试覆盖

---

**报告生成完毕 · 2026-07-06**