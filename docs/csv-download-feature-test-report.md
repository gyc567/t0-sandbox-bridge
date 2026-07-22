# CSV Download Feature — Test Report

**Date:** 2026-07-22
**Feature:** Payment-Payment Continued CSV download + country selector fix
**Files changed:** 5 new, 1 modified

---

## Summary

| Category | Result |
|----------|--------|
| New test files | 2 (`recipient-info-csv.test.ts`, `countries.test.ts`) |
| New tests | 28 (19 + 9) |
| All tests passing | ✅ |
| TypeScript | ✅ No errors |
| Existing tests | ✅ 772 unaffected |

---

## New Files

### `src/lib/t0/countries.ts`
ISO 3166-1 alpha-2 country list with `SUPPORTED_COUNTRIES`, `CountryCode`, `isSupportedCountry()`, `getCountryLabel()`.

### `src/lib/t0/countries.test.ts`
9 tests — array integrity, uniqueness, ISO format, type-guard true/false, label lookup, type narrowing.

### `src/lib/t0/recipient-info-csv.ts`
Single-responsibility CSV generator with:
- `RecipientInfoRecord` interface (11 columns per spec)
- `generateRecipientCSV()` — RFC 4180 compliant string generation
- `downloadRecipientCSV()` — triggers browser download

### `src/lib/t0/recipient-info-csv.test.ts`
19 tests — full branch coverage for escapeCSV, recordToRow, generateRecipientCSV:
- Empty/undefined/null field handling
- Plain text (no quoting)
- Comma quoting
- Newline quoting
- Double-quote escaping (`""`)
- Mixed special characters
- All 11 columns in order
- Partial records
- Duplicate country column (col 4 + col 11)
- Unicode (Chinese characters)
- Column count consistency

---

## Modified Files

### `src/routes/ofi.tsx`
- Added `SUPPORTED_COUNTRIES` import (replaces `SUPPORTED_CURRENCIES` for country dropdown)
- Added `downloadRecipientCSV` import
- Country dropdown now shows ISO country names (not currency codes)
- Added "Download CSV" button (disabled until name + country filled)

---

## CSV Format

| Column | Field |
|--------|-------|
| 1 | 手机号 |
| 2 | 收款人钱包地址 |
| 3 | 收款人姓名 |
| 4 | 收款人国家 |
| 5 | 收款人邮箱 |
| 6 | 收款人手机号 |
| 7 | 收款人地址 |
| 8 | 收款人邮政编码 |
| 9 | 收款人城市 |
| 10 | 收款人省份 |
| 11 | 收款人国家 (duplicate) |

---

## Design Decisions

| Principle | Implementation |
|-----------|----------------|
| KISS | Single utility file for CSV, no abstraction layers |
| High cohesion | `recipient-info-csv.ts` — one job: CSV generation |
| Low coupling | Pure function `generateRecipientCSV()` — no side effects, no imports from app code |
| Single responsibility | `countries.ts` mirrors `currencies.ts` pattern — canonical list + helpers |
| No regression | Existing tests unmodified (772 tests still pass) |
