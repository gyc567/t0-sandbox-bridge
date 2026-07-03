/**
 * Numeric / decimal invariants.
 *
 * We deliberately avoid `number` for monetary amounts in favour of `bigint`
 * (for wei-style fixed point) or string-encoded decimals. This module enforces
 * the rules an AI should follow when touching money, prices, quantities.
 */

const HEX_RE = /^0x[0-9a-fA-F]+$/;

/** Positive finite number — useful for counts, ms, ratios. */
export function assertPositiveNumber(value: number, label = "number"): number {
  if (!Number.isFinite(value)) {
    throw new Error(`[contract:positive] ${label} must be finite, got ${value}`);
  }
  if (value <= 0) {
    throw new Error(`[contract:positive] ${label} must be > 0, got ${value}`);
  }
  return value;
}

/** Non-negative finite number (zero allowed). */
export function assertNonNegativeNumber(value: number, label = "number"): number {
  if (!Number.isFinite(value)) {
    throw new Error(`[contract:non-negative] ${label} must be finite, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`[contract:non-negative] ${label} must be >= 0, got ${value}`);
  }
  return value;
}

/** Strictly positive bigint — use for wei/satoshi style amounts. */
export function assertPositiveBigInt(value: bigint, label = "bigint"): bigint {
  if (value <= 0n) {
    throw new Error(`[contract:positive-bigint] ${label} must be > 0n, got ${value}`);
  }
  return value;
}

/** Hex string with optional 0x prefix, any length. */
export function assertHex(value: string, label = "string"): string {
  if (typeof value !== "string" || !HEX_RE.test(value)) {
    throw new Error(`[contract:hex] ${label} must be hex, got ${JSON.stringify(value)}`);
  }
  return value.toLowerCase();
}

/** Hex string with exactly N bytes (2N + 2 chars including 0x). */
export function assertHexBytes(value: string, bytes: number, label = "string"): string {
  assertHex(value, label);
  const expected = 2 + bytes * 2;
  if (value.length !== expected) {
    throw new Error(
      `[contract:hex-bytes] ${label} must be ${bytes} bytes (${expected} chars), got ${value.length}`,
    );
  }
  return value.toLowerCase();
}

/** Unix timestamp in milliseconds — sanity-bounded to avoid obviously bad values. */
export function assertTimestampMs(value: number, label = "timestamp"): number {
  if (!Number.isInteger(value)) {
    throw new Error(`[contract:timestamp] ${label} must be an integer, got ${value}`);
  }
  // 2001-01-01 .. 2100-01-01 — wide but excludes 0/garbage
  const MIN = 978_307_200_000;
  const MAX = 4_102_444_800_000;
  if (value < MIN || value > MAX) {
    throw new Error(`[contract:timestamp] ${label} out of range, got ${value}`);
  }
  return value;
}
