import { HttpT0Client, MockT0Client } from "./client";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";

// Switch to real HTTP client when T0_NGROK_URL is configured; otherwise mock.
const ngrokUrl = process.env.T0_NGROK_URL;
const apiKey = process.env.T0_API_KEY;

export const t0Client = ngrokUrl && apiKey
  ? new HttpT0Client(ngrokUrl, apiKey)
  : new MockT0Client();

export const providerService = new PayoutProviderService(t0Client);
export const sandboxNetwork = new SandboxNetwork(providerService);

// Re-export all modules
export * from "./ecdsa";
export * from "./csv";
export * from "./events";
