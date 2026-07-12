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
_TBD: how tests are run and what must pass before a change is considered done_
<!-- agents-md:end id=testing -->

<!-- agents-md:begin id=structure -->
## Project structure
Top-level: `docs/`, `e2e-reports/`, `scripts/`, `src/`. _TBD: note where the important code lives_
<!-- agents-md:end id=structure -->

<!-- agents-md:begin id=conventions -->
## Code style & conventions
TypeScript. _TBD: formatter/linter, naming, import patterns, anything an agent should match_
<!-- agents-md:end id=conventions -->

<!-- agents-md:begin id=git -->
## Git & PR workflow
Default branch `main`. Remote: git@github.com:gyc567/t0-sandbox-bridge. _TBD: commit/PR conventions, how changes ship (CI? auto-deploy?)_
<!-- agents-md:end id=git -->

<!-- agents-md:begin id=gotchas -->
## Gotchas & hard-won lessons
_TBD: framework quirks and things that have broken before + how they were fixed — add to this after every incident_
<!-- agents-md:end id=gotchas -->

<!-- agents-md:begin id=security -->
## Security & secrets
Config/secrets via `.env` (see `.env.example`), never committed. _TBD: where secrets live and what an agent must never expose_ Never commit real secrets.
<!-- agents-md:end id=security -->

<!-- agents-md:begin id=boundaries -->
## Boundaries
- ✅ **Always**: run tests/typecheck before committing; _TBD: safe zones to edit, e.g. src/ and tests/_
- ⚠️ **Ask first**: _TBD: risky changes — schema/migrations, adding dependencies, touching deploy/CI, rebuilding or redeploying production_
- 🚫 **Never**: commit secrets or API keys; edit generated/build output or `node_modules/`; force-push `main`
<!-- agents-md:end id=boundaries -->

## Notes
<!-- Human-owned. Anything here is never touched by re-runs of agents-md. -->

---
<!-- Generated and maintained by agents-md (https://github.com/eugeniughelbur/agents-md).
     Content INSIDE agents-md:begin/end markers is regenerated on re-run.
     Everything OUTSIDE the markers (including ## Notes) is yours and is preserved. -->
