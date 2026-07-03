import { describe, it, expect } from "vitest";
import { csvCell, toCSVRow, snapshotToCSV, csvFilename } from "./csv";
import type { Snapshot } from "./provider";
import type { NetworkEvent } from "./types";

describe("csvCell", () => {
  it("returns plain string for simple values", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell("world")).toBe("world");
  });

  it("converts numbers to string", () => {
    expect(csvCell(123)).toBe("123");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(3.14)).toBe("3.14");
  });

  it("converts null/undefined to empty string", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("wraps value with comma in quotes", () => {
    expect(csvCell("hello,world")).toBe('"hello,world"');
    expect(csvCell("a,b,c")).toBe('"a,b,c"');
  });

  it("wraps value with quote in quotes and escapes quotes", () => {
    expect(csvCell('say "hello"')).toBe('"say ""hello"""');
    expect(csvCell('a"b')).toBe('"a""b"');
  });

  it("wraps value with newline in quotes", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("a\nb\nc")).toBe('"a\nb\nc"');
  });

  it("handles combined edge cases", () => {
    expect(csvCell('hello, "world"\ntest')).toBe('"hello, ""world""\ntest"');
  });

  it("handles empty string", () => {
    expect(csvCell("")).toBe("");
  });
});

describe("toCSVRow", () => {
  it("joins values with comma", () => {
    expect(toCSVRow(["a", "b", "c"])).toBe("a,b,c");
    expect(toCSVRow(["hello", "world"])).toBe("hello,world");
  });

  it("escapes values containing commas", () => {
    expect(toCSVRow(["a,b", "c"])).toBe('"a,b",c');
  });

  it("escapes values containing quotes", () => {
    expect(toCSVRow(['say "hi"', "c"])).toBe('"say ""hi""",c');
  });

  it("escapes values containing newlines", () => {
    expect(toCSVRow(["a\nb", "c"])).toBe('"a\nb",c');
  });

  it("handles mixed values", () => {
    const row = toCSVRow(["simple", "has,comma", 'has"quote', "a\nb", null, 42]);
    expect(row).toBe('simple,"has,comma","has""quote","a\nb",,42');
  });

  it("handles empty array", () => {
    expect(toCSVRow([])).toBe("");
  });
});

describe("snapshotToCSV", () => {
  const createSnapshot = (overrides?: Partial<Snapshot>): Snapshot => ({
    quotes: [
      {
        id: "qt_1",
        currency: "USD",
        band: 1_000,
        rate: 1.0,
        expiresAt: 1_700_000_000_000,
        createdAt: 1_699_999_000_000,
      },
    ],
    payments: [
      {
        id: "pm_1",
        quoteId: "qt_1",
        currency: "USD",
        usdAmount: 1_000,
        localAmount: 1_000,
        beneficiaryRef: "ben_1",
        status: "confirmed",
        createdAt: 1_699_999_500_000,
      },
    ],
    payouts: [
      {
        id: "po_1",
        paymentId: "pm_1",
        status: "success",
        updatedAt: 1_700_000_100_000,
      },
    ],
    events: [
      { type: "QuotePublished", quoteId: "qt_1", at: 1_699_999_000_000 },
      { type: "PaymentConfirmed", paymentId: "pm_1", at: 1_700_000_100_000 },
    ],
    ...overrides,
  });

  it("includes quotes section", () => {
    const csv = snapshotToCSV(createSnapshot());
    expect(csv).toContain("=== Quotes ===");
    expect(csv).toContain("qt_1");
    expect(csv).toContain("USD");
  });

  it("includes payments section", () => {
    const csv = snapshotToCSV(createSnapshot());
    expect(csv).toContain("=== Payments ===");
    expect(csv).toContain("pm_1");
    expect(csv).toContain("confirmed");
  });

  it("includes payouts section", () => {
    const csv = snapshotToCSV(createSnapshot());
    expect(csv).toContain("=== Payouts ===");
    expect(csv).toContain("po_1");
    expect(csv).toContain("success");
  });

  it("includes events section", () => {
    const csv = snapshotToCSV(createSnapshot());
    expect(csv).toContain("=== Events ===");
    expect(csv).toContain("QuotePublished");
    expect(csv).toContain("PaymentConfirmed");
  });

  it("handles empty snapshot", () => {
    const csv = snapshotToCSV(
      createSnapshot({ quotes: [], payments: [], payouts: [], events: [] }),
    );
    expect(csv).toContain("=== Quotes ===");
    expect(csv).toContain("=== Payments ===");
    expect(csv).toContain("=== Payouts ===");
    expect(csv).toContain("=== Events ===");
  });

  it("handles missing optional reason in payouts", () => {
    const snapshot = createSnapshot({
      payouts: [{ id: "po_1", paymentId: "pm_1", status: "failed", updatedAt: 1_700_000_100_000 }],
    });
    const csv = snapshotToCSV(snapshot);
    expect(csv).toContain("po_1");
  });

  it("includes payout reason when present", () => {
    const snapshot = createSnapshot({
      payouts: [
        {
          id: "po_1",
          paymentId: "pm_1",
          status: "failed",
          reason: "insufficient funds",
          updatedAt: 1_700_000_100_000,
        },
      ],
    });
    const csv = snapshotToCSV(snapshot);
    expect(csv).toContain("insufficient funds");
  });

  it("properly escapes special characters in data", () => {
    const snapshot = createSnapshot({
      quotes: [
        {
          id: "qt_special",
          currency: "USD",
          band: 1_000,
          rate: 1.0,
          expiresAt: 1_700_000_000_000,
          createdAt: 1_699_999_000_000,
        },
      ],
      payments: [
        {
          id: "pm_special",
          quoteId: "qt_special",
          currency: "USD",
          usdAmount: 1_000,
          localAmount: 1_000,
          beneficiaryRef: 'ben, "special" ref\nwith newline',
          status: "confirmed",
          createdAt: 1_699_999_500_000,
        },
      ],
      payouts: [],
      events: [],
    });
    const csv = snapshotToCSV(snapshot);

    // Check that the special characters are properly escaped
    expect(csv).toContain('"ben, ""special"" ref');
    expect(csv).toContain("with newline");
  });
});

describe("csvFilename", () => {
  it("includes default prefix", () => {
    const filename = csvFilename();
    expect(filename).toContain("t0-sandbox");
  });

  it("includes date in YYYY-MM-DD format", () => {
    const filename = csvFilename();
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    expect(filename).toMatch(datePattern);
  });

  it("uses custom prefix", () => {
    const filename = csvFilename("custom-prefix");
    expect(filename).toContain("custom-prefix");
    expect(filename).not.toContain("t0-sandbox");
  });

  it("has .csv extension", () => {
    const filename = csvFilename();
    expect(filename.endsWith(".csv")).toBe(true);
  });

  it("handles all event types in eventId", () => {
    const events: NetworkEvent[] = [
      { type: "QuotePublished", quoteId: "qt_test", at: 1 },
      { type: "USDTTransactionNotification", txHash: "0xtx", usd: 100, at: 2 },
      { type: "CreditUsageNotification", counterparty: "cp_test", used: 50, at: 3 },
      { type: "PaymentAccepted", paymentId: "pm_test", at: 4 },
      { type: "PayoutAccepted", payoutId: "po_test", at: 5 },
      { type: "PayoutSuccess", payoutId: "po_test", at: 6 },
      { type: "PaymentConfirmed", paymentId: "pm_test", at: 7 },
    ];

    const csv = snapshotToCSV({
      quotes: [],
      payments: [],
      payouts: [],
      events,
    });

    expect(csv).toContain("qt_test");
    expect(csv).toContain("0xtx");
    expect(csv).toContain("cp_test");
    expect(csv).toContain("pm_test");
    expect(csv).toContain("po_test");
  });

  // Test all branches in csvCell function (quote path, comma path, newline path)
  it("handles value with quote only", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("handles value with comma only", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  it("handles value with newline only", () => {
    expect(csvCell("a\nb")).toBe('"a\nb"');
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
