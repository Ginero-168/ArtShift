import type { RequestedSizeUnit } from "@/lib/ai/imageGeneration";
import type {
  GenerationIngredient,
  PriorImageGenerationContext,
} from "@/lib/ai/orchestration/chatContinuity";

const SIZE_UNITS = new Set<RequestedSizeUnit>(["cm", "mm", "m", "in", "px", "named"]);

/**
 * Parse a last-image generation package from a recall/director request body.
 * Keeps exact size fields (cm/px/named, print canvas) so orientation follow-ups
 * can invert 29×7cm → 7×29cm instead of defaulting to 9:16.
 */
export function parsePriorImageGenerationPayload(
  value: unknown,
): PriorImageGenerationContext | null {
  if (!isRecord(value) || containsSensitivePayload(value)) return null;
  if (!isSafeString(value.userPrompt, 8_000, 1) || !isSafeString(value.refinedPrompt, 16_000, 1)) {
    return null;
  }
  if (
    !isBoundedNumber(value.width, 1, 100_000) ||
    !isBoundedNumber(value.height, 1, 100_000) ||
    !isSafeString(value.aspectRatio, 64, 1)
  ) {
    return null;
  }
  const ingredients: GenerationIngredient[] = [];
  if (value.ingredients !== undefined) {
    if (!Array.isArray(value.ingredients) || value.ingredients.length > 8) return null;
    for (const item of value.ingredients) {
      if (!isRecord(item) || !isSafeString(item.objectId, 200, 1)) return null;
      if (item.displayName !== undefined && !isSafeString(item.displayName, 200)) return null;
      if (item.fileId !== undefined && !isSafeString(item.fileId, 200)) return null;
      ingredients.push({
        objectId: item.objectId,
        displayName: typeof item.displayName === "string" ? item.displayName : "Photo",
        ...(typeof item.fileId === "string" && item.fileId ? { fileId: item.fileId } : {}),
      });
    }
  }
  const sizeUnit =
    typeof value.sizeUnit === "string" && SIZE_UNITS.has(value.sizeUnit as RequestedSizeUnit)
      ? (value.sizeUnit as RequestedSizeUnit)
      : undefined;

  return {
    userPrompt: value.userPrompt,
    refinedPrompt: value.refinedPrompt,
    ...(isSafeString(value.summary, 2_000) ? { summary: value.summary } : {}),
    width: value.width,
    height: value.height,
    aspectRatio: value.aspectRatio,
    ...(value.ratioClamped === true ? { ratioClamped: true } : {}),
    ...(isBoundedNumber(value.printWidth, 1, 100_000) ? { printWidth: value.printWidth } : {}),
    ...(isBoundedNumber(value.printHeight, 1, 100_000) ? { printHeight: value.printHeight } : {}),
    ...(isBoundedNumber(value.sourceWidth, 0.001, 100_000)
      ? { sourceWidth: value.sourceWidth }
      : {}),
    ...(isBoundedNumber(value.sourceHeight, 0.001, 100_000)
      ? { sourceHeight: value.sourceHeight }
      : {}),
    ...(isSafeString(value.sizeLabel, 64, 1) ? { sizeLabel: value.sizeLabel } : {}),
    ...(sizeUnit ? { sizeUnit } : {}),
    ...(isSafeString(value.modelId, 120) ? { modelId: value.modelId } : {}),
    ...(isSafeString(value.outputElementId, 200) ? { outputElementId: value.outputElementId } : {}),
    ...(isSafeString(value.outputFileId, 200) ? { outputFileId: value.outputFileId } : {}),
    ...(ingredients.length ? { ingredients } : {}),
    ...(isSafeString(value.campaignNotes, 2_000) ? { campaignNotes: value.campaignNotes } : {}),
  };
}

function containsSensitivePayload(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return /data:image\/|replicate\.delivery|api[_-]?key|bearer\s+\S+|(?:secret|token|credential)\s*[:=]/iu.test(
      value,
    );
  }
  if (!value || typeof value !== "object" || seen.has(value as object)) return false;
  seen.add(value as object);
  if (Array.isArray(value)) return value.some((item) => containsSensitivePayload(item, seen));
  return Object.values(value as Record<string, unknown>).some((item) =>
    containsSensitivePayload(item, seen),
  );
}

function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isSafeString(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
