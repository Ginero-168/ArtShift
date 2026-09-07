import { beforeEach, describe, expect, it, vi } from "vitest";

const getCachedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/engine/imageCache", () => ({ getCached: getCachedMock }));
vi.mock("@/lib/vision/assetAnalysisBrowser", () => ({ getAssetAnalysis: vi.fn(() => undefined) }));
vi.mock("@/lib/ai/orchestration/visibleReferenceRenderer", () => ({
  renderVisibleReference: vi.fn(() => ({
    dataUrl: "data:image/png;base64,VISIBLE_RENDER",
    width: 400,
    height: 300,
    limitations: ["test visible render"],
  })),
}));
vi.mock("@/lib/vision/visionEngine", () => ({
  visionCaption: vi.fn(),
  visionDetect: vi.fn(),
  visionOcr: vi.fn(),
}));

import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import {
  analyzeImageReference,
  analyzeImageReferences,
} from "@/lib/ai/orchestration/referenceAnalysis";

const ref: ComposerImageRef = {
  objectId: "image-1",
  elementVersion: 3,
  fileId: "file-1",
  displayName: "product.png",
  sourceWidth: 800,
  sourceHeight: 600,
  width: 400,
  height: 300,
  angle: 0,
};

function analyzers() {
  return {
    caption: vi.fn(async () => "a red coffee mug"),
    detect: vi.fn(async () => ({ objects: [{ label: "mug" }, { label: "table" }] })),
    ocr: vi.fn(async () => "SALE 20%"),
    asset: vi.fn(() => undefined),
  };
}

describe("local selected-image analysis", () => {
  beforeEach(() => {
    getCachedMock.mockReset();
  });

  it("returns task-safe semantic metadata without returning raw image bytes", async () => {
    getCachedMock.mockReturnValue({
      dataURL: "data:image/png;base64,SECRET_IMAGE_BYTES",
      width: 800,
      height: 600,
    });
    const configuredAnalyzers = analyzers();
    const result = await analyzeImageReference(
      ref,
      new AbortController().signal,
      undefined,
      configuredAnalyzers,
    );

    expect(result).toMatchObject({
      ref: { objectId: "image-1", elementVersion: 3, displayName: "product.png" },
      caption: "a red coffee mug",
      objects: ["mug", "table"],
      visibleText: "SALE 20%",
      dimensions: { width: 400, height: 300 },
      limitations: ["test visible render"],
    });
    expect(configuredAnalyzers.caption).toHaveBeenCalledWith(
      "data:image/png;base64,VISIBLE_RENDER",
      "detailed",
      expect.any(Function),
    );
    expect(JSON.stringify(result)).not.toContain("SECRET_IMAGE_BYTES");
  });

  it("analyzes multiple references sequentially and honors cancellation before the next one", async () => {
    getCachedMock.mockReturnValue({ dataURL: "data:image/png;base64,AA==", width: 10, height: 10 });
    const controller = new AbortController();
    const onProgress = vi.fn((_completed: number, _total: number, _stage: string) => {
      if (_completed > 1) controller.abort();
    });
    await expect(
      analyzeImageReferences(
        [ref, { ...ref, objectId: "image-2", fileId: "file-2" }],
        controller.signal,
        onProgress,
        analyzers(),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops before reading the cache when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzeImageReference(ref, controller.signal, undefined, analyzers()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(getCachedMock).not.toHaveBeenCalled();
  });
});
