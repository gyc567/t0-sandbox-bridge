import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "coverage", ".vercel"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // ============================================================
  // AI First guardrails — production source under src/lib + src/shared
  // These rules block the most common AI shortcuts so generated code
  // must use the contracts layer / explicit types instead.
  // ============================================================
  {
    files: ["src/lib/**/*.ts", "src/lib/**/*.tsx", "src/shared/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.contract.test.ts"],
    rules: {
      // Force explicit types — the AI "escape hatch" `any` is never acceptable
      // in production code. Use `unknown` + a schema check if you really don't
      // know the shape.
      "@typescript-eslint/no-explicit-any": "error",
      // Note: the no-unsafe-* rules require type-aware linting (parserOptions.project)
      // which we don't enable because it triples lint time. Enforce manually via
      // code review + the contract tests instead.
      // Magic numbers in financial / crypto code are how AI introduces bugs.
      // Use named constants from src/shared/contracts instead.
      "no-magic-numbers": ["warn", { ignore: [-1, 0, 1, 2, 1_024], ignoreArrayIndexes: true }],
      // Drift toward `// eslint-disable` — never acceptable in production.
      "no-warning-comments": [
        "warn",
        { terms: ["eslint-disable", "todo", "fixme", "xxx"], location: "start" },
      ],
    },
  },
  // ============================================================
  // Tests are allowed to be more permissive.
  // ============================================================
  {
    files: ["**/*.test.ts", "**/*.contract.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "no-magic-numbers": "off",
    },
  },
  eslintPluginPrettier,
);
