import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: [
      "src/lib/t0/**/*.test.ts",
      "src/lib/theme/**/*.test.ts",
      "src/lib/playground/**/*.test.ts",
    ],
    environment: "happy-dom",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/t0/**/*.ts",
        "src/lib/theme/**/*.ts",
        "src/lib/playground/playback.ts",
      ],
      exclude: [
        "src/lib/t0/**/*.test.ts",
        "src/lib/t0/index.ts",
        "src/lib/t0/t0.functions.ts",
        "src/lib/theme/**/*.test.ts",
        "src/lib/playground/**/*.test.ts",
      ],
      reporter: ["text", "text-summary", "json-summary"],
      thresholds: {
        lines: 100,
        functions: 95,
        branches: 90,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});