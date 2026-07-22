# Code Audit Report — T-0 Sandbox Bridge

**Audit Date:** 2026-07-22
**Audit Scope:** `src/routes/ofi.tsx`, `src/routes/provider.tsx`, `src/lib/t0/`, `src/components/ofi/`, new files (`countries.ts`, `recipient-info-csv.ts`)
**Auditor:** Claude Code (automated analysis + agent review)

---

## Executive Summary

The T-0 Sandbox Bridge is a TanStack Start application that simulates the T-0 Network protocol for cross-border payouts. The codebase shows strong architectural discipline — clear single-responsibility modules, pure-function testability, fail-fast env validation, and explicit data contracts between Provider/Network/OFI roles. The most recent additions (`countries.ts`, `recipient-info-csv.ts`) are exemplary KISS modules.

The most concerning findings are concentrated in **security/auth posture** (open-access sandbox removes any auth), **CSV injection (formula injection)** in `recipient-info-csv.ts`, and **missing runtime URL-encoded escape** in several places. Performance-wise, the routes use defensive `useEffect` scrolling patterns that could leak intervals under race conditions. There are also several **type-safety holes** around `bigint` serialization and inline `as` casts.

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 4     |
| Medium   | 13    |
| Low      | 12    |

---

## 1. Security Findings

### S-1 [CRITICAL] CSV Formula Injection — `recipient-info-csv.ts:42-49`

**File:** `src/lib/t0/recipient-info-csv.ts`
**Severity:** Critical (when CSVs are opened in Excel/Sheets)
**Description:** `escapeCSV` wraps fields containing `,`, `\n`, or `"` in double quotes — but does NOT prefix fields starting with `=`, `+`, `-`, `@`, or tab/CR (`\t`, `\r`) with a single quote. A malicious recipient name like `=cmd|'/c calc'!A1` will be written verbatim. When the operator opens the CSV in Excel/Google Sheets/LibreOffice, the formula executes.

**Recommendation:** Add CSV-injection escaping: if a value (after the null-check) starts with `=`, `+`, `-`, `@`, `\t`, or `\r`, prefix the entire output with a single quote (`'`) before quoting/escaping.

### S-2 [HIGH] Open-access sandbox with no auth or rate-limit

**Files:** `src/routes/ofi.tsx`, `src/routes/provider.tsx`, `src/routes/api/t0/provider/$.ts`
**Severity:** High
**Description:** The sandbox is open-access with no login required. Any process that knows the public key can sign and post arbitrary ProviderService RPCs. There is no per-caller nonce, no replay-protection beyond a 60s window, no IP allowlist, and no audit logging.

**Recommendation:**
- Add CSRF / origin check on POST endpoints
- Require an auth header for the `/api/t0/provider` POST handler in non-localhost deployments
- Add rate-limit middleware (e.g. 10 req/sec per IP)
- Log every inbound Provider RPC with request body hash + caller IP

### S-3 [HIGH] Unsanitised `txHash` flows into ledger field

**Files:** `src/routes/ofi.tsx:239`, `src/lib/t0/settlement.ts:307`
**Severity:** High
**Description:** User-typed `txHashDraft` is passed verbatim into `submitSettlement`. React escapes JSX content so XSS is mitigated, but the field is also serialized to JSON dumps and can contain newlines/control characters that corrupt display.

**Recommendation:** Validate `txHashDraft` shape (`/^0x[a-fA-F0-9]{64}$/`) before submission.

### S-4 [HIGH] Network public key bypass via empty string

**File:** `src/routes/api/t0/provider/$.ts`
**Severity:** High
**Description:** The handler returns 503 when `T0_NETWORK_PUBLIC_KEY` is empty — but there's no parallel guard for the Provider inbound. A misconfigured deployment silently accepts any single-character env value.

**Recommendation:** Add fail-fast env validation rejecting lengths that are not 33 (compressed) or 65 (uncompressed secp256k1 keys).

### S-5 [MEDIUM] Signed request body signature coverage risk

**File:** `src/lib/t0/t0-receiver.ts:204-219`
**Severity:** Medium
**Description:** `verifyRequestSignature` reads body via `request.arrayBuffer()` and hashes bytes, then reconstructs via `new Request(...)`. If any middleware re-parses via `request.text()` and re-encodes, signatures could mismatch.

**Recommendation:** Document that `bodyBytes` MUST be passed through verbatim. Add a test asserting handler sees the same bytes signature covered.

### S-6 [MEDIUM] No `rel="noopener noreferrer"` on external link

**File:** `src/routes/ofi.tsx:472`
**Severity:** Low/Medium
**Description:** The error action `<a href={errorActionHref}>` does not include `rel`. If `errorActionHref` ever accepts external URLs, this is a tabnabbing risk.

**Recommendation:** Add `rel="noopener noreferrer"` defensively.

### S-7 [MEDIUM] No size cap validation before base64 decode

**File:** `src/lib/t0/t0.functions.ts:157-190`
**Severity:** Medium
**Description:** `ofiUploadAmlFileFn` accepts `fileSize` and `bytesBase64` from client. Malicious client could send `fileSize: 10_000_000` and `bytesBase64` of 100 bytes (mismatch), wasting bandwidth before validation.

**Recommendation:** Validate `bytesBase64.length * 0.75 <= MAX_AML_FILE_SIZE` BEFORE decoding.

---

## 2. Code Quality Findings

### Q-1 [HIGH] `routes/ofi.tsx` is 1,319 lines — single-responsibility violation

**File:** `src/routes/ofi.tsx`
**Severity:** High
**Description:** `OfiPage` owns: (1) quote management UI, (2) USDT pre-settlement funding, (3) credit usage display, (4) recipient info form, (5) payment creation, (6) manual AML triggering/uploading, (7) payout request approval, (8) quote confirmations, (9) confirmed payment list. The Provider route delegates to panels — OFI should mirror that.

**Recommendation:** Extract sub-components: `OfiQuotePanel.tsx`, `OfiPreSettlementPanel.tsx`, `OfiPaymentCreationPanel.tsx`, `OfiPayoutApprovalPanel.tsx`. Route file should be <200 lines.

### Q-2 [MEDIUM] Magic number `1500` in scroll-highlight timeout

**File:** `src/routes/ofi.tsx:210-212`
**Severity:** Low/Medium
**Description:** `setTimeout(..., 1500)` and `attempts > 20` × `200ms` are magic numbers sprinkled inline.

**Recommendation:** Lift to module constants: `const HIGHLIGHT_DURATION_MS = 1500`, `const SCROLL_RETRY_INTERVAL_MS = 200`, `const SCROLL_RETRY_MAX = 20`.

### Q-3 [MEDIUM] Repeated `filter` chains in JSX render body

**Files:** `src/routes/ofi.tsx:635-700, 868-922, 942-1003, 1076-1128`
**Severity:** Medium
**Description:** Each `.events.filter(...).map(...)` is computed inside JSX body. Every render re-iterates `data.events`. Double filter (once for `length === 0`, once for `.map`) is wasteful.

**Recommendation:** Wrap each in `useMemo`, or extract to `useEventsByType(data.events, type)`.

### Q-4 [MEDIUM] Duplicate `formatBytes`/`formatTime` in 4 components

**Files:** `src/components/ofi/OfiManualAmlPanel.tsx`, `src/components/provider/ManualAmlPanel.tsx`, `src/components/ofi/OfiReFundPanel.tsx`, `src/components/provider/ProviderReFundPanel.tsx`
**Severity:** Low
**Description:** Same helper functions appear in 4 components.

**Recommendation:** Extract to `src/lib/format.ts`.

### Q-5 [MEDIUM] `[...data.settlementState.ledger].reverse()` on every render

**File:** `src/routes/ofi.tsx:585`
**Severity:** Low/Medium
**Description:** Allocates a new array + mutates on every render.

**Recommendation:** Wrap in `useMemo` keyed on `data.settlementState.ledger`.

### Q-6 [MEDIUM] Type cast `as unknown as bigint` lies to TypeScript

**File:** `src/routes/ofi.tsx:162`
**Severity:** Medium
**Description:** `version: r.latestLimit.version.toString() as unknown as bigint` serializes bigint to string, then casts back to bigint. Downstream arithmetic throws `TypeError`.

**Recommendation:** Widen type to `version: bigint | string` and document why, or create `serializeReadModel` helper.

### Q-7 [MEDIUM] Inline `as` casts bypass type checks in onChange handlers

**Files:** `src/routes/ofi.tsx:516, 738, 1151`
**Severity:** Medium
**Description:** `(v) => setFundingChain(v as typeof fundingChain)` — unchecked casts that could mask invalid runtime values.

**Recommendation:** Use discriminated checks: `if (v === "TRON" || v === "ETHEREUM" || v === "BSC") setFundingChain(v)`.

---

## 3. Error Handling Findings

### E-1 [HIGH] `setInterval` cleanup race in scroll effect

**File:** `src/routes/ofi.tsx:217-225`
**Severity:** High (memory leak / orphaned work)
**Description:** If `data.payments` changes mid-polling loop, the effect re-runs and `clearInterval(id)` clears the NEW interval (not the old one) due to closure capture. React 18 strict-mode makes this worse.

**Recommendation:** Use `useRef<number | null>` for interval id; clear on both dependency-change cleanup and unmount.

### E-2 [MEDIUM] `run` helper in provider route catches but doesn't surface errors

**File:** `src/routes/provider.tsx:134-146`
**Severity:** Medium
**Description:** `run` logs to console but never sets `error` state. User sees no feedback on failure — just a brief `busy` flicker.

**Recommendation:** Mirror OFI route's `run` pattern which sets `setError(...)`.

### E-3 [MEDIUM] Base64 decode failure silently swallowed

**File:** `src/lib/t0/aml-blob.ts:21-23`
**Severity:** Medium
**Description:** `new Uint8Array(Buffer.from(b64, "base64"))` silently strips invalid characters. No distinct error for malformed base64.

**Recommendation:** Detect malformed base64 and throw distinct error message.

### E-4 [MEDIUM] `applyAmlReview` partial state on second throw

**File:** `src/lib/t0/t0.functions.ts:131-151`
**Severity:** Medium
**Description:** If `approvePaymentQuote` throws after `completeManualAml` succeeds, payment is left in `accepted` status with no `OfiAmlEvent` logged.

**Recommendation:** Wrap approve flow in try/catch and revert payment to `pending_aml` if second step fails.

---

## 4. TypeScript Findings

### T-1 [HIGH] `useState<unknown>(null)` for paymentResult

**File:** `src/routes/ofi.tsx:268`
**Severity:** High
**Description:** `const [paymentResult, setPaymentResult] = useState<unknown>(null)`. Stores server fn result as `unknown`, losing all type info. Subsequent `if ("success" in r)` checks are unchecked.

**Recommendation:** Type as `useState<Awaited<ReturnType<typeof ofiCreatePaymentFn>> | null>(null)`.

### T-2 [HIGH] Massive inline type duplication in readModelData state

**File:** `src/routes/ofi.tsx:111-132, 136-145`
**Severity:** High
**Description:** `latestLimit` shape declared TWICE in same component — once in `useState` and again in `refreshReadModel`. If server shape changes, both must be updated.

**Recommendation:** Extract `interface OfiReadModelResult { latestLimit: ...; activeProjections: ... }` and reuse.

### T-3 [MEDIUM] Unchecked `as OfiSnapshot` cast

**File:** `src/routes/ofi.tsx:250`
**Severity:** Medium
**Description:** `(await snapshot({})) as OfiSnapshot` trusts the server. If server adds/renames a field, UI breaks silently.

**Recommendation:** Export `type OfiSnapshot = Awaited<ReturnType<typeof ofiSnapshotFn>>`.

### T-4 [MEDIUM] `(await inboxStateReadModel({})) as typeof inboxCounts` drift risk

**File:** `src/routes/provider.tsx:107`
**Severity:** Medium
**Description:** Inline inferred type can drift from actual server return shape.

**Recommendation:** Lift to named `interface CallbackInboxCounts` and export.

---

## 5. Performance Findings

### P-1 [MEDIUM] `data.payouts.find` inside row render — O(M×N)

**Files:** `src/routes/ofi.tsx:1237, 1089`, `src/routes/provider.tsx:387`
**Severity:** Medium
**Description:** Linear search through `data.payouts` happens **once per payment row**. With M payments and N payouts, O(M×N) per render.

**Recommendation:** Build `Map<paymentId, Payout>` once (memoized) and lookup in O(1).

### P-2 [MEDIUM] `data.events.filter(...).map(...)` inside List render

**Files:** `src/routes/ofi.tsx:653-662, 883-895, 1031-1042`
**Severity:** Medium
**Description:** Each row triggers separate filter+map pass over `data.events`.

**Recommendation:** Compute filtered list once outside `<List render>`.

### P-3 [MEDIUM] Sequential `await refreshReadModel(); await refresh();`

**File:** `src/routes/ofi.tsx:244-245`
**Severity:** Low
**Description:** Two independent refreshes happen sequentially after settlement.

**Recommendation:** `await Promise.all([refreshReadModel(), refresh()])`.

### P-4 [MEDIUM] `Math.random()` fallback for uuid is collision-unsafe

**File:** `src/lib/t0/client.ts:73`
**Severity:** Medium (correctness)
**Description:** `crypto.randomUUID?.() ?? \`${Date.now()}-${Math.random()}\`` — non-cryptographic fallback can produce collisions.

**Recommendation:** Use `globalThis.crypto.getRandomValues` fallback or throw instead of degrading to Math.random.

---

## 6. Best Practices Findings

### B-1 [MEDIUM] No URL-driven state sync for active tab

**File:** `src/routes/ofi.tsx:89-93`
**Severity:** Medium
**Description:** If user switches tabs manually and URL updates, tab silently resets to `initialDefaultTab`.

**Recommendation:** Use `useRouterState` to drive `<Tabs value>` prop.

### B-2 [MEDIUM] No global error boundary

**File:** `src/routes/__root.tsx`
**Severity:** Medium
**Description:** Per-route `setError` pattern means no top-level boundary. A throwing `formatQuoteForDisplay` unmounts entire route.

**Recommendation:** Add `ErrorBoundary` to `__root.tsx`.

### B-3 [MEDIUM] No retry / timeout on `useServerFn` calls

**File:** `src/routes/ofi.tsx` (entire file)
**Severity:** Medium
**Description:** All server-fn calls have no retry, no timeout, no AbortController. A hung server leaves button in `busy=true` forever.

**Recommendation:** Wrap each `await` with `Promise.race([call, timeout(10_000)])`.

### B-4 [MEDIUM] Raw JSON dump not sanitised or size-limited

**Files:** `src/routes/ofi.tsx:857, 1225`
**Severity:** Medium
**Description:** `JSON.stringify(paymentResult, null, 2)` in `<Textarea readOnly>` — large payloads freeze UI; circular refs throw.

**Recommendation:** Wrap in try/catch and truncate to 10 KB.

---

## 7. Potential Bugs

### BUG-1 [HIGH] `run` discards error stack — `routes/ofi.tsx:283-294`

**File:** `src/routes/ofi.tsx:283-294`
**Severity:** High
**Description:** `catch (e) { setError(e instanceof Error ? e.message : "Operation failed") }` — full Error object (with stack) is lost. Compare provider route which at least `console.error`s.

**Recommendation:** `console.error(e);` then `setError(...)`.

### BUG-2 [MEDIUM] Race in `useEffect`-driven scroll

**File:** `src/routes/ofi.tsx:188-226`
**Severity:** Medium
**Description:** When `data.payments` updates during polling loop: cleanup clears new interval (not old), highlight can flicker.

**Recommendation:** See E-1.

### BUG-3 [MEDIUM] External quotes cache mutation during iteration

**File:** `src/lib/t0/network.ts:154-168`
**Severity:** Medium
**Description:** `evictExpiredExternalQuotes` deletes from `Map` during iteration — undefined behavior in some implementations.

**Recommendation:** Iterate `[...this.externalQuotes.entries()]`.

### BUG-4 [MEDIUM] `recipientCheckStatus` overwrites without audit trail

**File:** `src/lib/t0/network.ts:394-404`
**Severity:** Medium
**Description:** `updateRecipientCheck` mutates in place. For AML compliance, should capture decision history, not just latest value.

**Recommendation:** Append to `recipientCheckHistory` array.

### BUG-5 [MEDIUM] `rejectedAt` type inconsistency (`? number | null` vs `number`)

**File:** `src/lib/t0/types.ts:64`
**Severity:** Medium
**Description:** Type declares `rejectedAt?: number | null` but code only sets `number`. Confusing.

**Recommendation:** Tighten to `rejectedAt?: number` only.

### BUG-6 [MEDIUM] Menu item key drift between OFI and Provider

**Files:** `src/components/ofi/OfiSidebarMenu.tsx`, `src/components/provider/ProviderSidebarMenu.tsx`
**Severity:** Medium
**Description:** OFI uses `refund`, Provider uses `payment-refund` — semantic difference invisible to operators.

**Recommendation:** Use same key in both (`payment-refund`).

### BUG-7 [MEDIUM] `confirmFunds` doesn't validate pending status

**File:** `src/lib/t0/network.ts:339-341`
**Severity:** Medium
**Description:** Can call `confirmFunds` on already-accepted payment, silently re-marking it.

**Recommendation:** Throw if `payment.status !== "pending"`.

### BUG-8 [MEDIUM] `markPaymentStatus` allows illegal state transitions

**File:** `src/lib/t0/provider.ts:265-270`
**Severity:** Medium
**Description:** Any status can be set to any other — no validation that transition is legal.

**Recommendation:** Add allowed-transitions table; throw on illegal transition.

---

## New Files: Specific Observations

### `src/lib/t0/countries.ts`
**Overall:** Excellent. Single responsibility, derive type from data, pre-computed Set for O(1) lookup, alphabetized.

**Minor:**
- `getCountryLabel` uses `find()` O(N) — with 154 countries fine, but `Map<code, label>` would be O(1)
- Could expose `countryOf(currency)` cross-reference

### `src/lib/t0/recipient-info-csv.ts`
**Overall:** Well-structured single responsibility. RFC4180 escape looks correct on first read.

**Critical issue:** S-1 (CSV formula injection) — must fix before any production use.

**Minor:**
- `recordToRow` repeats field order from `CSV_HEADERS` — add runtime assertion

---

## Summary of Recommendations

### Must Fix Before Non-Sandbox Deployment

| ID | Issue | File |
|----|-------|------|
| S-1 | CSV formula injection | `recipient-info-csv.ts` |
| S-2 | No auth/rate-limit on `/api/t0/provider` | Multiple |
| S-3 | txHash shape validation missing | `settlement.ts` |
| S-4 | Public key length validation | `provider/$.ts` |
| Q-1 | Split `ofi.tsx` into panel components | `routes/ofi.tsx` |
| T-1 | Stop using `useState<unknown>` | `routes/ofi.tsx` |
| T-2 | Deduplicate `readModelData` type | `routes/ofi.tsx` |
| E-1 | Fix `setInterval` cleanup race | `routes/ofi.tsx` |
| BUG-1 | Log full error stack | `routes/ofi.tsx` |

### Medium-Term

- Extract `CreditUsagePanel`, `formatBytes`/`formatTime` helpers
- Memoize `data.payouts.find` and `data.events.filter`
- Add error boundary to `__root.tsx`
- Type-safe `as` casts in Radix onChange handlers

### Long-Term

- Validated state-machine transitions in `PayoutProviderService`
- Audit trail for `updateRecipientCheck` decisions
- URL-driven tab state in `OfiSidebarMenu`
