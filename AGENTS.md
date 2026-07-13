# AGENTS.md

> Guidance for AI coding agents working in this repo. Read this first.
> **Before building, changing, or debugging anything: verify live state** (read the actual
> code, config, and deployed branch). Do not act on stale assumptions.



<!-- agents-md:begin id=overview -->
## Overview
tanstack_start_ts. Stack: node (react, vite, typescript).
<!-- agents-md:end id=overview -->

<!-- agents-md:begin id=commands -->
## Commands
- Install: `npm install`
- Dev / run: `npm run dev`
- Build: `npm run build`
- Test: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Format: `npm run format`
<!-- agents-md:end id=commands -->

<!-- agents-md:begin id=testing -->
## Testing
- **Runner**: Vitest (`vitest run`)
- **Unit tests**: `npm run test` — all `*.test.ts` files under `src/`
- **Contract tests**: `npm run test:contract` — `*.contract.test.ts` files, must pass for any API change
- **Coverage**: `npm run test:coverage` — target 100% coverage on new feature code
- **E2E**: `npm run test:e2e:smoke` (smoke) and `npm run test:e2e:deep` (deep check)
- **Before committing**: `npm run verify` (runs lint + typecheck + tests via `scripts/ci.sh`)
<!-- agents-md:end id=testing -->

<!-- agents-md:begin id=structure -->
## Project structure
Top-level: `docs/`, `e2e-reports/`, `scripts/`, `src/`.

**Core code locations**:
- `src/routes/` — TanStack Router pages (`__root.tsx`, `login.tsx`, `ofi.tsx`, `provider.tsx`, `sandbox.tsx`, etc.)
- `src/components/` — React components organized by domain (`ui/`, `ofi/`, `provider/`, `console/`, `flow/`, etc.)
- `src/lib/` — Core business logic: `t0/` (T0 protocol), `playground/`, `polyfills/`, `utils.ts`, `theme/`
- `src/shared/` — Shared contracts and types: `contracts/` (Zod schemas, API contracts)
- `src/hooks/` — Custom React hooks
- `src/data/` — Data layer: `artifacts.ts`, `channels.ts`, `flows.ts`, `integration/`
- `src/test/` — Test utilities: `contract.ts`, `fixtures.ts`, `snapshot.ts`, `index.ts`
- `api/` — API routes (server-side)
<!-- agents-md:end id=structure -->

<!-- agents-md:begin id=conventions -->
## Code style & conventions
TypeScript. Prettier + ESLint (flat config).

- **Formatter**: Prettier (`npm run format`) — config in `.prettierrc`:
  - `printWidth: 100`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`
- **Linter**: ESLint (`npm run lint`) — `eslint.config.js`, extends `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`, `prettier`
- **Naming**: React components `PascalCase`, hooks `useXxx`, utilities `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Imports**: Use path alias `@/` (e.g., `import { foo } from "@/lib/utils"`), never relative `../` across modules
- **Types**: Strict mode enabled. Production code (`src/lib/`, `src/shared/`) **no `any`** — use `unknown` + schema check
- **Server-only**: Never import `server-only` package; use `*.server.ts` suffix or `@tanstack/react-start/server-only`
<!-- agents-md:end id=conventions -->

<!-- agents-md:begin id=git -->
## Git & PR workflow
Default branch `main`. Remote: git@github.com:gyc567/t0-sandbox-bridge.

- **Commit message**: English, concise, imperative mood (e.g., "fix: correct quote calculation in OFI")
- **Before push**: `npm run verify` must pass (lint + typecheck + tests)
- **PR**: Create feature branch, open PR to `main`, require review before merge
- **CI/CD**: `scripts/ci.sh` runs verification; deployment via Vercel (see `.vercel/`)
- **Never**: force-push `main`, commit secrets, edit `node_modules/` or build output
<!-- agents-md:end id=git -->

<!-- agents-md:begin id=gotchas -->
## Gotchas & hard-won lessons
- **TanStack Start server-only**: Never use the Next.js `server-only` package. Rename server modules to `*.server.ts` or use `@tanstack/react-start/server-only`. ESLint enforces this (`no-restricted-imports`).
- **AI guardrails in production code**: `src/lib/` and `src/shared/` have strict ESLint rules — no `any`, no magic numbers (except `-1, 0, 1, 2`), no `eslint-disable` / `todo` / `fixme` comments. Use named constants from `src/shared/contracts` instead.
- **Tests are permissive**: `*.test.ts` and `*.contract.test.ts` relax type rules — `any` and magic numbers are allowed in tests only.
- **Vite + TanStack Router**: Route files under `src/routes/` are auto-generated in `routeTree.gen.ts` — do not manually edit the generated file. Run `npm run dev` to regenerate.
- **Path aliases**: Always use `@/` imports. The `tsconfig.json` maps `@/*` to `./src/*`. Relative `../` imports across modules are discouraged.
- **Prettier trailing commas**: Config uses `trailingComma: "all"` — ensure your editor respects `.prettierrc` to avoid format noise in diffs.
<!-- agents-md:end id=gotchas -->

<!-- agents-md:begin id=security -->
## Security & secrets
Config/secrets via `.env` (see `.env.example`), never committed. Never commit real secrets.

- **Secret locations**: `.env` (local), `.env.local` (local overrides), Vercel dashboard (production env vars)
- **What must never be exposed**: API keys, private keys, wallet mnemonics, database credentials, webhook secrets
- **Crypto handling**: Uses `@noble/secp256k1` and `@noble/hashes` — never roll your own crypto primitives
- **Contract validation**: All external inputs validated via Zod schemas in `src/shared/contracts/` before processing
<!-- agents-md:end id=security -->

<!-- agents-md:begin id=boundaries -->
## Boundaries
- ✅ **Always**: run `npm run verify` before committing; safe zones to edit: `src/` (except generated files like `routeTree.gen.ts`), `tests/`, `scripts/`, `docs/`
- ⚠️ **Ask first**: risky changes — schema/migrations (Zod contracts in `src/shared/contracts/`), adding dependencies (`npm install`), touching deploy/CI (`scripts/ci.sh`, `.vercel/`), rebuilding or redeploying production, modifying `package.json` scripts
- 🚫 **Never**: commit secrets or API keys; edit generated/build output or `node_modules/`; force-push `main`; manually edit `routeTree.gen.ts`; use `any` in `src/lib/` or `src/shared/`
<!-- agents-md:end id=boundaries -->

## 工程原则

1. **KISS 设计原则** — 保持代码整洁，用最简方案解决问题。
2. **高内聚，低耦合** — 使用精简的设计模式，避免过度工程化。
3. **100% 测试覆盖** — 所有新增功能代码都必须有测试，保证测试通过率达到 100%。
4. **保留测试用例** — 所有测试用例代码必须保留，并输出测试报告。

## 执行纪律

- **先想清楚再写代码** — 陈述假设，不确定就问，杜绝猜测。
- **从最简方案入手** — 只写能解决问题的最少代码，不加任何多余抽象。
- **像手术一样精准修改** — 不碰与需求无关的代码，每行改动都对应明确要求。
- **以目标驱动执行** — 写第一行代码前，把模糊指令转化为可验证的成功标准。

## Notes
<!-- Human-owned. Anything here is never touched by re-runs of agents-md. -->

---
<!-- Generated and maintained by agents-md (https://github.com/eugeniughelbur/agents-md).
     Content INSIDE agents-md:begin/end markers is regenerated on re-run.
     Everything OUTSIDE the markers (including ## Notes) is yours and is preserved. -->
