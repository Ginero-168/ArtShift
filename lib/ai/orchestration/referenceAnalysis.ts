import { getCached } from "@/lib/engine/imageCache";
import { getAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";
import { visionCaption, visionDetect, visionOcr } from "@/lib/vision/visionEngine";
import type { ComposerImageRef } from "./imageReferences";

export type ImageReferenceAnalysis = {
  ref: Pick<ComposerImageRef, "objectId" | "elementVersion" | "displayName">;
  caption: string;
  objects: string[];
  visibleText: string;
  dimensions: { width: number; height: number; aspectRatio: number };
  transparency: "none" | "partial" | "unknown";
  appearanceNotes: string[];
  limitations: string[];
};

export type ImageReferenceAnalyzers = {
  caption: (
    dataUrl: string,
    mode: "detailed",
    onProgress?: (progress: number) => void,
  ) => Promise<string>;
  detect: (
    dataUrl: string,
    onProgress?: (progress: number) => void,
  ) => Promise<{ objects: Array<{ label: string }> }>;
  ocr: (dataUrl: string, onProgress?: (progress: number) => void) => Promise<string>;
  asset: (fileId: string) => ReturnType<typeof getAssetAnalysis>;
};

const defaultAnalyzers: ImageReferenceAnalyzers = {
  caption: async (dataUrl, _mode, onProgress) =>
    visionCaption(dataUrl, "detailed", (progress) => onProgress?.(progress)),
  detect: async (dataUrl, onProgress) =>
    visionDetect(dataUrl, (progress) => onProgress?.(progress)),
  ocr: async (dataUrl, onProgress) => visionOcr(dataUrl, (progress) => onProgress?.(progress)),
  asset: getAssetAnalysis,
};

export async function analyzeImageReference(
  ref: ComposerImageRef,
  signal: AbortSignal,
  onProgress?: (stage: string, progress: number) => void,
  analyzers: ImageReferenceAnalyzers = defaultAnalyzers,
): Promise<ImageReferenceAnalysis> {
  const cached = getCached(ref.fileId);
  if (!cached?.dataURL) throw new Error(`ไม่พบข้อมูลภาพ ${ref.displayName} ในเครื่อง`);
  throwIfAborted(signal);
  onProgress?.("กำลังอ่านภาพที่เลือก", 0.05);

  const [caption, detection, visibleText] = await Promise.all([
    analyzers.caption(cached.dataURL, "detailed", (progress) =>
      onProgress?.("กำลังอ่านบริบทภาพ", 0.1 + progress * 0.25),
    ),
    analyzers.detect(cached.dataURL, (progress) =>
      onProgress?.("กำลังตรวจวัตถุในภาพ", 0.1 + progress * 0.25),
    ),
    analyzers.ocr(cached.dataURL, (progress) =>
      onProgress?.("กำลังตรวจข้อความในภาพ", 0.1 + progress * 0.25),
    ),
  ]);
  throwIfAborted(signal);

  const asset = analyzers.asset(ref.fileId);
  const transparency =
    asset?.result?.hasTransparency === true ? "partial" : asset?.result ? "none" : "unknown";
  onProgress?.("วิเคราะห์ภาพเสร็จแล้ว", 1);
  return {
    ref: {
      objectId: ref.objectId,
      elementVersion: ref.elementVersion,
      displayName: ref.displayName,
    },
    caption: caption.trim(),
    objects: detection.objects.map((object) => object.label.trim()).filter(Boolean),
    visibleText: visibleText.trim(),
    dimensions: {
      width: cached.width,
      height: cached.height,
      aspectRatio: cached.width / Math.max(1, cached.height),
    },
    transparency,
    appearanceNotes: [
      `Canvas placement ${Math.round(ref.width)} × ${Math.round(ref.height)} px`,
      `rotation ${Math.round((ref.angle * 180) / Math.PI)}°`,
    ],
    limitations:
      asset?.result?.foregroundStatus === "failed" ? ["foreground preview analysis failed"] : [],
  };
}

export async function analyzeImageReferences(
  refs: readonly ComposerImageRef[],
  signal: AbortSignal,
  onProgress?: (completed: number, total: number, stage: string) => void,
  analyzers: ImageReferenceAnalyzers = defaultAnalyzers,
): Promise<ImageReferenceAnalysis[]> {
  const results: ImageReferenceAnalysis[] = [];
  for (const [index, ref] of refs.entries()) {
    throwIfAborted(signal);
    results.push(
      await analyzeImageReference(
        ref,
        signal,
        (stage, progress) => onProgress?.(index + progress, refs.length, stage),
        analyzers,
      ),
    );
  }
  return results;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error("การวิเคราะห์ภาพถูกยกเลิกแล้วครับ");
    error.name = "AbortError";
    throw error;
  }
}
