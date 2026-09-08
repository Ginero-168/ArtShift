import { afterEach, describe, expect, it } from "vitest";
import {
  beginProcessingPreview,
  clearProcessingPreview,
  getProcessingPreview,
  getProcessingPreviewBounds,
  getProcessingPreviewById,
  getProcessingPreviewPlacement,
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

  it("starts an upscale preview at the duplicate position", () => {
    const id = beginProcessingPreview({
      kind: "upscale",
      label: "Upscale",
      ...getProcessingPreviewBounds({ x: 100, y: 80, width: 320, height: 220 }),
      progress: 0,
      sourceDataUrl: "data:image/png;base64,preview",
    });

    expect(getProcessingPreview()).toMatchObject({
      id,
      kind: "upscale",
      label: "Upscale",
      x: 452,
      y: 80,
      width: 320,
      height: 220,
      sourceDataUrl: "data:image/png;base64,preview",
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
      label: "Extract",
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

  it("supports an honest indeterminate provider phase", () => {
    const id = beginProcessingPreview({
      kind: "generate",
      label: "Generate",
      x: 100,
      y: 80,
      width: 320,
      height: 220,
      progress: 0,
    });

    updateProcessingPreview(id, { progress: null, message: "กำลังสร้างภาพ…" });

    expect(getProcessingPreview()).toMatchObject({
      id,
      progress: null,
      message: "กำลังสร้างภาพ…",
    });
  });

  it("keeps quality, preload and commit phases explicit", () => {
    const id = beginProcessingPreview({
      kind: "generate",
      label: "Generate",
      x: 100,
      y: 80,
      width: 320,
      height: 220,
      progress: null,
    });

    for (const phase of [
      "analyzing",
      "generating",
      "quality-check",
      "preloading",
      "committing",
    ] as const) {
      updateProcessingPreview(id, { phase });
      expect(getProcessingPreview()).toMatchObject({ id, phase });
    }
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

  it("updates coordinates and userDragged flag when preview is moved", () => {
    const id = beginProcessingPreview({
      kind: "remove-bg",
      label: "RemoveBG",
      x: 200,
      y: 150,
      width: 300,
      height: 250,
      progress: 0.2,
    });

    expect(getProcessingPreviewById(id)).toMatchObject({
      x: 200,
      y: 150,
    });
    expect(getProcessingPreviewById(id)?.userDragged).toBeUndefined();

    // Simulate drag movement
    updateProcessingPreview(id, {
      x: 450,
      y: 320,
      userDragged: true,
    });

    expect(getProcessingPreviewById(id)).toMatchObject({
      x: 450,
      y: 320,
      userDragged: true,
    });

    // Placement helper returns moved coordinates
    const placement = getProcessingPreviewPlacement(id, {
      x: 200,
      y: 150,
      width: 300,
      height: 250,
    });
    expect(placement).toEqual({
      x: 450,
      y: 320,
      width: 300,
      height: 250,
    });

    // Background progress update preserves dragged coordinates
    updateProcessingPreview(id, {
      progress: 0.79,
      message: "Refining foreground edges...",
    });

    expect(getProcessingPreviewById(id)).toMatchObject({
      x: 450,
      y: 320,
      userDragged: true,
      progress: 0.79,
      message: "Refining foreground edges...",
    });
  });

  it("returns fallback placement when preview id does not exist", () => {
    const fallback = { x: 100, y: 100, width: 200, height: 200 };
    expect(getProcessingPreviewPlacement("non-existent-id", fallback)).toBe(fallback);
    expect(getProcessingPreviewPlacement(undefined, fallback)).toBe(fallback);
  });
});
