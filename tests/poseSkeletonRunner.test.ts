import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PoseSkeletonRunner } from "@/components/Canvas/PropertiesPanel/PoseSkeletonRunner";
import { getProcessingPreview } from "@/lib/engine/processingPreview";
import type { ImageElement } from "@/lib/engine/types";
import { releaseImageActionRun } from "@/lib/vision/imageActionRunGuard";
import {
  POSE_SKELETON_API_MESSAGE,
  POSE_SKELETON_MISSING_KEY_MESSAGE,
  POSE_SKELETON_NO_PERSON_MESSAGE,
} from "@/lib/vision/poseSkeleton";

const loadDataURL = vi.hoisted(() => vi.fn());

vi.mock("@/lib/engine/imageCache", () => ({
  getCached: vi.fn(() => ({
    fileId: "file-1",
    dataURL: "data:image/png;base64,aaaa",
    img: { width: 100, height: 80 },
    width: 100,
    height: 80,
  })),
  preloadDataURL: vi.fn(async () => ({ dataURL: "data:image/png;base64,aaaa" })),
  loadDataURL,
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function standingLandmarks() {
  const landmarks = Array.from({ length: 17 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const points: Record<number, [number, number]> = {
    0: [0.5, 0.12],
    5: [0.35, 0.28],
    6: [0.65, 0.28],
    7: [0.28, 0.48],
    8: [0.72, 0.48],
    11: [0.4, 0.62],
    12: [0.6, 0.62],
  };
  for (const [index, value] of Object.entries(points)) {
    const [x, y] = value;
    landmarks[Number(index)] = { x, y, visibility: 1 };
  }
  return landmarks;
}

afterEach(() => {
  cleanup();
  releaseImageActionRun("skeleton:img-model");
  releaseImageActionRun("skeleton:img-abort");
  releaseImageActionRun("skeleton:img-key");
  releaseImageActionRun("skeleton:img-empty");
  releaseImageActionRun("skeleton:img-ok");
  vi.unstubAllGlobals();
  loadDataURL.mockReset();
});

describe("Pose skeleton runner", () => {
  it("alerts the Thai API message and clears Preload when the pose call fails", async () => {
    window.alert = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        expect(getProcessingPreview()?.kind).toBe("skeleton");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return jsonResponse(
          {
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message: "AI provider is temporarily unavailable.",
            },
          },
          502,
        );
      }),
    );
    const onComplete = vi.fn();
    render(
      createElement(PoseSkeletonRunner, {
        element: imageElement("img-model"),
        onComplete,
      }),
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(window.alert).toHaveBeenCalledWith(`Skeleton ไม่สำเร็จ: ${POSE_SKELETON_API_MESSAGE}`);
    expect(getProcessingPreview()).toBeNull();
  });

  it("alerts the Thai missing-key message when Replicate is not configured", async () => {
    window.alert = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error:
              "AI provider is not configured for this session. Add your Replicate API key in AI Provider Settings.",
            code: "PROVIDER_AUTH",
          },
          503,
        ),
      ),
    );
    const onComplete = vi.fn();
    render(
      createElement(PoseSkeletonRunner, {
        element: imageElement("img-key"),
        onComplete,
      }),
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(window.alert).toHaveBeenCalledWith(
      `Skeleton ไม่สำเร็จ: ${POSE_SKELETON_MISSING_KEY_MESSAGE}`,
    );
    expect(getProcessingPreview()).toBeNull();
  });

  it("alerts when nobody is found and does not place an image", async () => {
    window.alert = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "succeeded", poses: [] })),
    );
    const onComplete = vi.fn();
    render(
      createElement(PoseSkeletonRunner, {
        element: imageElement("img-empty"),
        onComplete,
      }),
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(window.alert).toHaveBeenCalledWith(
      `Skeleton ไม่สำเร็จ: ${POSE_SKELETON_NO_PERSON_MESSAGE}`,
    );
    expect(loadDataURL).not.toHaveBeenCalled();
    expect(getProcessingPreview()).toBeNull();
  });

  it("places a transparent skeleton PNG from YOLO keypoints at Preload", async () => {
    window.alert = vi.fn();
    loadDataURL.mockResolvedValue({
      fileId: "skeleton-file",
      dataURL: "data:image/png;base64,bbbb",
      width: 100,
      height: 80,
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        task: string;
        input: { modelSize: string };
        options: { cloudConsent: boolean; provider: string; modelAlias: string };
      };
      expect(body.task).toBe("image.poseSkeleton");
      expect(body.input.modelSize).toBe("n");
      expect(body.options).toMatchObject({
        cloudConsent: true,
        provider: "replicate",
        modelAlias: "yolo26-pose",
      });
      return jsonResponse({
        predictionId: "pred12345678",
        status: "succeeded",
        poses: [{ landmarks: standingLandmarks(), confidence: 0.9 }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onComplete = vi.fn();
    render(
      createElement(PoseSkeletonRunner, {
        element: imageElement("img-ok"),
        onComplete,
      }),
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/skeleton",
      expect.objectContaining({ method: "POST" }),
    );
    expect(loadDataURL).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
    expect(window.alert).not.toHaveBeenCalled();
    expect(getProcessingPreview()).toBeNull();
  });

  it("clears Preload without an alert when the job is aborted", async () => {
    window.alert = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        expect(getProcessingPreview()?.kind).toBe("skeleton");
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        init?.signal?.throwIfAborted?.();
        throw error;
      }),
    );
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
