// OfiManualAmlPanel.test.tsx — React component tests for the OFI manual-AML
// flow (Phase 7 rewrite: OFI-trigger + OFI-upload + Provider-review).
//
// Most cases use SSR via renderToStaticMarkup. Handler tests use
// @testing-library/react + happy-dom.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  OfiManualAmlPanel,
  classifyOfiRow,
  runOfiUpload,
} from "./OfiManualAmlPanel";
import type { Payment } from "@/lib/t0/types";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pm_ofi_001",
    quoteId: "qt_ofi_001",
    currency: "EUR",
    usdAmount: 1000,
    localAmount: 920,
    beneficiaryRef: "BEN-OFI-001",
    status: "pending",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("classifyOfiRow (pure)", () => {
  it("returns 'trigger' for status pending", () => {
    expect(classifyOfiRow(makePayment({ status: "pending" }))).toEqual({ kind: "trigger" });
  });

  it("returns 'upload' for status pending_aml with no amlFile", () => {
    expect(classifyOfiRow(makePayment({ status: "pending_aml" }))).toEqual({ kind: "upload" });
  });

  it("returns 'waiting' for status pending_aml with amlFile", () => {
    const p = makePayment({
      status: "pending_aml",
      amlFile: {
        filename: "r.pdf",
        fileSize: 1,
        fileType: "application/pdf",
        uploadedAt: 0,
      },
    });
    expect(classifyOfiRow(p)).toEqual({ kind: "waiting" });
  });

  it("returns 'hidden' for terminal statuses (accepted/rejected/confirmed)", () => {
    expect(classifyOfiRow(makePayment({ status: "accepted" }))).toEqual({ kind: "hidden" });
    expect(classifyOfiRow(makePayment({ status: "rejected" }))).toEqual({ kind: "hidden" });
    expect(classifyOfiRow(makePayment({ status: "confirmed" }))).toEqual({ kind: "hidden" });
  });
});

describe("OfiManualAmlPanel — structural", () => {
  const onTriggerAml = vi.fn();
  const onUploadAmlFile = vi.fn(async () => {});

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders empty state when no payments", () => {
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(html).toContain("No payments eligible for manual AML");
  });

  it("renders the AML banner on every render", () => {
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(html).toContain("Sandbox is configured to require AML");
    expect(html).toContain("09a");
    expect(html).toContain("Payment-Manual AML (OFI view)");
  });

  it("renders a Trigger AML button for status=pending payments", () => {
    const p = makePayment({ id: "pm_trig", status: "pending" });
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[p]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(html).toContain('data-testid="ofi-trigger-section"');
    expect(html).toContain('data-testid="ofi-trigger-aml-pm_trig"');
    expect(html).toContain("Trigger AML");
  });

  it("renders a file input + Upload & Submit button for status=pending_aml with no file", () => {
    const p = makePayment({ id: "pm_up", status: "pending_aml" });
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[p]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(html).toContain('data-testid="ofi-upload-section"');
    expect(html).toContain('data-testid="ofi-aml-file-input-pm_up"');
    expect(html).toContain('data-testid="ofi-aml-upload-pm_up"');
    expect(html).toContain('type="file"');
    expect(html).toContain("Upload &amp; Submit");
  });

  it("renders a waiting hint for status=pending_aml with amlFile", () => {
    const p = makePayment({
      id: "pm_wait",
      status: "pending_aml",
      amlFile: {
        filename: "report.pdf",
        fileSize: 1024,
        fileType: "application/pdf",
        uploadedAt: 1_700_000_000_000,
      },
    });
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[p]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(html).toContain('data-testid="ofi-waiting-section"');
    expect(html).toContain('data-testid="ofi-waiting-row-pm_wait"');
    expect(html).toContain("report.pdf");
    expect(html).toContain("1.0 KB");
    expect(html).toContain("awaiting Provider review");
    // No file input or trigger button on a waiting row
    expect(html).not.toContain('data-testid="ofi-aml-file-input-pm_wait"');
    expect(html).not.toContain('data-testid="ofi-aml-upload-pm_wait"');
    expect(html).not.toContain('data-testid="ofi-trigger-aml-pm_wait"');
  });

  it("formats amlFile sizes in B / KB / MB units on the waiting row", () => {
    const makeWith = (bytes: number, id: string): Payment =>
      makePayment({
        id,
        status: "pending_aml",
        amlFile: {
          filename: "x",
          fileSize: bytes,
          fileType: "application/pdf",
          uploadedAt: 0,
        },
      });
    const htmlB = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[makeWith(500, "pm_b")]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(htmlB).toContain("500 B");
    const htmlMB = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[makeWith(3 * 1024 * 1024, "pm_mb")]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(htmlMB).toContain("3.0 MB");
  });

  it("renders all three sections when payments span the three states", () => {
    const triggerP = makePayment({ id: "pm_t", status: "pending" });
    const uploadP = makePayment({ id: "pm_u", status: "pending_aml" });
    const waitingP = makePayment({
      id: "pm_w",
      status: "pending_aml",
      amlFile: {
        filename: "w.pdf",
        fileSize: 1,
        fileType: "application/pdf",
        uploadedAt: 0,
      },
    });
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[triggerP, uploadP, waitingP]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(html).toContain('data-testid="ofi-waiting-section"');
    expect(html).toContain('data-testid="ofi-upload-section"');
    expect(html).toContain('data-testid="ofi-trigger-section"');
  });

  it("hides terminal-status payments entirely", () => {
    const accepted = makePayment({ id: "pm_done", status: "accepted" });
    const confirmed = makePayment({ id: "pm_paid", status: "confirmed" });
    const rejected = makePayment({ id: "pm_no", status: "rejected" });
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[accepted, confirmed, rejected]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    expect(html).toContain("No payments eligible for manual AML");
    expect(html).not.toContain('data-testid="ofi-trigger-aml-pm_done"');
    expect(html).not.toContain('data-testid="ofi-trigger-aml-pm_paid"');
    expect(html).not.toContain('data-testid="ofi-trigger-aml-pm_no"');
  });

  it("disables the Trigger AML button when busy", () => {
    const p = makePayment({ id: "pm_busy", status: "pending" });
    const html = renderToStaticMarkup(
      <OfiManualAmlPanel
        payments={[p]}
        busy={true}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    const withoutClass = html.replace(/class="[^"]*"/g, "");
    expect(withoutClass).toMatch(
      /<button[^>]*\bdisabled\b[^>]*data-testid="ofi-trigger-aml-pm_busy"/,
    );
  });
});

// ── Handler-driven tests (happy-dom) ────────────────────────────────────

describe("OfiManualAmlPanel — handler interactions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("clicking Trigger AML invokes onTriggerAml with the payment", () => {
    const onTriggerAml = vi.fn();
    const onUploadAmlFile = vi.fn(async () => {});
    const p = makePayment({ id: "pm_click", status: "pending" });
    const { getByTestId } = render(
      <OfiManualAmlPanel
        payments={[p]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    fireEvent.click(getByTestId("ofi-trigger-aml-pm_click"));
    expect(onTriggerAml).toHaveBeenCalledTimes(1);
    expect(onTriggerAml).toHaveBeenCalledWith(p);
  });

  it("clicking Upload & Submit calls onUploadAmlFile(paymentId, file)", () => {
    const onTriggerAml = vi.fn();
    const onUploadAmlFile = vi.fn(async () => {});
    const p = makePayment({ id: "pm_file", status: "pending_aml" });
    const { getByTestId } = render(
      <OfiManualAmlPanel
        payments={[p]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    fireEvent.change(getByTestId("ofi-aml-file-input-pm_file"), {
      target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(getByTestId("ofi-aml-upload-pm_file"));
    expect(onUploadAmlFile).toHaveBeenCalledTimes(1);
    expect(onUploadAmlFile).toHaveBeenCalledWith("pm_file", expect.any(File));
  });

    it("surfaces an error message when the upload callback throws", async () => {
    const onTriggerAml = vi.fn();
    const onUploadAmlFile = vi.fn(async () => {
      throw new Error("kaboom");
    });
    const p = makePayment({ id: "pm_err", status: "pending_aml" });
    const { getByTestId, findByText } = render(
      <OfiManualAmlPanel
        payments={[p]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    fireEvent.change(getByTestId("ofi-aml-file-input-pm_err"), {
      target: { files: [new File(["x"], "explode.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(getByTestId("ofi-aml-upload-pm_err"));
    const err = await findByText(/kaboom/);
    expect(err).toBeDefined();
  });

  it("clearing the file input resets the selected file", () => {
    const onTriggerAml = vi.fn();
    const onUploadAmlFile = vi.fn(async () => {});
    const p = makePayment({ id: "pm_clear", status: "pending_aml" });
    const { getByTestId } = render(
      <OfiManualAmlPanel
        payments={[p]}
        busy={false}
        onTriggerAml={onTriggerAml}
        onUploadAmlFile={onUploadAmlFile}
      />,
    );
    // First select a file (button enabled)
    fireEvent.change(getByTestId("ofi-aml-file-input-pm_clear"), {
      target: { files: [new File(["x"], "first.pdf", { type: "application/pdf" })] },
    });
    expect(
      (getByTestId("ofi-aml-upload-pm_clear") as HTMLButtonElement).disabled,
    ).toBe(false);
    // Clear the input (e.target.files is null)
    fireEvent.change(getByTestId("ofi-aml-file-input-pm_clear"), {
      target: { files: null },
    });
    // Upload button is back to disabled.
    expect(
      (getByTestId("ofi-aml-upload-pm_clear") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("runOfiUpload: no file selected returns inline error and never calls the callback", async () => {
    const onUploadAmlFile = vi.fn(async () => {});
    const out = await runOfiUpload({
      paymentId: "pm_x",
      selectedFile: null,
      onUploadAmlFile,
    });
    expect(out.error).toBe("Please select an AML file first");
    expect(onUploadAmlFile).not.toHaveBeenCalled();
  });

  it("runOfiUpload: with a file, awaits the callback and returns no error", async () => {
    const onUploadAmlFile = vi.fn(async () => {});
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const out = await runOfiUpload({
      paymentId: "pm_x",
      selectedFile: file,
      onUploadAmlFile,
    });
    expect(onUploadAmlFile).toHaveBeenCalledWith("pm_x", file);
    expect(out.error).toBeNull();
  });

  it("runOfiUpload: callback throw returns the error message", async () => {
    const onUploadAmlFile = vi.fn(async () => {
      throw new Error("kaboom");
    });
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const out = await runOfiUpload({
      paymentId: "pm_x",
      selectedFile: file,
      onUploadAmlFile,
    });
    expect(out.error).toBe("kaboom");
  });

  it("runOfiUpload: non-Error throws produce a generic message", async () => {
    const onUploadAmlFile = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "string-only";
    });
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const out = await runOfiUpload({
      paymentId: "pm_x",
      selectedFile: file,
      onUploadAmlFile,
    });
    expect(out.error).toBe("Upload failed");
  });
});