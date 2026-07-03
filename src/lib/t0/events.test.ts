import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  subscribeEvents,
  broadcastEvent,
  getSubscriberCount,
  clearSubscribers,
  formatSSEMessage,
} from "./events";
import type { NetworkEvent } from "./types";

describe("subscribeEvents", () => {
  beforeEach(() => {
    clearSubscribers();
  });

  it("adds subscriber and returns unsubscribe function", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeEvents(callback);

    expect(getSubscriberCount()).toBe(1);

    // Unsubscribe should remove the callback
    unsubscribe();
    expect(getSubscriberCount()).toBe(0);
  });

  it("allows multiple subscribers", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    subscribeEvents(cb1);
    subscribeEvents(cb2);
    subscribeEvents(cb3);

    expect(getSubscriberCount()).toBe(3);
  });

  it("unsubscribe only removes its own callback", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribeEvents(cb1);
    subscribeEvents(cb2);

    unsub1();

    expect(getSubscriberCount()).toBe(1);
  });

  it("calling unsubscribe twice is safe", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeEvents(callback);

    unsubscribe();
    unsubscribe(); // Second call should be no-op

    expect(getSubscriberCount()).toBe(0);
  });
});

describe("broadcastEvent", () => {
  beforeEach(() => {
    clearSubscribers();
  });

  it("delivers event to all subscribers", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    subscribeEvents(cb1);
    subscribeEvents(cb2);

    const event: NetworkEvent = { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 };
    broadcastEvent(event);

    expect(cb1).toHaveBeenCalledOnce();
    expect(cb1).toHaveBeenCalledWith(event);
    expect(cb2).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledWith(event);
  });

  it("removes failed subscriber", () => {
    const failingCb = vi.fn(() => {
      throw new Error("subscriber error");
    });
    const goodCb = vi.fn();

    subscribeEvents(failingCb);
    subscribeEvents(goodCb);

    const event: NetworkEvent = { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 };
    broadcastEvent(event);

    expect(failingCb).toHaveBeenCalledOnce();
    expect(goodCb).toHaveBeenCalledOnce();
    expect(getSubscriberCount()).toBe(1); // Failing subscriber should be removed
  });

  it("continues broadcasting after subscriber removal", () => {
    const failingCb = vi.fn(() => {
      throw new Error("error");
    });
    const goodCb = vi.fn();

    subscribeEvents(failingCb);
    subscribeEvents(goodCb);

    const event1: NetworkEvent = { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 };
    broadcastEvent(event1);

    const event2: NetworkEvent = {
      type: "PaymentAccepted",
      paymentId: "pm_1",
      at: 1_700_000_001_000,
    };
    broadcastEvent(event2);

    expect(goodCb).toHaveBeenCalledTimes(2);
    expect(goodCb).toHaveBeenCalledWith(event1);
    expect(goodCb).toHaveBeenCalledWith(event2);
  });

  it("handles empty subscriber list", () => {
    const event: NetworkEvent = { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 };
    expect(() => broadcastEvent(event)).not.toThrow();
  });

  it("broadcasts all event types correctly", () => {
    const cb = vi.fn();
    subscribeEvents(cb);

    const events: NetworkEvent[] = [
      { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 },
      { type: "USDTTransactionNotification", txHash: "0x123", usd: 1000, at: 1_700_000_001_000 },
      { type: "CreditUsageNotification", counterparty: "cp_1", used: 500, at: 1_700_000_002_000 },
      { type: "PaymentAccepted", paymentId: "pm_1", at: 1_700_000_003_000 },
      { type: "PayoutAccepted", payoutId: "po_1", at: 1_700_000_004_000 },
      { type: "PayoutSuccess", payoutId: "po_1", at: 1_700_000_005_000 },
      { type: "PaymentConfirmed", paymentId: "pm_1", at: 1_700_000_006_000 },
    ];

    for (const event of events) {
      broadcastEvent(event);
    }

    expect(cb).toHaveBeenCalledTimes(7);
  });
});

describe("getSubscriberCount", () => {
  beforeEach(() => {
    clearSubscribers();
  });

  it("returns 0 when no subscribers", () => {
    expect(getSubscriberCount()).toBe(0);
  });

  it("returns correct count after adding subscribers", () => {
    subscribeEvents(vi.fn());
    subscribeEvents(vi.fn());
    expect(getSubscriberCount()).toBe(2);
  });

  it("returns correct count after unsubscribing", () => {
    const unsub1 = subscribeEvents(vi.fn());
    subscribeEvents(vi.fn());

    unsub1();
    expect(getSubscriberCount()).toBe(1);
  });
});

describe("clearSubscribers", () => {
  it("removes all subscribers", () => {
    subscribeEvents(vi.fn());
    subscribeEvents(vi.fn());
    subscribeEvents(vi.fn());

    clearSubscribers();

    expect(getSubscriberCount()).toBe(0);
  });

  it("is safe when no subscribers", () => {
    expect(() => clearSubscribers()).not.toThrow();
  });
});

describe("formatSSEMessage", () => {
  it("formats event as SSE message", () => {
    const event: NetworkEvent = { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 };
    const message = formatSSEMessage(event);

    expect(message).toBe('data: {"type":"QuotePublished","quoteId":"qt_1","at":1700000000000}\n\n');
  });

  it("escapes special JSON characters in event data", () => {
    const event: NetworkEvent = { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 };
    const message = formatSSEMessage(event);

    expect(message).toContain("data: ");
    expect(message.endsWith("\n\n")).toBe(true);
  });

  it("formats different event types correctly", () => {
    const events: NetworkEvent[] = [
      { type: "QuotePublished", quoteId: "qt_1", at: 1_700_000_000_000 },
      { type: "USDTTransactionNotification", txHash: "0xabc", usd: 500, at: 1_700_000_001_000 },
      { type: "PaymentAccepted", paymentId: "pm_1", at: 1_700_000_002_000 },
    ];

    for (const event of events) {
      const message = formatSSEMessage(event);
      expect(message).toMatch(/^data: \{.*\}\n\n$/);
    }
  });
});

// Helper matcher
expect.extend({
  toEndWith(received: string, suffix: string) {
    const pass = received.endsWith(suffix);
    return {
      pass,
      message: () => `expected ${received} to ${pass ? "not " : ""}end with ${suffix}`,
    };
  },
});
