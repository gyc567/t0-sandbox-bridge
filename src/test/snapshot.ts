/**
 * Structured snapshot helpers.
 *
 * Vitest's built-in `toMatchSnapshot()` is fine, but it writes raw serialized
 * text that AI reviewers can't easily diff against the "intent". These helpers
 * normalise common cases so the snapshot shows *what* a value is, not just
 * how it serialises.
 */

import { expect } from "vitest";

/**
 * Assert a snapshot that omits volatile fields (timestamps, hashes).
 * Pass `mask` as a list of dotted paths (objects) or substring needles (strings)
 * to replace with the literal "<masked>".
 *
 * - For object values: each entry is treated as a dotted path; the leaf is replaced.
 * - For string values: each entry is treated as a literal substring to redact.
 * - For other primitives: mask is ignored.
 */
export function assertStableSnapshot<T>(
  actual: T,
  mask: readonly string[] = [],
  hint?: string,
): void {
  const masked = mask.length === 0 ? actual : applyMask(actual, mask);
  expect(masked).toMatchSnapshot(hint);
}

function applyMask(value: unknown, mask: readonly string[]): unknown {
  if (mask.length === 0) return value;
  if (typeof value === "string") {
    let out = value;
    for (const needle of mask) {
      out = out.split(needle).join("<masked>");
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    const out = structuredClone(value);
    for (const path of mask) {
      setByPath(out, path, "<masked>");
    }
    return out;
  }
  return value;
}

function setByPath(target: unknown, dotted: string, value: unknown): void {
  const parts = dotted.split(".");
  let cursor: unknown = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor == null || typeof cursor !== "object") return;
    cursor = (cursor as Record<string, unknown>)[parts[i]!];
  }
  if (cursor == null || typeof cursor !== "object") return;
  (cursor as Record<string, unknown>)[parts[parts.length - 1]!] = value;
}

/**
 * Diff two values structurally with a readable message. Useful when you want
 * to fail loudly with a *labelled* diff rather than vitest's default deep
 * equality output.
 */
export function assertStructurallyEqual<T>(actual: T, expected: T, label = "value"): void {
  const aJson = JSON.stringify(actual, null, 2);
  const eJson = JSON.stringify(expected, null, 2);
  if (aJson !== eJson) {
    throw new Error(
      `[struct:${label}] mismatch\n--- expected ---\n${eJson}\n--- actual ---\n${aJson}\n`,
    );
  }
}
