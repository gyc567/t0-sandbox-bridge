# Provider AML Rejection → Refund + OFI Fiat Beneficiary Input Plan

> Status: Phase 1 (ReFund Tab) ready for implementation · Part B (IVMS101) deferred
>
> Current: Part A (AML rejection → Refund) is substantially implemented. This document revises and clarifies the remaining work.
>
> Rev.2: Added ReFund tab plan (replacing buried-in-ManualAmlPanel design), audit of the original plan, and revised implementation ordering.

---

## Part 0 — Audit of the Original Plan

### 0.1 What Was Already Built (Before This Revision)

| Item | File | Status |
|------|------|--------|
| `refundedAt?: number \| null` on `Payment` | `types.ts` | ✅ Done |
| `rejectedReason?: "aml_denied" \| "aml_not_needed"` on `Payment` | `types.ts` | ✅ Done |
| `provider.refundPayment(paymentId, now)` | `provider.ts:274` | ✅ Done |
| `sandboxNetwork.requestRefund(paymentId)` — validates, releases credit, sets `refundedAt`, emits notification | `network.ts:411` | ✅ Done |
| `requestRefundFn` server fn | `t0.functions.ts:53` | ✅ Done |
| `OfiAmlEvent` emitted on AML reject (immediately, not at refund time) | `applyAmlReview` in `t0.functions.ts` | ✅ Done |
| `listRejectedPayments()` — sorted: refunded first, then awaiting | `network.ts:433` | ✅ Done |
| `RefundableRow` — inside ManualAmlPanel | `ManualAmlPanel.tsx:281` | ✅ Done |
| `RefundedRow` — inside ManualAmlPanel | `ManualAmlPanel.tsx:316` | ✅ Done |
| `OfiReFundPanel` — OFI-side read-only view with ReFund tab in sidebar | `OfiReFundPanel.tsx` + `OfiSidebarMenu` | ✅ Done |
| `ofiListRejectedPaymentsFn` | `t0.functions.ts:258` | ✅ Done |
| `ProviderSidebarMenu` — 4 tabs, no ReFund tab | `ProviderSidebarMenu.tsx` | ✅ Done |
| `ManualAmlPanel` — contains refund sub-sections | `ManualAmlPanel.tsx` | ✅ Done (but buried) |

### 0.2 Original Plan Problems

**Problem 1 — ReFund UI buried inside Manual AML panel**
The refund sections (`RefundableRow`, `RefundedRow`) live inside `ManualAmlPanel` which is only visible under the `payment-manual-aml` tab. A Provider reviewing AML files would not naturally look there for refund management. The original plan did not propose a standalone tab.

**Fix (Rev.2):** Add a 5th sidebar tab `payment-refund` → `ProviderReFundPanel`. Move the Refund UX out of ManualAmlPanel into its own dedicated panel. This also cleanly separates the two concerns: AML review vs. refund bookkeeping.

**Problem 2 — Missing Provider ReFund tab component**
The OFI has `OfiReFundPanel` + a sidebar tab. The Provider had no equivalent. The original plan mentioned only the ManualAmlPanel integration.

**Fix (Rev.2):** Create `ProviderReFundPanel` as a new component mirroring the OFI panel's structure but with Provider-specific actions (Refund button).

**Problem 3 — No dedicated `listRejectedPaymentsFn` for Provider**
The Provider uses `snapshotFn` (all payments) and filters client-side. A dedicated read-only server fn could be added later if pagination becomes necessary, but for the sandbox scale this is premature optimization.

**Fix (Rev.2):** Keep using `snapshotFn` for now. No new server fn needed at this stage.

**Problem 4 — Cancel AML and Reject are still semantically distinct but produce the same terminal state**
The original plan noted this but the implementation uses the same `completeManualAml(id, false, reason)` path with a different `reason` string. This is correct — the `reason` field provides the audit trail.

**Status:** Acceptable. No change needed.

### 0.3 What Remains Unchanged from Original Plan

- **Part B (IVMS101 + BeneficiaryDetails union)** — deferred. Requires significant form work on both OFI (Create Payment) and Provider (Manual AML review). Not in scope for the current sprint.
- The `rejectedAt` field is set by `completeManualAml(false)` — correct.
- Credit release happens only at Refund time — correct.
- `OfiAmlEvent` is emitted on reject immediately — correct.

---

## Part A — ReFund Tab (Provider Console)

### A.1 Design Decision: Standalone Tab vs. ManualAmlPanel Sub-Section

**Conclusion:** Add a 5th sidebar tab `payment-refund`.

**Rationale:**
- AML review and refund management are two distinct responsibilities. Mixing them in one panel violates single responsibility.
- A Provider processing AML rejections needs a dedicated dashboard to see all rejected payments at a glance, not just those that happen to appear during AML review.
- The OFI console already has a ReFund tab — symmetry between Provider and OFI consoles aids operator mental model.
- Moving Refund buttons out of `ManualAmlPanel` simplifies that panel (fewer responsibilities).

**Alternative considered:** Keep refund UX inside ManualAmlPanel but split into two sub-sections. Rejected because the `payment-manual-aml` tab would only show rejected payments — it is semantically wrong to call the tab "Manual AML" and show refund rows that are not about AML review.

### A.2 Sidebar Structure

```
ProviderSidebarMenu (5 tabs)
  ├── quote-management         → QuoteManagementContent
  ├── payment-pre-settlement   → CreditUsageContent
  ├── payment-continued        → PayoutExecutionContent
  ├── payment-manual-aml       → ManualAmlPanel  (no refund rows)
  └── payment-refund           → ProviderReFundPanel  ← NEW
```

**Migration:** Remove `RefundableRow` and `RefundedRow` from `ManualAmlPanel`. The refund sub-sections currently inside `ManualAmlPanel` move entirely to `ProviderReFundPanel`.

### A.3 Data Flow

```
ProviderReFundPanel (client)
  └── payments prop → filtered to status === "rejected"

  [Awaiting Refund section]
    PaymentRow: paymentId · currency · localAmount · beneficiaryRef
                rejectedReason · rejectedAt · [Refund button]

  [Refunded section]
    PaymentRow: paymentId · currency · localAmount · beneficiaryRef
                rejectedReason · refundedAt · duration (refundedAt - rejectedAt)

User clicks "Refund" button → onRefundAml(paymentId) handler in provider.tsx
  → requestRefundFn({ data: { paymentId } })
    → sandboxNetwork.requestRefund(paymentId)
      → validates: payment.status === "rejected" && payment.refundedAt == null
      → settlementRegistry.releaseCredit(payment.usdAmount)  (if registry attached)
      → provider.refundPayment(paymentId, now)
      → provider.notifyCreditUsage("ofi", payment.usdAmount, { paymentId, quoteId })
  → refresh() → snapshotFn() → updated data flows back in
```

### A.4 ProviderReFundPanel Component

**New file:** `src/components/provider/ProviderReFundPanel.tsx`

Props:
```typescript
interface ProviderReFundPanelProps {
  payments: Payment[];        // All payments from snapshotFn, filtered client-side
  busy: boolean;
  onRefundAml: (paymentId: string) => Promise<void>;
}
```

Internal structure:
- `AwaitingRefundRow` — shows Refund button (same as current `RefundableRow` but in dedicated panel)
- `RefundedRow` — read-only chip with timestamp + duration (same as current `RefundedRow`)
- Section headers with counts: "Awaiting Refund (n)" / "Refunded (n)"
- Empty state: "No rejected payments."

### A.5 No New Server Functions Required

| Server Fn | Used By | Rationale |
|-----------|---------|-----------|
| `snapshotFn` | ProviderReFundPanel (via `data.payments`) | Already returns all payments including rejected |
| `requestRefundFn` | `onRefundAml` in provider.tsx | Already wired; reuses existing handler |

The `ofiListRejectedPaymentsFn` is OFI-specific (server-side filter). Provider filters client-side from `snapshotFn` — fine for sandbox scale.

### A.6 State Transition (ReFund only)

```
pending ──► accepted ──► confirmed
    │           │
    │           └── pending_aml ──► accepted  (AML approved + Last Look)
    │                               (Refund not applicable)
    │
    └──────────────────────────────► rejected  (AML denied/cancelled)
                                        │
                                   refundedAt = now  (Provider clicks Refund)
```

Refunded is a **terminal sub-state** of `rejected`. The `PaymentStatus` enum value stays `"rejected"`. The `refundedAt` timestamp discriminates.

---

## Part B — OFI Fiat Beneficiary Input + Provider IVMS101 Review

> **Deferred.** Requires significant form work on both OFI (Create Payment) and Provider (Manual AML panel). To be scoped in a separate sprint.

### B.1 Scope Summary

1. **OFI Create Payment form** — add `BeneficiaryDetails` union (IBAN / Domestic / Mobile Money) and `TravelRuleData` with IVMS101 person structures
2. **Provider ManualAmlPanel** — display beneficiary bank info + IVMS101 identity; auto-run compliance checks on panel open; "Re-run Validation" button; Approve disabled when checks fail
3. **New types** — `BeneficiaryDetails` union, full `Ivms101*` type tree, `TravelRuleData`, updated `CreatePaymentInput`
4. **Client-side validation** — IBAN regex, E.164 phone format, sort code formatting, required field enforcement
5. **Server-side validation** — IBAN format, required fields, in `ofiCreatePaymentFn` and `createPayment`

### B.2 Key Design Decisions (Carried Forward from Original Plan)

- `OfiAmlEvent` emitted on AML reject immediately (not at refund time) — already implemented ✅
- `PaymentStatus.rejected` reused, `refundedAt?: number | null` discriminates terminal state — already implemented ✅
- Credit release only at Refund time, not at `completeManualAml(false)` — already implemented ✅
- `sandboxNetwork.requestRefund` is the sole refund entry point — already implemented ✅
- `OfiManualAmlPanel` gains `kind: "rejected"` section — already implemented ✅

---

## Part C — Implementation Order (Rev.2)

```
Step 1 — Add payment-refund tab to ProviderSidebarMenu
         File: src/components/provider/ProviderSidebarMenu.tsx
         + MENU_ITEMS entry: { value: "payment-refund", label: "ReFund" }
         + new prop: paymentRefundContent: ReactNode

Step 2 — Create ProviderReFundPanel component
         File: src/components/provider/ProviderReFundPanel.tsx (NEW)
         + Props: payments, busy, onRefundAml
         + AwaitingRefundRow (with Refund button)
         + RefundedRow (read-only with timestamp + duration)
         + Section headers with counts
         + Empty state

Step 3 — Wire into provider.tsx
         File: src/routes/provider.tsx
         + Add paymentRefundContent prop to ProviderSidebarMenu
         + <ProviderReFundPanel payments={data.payments.filter(p => p.status === "rejected")}
                                 busy={busy} onRefundAml={onRefundAml} />

Step 4 — Remove refund sub-sections from ManualAmlPanel
         File: src/components/provider/ManualAmlPanel.tsx
         - Remove RefundableRow and RefundedRow components
         - Remove refundablePayments and refundedPayments filtering
         - Remove the two "Awaiting Refund" / "Refunded" sections from render
         Note: ManualAmlPanel still shows ReadOnlyRow for "rejected" status
               (accepted AML approvals), which is correct.

Step 5 — Tests
         File: src/components/provider/ProviderReFundPanel.test.tsx (NEW)
         + Empty state
         + Awaiting Refund section with Refund button
         + Refunded section (read-only)
         + Multiple payments (awaiting + refunded mixed)
         + busy state disables Refund button
         + onRefundAml called with correct paymentId

Step 6 — TypeScript check + full test suite
         bun tsc --noEmit
         bun x vitest run
```

---

## Part D — File Inventory (This Sprint)

| File | Action | Detail |
|------|--------|--------|
| `src/components/provider/ProviderSidebarMenu.tsx` | Modify | Add 5th menu item + prop |
| `src/components/provider/ProviderReFundPanel.tsx` | **Create** | New component (mirrors OfiReFundPanel structure with Refund buttons) |
| `src/routes/provider.tsx` | Modify | Wire new tab content prop; remove refund sub-sections from ManualAmlPanel (Step 4) |
| `src/components/provider/ManualAmlPanel.tsx` | Modify | Remove `RefundableRow`, `RefundedRow`, related state and sections |
| `src/components/provider/ProviderReFundPanel.test.tsx` | **Create** | Tests |

**No changes to:** `network.ts`, `provider.ts`, `t0.functions.ts`, `types.ts`, `settlement.ts`, `sdk-adapter.ts`, `ofi.tsx`, `OfiReFundPanel.tsx`, `OfiSidebarMenu.tsx`

---

## Part E — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Refund button double-click causes double credit release | Low | Medium | `requestRefund` is idempotent — second call throws "already refunded" |
| Moving refund rows out of ManualAmlPanel breaks existing muscle memory for testers | Low | Low | Clear communication in PR description; screenshots in test plan |
| ProviderReFundPanel test coverage gap | Medium | Medium | Write tests before marking done; aim for 100% component coverage |
| `ManualAmlPanel` tests break after removing refund rows | Medium | Low | Update `ManualAmlPanel.test.tsx` — remove refund row assertions; add assertions that refund rows are absent |

---

## Part F — Out of Scope (This Sprint)

- Part B (IVMS101 + BeneficiaryDetails forms)
- Chargeback / clawback (OFI-initiated reversal)
- Time-triggered automatic refunds
- Provider-side pagination for large refund queues
- Production persistence (sandbox only)
- GLEIF LEI real-time lookup

---

## Appendix — Comparison: OFI ReFund Panel vs. Provider ReFund Panel

| Aspect | OfiReFundPanel | ProviderReFundPanel |
|--------|---------------|-------------------|
| Purpose | Read-only OFI observation of rejection + refund timeline | Provider action panel — trigger refunds |
| Refund button | None (read-only) | Yes — per awaiting-refund row |
| AML file info | Shows AML filename + upload time | Not shown (Provider already reviewed it in ManualAmlPanel) |
| Data source | `ofiListRejectedPaymentsFn` | `snapshotFn` filtered client-side |
| Timeline shown | rejectedAt + refundedAt + duration | rejectedAt + refundedAt + duration |
| Rejection reason | Shown | Shown |
