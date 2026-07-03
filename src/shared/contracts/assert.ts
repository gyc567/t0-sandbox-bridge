/**
 * Core invariant assertions.
 *
 * Used to encode business rules / structural invariants as named, reusable
 * functions. AI agents should reference these rather than re-deriving the
 * check inline, so the rule lives in exactly one place.
 *
 * Style note: every assertion here throws a plain `Error` with a stable
 * prefix (`[contract]`) so tests and runtime can grep / match reliably.
 */

export class ContractError extends Error {
  readonly tag = "ContractError" as const;
  constructor(
    public readonly rule: string,
    message: string,
  ) {
    super(`[contract:${rule}] ${message}`);
    this.name = "ContractError";
  }
}

/** Narrow a possibly-undefined value, throwing if undefined/null. */
export function assertDefined<T>(value: T, label = "value"): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new ContractError("defined", `${label} must be defined`);
  }
}

/** Exhaustiveness check for discriminated unions / switch defaults. */
export function assertNever(x: never, label = "value"): never {
  throw new ContractError("never", `unexpected ${label}: ${JSON.stringify(x)}`);
}

/** TypeScript "this should be unreachable" guard. */
export function assertUnreachable(label = "unreachable"): never {
  throw new ContractError("unreachable", label);
}

/** Boolean invariant — use sparingly, prefer a named rule. */
export function assert(condition: boolean, rule: string, message: string): asserts condition {
  if (!condition) {
    throw new ContractError(rule, message);
  }
}

/** String must be non-empty after trim. Returns the trimmed value. */
export function assertNonEmpty(value: string, label = "string"): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ContractError("non-empty", `${label} must be non-empty`);
  }
  return trimmed;
}
