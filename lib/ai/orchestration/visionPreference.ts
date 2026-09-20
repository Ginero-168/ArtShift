/**
 * Vision analysis preference: cloud Gemini API first, local Florence only as fallback.
 * Image pixel generation is a separate pipeline (see generateAIImage).
 */

export type VisionBackendId = "cloud-api" | "local-florence";

export const DEFAULT_CLOUD_VISION_LABEL = "Gemini 3 Flash";
export const LOCAL_VISION_LABEL = "Florence-2";

export type VisionBackendOrderOptions = {
  /** Explicit cloud consent is required before any Gemini / Replicate vision call. */
  cloudConsent?: boolean;
  /**
   * Include Florence as a later fallback after the API attempt.
   * Default true: local runs only when the API is missing, declined, or failed.
   * Set false to keep Florence off the generate critical path.
   */
  allowLocalFallback?: boolean;
};

/**
 * Preference order for caption / OCR / detect / post-generate understanding.
 * Cloud API is always first when consent is present. Local Florence is never first.
 */
export function resolveVisionBackendOrder(
  options: VisionBackendOrderOptions = {},
): VisionBackendId[] {
  const allowLocal = options.allowLocalFallback !== false;
  const order: VisionBackendId[] = [];
  if (options.cloudConsent === true) order.push("cloud-api");
  if (allowLocal) order.push("local-florence");
  return order;
}

export function formatVisionModelLabel(
  modelId?: string | null,
  source?: VisionBackendId | null,
): string {
  if (source === "local-florence") return LOCAL_VISION_LABEL;
  const raw = typeof modelId === "string" ? modelId.trim() : "";
  if (!raw) return DEFAULT_CLOUD_VISION_LABEL;
  const unpinned = raw.split("@")[0] ?? raw;
  const lower = unpinned.toLowerCase();
  if (lower.includes("florence")) return LOCAL_VISION_LABEL;
  if (lower.includes("gemini-3-flash") || lower.includes("gemini-3")) {
    return DEFAULT_CLOUD_VISION_LABEL;
  }
  if (lower.includes("gemini")) return "Gemini";
  const slug = unpinned.includes("/") ? unpinned.slice(unpinned.lastIndexOf("/") + 1) : unpinned;
  return slug.split(/[-_]/g).filter(Boolean).map(humanizeVisionToken).join(" ");
}

export function cloudVisionStatusMessage(percent?: number): string {
  if (typeof percent === "number" && Number.isFinite(percent)) {
    return `กำลังวิเคราะห์ภาพด้วย ${DEFAULT_CLOUD_VISION_LABEL} (${Math.round(percent)}%)...`;
  }
  return `กำลังวิเคราะห์ภาพด้วย ${DEFAULT_CLOUD_VISION_LABEL}...`;
}

function humanizeVisionToken(token: string): string {
  if (/^gpt$/i.test(token)) return "GPT";
  if (/^ai$/i.test(token)) return "AI";
  if (/^\d+(?:\.\d+)?$/.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}
