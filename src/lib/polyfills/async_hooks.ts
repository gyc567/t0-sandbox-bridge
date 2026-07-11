// Browser polyfill for node:async_hooks
// Prevents "AsyncLocalStorage is not a constructor" in TanStack Start + React 19
export class AsyncLocalStorage {
  getStore() { return undefined; }
  run(_store: unknown, callback: (...args: unknown[]) => unknown, ...args: unknown[]) {
    return callback(...args);
  }
  enterWith(_store: unknown) {}
  disable() {}
}
export const asyncLocalStorage = new AsyncLocalStorage();
