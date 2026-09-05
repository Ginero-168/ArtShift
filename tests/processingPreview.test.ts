import { afterEach, describe, expect, it } from "vitest";
import {
  beginProcessingPreview,
  clearProcessingPreview,
  getProcessingPreview,
  getProcessingPreviewBounds,
  getProcessingPreviews,
  updateProcessingPreview,
} from "@/lib/engine/processingPreview";

describe("transient processing preview", () => {
  afterEach(() => {
    for (const preview of [...getProcessingPreviews()]) {
      clearProcessingPreview(preview.id);
    }
  });

  it("creates a transient preview with its canvas placement and loading state", () => {
    const id = beginProcessingPreview({
      kind: "vectorize",
      label: "Vectorize",
      x: 900,
      y: 120,
      width: 240,
      height: 180,
      progress: 0,
      sourceDataUrl: "data:image/png;base64,preview",
    });

    expect(getProcessingPreview()).toMatchObject({
      id,
      kind: "vectorize",
      x: 900,
      y: 120,
      width: 240,
      height: 180,
      progress: 0,
      sourceDataUrl: "data:image/png;base64,preview",
    });
  });

  it("places the duplicate to the right while preserving the source size", () => {
    expect(getProcessingPreviewBounds({ x: 120, y: 80, width: 640, height: 360 })).toEqual({
      x: 792,
      y: 80,
      width: 640,
      height: 360,
    });
  });

  it("keeps queued previews visible alongside the active preview", () => {
    const firstId = beginProcessingPreview({
      kind: "vectorize",
      label: "Vectorize 1",
      x: 100,
      y: 80,
      width: 640,
      height: 360,
      progress: 0.4,
      phase: "running",
    });
    const secondId = beginProcessingPreview({
      kind: "extract",
      label: "Extract 2",
      x: 900,
      y: 80,
      width: 640,
      height: 360,
      progress: 0,
      phase: "queued",
      queuePosition: 1,
    });

    expect(getProcessingPreviews().map((item) => item.id)).toEqual([firstId, secondId]);
    clearProcessingPreview(firstId);
    expect(getProcessingPreviews().map((item) => item.id)).toEqual([secondId]);
  });

  it("updates progress without creating a second preview", () => {
    const id = beginProcessingPreview({
      kind: "extract",
      label: "Extract All",
      x: 500,
      y: 100,
      width: 220,
      height: 160,
      progress: 0.1,
    });

    updateProcessingPreview(id, { progress: 0.72, message: "Finding objects…" });

    expect(getProcessingPreview()).toMatchObject({
      id,
      progress: 0.72,
      message: "Finding objects…",
    });
  });

  it("clears only the matching request so cancellation cannot leave a stale preview", () => {
    const firstId = beginProcessingPreview({
      kind: "remove-bg",
      label: "Remove BG",
      x: 300,
      y: 80,
      width: 200,
      height: 150,
      progress: 0,
    });
    const secondId = beginProcessingPreview({
      kind: "vectorize",
      label: "Vectorize",
      x: 600,
      y: 80,
      width: 200,
      height: 150,
      progress: 0,
    });

    clearProcessingPreview(firstId);
    expect(getProcessingPreview()?.id).toBe(secondId);
    clearProcessingPreview(secondId);
    expect(getProcessingPreview()).toBeNull();
  });
});
