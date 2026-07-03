/**
 * Contract test helpers — AI regression primitives.
 *
 * Goals:
 * - one canonical way to assert "this value matches this schema"
 * - fixtures are deterministic so AI-generated code produces stable diffs
 * - structured snapshots so AI reviews show *what* changed, not just that it did
 */

import type { ZodSchema, ZodTypeAny, z } from "zod";
import { expect } from "vitest";

/**
 * Assert that a value matches a Zod schema. Returns the parsed value with the
 * correct type. On failure, throws with the full Zod issues so AI agents can
 * fix the root cause without a guessing game.
 */
export function assertContract<S extends ZodTypeAny>(
  schema: S,
  value: unknown,
  label = "value",
): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = JSON.stringify(result.error.issues, null, 2);
    throw new Error(`[contract:${label}] schema mismatch:\n${issues}`);
  }
  return result.data;
}

/**
 * Round-trip a value through schema parse + stringify so we exercise the
 * serialization boundary as well as structural validity. Useful for AI
 * regressions on JSON-shaped payloads.
 */
export function assertContractRoundtrip<S extends ZodSchema<unknown>>(
  schema: S,
  value: unknown,
  label = "value",
): z.infer<S> {
  const json = JSON.parse(JSON.stringify(value));
  const back = assertContract(schema, json, label);
  expect(back).toEqual(value);
  return back;
}

/**
 * Type-level helper so callers can declare a fixture's type from its schema
 * without re-writing it.
 *
 * Usage:
 *   const OrderSchema = z.object({ id: z.string(), total: z.number() });
 *   type Order = SchemaOf<typeof OrderSchema>;
 */
export type SchemaOf<S extends ZodTypeAny> = z.infer<S>;
