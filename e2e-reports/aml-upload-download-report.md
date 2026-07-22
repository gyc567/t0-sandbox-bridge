# AML Upload → Download — Test Report

## Issue Found & Fixed

**Bug**: OFI uploads AML file → `onUploadAmlFile` completes successfully → but neither OFI nor Provider UI updates to show the new state. Download button never appears.

**Root Cause**: `ofi.tsx`'s `onUploadAmlFile` did NOT call `refresh()` after `uploadAmlFile()` succeeded. The server correctly persisted `amlFile` metadata + blob, but the client-side React state was never refreshed.

**Fix** (1-line change in `src/routes/ofi.tsx`):
```typescript
// onUploadAmlFile — AFTER
await uploadAmlFile({ data: { ..., bytesBase64 } });
await refresh();  // ← Added this line
```

## Test Coverage

| Category | Tests | Status |
|----------|-------|--------|
| `aml-blob.test.ts` (new) | 5 | ✅ PASS |
| `provider.test.ts` (AML blob) | 4 new | ✅ PASS |
| `network.test.ts` (AML blob fwd) | 2 new | ✅ PASS |
| `t0.functions.aml.test.ts` (download + updated upload) | 3 new + 6 updated | ✅ PASS |
| `ManualAmlPanel.test.tsx` (Download button) | 4 new + 22 updated | ✅ PASS |
| `OfiManualAmlPanel.test.tsx` | existing | ✅ PASS |
| All 43 test files | **770 total** | ✅ PASS |

## Changed Files

| File | Change |
|------|--------|
| `src/routes/ofi.tsx` | `onUploadAmlFile` calls `await refresh()` after upload |
| (all Phase 1–9 files from plan) | ✅ Already implemented |

## Verification

1. **Unit tests**: `npx vitest run` → 770 passed
2. **Dev server**: http://localhost:8080/provider — Running
3. **Manual verification steps**:
   - OFI: Create payment → Trigger AML → Upload AML file → Should immediately show "✓ file.pdf uploaded" waiting state
   - Provider: Refresh page → Payment-Manual AML → Should show Download button for that payment
   - Provider: Click Download → Browser saves the file locally
