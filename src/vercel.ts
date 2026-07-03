/**
 * Vercel server-side entry.
 *
 * Delegates to the shared SSR handler in server.ts (which also normalises
 * catastrophic h3 500 responses). Kept as a thin re-export so the Vercel
 * build pipeline can discover it without inheriting the wrapper.
 */
export { default } from "./server";
