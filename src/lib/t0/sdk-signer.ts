// Thin wrapper that validates a hex-encoded private key up-front and surfaces
// a domain-specific error. The actual signing is delegated to the SDK's
// createClient, which accepts a hex string directly (see SDK signature:
//   createClient(signer: string | Buffer | (data) => Promise<Signature>, ...))

export class SignerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignerConfigError";
  }
}

/**
 * Validate a hex-encoded private key. Returns the normalised key (with 0x prefix).
 * Throws `SignerConfigError` on malformed input. Callers should pass the
 * return value to `createSdkNetworkClient`.
 */
export function normalisePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new SignerConfigError(
      "Provider private key must be 64 hex characters (with optional 0x prefix)",
    );
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}
