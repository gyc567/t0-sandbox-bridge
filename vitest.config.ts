import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // AI First: every layer of the project gets its own test surface.
    // - lib tests = behavioural unit tests
    // - shared/contracts/*.test.ts = invariant regression tests
    // - shared/schema/*.contract.test.ts = schema round-trip tests (added later)
    // - test/*.test.ts = test-helper self-tests
    include: [
      "src/lib/**/*.test.ts",
      "src/lib/**/*.contract.test.ts",
      "src/shared/**/*.test.ts",
      "src/shared/**/*.contract.test.ts",
      "src/test/**/*.test.ts",
      "src/components/ofi/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.output/**", "**/.vercel/**"],
    environment: "happy-dom",
    // AI agents regenerate code frequently; a stale snapshot should fail loudly,
    // not silently pass. We surface the actual diff in test output.
    reporters: process.env.CI
      ? ["default", ["junit", { outputFile: "coverage/junit.xml" }]]
      : ["default"],
    // Bail on first failure in CI so AI agents see one fixable error at a time.
    bail: process.env.CI ? 1 : 0,
    // 30s default per test; longer-running paths should override per-file.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/t0/**/*.ts",
        "src/lib/theme/**/*.ts",
        "src/lib/playground/playback.ts",
        "src/shared/contracts/**/*.ts",
        "src/components/ofi/**/*.tsx",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.contract.test.ts",
        "src/lib/t0/index.ts",
        "src/lib/t0/t0.functions.ts",
      ],
      reporter: ["text", "text-summary", "json-summary", "html"],
      thresholds: {
        // Global thresholds intentionally set just below current legacy gaps so
        // CI stays green while the project backfills tests. New modules must
        // still hit the stricter per-directory threshold below.
        lines: 95,
        functions: 90,
        branches: 90,
        statements: 95,
        // AI First: newly-created shared layers must be exhaustively tested;
        // they have no legacy excuse for uncovered branches.
        perDirectory: {
          "src/shared/contracts": {
            lines: 100,
            functions: 100,
            branches: 95,
            statements: 100,
          },
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
