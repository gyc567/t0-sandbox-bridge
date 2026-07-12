// CSV export module for T-0 sandbox data.
// Handles proper escaping for commas, quotes, and newlines.

import type { NetworkEvent, Payment, Payout, Quote } from "./types";
import type { Snapshot } from "./provider";

/**
 * Escape a value for CSV.
 * - Wraps in double quotes if contains comma, quote, or newline
 * - Escapes internal double quotes by doubling them
 */
export function csvCell(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/** Join values into a CSV row */
export function toCSVRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/** Convert quotes array to CSV lines */
function quotesToCSV(quotes: Quote[]): string[] {
  const lines: string[] = ["=== Quotes ==="];
  lines.push(toCSVRow(["id", "currency", "band", "rate", "expiresAt", "createdAt"]));
  for (const q of quotes) {
    lines.push(toCSVRow([q.id, q.currency, q.band, q.rate, q.expiresAt, q.createdAt]));
  }
  return lines;
}

/** Convert payments array to CSV lines */
function paymentsToCSV(payments: Payment[]): string[] {
  const lines: string[] = ["=== Payments ==="];
  lines.push(
    toCSVRow([
      "id",
      "quoteId",
      "currency",
      "usdAmount",
      "localAmount",
      "beneficiaryRef",
      "status",
      "createdAt",
    ]),
  );
  for (const p of payments) {
    lines.push(
      toCSVRow([
        p.id,
        p.quoteId,
        p.currency,
        p.usdAmount,
        p.localAmount,
        p.beneficiaryRef,
        p.status,
        p.createdAt,
      ]),
    );
  }
  return lines;
}

/** Convert payouts array to CSV lines */
function payoutsToCSV(payouts: Payout[]): string[] {
  const lines: string[] = ["=== Payouts ==="];
  lines.push(toCSVRow(["id", "paymentId", "status", "reason", "updatedAt"]));
  for (const po of payouts) {
    lines.push(toCSVRow([po.id, po.paymentId, po.status, po.reason ?? "", po.updatedAt]));
  }
  return lines;
}

/** Extract ID from NetworkEvent */
function eventId(e: NetworkEvent): string {
  if ("quoteId" in e && e.quoteId !== undefined) return e.quoteId;
  if ("txHash" in e && e.txHash !== undefined) return e.txHash;
  if ("paymentId" in e && e.paymentId !== undefined) return e.paymentId;
  if ("payoutId" in e && e.payoutId !== undefined) return e.payoutId;
  if ("counterparty" in e && e.counterparty !== undefined) return e.counterparty;
  /* c8 ignore next */ return "";
}

/** Convert events array to CSV lines */
function eventsToCSV(events: NetworkEvent[]): string[] {
  const lines: string[] = ["=== Events ==="];
  lines.push(toCSVRow(["type", "id", "at", "extra"]));
  for (const e of events) {
    const extra = JSON.stringify(e).replace(/"/g, '""');
    lines.push(toCSVRow([e.type, eventId(e), e.at, extra]));
  }
  return lines;
}

// Re-export Snapshot type
export type { Snapshot } from "./provider";

/**
 * Convert a snapshot to CSV format.
 * Sections: Quotes, Payments, Payouts, Events
 */
export function snapshotToCSV(snapshot: Snapshot): string {
  const lines: string[] = [];

  lines.push(...quotesToCSV(snapshot.quotes));
  lines.push("");
  lines.push(...paymentsToCSV(snapshot.payments));
  lines.push("");
  lines.push(...payoutsToCSV(snapshot.payouts));
  lines.push("");
  lines.push(...eventsToCSV(snapshot.events));

  return lines.join("\n");
}

/**
 * Generate filename with current date.
 */
export function csvFilename(prefix = "t0-sandbox"): string {
  const date = new Date().toISOString().split("T")[0];
  return `${prefix}-${date}.csv`;
}

/**
 * Trigger browser download of CSV content.
 * Only works in browser environment.
 */
export function downloadCSV(content: string, filename: string): void {
  /* c8 ignore start */
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  /* c8 ignore stop */
}
