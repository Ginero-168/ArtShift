import { getAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";
import { visionCaption, visionDetect, visionOcr } from "@/lib/vision/visionEngine";
import type { ComposerImageRef } from "./imageReferences";
import { renderVisibleReference } from "./visibleReferenceRenderer";

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
  turbo?: (
    dataUrl: string,
    signal: AbortSignal,
    onProgress?: (stage: string, progress: number) => void,
  ) => Promise<{ caption: string; objects: string[]; visibleText: string } | null>;
};

export async function tryCloudVisionTurbo(
  dataUrl: string,
  signal: AbortSignal,
  onProgress?: (stage: string, progress: number) => void,
): Promise<{ caption: string; objects: string[]; visibleText: string } | null> {
  if (typeof fetch === "undefined") return null;
  try {
    onProgress?.("Cloud Vision Turbo ⚡ กำลังวิเคราะห์", 0.3);
    const timeoutSignal = AbortSignal.timeout ? AbortSignal.timeout(12_000) : undefined;
    const combinedSignal =
      timeoutSignal && typeof (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any === "function"
        ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([signal, timeoutSignal])
        : signal;

    const res = await fetch("/api/ai/vision-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
      signal: combinedSignal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.result) {
      onProgress?.("Cloud Vision Turbo ⚡ วิเคราะห์เสร็จสิ้น", 0.95);
      return {
        caption: typeof data.result.caption === "string" ? data.result.caption : "",
        objects: Array.isArray(data.result.objects) ? data.result.objects.map(String) : [],
        visibleText: typeof data.result.visibleText === "string" ? data.result.visibleText : "",
      };
    }
  } catch {
    // Graceful fallback to local Florence-2
  }
  return null;
}

const defaultAnalyzers: ImageReferenceAnalyzers = {
  caption: async (dataUrl, _mode, onProgress) =>
    visionCaption(dataUrl, "detailed", (progress) => onProgress?.(progress)),
  detect: async (dataUrl, onProgress) =>
    visionDetect(dataUrl, (progress) => onProgress?.(progress)),
  ocr: async (dataUrl, onProgress) => visionOcr(dataUrl, (progress) => onProgress?.(progress)),
  asset: getAssetAnalysis,
  turbo: tryCloudVisionTurbo,
};

export async function analyzeImageReference(
  ref: ComposerImageRef,
  signal: AbortSignal,
  onProgress?: (stage: string, progress: number) => void,
  analyzers: ImageReferenceAnalyzers = defaultAnalyzers,
): Promise<ImageReferenceAnalysis> {
  throwIfAborted(signal);
  const visible = renderVisibleReference(ref);
  onProgress?.("กำลังอ่านภาพที่เลือก", 0.05);

  let caption = "";
  let objects: string[] = [];
  let visibleText = "";

  // 1. Cloud Vision Turbo Fast-Lane (if available on analyzers)
  let turboSuccess = false;
  if (analyzers.turbo) {
    const turboResult = await analyzers.turbo(visible.dataUrl, signal, onProgress);
    if (turboResult && (turboResult.caption || turboResult.visibleText || turboResult.objects.length > 0)) {
      caption = turboResult.caption;
      objects = turboResult.objects;
      visibleText = turboResult.visibleText;
      turboSuccess = true;
    }
  }

  // 2. Local Florence-2 Fallback pass (if turbo not used or failed)
  if (!turboSuccess) {
    const [localCaption, detection, localText] = await Promise.all([
      analyzers.caption(visible.dataUrl, "detailed", (progress) =>
        onProgress?.("กำลังอ่านบริบทภาพ", 0.1 + progress * 0.25),
      ),
      analyzers.detect(visible.dataUrl, (progress) =>
        onProgress?.("กำลังตรวจวัตถุในภาพ", 0.1 + progress * 0.25),
      ),
      analyzers.ocr(visible.dataUrl, (progress) =>
        onProgress?.("กำลังตรวจข้อความในภาพ", 0.1 + progress * 0.25),
      ),
    ]);
    caption = localCaption;
    objects = detection.objects.map((object) => object.label.trim()).filter(Boolean);
    visibleText = localText;
  }
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
    objects,
    visibleText: visibleText.trim(),
    dimensions: {
      width: visible.width,
      height: visible.height,
      aspectRatio: visible.width / Math.max(1, visible.height),
    },
    transparency,
    appearanceNotes: [
      `Canvas placement ${Math.round(ref.width)} × ${Math.round(ref.height)} px`,
      `rotation ${Math.round((ref.angle * 180) / Math.PI)}°`,
    ],
    limitations: [
      ...visible.limitations,
      ...(asset?.result?.foregroundStatus === "failed"
        ? ["foreground preview analysis failed"]
        : []),
    ],
  };
}

export async function analyzeImageReferences(
  refs: readonly ComposerImageRef[],
  signal: AbortSignal,
  onProgress?: (completed: number, total: number, stage: string) => void,
  analyzers: ImageReferenceAnalyzers = defaultAnalyzers,
): Promise<ImageReferenceAnalysis[]> {
  throwIfAborted(signal);
  return Promise.all(
    refs.map((ref, index) =>
      analyzeImageReference(
        ref,
        signal,
        (stage, progress) => onProgress?.(index + progress, refs.length, stage),
        analyzers,
      ),
    ),
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error("การวิเคราะห์ภาพถูกยกเลิกแล้วครับ");
    error.name = "AbortError";
    throw error;
  }
}
