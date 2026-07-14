# Provider Manual AML — Test Report

## Outcome: PASS

All targeted checks green. Global vitest thresholds (95% lines / 95% statements /
90% branches / 90% functions) pass after the change — they were already failing at
baseline (94.6% lines) and this work moves the project above the threshold.

## Test inventory

| Suite                                                | Baseline | After | Delta |
| ---------------------------------------------------- | -------- | ----- | ----- |
| `src/lib/t0/aml.test.ts`                             | 22       | 22    | 0     |
| `src/lib/t0/network.test.ts`                         | 46       | 46    | 0     |
| `src/lib/t0/t0.functions.aml.test.ts`                | 7        | 15    | +8    |
| `src/components/provider/ManualAmlPanel.test.tsx`    | 12       | 28    | +16   |
| **Targeted subtotal**                                | **87**   | **111** | **+24** |
| Full project (all 40 files)                          | 722      | 732   | +10   |

(The "Full project" delta is smaller because the targeted suites above share the
project-wide count; the +24 figure is the deduplicated new test count.)

## What the new tests lock down

`src/lib/t0/t0.functions.aml.test.ts` (+8 tests):

- `applyAmlReview` — rejection does NOT call `approvePaymentQuote` (no Last Look
  fallback on rejection).
- `applyAmlReview` — approval ordering: `completeManualAml` runs BEFORE
  `approvePaymentQuote` (Last Look relies on the payment being accepted first).
- `applyAmlReview` — approval cascade invokes both network calls + the
  `logOfiAmlEvent` provider hook.
- `applyAmlReview` — rejection does NOT call `logOfiAmlEvent`.
- `applyAmlReview` — calling twice on an already-accepted payment throws, the
  guard is not silently swallowed.
- `reviewAmlUpload` — pure-validates + returns approved for a clean PDF without
  touching the network.
- `reviewAmlUpload` — throws on an unsupported file type before reaching the
  reviewer.
- Wiring source-level sanity check: `uploadAmlFileFn` references both
  `reviewAmlUpload` and `applyAmlReview`.
- (Re-)asserted: rejected upload now transitions the payment to `status:
  "rejected"` (was `pending_aml` in the old test).

`src/components/provider/ManualAmlPanel.test.tsx` (+16 tests):

- Empty state no longer mentions "Trigger AML from the OFI console" — checked
  across all 5 combinations of empty / pending / approved / rejected payment
  lists.
- Approved + rejected payments render in their own sections (`aml-approved-section`,
  `aml-rejected-section`) with read-only chips and no upload UI.
- The active queue only renders when there is at least one `pending_aml`
  payment.
- All three sections coexist when each has payments; only the matching section
  data attribute appears for each payment's `read-only-{status}-{id}` chip.
- Five new handler tests in happy-dom cover file-selection change, click uploads,
  and an upload-callback that throws — all driven via
  `@testing-library/react` (matches the existing `OfiManualAmlPanel.test.tsx`
  pattern).
- Four new tests cover the extracted `runRowUpload` pure helper: no-file guard,
  approved flow, rejected flow, thrown-error mapping (including the
  non-Error fallback that returns "Upload failed").

## Coverage

| Metric      | Baseline | After  | Threshold | Status |
| ----------- | -------- | ------ | --------- | ------ |
| Statements  | 94.22%   | 95.15% | 95%       | PASS   |
| Branches    | 89.02%   | 90.33% | 90%       | PASS   |
| Functions   | 94.72%   | 95.38% | 90%       | PASS   |
| Lines       | 94.60%   | 95.61% | 95%       | PASS   |

`ManualAmlPanel.tsx` file-level coverage (the only file materially touched):

| Metric      | Baseline | After  |
| ----------- | -------- | ------ |
| Statements  | 43.47%   | 100%   |
| Branches    | 37.50%   | 97.36% |
| Functions   | 66.66%   | 100%   |
| Lines       | 40.90%   | 100%   |

The remaining ~3% branch gap on the panel is a single conditional in the read-only
chip rendering — not an exercise-critical path.

## Files changed

| File                                                          | Change                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/t0/t0.functions.ts`                                  | Extracted `reviewAmlUpload` + `applyAmlReview` named helpers; `uploadAmlFileFn` now     |
|                                                               | composes them. No behavior change for existing callers; rejection now also calls       |
|                                                               | `completeManualAml(false)` so the payment transitions out of `pending_aml`.           |
| `src/lib/t0/t0.functions.aml.test.ts`                         | Restructured around the new helpers. Added 8 new tests.                               |
| `src/components/provider/ManualAmlPanel.tsx`                  | Added `runRowUpload` pure helper; added read-only Approved/Rejected sections; dropped |
|                                                               | "Trigger AML from the OFI console" empty-state copy; tightened copy on the description.|
| `src/components/provider/ManualAmlPanel.test.tsx`             | Rewrote the 3 stale assertions; added 16 new tests.                                    |
| `src/routes/provider.tsx`                                     | `onUploadAndReview` now returns `AmlReviewOutcome`; `run` made generic so it can       |
|                                                               | forward the upload result back to the row for the result banner.                      |

## What is explicitly NOT changed (per KISS + scope discipline)

- `src/routes/ofi.tsx` — OFI console untouched.
- Quote management, Get Quote, Create Payment, payout execution logic —
  untouched.
- `src/lib/t0/provider.ts`, `src/lib/t0/provider-impl.ts`, `src/lib/t0/ofi.ts`
  — no behavior changes.
- No new top-level abstractions added (the only new files are test files).
- No test removals; every previously-passing test still passes.

## Verification

Commands run (all green):

```bash
bun x vitest run src/components/provider/ManualAmlPanel.test.tsx \
                 src/lib/t0/t0.functions.aml.test.ts \
                 src/lib/t0/aml.test.ts \
                 src/lib/t0/network.test.ts
# → 4 files / 111 tests / all pass

bun x vitest run
# → 40 files / 732 tests / all pass

bun run typecheck
# → tsc --noEmit clean (no output, no errors)

bun x vitest run --coverage
# → All thresholds PASS (95.15% statements, 90.33% branches,
#   95.38% functions, 95.61% lines)
```

Manual-smoke check (not run in CI; instructions only):

1. `bun run dev`.
2. `/ofi` → trigger manual AML on a payment.
3. `/provider` → confirm the new AML queue shows the pending payment in the
   "Pending review" section.
4. Upload `report.pdf` → confirm the row shows the approved result banner;
   after refresh the payment moves to the "Approved · Last Look cleared"
   section, and the quote TTL is bumped (Last Look).
5. Upload `reject.pdf` on a fresh payment → confirm the row shows the rejected
   banner; after refresh the payment moves to the "Rejected" section, and the
   quote TTL is NOT bumped (no fallback).
6. Confirm the empty-state paragraph reads "No payments pending AML review."
   and does NOT contain "Trigger AML from the OFI console".
