// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    serverFns: {
      // CSRF protection is intentionally handled outside TanStack Start's middleware
      // (see security notes). Suppress the framework warning to keep the dev log clean.
      disableCsrfMiddlewareWarning: true,
    },
  },
  // Vercel deployment configuration
  nitro: {
    preset: "vercel",
  },
  vite: {
    resolve: {
      alias: {
        // Prevent node:async_hooks from leaking into client bundle (TanStack Start + React 19 bug)
        "node:async_hooks": "/src/lib/polyfills/async_hooks.ts",
        "async_hooks": "/src/lib/polyfills/async_hooks.ts",
      },
    },
  },
});
