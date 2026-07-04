import { MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";

// Sandbox-mode singleton (in-memory).
export const t0Client = new MockT0Client();
export const providerService = new PayoutProviderService(t0Client);
export const sandboxNetwork = new SandboxNetwork(providerService);

// Re-export all modules
export * from "./ecdsa";
export * from "./csv";
export * from "./events";
