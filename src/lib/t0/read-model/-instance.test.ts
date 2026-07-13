// read-model/-instance.test.ts — smoke coverage for the shared inbox singleton.

import { describe, it, expect, afterEach } from "vitest";
import {
  getCallbackInbox,
  resetSharedCallbackInboxForTest,
  setSharedCallbackInboxForTest,
  sharedCallbackInbox,
  sharedStore,
} from "./instance";
import { CallbackInbox } from "./inbox";
import { InMemoryStore } from "./store";

afterEach(() => {
  resetSharedCallbackInboxForTest();
});

describe("read-model/instance", () => {
  it("exports a shared store and shared inbox", () => {
    expect(sharedStore).toBeInstanceOf(InMemoryStore);
    expect(sharedCallbackInbox).toBeInstanceOf(CallbackInbox);
  });

  it("getCallbackInbox returns the shared inbox by default", () => {
    expect(getCallbackInbox()).toBe(sharedCallbackInbox);
  });

  it("setSharedCallbackInboxForTest swaps the active inbox", () => {
    const altStore = new InMemoryStore();
    const altInbox = new CallbackInbox(altStore, { providerId: 99 });
    setSharedCallbackInboxForTest(altInbox);
    expect(getCallbackInbox()).toBe(altInbox);
  });

  it("resetSharedCallbackInboxForTest restores the shared inbox", () => {
    const altStore = new InMemoryStore();
    setSharedCallbackInboxForTest(new CallbackInbox(altStore));
    resetSharedCallbackInboxForTest();
    expect(getCallbackInbox()).toBe(sharedCallbackInbox);
  });

  it("getStore on the shared inbox returns the shared store", () => {
    expect(sharedCallbackInbox.getStore()).toBe(sharedStore);
  });
});
