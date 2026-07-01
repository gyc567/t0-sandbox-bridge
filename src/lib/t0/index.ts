import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";

// Sandbox-mode singleton (in-memory).
export const t0Client = new MockT0Client();
export const providerService = new PayoutProviderService(t0Client);

// Re-export all modules
export * from "./ecdsa";
export * from "./csv";
export * from "./events";
