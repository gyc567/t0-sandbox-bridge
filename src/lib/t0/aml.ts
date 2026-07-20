// AML file review service — high cohesion, single responsibility.
// Handles file upload validation and review result generation.
// Sandbox mode: simulated review (always approved unless filename contains "reject").
// Production extension point: swap the reviewer implementation.

const KB = 1_024;
const MB = 1_024 * KB;
const MS_DELAY = 100;
const MAX_SIZE_MB = 10;

export interface AmlFileReviewInput {
  paymentId: string;
  filename: string;
  fileSize: number;
  fileType: string;
  /** Actual decoded byte length. Used to verify fileSize matches the real payload. */
  decodedLength?: number;
  /** First few bytes of the file. Used for magic-byte verification. */
  magicBytes?: Uint8Array;
}

export type AmlReviewResult =
  | { status: "approved"; message: string }
  | { status: "rejected"; message: string };

export interface AmlFileReviewer {
  review(input: AmlFileReviewInput): Promise<AmlReviewResult>;
}

/** Maximum file size: 10 MB */
export const MAX_AML_FILE_SIZE = MAX_SIZE_MB * MB;

/** Allowed MIME types for AML documents */
export const ALLOWED_AML_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

/**
 * Magic-byte signatures for allowed types.
 * PDF: %PDF (0x25 0x50 0x44 0x46)
 * PNG: 89 50 4E 47 0D 0A 1A 0A
 * JPEG: FF D8 FF
 */
const MAGIC_SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/jpg", bytes: [0xff, 0xd8, 0xff] },
];

/** Validate file before review */
export function validateAmlFile(
  filename: string,
  fileSize: number,
  fileType: string,
  decodedLength?: number,
  magicBytes?: Uint8Array,
): { valid: true } | { valid: false; reason: string } {
  if (fileSize <= 0) {
    return { valid: false, reason: "File is empty" };
  }
  if (fileSize > MAX_AML_FILE_SIZE) {
    return { valid: false, reason: `File exceeds ${MAX_SIZE_MB} MB limit` };
  }
  if (!ALLOWED_AML_TYPES.has(fileType)) {
    return { valid: false, reason: `Unsupported file type: ${fileType}` };
  }
  // Verify claimed size matches actual decoded bytes
  if (decodedLength !== undefined && decodedLength !== fileSize) {
    return { valid: false, reason: `File size mismatch: claimed ${fileSize}, got ${decodedLength}` };
  }
  // Magic-byte verification: sniff the file header to guard against MIME spoofing
  if (magicBytes && magicBytes.length > 0) {
    const sig = MAGIC_SIGNATURES.find((s) => s.mime === fileType);
    if (sig && !sig.bytes.every((b, i) => magicBytes[i] === b)) {
      return { valid: false, reason: `File content does not match declared type: ${fileType}` };
    }
  }
  return { valid: true };
}

/** Sandbox reviewer: simulated AML check */
export class SandboxAmlReviewer implements AmlFileReviewer {
  async review(input: AmlFileReviewInput): Promise<AmlReviewResult> {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, MS_DELAY));

    // Sandbox heuristic: reject if filename contains "reject" (case-insensitive)
    const isRejected = input.filename.toLowerCase().includes("reject");

    if (isRejected) {
      return {
        status: "rejected",
        message: `AML review failed for ${input.filename}: high-risk indicators detected`,
      };
    }

    return {
      status: "approved",
      message: `AML review passed for ${input.filename}: no risk indicators`,
    };
  }
}

/** Singleton sandbox reviewer instance */
export const sandboxAmlReviewer: AmlFileReviewer = new SandboxAmlReviewer();
