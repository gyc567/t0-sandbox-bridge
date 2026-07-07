# OFI Quote Display — Test Report

## Scope

Add a human-readable quote-pair (Sell USDT → Buy <local>) + expiration
summary row to the OFI console, replacing the raw JSON dump that
operators had to read by eye after `Get Quote`. Mirrors the existing
`quote-message.ts` (failure path) pattern.

## Files

| Path | Action | Lines |
|---|---|---|
| `src/lib/t0/quote-display.ts` | **new** — pure formatter | 132 |
| `src/lib/t0/quote-display.test.ts` | **new** — 100% coverage | 192 |
| `src/routes/ofi.tsx` | edit — adds display state + summary row | +47 / -3 |

## Test Results

### New module

```
$ bun x vitest run src/lib/t0/quote-display.test.ts
 ✓ src/lib/t0/quote-display.test.ts (21 tests) 3ms

 Test Files  1 passed (1)
      Tests  21 passed (21)
```

| Group | Tests | Coverage |
|---|---|---|
| pair (off-ramp invariant) | 2 | pair construction, buy side reflects quote.currency |
| money formatting | 10 | USD, EUR, GBP, JPY, BRL, MXN, IDR, NGN, KRW, unknown fallback |
| rate precision | 5 | near-1, ~100, very small, noisy + comma group, zero rate |
| expiration | 4 | fresh 60s, -30s elapsed, +90s expired (clamped to 0), raw pass-through |

### Coverage on new module

```
$ cat coverage/coverage-summary.json
/Users/eric/dreame/code/t0-sandbox-bridge/src/lib/t0/quote-display.ts:
  100% statements / 100% lines / 100% branches / 100% functions
```

All four metrics at 100%, matching the project rule for new
`src/lib/t0/` modules.

### Full suite (no regression)

```
$ bun x vitest run
 Test Files  19 passed (19)
      Tests  300 passed (300)
   Duration  819ms
```

21 new tests added; **279 prior tests still green**. Zero snapshot
changes; one pre-existing obsolete-snapshot warning
(`ecdsa.contract.test.ts.snap`) is unrelated to this work.

### Project totals (unchanged or improved)

```
$ bun x vitest run --coverage
total: 97.54% stmts / 98.56% lines / 91.97% branches / 99.35% funcs
```

All four metrics remain above the 95% / 95% / 90% / 90% thresholds
configured in `vitest.config.ts`.

### TypeScript

```
$ bun run typecheck
```

No new errors. The three pre-existing errors (in `login.tsx`,
`ofi.tsx:174`, `provider.tsx:98`) all stem from `router.navigate({ to:
"/login" })` missing a `search` parameter — they're on `main` before
this change and out of scope.

## What it looks like

After clicking **Get Quote** in `/ofi` with USD 1,000 → EUR:

```
┌─ Get Quote ─────────────────────────────────────────────────────┐
│                                                                │
│  USD amount: [ 1000 ]   Target: [ EUR · Euro ▾ ]   [Get Quote] │
│                                                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ PAIR                    PAYOUT · SETTLEMENT   EXPIRES IN   │ │
│  │ Sell USDT → Buy EUR     €920.00 · $1,000.00   60s          │ │
│  │ Rate 0.92                                     (at HH:MM:SS)│ │
│  │                                                            │ │
│  │ Raw payload (support tickets):                             │ │
│  │ {                                                           │ │
│  │   "success": {                                              │ │
│  │     "quote": { ... },                                       │ │
│  │     "payoutAmount": 920,                                    │ │
│  │     "settlementAmount": 1000                                │ │
│  │   }                                                         │ │
│  │ }                                                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

The raw JSON block stays below the new row — operators see the
human-readable headline first, support tickets still have the full
payload.

## KISS / cohesion / coupling audit

- **No new dependencies.** Pure TypeScript, no React state machinery,
  no `Intl.NumberFormat` (locale-dependent output would clash with the
  font-mono aesthetic; we use manual `groupThousands`).
- **No new components.** The summary row is inline in the existing
  `PanelCard`, matching the rest of the OFI console.
- **No live countdown.** `expiresInSeconds` is computed once when the
  quote arrives; the user can re-click `Get Quote` to refresh. Avoids
  `setInterval` / `useEffect` timer code that would need SSR-safe
  handling and its own test surface.
- **Off-ramp only.** Sandbox today only models pay-out (USDT → fiat).
  No on-ramp toggle — would be UI-only and dead-end every action.
- **Mirrors `quote-message.ts`.** Same file shape (one export + private
  helpers), same test style (one describe per behaviour group, no
  mocks), same coverage floor (100%).
- **Failure path untouched.** `formatQuoteFailure` still owns the
  `QuoteFailureReason` mapping; the two files grow independently.

## Unaffected modules

Verified by reading + by full-suite run:

- `src/lib/t0/network.ts` — `GetQuoteResult` shape unchanged.
- `src/lib/t0/provider.ts`, `currencies.ts`, `types.ts` — unchanged.
- `src/lib/t0/t0.functions.ts` — no new server functions (presentation
  is client-side only).
- `src/lib/t0/quote-message.ts` — failure path unchanged.
- `src/routes/provider.tsx`, `src/routes/login.tsx`, others — unchanged.

## Verification commands

```bash
# 1. New module — 21 tests, 100% coverage
bun x vitest run src/lib/t0/quote-display.test.ts --coverage

# 2. Full suite — 300 tests, no regressions
bun x vitest run

# 3. Project coverage above thresholds
bun x vitest run --coverage

# 4. TypeScript — no new errors
bun run typecheck

# 5. Manual UAT (dev server)
bun run dev
# → sign in as OFI → /ofi → set USD 1000, EUR → Get Quote
# → expect the new compact row above the JSON dump
```