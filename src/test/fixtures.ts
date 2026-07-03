/**
 * Deterministic test fixtures.
 *
 * Why seeded: AI-generated tests should produce *stable* diffs. A fixture
 * based on `Math.random()` forces a snapshot churn every run and hides real
 * regressions. Use these instead.
 */

/** A predictable 32-byte private key (NOT a real key, just a test vector). */
export const TEST_PRIVATE_KEY = "0x" + "01".repeat(32);

/** A predictable compressed public key matching TEST_PRIVATE_KEY (test vector only). */
export const TEST_PUBLIC_KEY = "0x" + "02" + "22".repeat(32);

/** A predictable 32-byte hash. */
export const TEST_HASH = "0x" + "33".repeat(32);

/** A predictable 64-byte signature. */
export const TEST_SIGNATURE = "0x" + "11".repeat(64);

/** A predictable timestamp (2023-11-14T22:13:20.000Z). */
export const TEST_TIMESTAMP_MS = 1_700_000_000_000;

/** A predictable JSON body. */
export const TEST_BODY = JSON.stringify({ test: "data", n: 1 });

/**
 * Tiny linear-congruential PRNG. Deterministic across runs and platforms,
 * no `Date.now()` leak. Use this when you need a "random" value but want the
 * snapshot to be stable.
 */
export function makePrng(seed = 0xdeadbeef): () => number {
  let state = seed >>> 0;
  return () => {
    // Numerical Recipes constants
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Pick N elements from `arr` deterministically. */
export function pickN<T>(arr: readonly T[], n: number, rng = makePrng()): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}
