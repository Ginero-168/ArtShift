"use client";

import { useEffect, useRef } from "react";
import { type AIProgressStatus, reportAIProgress } from "@/lib/ai/progressReporter";
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
import { detectHumanPoses } from "@/lib/vision/poseLandmarker";
import { poseSkeletonFailureMessage, renderPoseSkeletonPng } from "@/lib/vision/poseSkeleton";
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
  if (!cached?.dataURL || !cached.img) {
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
    run: (context) => placeSkeleton(element, cached.img, context, addElement, selectOnly),
  });
  await job.promise;
}

async function placeSkeleton(
  element: ImageElement,
  image: CanvasImageSource,
  context: ProcessingJobContext,
  addElement: (el: ReturnType<typeof createImage>, label?: string) => void,
  selectOnly: (ids: string[]) => void,
): Promise<void> {
  const { id: previewId, signal } = context;
  const report = createProgressReporter("Skeleton");
  try {
    if (signal.aborted) return;
    updateProcessingPreview(previewId, {
      progress: 0.12,
      message: "กำลังโหลดโมเดลท่าทางในเบราว์เซอร์…",
    });
    report("model", "กำลังโหลด Pose Landmarker บนเครื่อง", "started", 12);
    const poses = await detectHumanPoses(image);
    if (signal.aborted) return;
    updateProcessingPreview(previewId, {
      progress: 0.62,
      message: "กำลังวาดโครงร่างเป็น PNG…",
    });
    const cached = getCached(element.fileId);
    const asset = await renderPoseSkeletonPng(
      cached?.width ?? element.naturalWidth,
      cached?.height ?? element.naturalHeight,
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

function createProgressReporter(operation: string) {
  const taskId = crypto.randomUUID();
  return (stage: string, message: string, status: AIProgressStatus = "step", progress?: number) => {
    reportAIProgress({ taskId, operation, stage, message, status, progress });
  };
}
