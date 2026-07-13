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

/** Validate file before review */
export function validateAmlFile(
  filename: string,
  fileSize: number,
  fileType: string,
): { valid: true } | { valid: false; reason: string } {
  if (fileSize <= 0) {
    return { valid: false, reason: "File is empty" };
  }
  if (fileSize > MAX_AML_FILE_SIZE) {
    return { valid: false, reason: `File exceeds ${MAX_AML_FILE_SIZE / MB} MB limit` };
  }
  if (!ALLOWED_AML_TYPES.has(fileType)) {
    return { valid: false, reason: `Unsupported file type: ${fileType}` };
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
