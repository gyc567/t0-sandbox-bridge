import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/t0/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/t0/**/*.ts"],
      exclude: ["src/lib/t0/**/*.test.ts", "src/lib/t0/index.ts", "src/lib/t0/t0.functions.ts"],
      reporter: ["text", "text-summary", "json-summary"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
