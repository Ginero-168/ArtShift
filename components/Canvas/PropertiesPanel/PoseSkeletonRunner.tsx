"use client";

import { useEffect, useRef } from "react";
import { type AIProgressStatus, reportAIProgress } from "@/lib/ai/progressReporter";
import { DEFAULT_YOLO_POSE_MODEL_SIZE } from "@/lib/ai-runtime/contracts";
import { createImage } from "@/lib/engine/factory";
import { getCached, loadDataURL, preloadDataURL } from "@/lib/engine/imageCache";
import {
  getProcessingPreviewBounds,
  getProcessingPreviewPlacement,
  updateProcessingPreview,
} from "@/lib/engine/processingPreview";
import { enqueueProcessingJob, type ProcessingJobContext } from "@/lib/engine/processingQueue";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { createCachedImageAsset } from "@/lib/vision/extractedImageAsset";
import { claimImageActionRun, releaseImageActionRun } from "@/lib/vision/imageActionRunGuard";
import {
  type NormalizedPose,
  POSE_LANDMARK_COUNT,
  poseSkeletonFailureMessage,
  renderPoseSkeletonPng,
} from "@/lib/vision/poseSkeleton";
import { SKELETON_LABEL } from "./imageToolTypes";

export function PoseSkeletonRunner({
  element,
  onComplete,
}: {
  element: ImageElement;
  onComplete: () => void;
}) {
  const onCompleteRef = useRef(onComplete);
  const sourceRef = useRef(element);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const source = sourceRef.current;
    const runKey = `skeleton:${source.id}`;
    if (!claimImageActionRun(runKey)) return;
    const { addElement, selectOnly } = useEngine.getState();
    void runSkeleton(source, addElement, selectOnly).finally(() => {
      releaseImageActionRun(runKey);
      onCompleteRef.current();
    });
  }, []);

  return <div data-testid="skeleton-runner" hidden />;
}

async function runSkeleton(
  element: ImageElement,
  addElement: (el: ReturnType<typeof createImage>, label?: string) => void,
  selectOnly: (ids: string[]) => void,
): Promise<void> {
  const cached = getCached(element.fileId);
  if (!cached?.dataURL) {
    window.alert("Skeleton ไม่สำเร็จ: ไม่พบข้อมูลภาพในแคช");
    return;
  }
  const preloaded = await preloadDataURL(cached.dataURL);
  const job = enqueueProcessingJob({
    preview: {
      ...getProcessingPreviewBounds(element),
      kind: "skeleton",
      label: SKELETON_LABEL,
      progress: 0,
      message: "กำลังเตรียมผลลัพธ์…",
      sourceDataUrl: preloaded.dataURL,
    },
    run: (context) => placeSkeleton(element, context, addElement, selectOnly),
  });
  await job.promise;
}

async function placeSkeleton(
  element: ImageElement,
  context: ProcessingJobContext,
  addElement: (el: ReturnType<typeof createImage>, label?: string) => void,
  selectOnly: (ids: string[]) => void,
): Promise<void> {
  const { id: previewId, signal } = context;
  const report = createProgressReporter("Skeleton");
  try {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      throw codedError("INVALID_INPUT", "ไม่พบข้อมูลภาพในแคช");
    }
    if (signal.aborted) return;
    updateProcessingPreview(previewId, {
      progress: 0.12,
      message: "กำลังส่งภาพไปยัง YOLO26 Pose…",
    });
    report("consent", "ผู้ใช้กด Skeleton เพื่อส่งภาพไป Replicate", "started", 12);
    const response = await fetch("/api/skeleton", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        task: "image.poseSkeleton",
        input: {
          image: {
            dataUrl: cached.dataURL,
            mimeType: cached.dataURL
              .match(/^data:(image\/(?:jpeg|png|webp));/i)?.[1]
              ?.toLowerCase(),
          },
          width: cached.width,
          height: cached.height,
          modelSize: DEFAULT_YOLO_POSE_MODEL_SIZE,
        },
        options: {
          profile: "quality",
          provider: "replicate",
          modelAlias: "yolo26-pose",
          cloudConsent: true,
          allowFallback: false,
          timeoutMs: 120_000,
          cache: false,
        },
      }),
      signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      execution?: { output?: { poses?: unknown } };
      error?: { message?: unknown; code?: unknown } | string;
      code?: unknown;
    } | null;
    if (signal.aborted) return;
    if (!response.ok) throw skeletonRequestError(payload, response.status);
    const poses = readPoses(payload?.execution?.output?.poses);
    updateProcessingPreview(previewId, {
      progress: 0.62,
      message: "กำลังวาดโครงร่างเป็น PNG…",
    });
    const asset = await renderPoseSkeletonPng(
      cached.width || element.naturalWidth,
      cached.height || element.naturalHeight,
      poses,
    );
    if (signal.aborted) return;
    updateProcessingPreview(previewId, {
      progress: 0.84,
      message: "กำลังวางผลลัพธ์ลงบน Preload…",
    });
    const resultCached = await loadDataURL(asset.dataUrl);
    if (signal.aborted) return;
    const placement = getProcessingPreviewPlacement(previewId, getProcessingPreviewBounds(element));
    const resultImage = {
      ...createImage({
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        ...createCachedImageAsset(resultCached),
      }),
      angle: element.angle,
      flipX: element.flipX,
      flipY: element.flipY,
      crop: element.crop,
      sourceName: element.sourceName ? `${element.sourceName} · Skeleton` : "Skeleton",
    };
    addElement(resultImage, "pose skeleton");
    selectOnly([resultImage.id]);
    const people = asset.poseCount === 1 ? "1 คน" : `${asset.poseCount} คน`;
    report("complete", `Skeleton สำเร็จ · ${people}`, "success", 100);
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
    const message = poseSkeletonFailureMessage(error);
    report("error", `Skeleton ไม่สำเร็จ: ${message}`, "error");
    window.alert(`Skeleton ไม่สำเร็จ: ${message}`);
  }
}

function readPoses(value: unknown): NormalizedPose[] {
  if (!Array.isArray(value)) {
    throw codedError("PROVIDER_SCHEMA", "Skeleton returned no pose list.");
  }
  const poses: NormalizedPose[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const landmarks = (item as { landmarks?: unknown }).landmarks;
    if (!Array.isArray(landmarks) || landmarks.length !== POSE_LANDMARK_COUNT) continue;
    const parsed = landmarks.flatMap((landmark) => {
      if (!landmark || typeof landmark !== "object") return [];
      const point = landmark as { x?: unknown; y?: unknown; visibility?: unknown };
      const x = typeof point.x === "number" ? point.x : Number.NaN;
      const y = typeof point.y === "number" ? point.y : Number.NaN;
      const visibility = typeof point.visibility === "number" ? point.visibility : 0;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [{ x, y, visibility }];
    });
    if (parsed.length !== POSE_LANDMARK_COUNT) continue;
    poses.push({ landmarks: parsed });
  }
  return poses;
}

function skeletonRequestError(payload: unknown, status: number): Error {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (typeof record.code === "string") {
    const message = typeof record.error === "string" ? record.error : "Skeleton request failed.";
    return codedError(record.code, message);
  }
  const nested = record.error;
  if (typeof nested === "string") return codedError("PROVIDER_UNAVAILABLE", nested);
  if (nested && typeof nested === "object") {
    const error = nested as { code?: unknown; message?: unknown };
    return codedError(
      typeof error.code === "string" ? error.code : "PROVIDER_UNAVAILABLE",
      typeof error.message === "string" ? error.message : "Skeleton request failed.",
    );
  }
  return codedError("PROVIDER_UNAVAILABLE", `Skeleton request failed (${status}).`);
}

function codedError(code: string, message: string): Error {
  const error = new Error(message);
  return Object.assign(error, { code });
}

function createProgressReporter(operation: string) {
  const taskId = crypto.randomUUID();
  return (stage: string, message: string, status: AIProgressStatus = "step", progress?: number) => {
    reportAIProgress({ taskId, operation, stage, message, status, progress });
  };
}
