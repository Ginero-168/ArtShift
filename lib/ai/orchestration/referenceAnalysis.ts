import { getAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";
import { visionCaption, visionDetect, visionOcr } from "@/lib/vision/visionEngine";
import { parseVisionResponse, visionExtrasAsAppearanceNotes } from "./cloudVisionParser";
import type { ComposerImageRef } from "./imageReferences";
import { renderVisibleReference } from "./visibleReferenceRenderer";
import {
  DEFAULT_CLOUD_VISION_LABEL,
  formatVisionModelLabel,
  resolveVisionBackendOrder,
  type VisionBackendId,
} from "./visionPreference";

export type ImageReferenceAnalysis = {
  ref: Pick<ComposerImageRef, "objectId" | "elementVersion" | "displayName">;
  caption: string;
  objects: string[];
  visibleText: string;
  dimensions: { width: number; height: number; aspectRatio: number };
  transparency: "none" | "partial" | "unknown";
  appearanceNotes: string[];
  limitations: string[];
  source?: VisionBackendId | "none";
  modelLabel?: string;
};

export type CloudVisionTurboResult = {
  caption: string;
  objects: string[];
  visibleText: string;
  appearanceNotes?: string[];
  model?: string;
  modelLabel?: string;
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
  ) => Promise<CloudVisionTurboResult | null>;
};

export async function tryCloudVisionTurbo(
  dataUrl: string,
  signal: AbortSignal,
  onProgress?: (stage: string, progress: number) => void,
  options?: { cloudConsent?: boolean; timeoutMs?: number },
): Promise<CloudVisionTurboResult | null> {
  if (options?.cloudConsent !== true) return null;
  if (typeof fetch === "undefined") return null;
  try {
    onProgress?.(`${DEFAULT_CLOUD_VISION_LABEL} กำลังวิเคราะห์ภาพ`, 0.3);
    const timeoutMs = options.timeoutMs ?? 22_000;
    const timeoutSignal = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
    const combinedSignal =
      timeoutSignal &&
      typeof (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any ===
        "function"
        ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([
            signal,
            timeoutSignal,
          ])
        : signal;

    const res = await fetch("/api/ai/vision-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, cloudConsent: true }),
      signal: combinedSignal,
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      result?: unknown;
      model?: string;
    };
    if (data.success && data.result) {
      onProgress?.(`${DEFAULT_CLOUD_VISION_LABEL} วิเคราะห์เสร็จสิ้น`, 0.95);
      const parsed = parseVisionResponse(JSON.stringify(data.result));
      const model = typeof data.model === "string" ? data.model : undefined;
      return {
        caption: parsed.caption,
        objects: parsed.objects,
        visibleText: parsed.visibleText,
        appearanceNotes: visionExtrasAsAppearanceNotes(parsed),
        ...(model ? { model } : {}),
        modelLabel: formatVisionModelLabel(model, "cloud-api"),
      };
    }
  } catch {
    // Caller may fall back to local Florence-2 after this API miss.
  }
  return null;
}

export type AnalyzeImageReferenceOptions = {
  cloudConsent?: boolean;
  /** Default true. Set false to skip Florence after a cloud miss (generate critical path). */
  allowLocalFallback?: boolean;
};

const defaultAnalyzers: ImageReferenceAnalyzers = {
  caption: async (dataUrl, _mode, onProgress) =>
    visionCaption(dataUrl, "detailed", (progress) => onProgress?.(progress)),
  detect: async (dataUrl, onProgress) =>
    visionDetect(dataUrl, (progress) => onProgress?.(progress)),
  ocr: async (dataUrl, onProgress) => visionOcr(dataUrl, (progress) => onProgress?.(progress)),
  asset: getAssetAnalysis,
};

function analyzersForConsent(
  analyzers: ImageReferenceAnalyzers,
  cloudConsent: boolean,
): ImageReferenceAnalyzers {
  if (analyzers !== defaultAnalyzers) return analyzers;
  if (!cloudConsent) return analyzers;
  return {
    ...analyzers,
    turbo: (dataUrl, signal, onProgress) =>
      tryCloudVisionTurbo(dataUrl, signal, onProgress, { cloudConsent: true }),
  };
}

export async function analyzeImageReference(
  ref: ComposerImageRef,
  signal: AbortSignal,
  onProgress?: (stage: string, progress: number) => void,
  analyzers: ImageReferenceAnalyzers = defaultAnalyzers,
  options?: AnalyzeImageReferenceOptions,
): Promise<ImageReferenceAnalysis> {
  throwIfAborted(signal);
  const visible = renderVisibleReference(ref);
  onProgress?.("กำลังอ่านภาพที่เลือก", 0.05);

  let caption = "";
  let objects: string[] = [];
  let visibleText = "";
  let turboNotes: string[] = [];
  let source: VisionBackendId | "none" = "none";
  let modelLabel = DEFAULT_CLOUD_VISION_LABEL;

  const resolvedAnalyzers = analyzersForConsent(analyzers, options?.cloudConsent === true);
  const order = resolveVisionBackendOrder({
    cloudConsent: options?.cloudConsent === true || Boolean(resolvedAnalyzers.turbo),
    allowLocalFallback: options?.allowLocalFallback,
  });

  let turboSuccess = false;
  if (order[0] === "cloud-api" && resolvedAnalyzers.turbo) {
    const turboResult = await resolvedAnalyzers.turbo(visible.dataUrl, signal, onProgress);
    if (
      turboResult &&
      (turboResult.caption || turboResult.visibleText || turboResult.objects.length > 0)
    ) {
      caption = turboResult.caption;
      objects = turboResult.objects;
      visibleText = turboResult.visibleText;
      turboNotes = turboResult.appearanceNotes ?? [];
      source = "cloud-api";
      modelLabel = turboResult.modelLabel || formatVisionModelLabel(turboResult.model, "cloud-api");
      turboSuccess = true;
    }
  }

  if (!turboSuccess && order.includes("local-florence")) {
    const [localCaption, detection, localText] = await Promise.all([
      analyzers.caption(visible.dataUrl, "detailed", (progress) =>
        onProgress?.("กำลังอ่านบริบทภาพ (สำรองบนเครื่อง)", 0.1 + progress * 0.25),
      ),
      analyzers.detect(visible.dataUrl, (progress) =>
        onProgress?.("กำลังตรวจวัตถุในภาพ (สำรองบนเครื่อง)", 0.1 + progress * 0.25),
      ),
      analyzers.ocr(visible.dataUrl, (progress) =>
        onProgress?.("กำลังตรวจข้อความในภาพ (สำรองบนเครื่อง)", 0.1 + progress * 0.25),
      ),
    ]);
    caption = localCaption;
    objects = detection.objects.map((object) => object.label.trim()).filter(Boolean);
    visibleText = localText;
    source = "local-florence";
    modelLabel = formatVisionModelLabel(undefined, "local-florence");
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
      ...turboNotes,
    ],
    limitations: [
      ...visible.limitations,
      ...(asset?.result?.foregroundStatus === "failed"
        ? ["foreground preview analysis failed"]
        : []),
      ...(source === "none" ? ["cloud vision unavailable; local fallback disabled"] : []),
    ],
    source,
    modelLabel,
  };
}

export async function analyzeImageReferences(
  refs: readonly ComposerImageRef[],
  signal: AbortSignal,
  onProgress?: (completed: number, total: number, stage: string) => void,
  analyzers: ImageReferenceAnalyzers = defaultAnalyzers,
  options?: AnalyzeImageReferenceOptions,
): Promise<ImageReferenceAnalysis[]> {
  throwIfAborted(signal);
  return Promise.all(
    refs.map((ref, index) =>
      analyzeImageReference(
        ref,
        signal,
        (stage, progress) => onProgress?.(index + progress, refs.length, stage),
        analyzers,
        options,
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
