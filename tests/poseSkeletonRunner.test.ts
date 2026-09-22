import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PoseSkeletonRunner } from "@/components/Canvas/PropertiesPanel/PoseSkeletonRunner";
import { getProcessingPreview } from "@/lib/engine/processingPreview";
import type { ImageElement } from "@/lib/engine/types";
import { releaseImageActionRun } from "@/lib/vision/imageActionRunGuard";
import { detectHumanPoses } from "@/lib/vision/poseLandmarker";
import { POSE_SKELETON_MODEL_MESSAGE } from "@/lib/vision/poseSkeleton";

vi.mock("@/lib/vision/poseLandmarker", () => ({
  detectHumanPoses: vi.fn(),
}));

vi.mock("@/lib/engine/imageCache", () => ({
  getCached: vi.fn(() => ({
    fileId: "file-1",
    dataURL: "data:image/png;base64,aaa",
    img: { width: 100, height: 80 },
    width: 100,
    height: 80,
  })),
  preloadDataURL: vi.fn(async () => ({ dataURL: "data:image/png;base64,aaa" })),
  loadDataURL: vi.fn(),
}));

function imageElement(id: string): ImageElement {
  return {
    id,
    type: "image",
    fileId: "file-1",
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    naturalWidth: 100,
    naturalHeight: 80,
    crop: null,
    angle: 0,
    flipX: false,
    flipY: false,
    sourceName: "photo",
    status: "loaded",
  } as ImageElement;
}

function modelError(): Error {
  const error = new Error("Pose detection timed out.");
  error.name = "PoseModelError";
  return error;
}

afterEach(() => {
  cleanup();
  releaseImageActionRun("skeleton:img-model");
  releaseImageActionRun("skeleton:img-abort");
  vi.mocked(detectHumanPoses).mockReset();
});

describe("Pose skeleton runner failures", () => {
  it("alerts the Thai model message and clears Preload when detection fails", async () => {
    window.alert = vi.fn();
    vi.mocked(detectHumanPoses).mockImplementation(async (_image, options) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(getProcessingPreview()?.kind).toBe("skeleton");
      throw modelError();
    });
    const onComplete = vi.fn();
    render(
      createElement(PoseSkeletonRunner, {
        element: imageElement("img-model"),
        onComplete,
      }),
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(window.alert).toHaveBeenCalledWith(`Skeleton ไม่สำเร็จ: ${POSE_SKELETON_MODEL_MESSAGE}`);
    expect(getProcessingPreview()).toBeNull();
  });

  it("clears Preload without an alert when the job is aborted", async () => {
    window.alert = vi.fn();
    vi.mocked(detectHumanPoses).mockImplementation(async (_image, options) => {
      expect(getProcessingPreview()?.kind).toBe("skeleton");
      const error = new Error("Skeleton was cancelled.");
      error.name = "AbortError";
      options?.signal?.throwIfAborted?.();
      throw error;
    });
    const onComplete = vi.fn();
    render(
      createElement(PoseSkeletonRunner, {
        element: imageElement("img-abort"),
        onComplete,
      }),
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(window.alert).not.toHaveBeenCalled();
    expect(getProcessingPreview()).toBeNull();
  });
});
