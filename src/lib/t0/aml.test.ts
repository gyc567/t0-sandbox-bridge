// aml.test.ts — 100% coverage for AML file review service.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateAmlFile,
  SandboxAmlReviewer,
  MAX_AML_FILE_SIZE,
  ALLOWED_AML_TYPES,
  sandboxAmlReviewer,
} from "./aml";

describe("validateAmlFile", () => {
  it("approves a valid PDF file", () => {
    const result = validateAmlFile("report.pdf", 1024, "application/pdf");
    expect(result).toEqual({ valid: true });
  });

  it("approves a valid PNG file", () => {
    const result = validateAmlFile("screenshot.png", 1024, "image/png");
    expect(result).toEqual({ valid: true });
  });

  it("approves a valid JPEG file", () => {
    const result = validateAmlFile("photo.jpg", 1024, "image/jpeg");
    expect(result).toEqual({ valid: true });
  });

  it("approves a valid JPG file", () => {
    const result = validateAmlFile("photo.jpg", 1024, "image/jpg");
    expect(result).toEqual({ valid: true });
  });

  it("rejects empty files (size = 0)", () => {
    const result = validateAmlFile("empty.pdf", 0, "application/pdf");
    expect(result).toEqual({ valid: false, reason: "File is empty" });
  });

  it("rejects negative file sizes", () => {
    const result = validateAmlFile("bad.pdf", -1, "application/pdf");
    expect(result).toEqual({ valid: false, reason: "File is empty" });
  });

  it("rejects files exceeding size limit", () => {
    const oversized = MAX_AML_FILE_SIZE + 1;
    const result = validateAmlFile("huge.pdf", oversized, "application/pdf");
    expect(result).toEqual({
      valid: false,
      reason: `File exceeds ${MAX_AML_FILE_SIZE / (1024 * 1024)} MB limit`,
    });
  });

  it("rejects files exactly at size limit + 1", () => {
    const result = validateAmlFile("huge.pdf", MAX_AML_FILE_SIZE + 1, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("accepts files exactly at size limit", () => {
    const result = validateAmlFile("max.pdf", MAX_AML_FILE_SIZE, "application/pdf");
    expect(result).toEqual({ valid: true });
  });

  it("rejects unsupported file types", () => {
    const result = validateAmlFile("script.exe", 1024, "application/x-msdownload");
    expect(result).toEqual({
      valid: false,
      reason: "Unsupported file type: application/x-msdownload",
    });
  });

  it("rejects text/plain files", () => {
    const result = validateAmlFile("notes.txt", 1024, "text/plain");
    expect(result.valid).toBe(false);
  });
});

describe("SandboxAmlReviewer", () => {
  let reviewer: SandboxAmlReviewer;

  beforeEach(() => {
    reviewer = new SandboxAmlReviewer();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("approves a normal filename", async () => {
    const promise = reviewer.review({
      paymentId: "pm_test",
      filename: "aml_report.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
    });
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result.status).toBe("approved");
    expect(result.message).toContain("passed");
    expect(result.message).toContain("aml_report.pdf");
  });

  it("rejects a filename containing 'reject' (lowercase)", async () => {
    const promise = reviewer.review({
      paymentId: "pm_test",
      filename: "aml_reject_report.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
    });
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result.status).toBe("rejected");
    expect(result.message).toContain("failed");
    expect(result.message).toContain("aml_reject_report.pdf");
  });

  it("rejects a filename containing 'REJECT' (uppercase)", async () => {
    const promise = reviewer.review({
      paymentId: "pm_test",
      filename: "AML_REJECT_DOC.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
    });
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result.status).toBe("rejected");
  });

  it("rejects a filename containing 'Reject' (mixed case)", async () => {
    const promise = reviewer.review({
      paymentId: "pm_test",
      filename: "Aml_Reject_File.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
    });
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result.status).toBe("rejected");
  });

  it("includes paymentId in the review input", async () => {
    const promise = reviewer.review({
      paymentId: "pm_abc123",
      filename: "report.pdf",
      fileSize: 2048,
      fileType: "image/png",
    });
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result.status).toBe("approved");
  });

  it("handles large file sizes gracefully", async () => {
    const promise = reviewer.review({
      paymentId: "pm_large",
      filename: "big.pdf",
      fileSize: MAX_AML_FILE_SIZE,
      fileType: "application/pdf",
    });
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result.status).toBe("approved");
  });
});

describe("sandboxAmlReviewer singleton", () => {
  it("is a SandboxAmlReviewer instance", () => {
    expect(sandboxAmlReviewer).toBeInstanceOf(SandboxAmlReviewer);
  });

  it("returns approved for normal files", async () => {
    const result = await sandboxAmlReviewer.review({
      paymentId: "pm_singleton",
      filename: "test.pdf",
      fileSize: 1024,
      fileType: "application/pdf",
    });
    expect(result.status).toBe("approved");
  });
});

describe("ALLOWED_AML_TYPES", () => {
  it("contains exactly 4 allowed types", () => {
    expect(ALLOWED_AML_TYPES.size).toBe(4);
  });

  it("includes all expected MIME types", () => {
    expect(ALLOWED_AML_TYPES.has("application/pdf")).toBe(true);
    expect(ALLOWED_AML_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_AML_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_AML_TYPES.has("image/jpg")).toBe(true);
  });
});

describe("MAX_AML_FILE_SIZE", () => {
  it("equals 10 MB in bytes", () => {
    expect(MAX_AML_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});
