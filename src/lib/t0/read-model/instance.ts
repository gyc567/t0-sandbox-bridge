// read-model/instance.ts — Shared CallbackInbox singleton.
//
// Phase 1 of docs/pre-settlement-flow-plan.md. Both `provider-impl.ts`
// (T-0 RPC ingress) and `index.ts` (server fns / app entry) need to
// share the same CallbackInbox instance so an UpdateLimit callback is
// visible to subsequent OFI server fn calls.
//
// Kept in its own tiny module so neither side has to import the other,
// avoiding a circular dependency.

import { CallbackInbox } from "./inbox";
import { InMemoryStore } from "./store";

export const sharedStore = new InMemoryStore();
export const sharedCallbackInbox: CallbackInbox = new CallbackInbox(sharedStore);

/** Test-only: replace the shared instance with a fresh one. Returns
 *  the previous store so the caller can inspect / restore state. */
export function setSharedCallbackInboxForTest(inbox: CallbackInbox): void {
  _currentInbox = inbox;
}

export function resetSharedCallbackInboxForTest(): void {
  _currentInbox = sharedCallbackInbox;
}

let _currentInbox: CallbackInbox = sharedCallbackInbox;

/** Resolve the active inbox (the test override or the shared default). */
export function getCallbackInbox(): CallbackInbox {
  return _currentInbox;
}