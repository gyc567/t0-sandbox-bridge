# AGENTS.md

> Guidance for AI coding agents working in this repo. Read this first.
> **Before building, changing, or debugging anything: verify live state** (read the actual
> code, config, and deployed branch). Do not act on stale assumptions.



<!-- agents-md:begin id=overview -->
## Overview
Stack: React + Vite + TypeScript (TanStack Start / Router).
<!-- agents-md:end id=overview -->

<!-- agents-md:begin id=commands -->
## Commands
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run format`
<!-- agents-md:end id=commands -->

<!-- agents-md:begin id=testing -->
## Testing
- Vitest is the test runner.
- New behavior must have tests, and existing tests stay unless obsolete.
- Target 100% coverage for new feature code.
- Start with the smallest test slice that proves the change, then widen only if needed.
- Run `npm run verify` before commit.
<!-- agents-md:end id=testing -->

<!-- agents-md:begin id=structure -->
## Project structure
- Top-level: `docs/`, `e2e-reports/`, `scripts/`, `src/`, `api/`.
- Main app code lives in `src/routes/`, `src/components/`, `src/lib/`, `src/shared/`, `src/hooks/`, `src/data/`, `src/test/`.
<!-- agents-md:end id=structure -->

<!-- agents-md:begin id=conventions -->
## Code style & conventions
- Prettier + ESLint; keep formatting consistent with `.prettierrc`.
- Use `@/` imports, `PascalCase` components, `useXxx` hooks, `camelCase` utilities.
- Production code in `src/lib/` and `src/shared/` has strict types: no `any`.
- Keep abstractions minimal; extract only when repetition or branching justifies it.
- Use `*.server.ts` or `@tanstack/react-start/server-only`, never the Next.js package.
- **Naming**: use meaningful, pronounceable, searchable names; avoid mental mapping (`u`, `s`, `t`).
- **Functions**: do one thing; keep args to 2 or fewer (use object literals / destructuring for more). Avoid flag arguments.
- **Immutability**: prefer `readonly` properties, `ReadonlyArray`, `as const`, and spread over mutation.
- **Side effects**: avoid mutating inputs; centralize I/O in dedicated services.
- **DRY**: remove duplicate code, but don't force bad abstractions across unrelated domains.
- **Conditionals**: encapsulate booleans in named functions; avoid negative conditionals; prefer polymorphism over `switch` on type.
- **Classes**: keep them small (SRP), high cohesion / low coupling; prefer composition over inheritance; use method chaining where it improves readability.
- **SOLID**: apply SRP, OCP, LSP, ISP, DIP to class/module design.
- **TypeScript specifics**: use `type` for unions/intersections, `interface` for `extends`/`implements`; prefer `enum` for intent over plain string constants.
- **Error handling**: avoid global pollution; use `class` extension over prototype monkey-patching.
- **Testing**: follow F.I.R.S.T. (Fast, Independent, Repeatable, Self-Validating, Timely); one concept per test.
<!-- agents-md:end id=conventions -->

<!-- agents-md:begin id=git -->
## Git & PR workflow
Default branch `main`. Remote: git@github.com:gyc567/t0-sandbox-bridge.

- Keep commit messages short, imperative, and in English.
- Run `npm run verify` before push.
- Do not force-push `main`, commit secrets, or edit generated/build output.
<!-- agents-md:end id=git -->

<!-- agents-md:begin id=gotchas -->
## Gotchas & hard-won lessons
- `src/routes/routeTree.gen.ts` is generated; do not edit it manually.
- Tests relax some production rules, but production code in `src/lib/` and `src/shared/` stays strict.
- Prefer `@/` imports; avoid cross-module `../` paths.
- Keep Prettier trailing commas on to avoid diff noise.
<!-- agents-md:end id=gotchas -->

<!-- agents-md:begin id=security -->
## Security & secrets
Config/secrets via `.env` (see `.env.example`), never committed. Never commit real secrets.

- Secrets stay in `.env`, `.env.local`, or Vercel env vars.
- Never expose API keys, private keys, mnemonics, database credentials, or webhook secrets.
- Validate external inputs with Zod before processing.
<!-- agents-md:end id=security -->

<!-- agents-md:begin id=boundaries -->
## Boundaries
- Safe to edit: `src/` (except generated files), `tests/`, `scripts/`, `docs/`.
- Ask first before dependencies, schema/migrations, deploy/CI, production rebuilds, or `package.json` script changes.
- Never touch secrets, generated/build output, `node_modules/`, or `routeTree.gen.ts`.
<!-- agents-md:end id=boundaries -->

## Local rules

- Make the smallest change that satisfies the request.
- Keep new logic local and cohesive; split only when it clearly reduces duplication or branching.
- Preserve unrelated files and existing tests.
- State assumptions when needed, then verify live code or config before editing.
- **Evidence-based reporting**: before claiming any work is done, verify it against actual tool outputs from this session. Only report results you can prove. If something is unverified, say so. If a step failed, include the output and state the failure honestly. Never report success you cannot demonstrate.

## Notes
- Repo-specific overlay above; everything inside `agents-md` markers is generated.
<!-- Human-owned. Anything here is never touched by re-runs of agents-md. -->

---
<!-- Generated and maintained by agents-md (https://github.com/eugeniughelbur/agents-md).
     Content INSIDE agents-md:begin/end markers is regenerated on re-run.
     Everything OUTSIDE the markers (including ## Notes) is yours and is preserved. -->
