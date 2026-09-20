import { resolveGenerationSizeFromRatio } from "@/lib/ai/generationSize";
import {
  ASPECT_RATIOS,
  extractRequestedSizeSpecsFromText,
  hasExplicitDimensionsInText,
  hasNumericOrNamedSizeInText,
  type RequestedSizeSpec,
  type RequestedSizeUnit,
  resolveImageGenerationDimensions,
  uniqueRequestedSizeSpecs,
} from "@/lib/ai/imageGeneration";
import {
  buildComposerImageSelectionFromIds,
  type ComposerImageRef,
} from "@/lib/ai/orchestration/imageReferences";
import type { EngineElement } from "@/lib/engine/types";

/**
 * Chat continuity helpers for image follow-ups
 * (e.g. "สร้างมาอีก 3 รูป" should keep prior aspect ratio + base prompt,
 *  and "ปรับเป็นแนวตั้ง" should revise the last generation package).
 */

/** Sliding window sent to Creative Director / recall (matches persisted chat depth). */
export const DIRECTOR_CONVERSATION_HISTORY_LIMIT = 24;
export const DIRECTOR_HISTORY_MESSAGE_MAX_CHARS = 4_000;

export const LAST_GENERATION_FOLLOW_UP_NOTE = "แก้ต่อจากภาพล่าสุด — ใช้ภาพต้นฉบับและข้อตกลงในแชท";

const FOLLOW_UP_CONTEXT_MARKERS = [
  "=== LAST IMAGE GENERATION PACKAGE",
  "=== SMART RECALL",
  "=== PRIOR IMAGE GENERATION TO CONTINUE",
  "=== SHARED ANCHORS",
  "=== PRIOR VARIANT AXES",
  "=== VARIATION STRATEGY",
  "=== REVISION STRATEGY",
  "CONTINUATION RULES:",
  "=== ATTACHED REFERENCE",
  "=== UNTRUSTED LOCAL CONTEXT",
];

/**
 * The user's short follow-up command, ignoring injected last-package / recall text.
 * "ปรับเป็นแนวตั้ง" plus a 29×7cm package must still count as orientation-only — not a new 29×7 size.
 */
export function followUpCommandText(prompt: string): string {
  const text = (prompt || "").trim();
  if (!text) return "";
  const labeled = /User follow-up (?:request|command):\s*([^\n]+)/iu.exec(text);
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 500);
  let cut = text;
  for (const marker of FOLLOW_UP_CONTEXT_MARKERS) {
    const idx = cut.indexOf(marker);
    if (idx >= 0) cut = cut.slice(0, idx);
  }
  const firstLine = cut
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine || cut).trim().slice(0, 500);
}

/**
 * Full user-ask text for output-count / multi-size decisions.
 * Strips injected last-package / recall blocks so a remembered 29×7cm
 * (or Director prose) cannot look like a multi-size campaign.
 */
export function followUpAskText(prompt: string | undefined): string {
  const text = (prompt || "").trim();
  if (!text) return "";
  let cut = text;
  for (const marker of FOLLOW_UP_CONTEXT_MARKERS) {
    const idx = cut.indexOf(marker);
    if (idx >= 0) cut = cut.slice(0, idx);
  }
  const labeled = /User follow-up (?:request|command):\s*([\s\S]+)/iu.exec(cut);
  if (labeled?.[1]?.trim()) return labeled[1].trim().slice(0, 4_000);
  return cut.trim().slice(0, 4_000);
}

/** Size list from the user ask only — last-package / Director prose must not inflate count. */
export function extractRequestedSizeSpecsFromUserAsk(
  prompt: string | undefined,
  extraAsks: readonly (string | undefined)[] = [],
): RequestedSizeSpec[] {
  const specs: RequestedSizeSpec[] = [];
  for (const raw of [prompt, ...extraAsks]) {
    const ask = followUpAskText(raw) || raw;
    if (!ask) continue;
    specs.push(...extractRequestedSizeSpecsFromText(stripFollowUpMentions(ask)));
  }
  return uniqueRequestedSizeSpecs(specs);
}

function stripFollowUpMentions(prompt: string): string {
  return prompt
    .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
    .replace(/@[^\s]+/g, "")
    .trim();
}

/** Layer-1 locks carried across Orchestrator turns (must not drift on follow-ups). */
export type SharedAnchorLock = {
  id: string;
  label: string;
  detail: string;
};

/** Layer-2 picks from Prompt Helper — safe axes to vary on follow-ups. */
export type VariantSelectionLock = {
  axisId: string;
  axisTitle: string;
  optionId: string;
  label: string;
  character?: string;
  modifier: string;
};

/** A source photo / reference actually used as an ingredient on the prior turn. */
export type GenerationIngredient = {
  objectId: string;
  fileId?: string;
  displayName: string;
};

export type ImageFollowUpKind = "variation" | "revision";

export type PriorImageGenerationContext = {
  userPrompt: string;
  refinedPrompt: string;
  summary?: string;
  width: number;
  height: number;
  aspectRatio: string;
  /** True when generation size was clamped to the model 3:1 max. */
  ratioClamped?: boolean;
  /** True print canvas when the requested ratio exceeds 3:1. */
  printWidth?: number;
  printHeight?: number;
  /** Original requested size (cm/px/ratio units) before model clamp. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Display/API label such as "29x7cm" or "16:9". */
  sizeLabel?: string;
  sizeUnit?: RequestedSizeUnit;
  /** subject = photo/illustration helper; brand-variant = Shared Anchor + Variant axes */
  refinementMode?: "subject" | "brand-variant" | "generic";
  sharedAnchors?: readonly SharedAnchorLock[];
  variantSelections?: readonly VariantSelectionLock[];
  /** Runtime image-model id used for the last successful output. */
  modelId?: string;
  /** Style / tone tags agreed on the prior turn (never invented later). */
  styleTags?: readonly string[];
  /** Canvas element id of the last generated image. */
  outputElementId?: string;
  /** Image-cache file id of the last generated image. */
  outputFileId?: string;
  /** Reference photos actually attached on the prior generate path. */
  ingredients?: readonly GenerationIngredient[];
  /** Brief / campaign notes carried from the prior turn. */
  campaignNotes?: string;
  /** True when this context itself was a follow-up revision of an earlier gen. */
  revisedLastGeneration?: boolean;
};

export type FollowUpOrientation = "portrait" | "landscape";

export type FollowUpResolvedSize = {
  width: number;
  height: number;
  aspectRatio: string;
  ratioClamped?: boolean;
  printWidth?: number;
  printHeight?: number;
  sizeLabel?: string;
};

export type ContinuityHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  generationContext?: PriorImageGenerationContext;
};

export type FollowUpImageBinding = {
  refs: ComposerImageRef[];
  carriedForward: boolean;
  usedOutput: boolean;
  usedIngredients: boolean;
};

export type FollowUpRecallSummary = {
  summary: string;
  agreedConstraints?: readonly string[];
  styleNotes?: string;
  campaignNotes?: string;
  followUpIntent?: string;
  aspectOverride?: string;
  priorExactSize?: string;
  resolvedExactSize?: string;
};

const BUILTIN_IMAGE_TOOL_RE =
  /(?:ลบพื้นหลัง|remove\s*bg|remove\s*background|vectorize|แปลงเป็น(?:\s+)?vector|แปลงเป็นเวกเตอร์|undo|ยกเลิกผลลัพธ์)/iu;

function isBuiltinImageToolPrompt(text: string): boolean {
  return BUILTIN_IMAGE_TOOL_RE.test(text);
}

/** More-of-the-same / extra-variation phrasing. */
export function isImageVariationFollowUpPrompt(prompt: string): boolean {
  const text = (prompt || "").trim();
  if (!text) return false;

  if (
    /(?:ขอตัวเลือก|ตัวเลือกเพิ่ม|เอาอีก|สร้างเพิ่ม|ทำเพิ่ม|เจนเพิ่ม|วาดเพิ่ม|ขอเพิ่ม|เพิ่มอีก|อีกแบบ|อีกรูป|อีกภาพ|variation|more\s+(?:like\s+)?(?:th(?:is|ese)|of\s+th)|another\s+(?:\d+\s+)?(?:image|variation|option))/iu.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /(?:สร้าง|ทำ|เอา|วาด|เจน|ผลิต|ออกแบบ|ขอ|generate|create|make)\s*(?:มา|ให้|เพิ่ม)?\s*อีก(?:\s*(?:\d+|[๑-๕]|หนึ่ง|สอง|สาม|สี่|ห้า|one|two|three|four|five))?\s*(?:แบบ|รูป|ภาพ|ตัวเลือก|ชิ้น|variations?|options?|images?)?/iu.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /(?:^|\s)อีก\s*(?:\d+|[๑-๕]|หนึ่ง|สอง|สาม|สี่|ห้า)?\s*(?:แบบ|รูป|ภาพ|ตัวเลือก)/iu.test(text) ||
    /(?:\d+|[๑-๕]|สอง|สาม|สี่|ห้า)\s*(?:แบบ|รูป|ภาพ|ตัวเลือก)\s*(?:เพิ่ม|อีก)/iu.test(text)
  ) {
    return true;
  }

  return false;
}

/** Size / resize follow-ups such as "ปรับไซส์เป็น 29x7cm" or "@Photo ปรับขนาดเป็น 16:9". */
export function isSizeAdjustFollowUpPrompt(prompt: string): boolean {
  const text = stripFollowUpMentions(prompt || "");
  if (!text || text.length > 240) return false;
  if (isBuiltinImageToolPrompt(text)) return false;
  return (
    /(?:ปรับ|เปลี่ยน|แปลง|ทำ|make|change|resize)\s*(?:ไซส์|ขนาด|สัดส่วน|size|aspect|ratio)/iu.test(
      text,
    ) ||
    /(?:ไซส์|ขนาด|สัดส่วน)\s*(?:เป็น|ให้เป็น|to)/iu.test(text) ||
    /(?:ปรับไซส์|ปรับขนาด|ปรับสัดส่วน|\bresize\b)/iu.test(text)
  );
}

/**
 * Short revision of the last image: orientation, style, "ปรับ…", "ทำให้เป็น…".
 * Does not invent a new brief — relies on prior generation package + chat.
 */
export function isImageRevisionFollowUpPrompt(prompt: string): boolean {
  const text = stripFollowUpMentions(prompt || "");
  if (!text || text.length > 240) return false;
  if (isBuiltinImageToolPrompt(text)) return false;
  if (isImageVariationFollowUpPrompt(text)) return false;
  if (isSizeAdjustFollowUpPrompt(text)) return true;

  if (
    /^(?:ช่วย|กรุณา)?\s*(?:ปรับ|ทำให้|ทำ|เปลี่ยน|แปลง|make|change|convert|switch)?\s*(?:เป็น|ให้เป็น|to|it(?:\s+to)?)?\s*(?:แนวตั้ง|แนวนอน|vertical|horizontal|portrait|landscape)/iu.test(
      text,
    )
  ) {
    return true;
  }

  if (/(?:ปรับเป็น|ทำให้เป็น|ทำเป็น|เปลี่ยนเป็น|แปลงเป็น)\s*(?:แนวตั้ง|แนวนอน|แนวตั้งใหม่)/iu.test(text)) {
    return true;
  }

  if (
    /\b(?:make\s+it|change\s+(?:it\s+)?to|convert\s+to|switch\s+to)\s+(?:vertical|horizontal|portrait|landscape|tall|wide)\b/iu.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /(?:ปรับ|ทำให้|เปลี่ยน|แปลง)\s*(?:รูป|ภาพ|ป้าย|งาน|แบนเนอร์|มัน|อันนี้|ไซส์|ขนาด|สัดส่วน|size)?\s*(?:ให้)?\s*เป็น/iu.test(
      text,
    )
  ) {
    return true;
  }

  if (
    /^(?:ช่วย|กรุณา)?\s*(?:ปรับ|แก้|แก้ไข|แต่ง)\s*(?:โทน|สไตล์|สี|รายละเอียด|องค์ประกอบ|layout|ข้อความ|copy|style|tone)/iu.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

export function classifyImageFollowUpPrompt(prompt: string): ImageFollowUpKind | null {
  const text = stripFollowUpMentions(prompt || "");
  if (isImageVariationFollowUpPrompt(text)) return "variation";
  if (isImageRevisionFollowUpPrompt(text)) return "revision";
  return null;
}

/** Detects short follow-up / more-variations / revision requests that rely on prior turn context. */
export function isImageFollowUpPrompt(prompt: string): boolean {
  return classifyImageFollowUpPrompt(prompt) !== null;
}

export function snapshotIngredients(
  refs: readonly Pick<ComposerImageRef, "objectId" | "fileId" | "displayName">[],
): GenerationIngredient[] {
  const seen = new Set<string>();
  const ingredients: GenerationIngredient[] = [];
  for (const ref of refs) {
    const objectId = ref.objectId?.trim();
    if (!objectId || seen.has(objectId)) continue;
    seen.add(objectId);
    ingredients.push({
      objectId,
      ...(ref.fileId ? { fileId: ref.fileId } : {}),
      displayName: ref.displayName || "Photo",
    });
  }
  return ingredients;
}

const COLON_ASPECT_RE = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/;

function isColonAspect(value: string | undefined): boolean {
  return Boolean(value && COLON_ASPECT_RE.test(value.trim()));
}

function sameOrientation(
  widthA: number,
  heightA: number,
  widthB: number,
  heightB: number,
): boolean {
  const squareA = Math.abs(widthA - heightA) < 1e-6;
  const squareB = Math.abs(widthB - heightB) < 1e-6;
  if (squareA || squareB) return true;
  return widthA >= heightA === widthB >= heightB;
}

function formatExactSizeLabel(
  sourceWidth: number,
  sourceHeight: number,
  unit?: RequestedSizeUnit,
  fallback?: string,
): string {
  if (unit === "named" || isColonAspect(fallback)) {
    return `${sourceWidth}:${sourceHeight}`;
  }
  if (unit) {
    return `${sourceWidth}x${sourceHeight}${unit}`;
  }
  return fallback || `${sourceWidth}x${sourceHeight}`;
}

function swapSizeLabel(
  label: string | undefined,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  unit?: RequestedSizeUnit,
): string {
  if (label && isColonAspect(label)) {
    return `${newWidth}:${newHeight}`;
  }
  if (label) {
    const replaced = label
      .replaceAll(`${oldWidth}x${oldHeight}`, `${newWidth}x${newHeight}`)
      .replaceAll(`${oldWidth}×${oldHeight}`, `${newWidth}×${newHeight}`);
    if (replaced !== label) return replaced;
  }
  return formatExactSizeLabel(newWidth, newHeight, unit, label);
}

function specToResolvedSize(spec: RequestedSizeSpec): FollowUpResolvedSize & {
  sourceWidth: number;
  sourceHeight: number;
  sizeLabel: string;
  sizeUnit?: RequestedSizeUnit;
} {
  return resolveSizeFromSource(spec.sourceWidth, spec.sourceHeight, spec.label, spec.unit);
}

function resolveSizeFromSource(
  sourceWidth: number,
  sourceHeight: number,
  label?: string,
  unit?: RequestedSizeUnit,
): FollowUpResolvedSize & {
  sourceWidth: number;
  sourceHeight: number;
  sizeLabel: string;
  sizeUnit?: RequestedSizeUnit;
} {
  const namedLabel =
    unit === "named" || isColonAspect(label) ? `${sourceWidth}:${sourceHeight}` : "";
  if (namedLabel) {
    const preset = ASPECT_RATIOS.find(
      (ratio) => ratio.id === namedLabel || ratio.ratio === namedLabel,
    );
    if (preset) {
      return {
        width: preset.width,
        height: preset.height,
        aspectRatio: preset.id,
        sourceWidth,
        sourceHeight,
        sizeLabel: preset.id,
        sizeUnit: "named",
      };
    }
    const resolved = resolveImageGenerationDimensions(namedLabel);
    return {
      width: resolved.width,
      height: resolved.height,
      aspectRatio: resolved.aspectRatio,
      ...(resolved.ratioClamped
        ? {
            ratioClamped: true,
            printWidth: resolved.printWidth,
            printHeight: resolved.printHeight,
          }
        : {}),
      sourceWidth,
      sourceHeight,
      sizeLabel: namedLabel,
      sizeUnit: "named",
    };
  }

  const resolved = resolveGenerationSizeFromRatio(sourceWidth, sourceHeight);
  return {
    width: resolved.width,
    height: resolved.height,
    aspectRatio: resolved.aspectRatio,
    ...(resolved.ratioClamped
      ? {
          ratioClamped: true,
          printWidth: resolved.printWidth,
          printHeight: resolved.printHeight,
        }
      : {}),
    sourceWidth,
    sourceHeight,
    sizeLabel: formatExactSizeLabel(sourceWidth, sourceHeight, unit, label),
    ...(unit ? { sizeUnit: unit } : {}),
  };
}

function toPublicFollowUpSize(
  size: FollowUpResolvedSize & {
    sourceWidth?: number;
    sourceHeight?: number;
    sizeLabel?: string;
    sizeUnit?: RequestedSizeUnit;
  },
): FollowUpResolvedSize {
  const includeExactLabel =
    Boolean(size.sizeLabel) && size.sizeUnit !== "named" && !isColonAspect(size.sizeLabel);
  return {
    width: size.width,
    height: size.height,
    aspectRatio: size.aspectRatio,
    ...(size.ratioClamped
      ? {
          ratioClamped: true,
          printWidth: size.printWidth,
          printHeight: size.printHeight,
        }
      : {}),
    ...(includeExactLabel ? { sizeLabel: size.sizeLabel } : {}),
  };
}

/** Portrait / landscape intent without a newly named WxH or A:B size. */
export function parseFollowUpOrientation(prompt: string): FollowUpOrientation | null {
  const text = (prompt || "").trim();
  if (!text) return null;
  const portrait =
    /(?:แนวตั้ง|\bvertical\b|portrait\s+(?:mode|orientation|ratio)|\bportrait\b(?!\s+of\b|\s+photo|\s+shot|\s+picture)|\btall\b)/iu.test(
      text,
    );
  const landscape = /(?:แนวนอน|\bhorizontal\b|\blandscape\b|\bwide\b)/iu.test(text);
  if (portrait && !landscape) return "portrait";
  if (landscape && !portrait) return "landscape";
  return null;
}

export function isOrientationOnlyFollowUpPrompt(prompt: string): boolean {
  const text = followUpCommandText(prompt);
  if (!text || hasNumericOrNamedSizeInText(text)) return false;
  if (!parseFollowUpOrientation(text)) return false;
  return isImageFollowUpPrompt(text);
}

export function resolvePriorRequestedSize(
  prior: PriorImageGenerationContext,
): FollowUpResolvedSize & {
  sourceWidth: number;
  sourceHeight: number;
  sizeLabel: string;
  sizeUnit?: RequestedSizeUnit;
} {
  if (
    typeof prior.sourceWidth === "number" &&
    prior.sourceWidth > 0 &&
    typeof prior.sourceHeight === "number" &&
    prior.sourceHeight > 0
  ) {
    return resolveSizeFromSource(
      prior.sourceWidth,
      prior.sourceHeight,
      prior.sizeLabel,
      prior.sizeUnit,
    );
  }

  const fromPrompt =
    extractRequestedSizeSpecsFromText(prior.userPrompt)[0] ??
    extractRequestedSizeSpecsFromText(prior.refinedPrompt)[0];
  if (fromPrompt) {
    return specToResolvedSize(fromPrompt);
  }

  if (isColonAspect(prior.aspectRatio)) {
    const match = COLON_ASPECT_RE.exec(prior.aspectRatio.trim());
    const width = Number(match?.[1]);
    const height = Number(match?.[2]);
    if (width > 0 && height > 0) {
      return resolveSizeFromSource(width, height, prior.aspectRatio, "named");
    }
  }

  if (prior.printWidth && prior.printHeight && prior.printWidth > 0 && prior.printHeight > 0) {
    return resolveSizeFromSource(
      prior.printWidth,
      prior.printHeight,
      prior.sizeLabel,
      prior.sizeUnit ?? "px",
    );
  }

  return resolveSizeFromSource(
    prior.width,
    prior.height,
    prior.aspectRatio,
    prior.sizeUnit ?? "px",
  );
}

export function applyOrientationToPriorSize(
  prior: PriorImageGenerationContext,
  orientation: FollowUpOrientation,
): FollowUpResolvedSize & {
  sourceWidth: number;
  sourceHeight: number;
  sizeLabel: string;
  sizeUnit?: RequestedSizeUnit;
} {
  const current = resolvePriorRequestedSize(prior);
  const isLandscape = current.sourceWidth >= current.sourceHeight;
  const wantLandscape = orientation === "landscape";
  if (isLandscape === wantLandscape) {
    return current;
  }
  return resolveSizeFromSource(
    current.sourceHeight,
    current.sourceWidth,
    swapSizeLabel(
      current.sizeLabel,
      current.sourceWidth,
      current.sourceHeight,
      current.sourceHeight,
      current.sourceWidth,
      current.sizeUnit,
    ),
    current.sizeUnit,
  );
}

function inferSnapshotSizeFields(input: {
  userPrompt: string;
  width: number;
  height: number;
  aspectRatio: string;
  ratioClamped?: boolean;
  printWidth?: number;
  printHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sizeLabel?: string;
  sizeUnit?: RequestedSizeUnit;
}): Pick<
  PriorImageGenerationContext,
  | "ratioClamped"
  | "printWidth"
  | "printHeight"
  | "sourceWidth"
  | "sourceHeight"
  | "sizeLabel"
  | "sizeUnit"
> {
  let sourceWidth = input.sourceWidth;
  let sourceHeight = input.sourceHeight;
  let sizeLabel = input.sizeLabel;
  let sizeUnit = input.sizeUnit;

  if (
    !(
      typeof sourceWidth === "number" &&
      sourceWidth > 0 &&
      typeof sourceHeight === "number" &&
      sourceHeight > 0
    )
  ) {
    const spec = extractRequestedSizeSpecsFromText(input.userPrompt)[0];
    if (spec) {
      sourceWidth = spec.sourceWidth;
      sourceHeight = spec.sourceHeight;
      sizeLabel = sizeLabel ?? spec.label;
      sizeUnit = sizeUnit ?? spec.unit;
    } else if (isColonAspect(input.aspectRatio)) {
      const match = COLON_ASPECT_RE.exec(input.aspectRatio.trim());
      const width = Number(match?.[1]);
      const height = Number(match?.[2]);
      if (width > 0 && height > 0) {
        sourceWidth = width;
        sourceHeight = height;
        sizeLabel = sizeLabel ?? input.aspectRatio;
        sizeUnit = sizeUnit ?? "named";
      }
    }
  }

  if (
    typeof sourceWidth === "number" &&
    sourceWidth > 0 &&
    typeof sourceHeight === "number" &&
    sourceHeight > 0 &&
    input.width > 0 &&
    input.height > 0 &&
    !sameOrientation(sourceWidth, sourceHeight, input.width, input.height)
  ) {
    const nextWidth = sourceHeight;
    const nextHeight = sourceWidth;
    sizeLabel = swapSizeLabel(
      sizeLabel,
      sourceWidth,
      sourceHeight,
      nextWidth,
      nextHeight,
      sizeUnit,
    );
    sourceWidth = nextWidth;
    sourceHeight = nextHeight;
  }

  const resolved =
    typeof sourceWidth === "number" &&
    sourceWidth > 0 &&
    typeof sourceHeight === "number" &&
    sourceHeight > 0
      ? resolveSizeFromSource(sourceWidth, sourceHeight, sizeLabel, sizeUnit)
      : null;

  return {
    ...(input.ratioClamped || resolved?.ratioClamped ? { ratioClamped: true as const } : {}),
    ...((input.printWidth && input.printHeight) || (resolved?.printWidth && resolved?.printHeight)
      ? {
          printWidth: input.printWidth ?? resolved?.printWidth,
          printHeight: input.printHeight ?? resolved?.printHeight,
        }
      : {}),
    ...(typeof sourceWidth === "number" &&
    sourceWidth > 0 &&
    typeof sourceHeight === "number" &&
    sourceHeight > 0
      ? {
          sourceWidth,
          sourceHeight,
          sizeLabel: sizeLabel || resolved?.sizeLabel,
          ...(sizeUnit || resolved?.sizeUnit ? { sizeUnit: sizeUnit ?? resolved?.sizeUnit } : {}),
        }
      : {}),
  };
}

export function snapshotGenerationContext(input: {
  userPrompt: string;
  refinedPrompt: string;
  summary?: string;
  width: number;
  height: number;
  aspectRatio: string;
  ratioClamped?: boolean;
  printWidth?: number;
  printHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sizeLabel?: string;
  sizeUnit?: RequestedSizeUnit;
  refinementMode?: PriorImageGenerationContext["refinementMode"];
  sharedAnchors?: readonly SharedAnchorLock[];
  variantSelections?: readonly VariantSelectionLock[];
  modelId?: string;
  styleTags?: readonly string[];
  outputElementId?: string;
  outputFileId?: string;
  ingredients?: readonly GenerationIngredient[];
  campaignNotes?: string;
  revisedLastGeneration?: boolean;
}): PriorImageGenerationContext {
  const inferred = inferSnapshotSizeFields(input);
  return {
    userPrompt: input.userPrompt,
    refinedPrompt: input.refinedPrompt,
    ...(input.summary ? { summary: input.summary } : {}),
    width: input.width,
    height: input.height,
    aspectRatio: input.aspectRatio,
    ...inferred,
    ...(input.refinementMode ? { refinementMode: input.refinementMode } : {}),
    ...(input.sharedAnchors?.length ? { sharedAnchors: input.sharedAnchors } : {}),
    ...(input.variantSelections?.length ? { variantSelections: input.variantSelections } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.styleTags?.length ? { styleTags: input.styleTags } : {}),
    ...(input.outputElementId ? { outputElementId: input.outputElementId } : {}),
    ...(input.outputFileId ? { outputFileId: input.outputFileId } : {}),
    ...(input.ingredients?.length ? { ingredients: input.ingredients } : {}),
    ...(input.campaignNotes ? { campaignNotes: input.campaignNotes } : {}),
    ...(input.revisedLastGeneration ? { revisedLastGeneration: true } : {}),
  };
}

function fileIdFromElement(element: EngineElement): string | undefined {
  if (element.type === "image" || element.type === "bookMockup") return element.fileId;
  if (element.type === "frame") return element.imageFileId || undefined;
  return undefined;
}

function uniqueRefs(refs: readonly ComposerImageRef[]): ComposerImageRef[] {
  const seen = new Set<string>();
  const out: ComposerImageRef[] = [];
  for (const ref of refs) {
    if (!ref.objectId || seen.has(ref.objectId)) continue;
    seen.add(ref.objectId);
    out.push(ref);
  }
  return out;
}

/**
 * Binds canvas image refs for a follow-up that has no new user attachments.
 * Last output is first (image-to-image source), then prior ingredients.
 * Never invents ids that were not stored on the prior package.
 */
export function resolveFollowUpImageRefs(options: {
  elements: readonly EngineElement[];
  prior: PriorImageGenerationContext | null | undefined;
  userRefs?: readonly ComposerImageRef[];
  maxRefs?: number;
}): FollowUpImageBinding {
  const maxRefs = options.maxRefs ?? 4;
  const userRefs = uniqueRefs(options.userRefs ?? []).slice(0, maxRefs);
  if (userRefs.length > 0) {
    return { refs: userRefs, carriedForward: false, usedOutput: false, usedIngredients: false };
  }

  const prior = options.prior;
  if (!prior) {
    return { refs: [], carriedForward: false, usedOutput: false, usedIngredients: false };
  }

  const orderedIds: string[] = [];
  if (prior.outputElementId) orderedIds.push(prior.outputElementId);
  for (const ingredient of prior.ingredients ?? []) {
    if (ingredient.objectId && !orderedIds.includes(ingredient.objectId)) {
      orderedIds.push(ingredient.objectId);
    }
  }

  const resolved = uniqueRefs(
    buildComposerImageSelectionFromIds(options.elements, orderedIds, { limit: maxRefs + 4 }).refs,
  );

  if (prior.outputFileId && !resolved.some((ref) => ref.fileId === prior.outputFileId)) {
    const byFile = options.elements.find(
      (element) => !element.isDeleted && fileIdFromElement(element) === prior.outputFileId,
    );
    if (byFile) {
      const extra = buildComposerImageSelectionFromIds(options.elements, [byFile.id], {
        limit: 1,
      }).refs[0];
      if (extra) resolved.unshift(extra);
    }
  }

  const refs = uniqueRefs(resolved).slice(0, maxRefs);
  const outputIds = new Set(
    [prior.outputElementId, prior.outputFileId].filter((id): id is string => Boolean(id)),
  );
  const ingredientIds = new Set((prior.ingredients ?? []).map((item) => item.objectId));

  return {
    refs,
    carriedForward: refs.length > 0,
    usedOutput: refs.some((ref) => outputIds.has(ref.objectId) || outputIds.has(ref.fileId)),
    usedIngredients: refs.some((ref) => ingredientIds.has(ref.objectId)),
  };
}

export function formatGenerationPackageForPrompt(prior: PriorImageGenerationContext): string {
  const ingredientLines =
    prior.ingredients && prior.ingredients.length > 0
      ? prior.ingredients.map(
          (item) =>
            `- ${item.displayName} (objectId: ${item.objectId}${item.fileId ? `, fileId: ${item.fileId}` : ""})`,
        )
      : ["- (none stored — do not invent reference photos)"];
  const anchorLines =
    prior.sharedAnchors?.map((anchor) => `- ${anchor.label}: ${anchor.detail}`) ?? [];
  return [
    "=== LAST IMAGE GENERATION PACKAGE (authoritative; do not invent extras) ===",
    `Original user brief: ${prior.userPrompt.slice(0, 4_000)}`,
    ...(prior.summary ? [`Prior summary: ${prior.summary.slice(0, 1_000)}`] : []),
    ...(prior.campaignNotes ? [`Campaign notes: ${prior.campaignNotes.slice(0, 1_000)}`] : []),
    `Refinement mode: ${prior.refinementMode ?? "generic"}`,
    `Prior aspect ratio / dimensions: ${prior.aspectRatio} (${prior.width}×${prior.height})`,
    ...(prior.sizeLabel || (prior.sourceWidth && prior.sourceHeight)
      ? [
          `Prior exact size: ${
            prior.sizeLabel ||
            formatExactSizeLabel(prior.sourceWidth!, prior.sourceHeight!, prior.sizeUnit)
          } — keep this physical/custom size; invert axes on orientation-only follow-ups (do not substitute 9:16)`,
        ]
      : []),
    ...(prior.modelId ? [`Prior image model: ${prior.modelId}`] : []),
    ...(prior.styleTags?.length ? [`Style tags: ${prior.styleTags.join(", ")}`] : []),
    ...(prior.outputElementId ? [`Last output element id: ${prior.outputElementId}`] : []),
    ...(prior.outputFileId ? [`Last output file id: ${prior.outputFileId}`] : []),
    "Ingredients used as references (only these; never invent new ones):",
    ...ingredientLines,
    ...(anchorLines.length ? ["Shared anchors:", ...anchorLines] : []),
    "Prior refinedPrompt (BASE brief):",
    prior.refinedPrompt.slice(0, 8_000),
  ].join("\n");
}

function formatRecallBlock(recall: FollowUpRecallSummary | undefined): string[] {
  if (!recall?.summary && !recall?.followUpIntent && !recall?.resolvedExactSize) return [];
  const resolvedSize = recall.resolvedExactSize || recall.aspectOverride;
  return [
    "=== SMART RECALL (Gemini 3 Flash summary of chat + last package) ===",
    ...(recall.summary ? [recall.summary.slice(0, 4_000)] : []),
    ...(recall.followUpIntent
      ? [`Interpreted follow-up intent: ${recall.followUpIntent.slice(0, 1_000)}`]
      : []),
    ...(recall.priorExactSize ? [`Prior exact size: ${recall.priorExactSize.slice(0, 64)}`] : []),
    ...(resolvedSize
      ? [
          `Resolved generation size (authoritative): ${resolvedSize.slice(0, 64)}. Use this size for the image task — do not substitute 9:16 when a custom WxH was stored.`,
        ]
      : []),
    ...(recall.styleNotes ? [`Recalled style: ${recall.styleNotes.slice(0, 500)}`] : []),
    ...(recall.campaignNotes ? [`Recalled campaign: ${recall.campaignNotes.slice(0, 800)}`] : []),
    ...(recall.agreedConstraints?.length
      ? [
          "Agreed constraints:",
          ...recall.agreedConstraints.slice(0, 12).map((item) => `- ${item.slice(0, 300)}`),
        ]
      : []),
    "Use this recall together with the structured package below. The package wins if they disagree on ingredients or copy. Resolved generation size wins over แนวตั้ง→9:16.",
    "",
  ];
}

/**
 * Builds director-facing prompt text that carries prior refinedPrompt + dimensions
 * when the user asks for more variations or a short revision without restating the brief.
 */
export function composeFollowUpDirectorPrompt(
  currentPrompt: string,
  prior: PriorImageGenerationContext,
  options?: { recall?: FollowUpRecallSummary | null; kind?: ImageFollowUpKind | null },
): string {
  const countHint = currentPrompt.trim();
  const kind = options?.kind ?? classifyImageFollowUpPrompt(currentPrompt) ?? "variation";
  const packageBlock = formatGenerationPackageForPrompt(prior);
  const recallLines = formatRecallBlock(options?.recall ?? undefined);

  const anchorLines =
    prior.sharedAnchors && prior.sharedAnchors.length > 0
      ? [
          "=== SHARED ANCHORS (Layer 1 — LOCKED unless the user explicitly overrides) ===",
          ...prior.sharedAnchors.map((a) => `- ${a.label}: ${a.detail}`),
          "Never change text/logo/brand colors/hierarchy listed above unless the follow-up says so.",
        ]
      : [];
  const variantLines =
    kind === "variation"
      ? prior.variantSelections && prior.variantSelections.length > 0
        ? [
            "=== PRIOR VARIANT AXES (Layer 2 — safe to differentiate) ===",
            ...prior.variantSelections.map(
              (v) =>
                `- ${v.axisTitle}: ${v.label}${v.character ? ` (${v.character})` : ""} → ${v.modifier}`,
            ),
            "For additional outputs, change at least two Layer-2 axes (mood / background structure / signature role / density) so each image has a distinct character pole — do not produce clones of the same personality.",
          ]
        : [
            "=== VARIATION STRATEGY ===",
            "No structured variant axes were stored. Still keep Layer-1 constraints from the prior brief; differentiate only mood, composition density, lighting accent, or secondary props.",
          ]
      : [
          "=== REVISION STRATEGY ===",
          "Apply the user's new instruction on top of the last generation. Keep copy, brand, ingredients, and style unless the follow-up overrides them.",
          "If the user only changes orientation (แนวตั้ง / แนวนอน / vertical / portrait / landscape) and the last size was custom WxH (including cm): SWAP the axes (29×7cm → 7×29cm). Do NOT replace with 9:16 / 3:4 / 16:9 unless the last size was a named aspect — then flip that named aspect (16:9↔9:16, 3:4↔4:3, 3:1↔1:3).",
          "Rebuild the layout for the resolved frame — do not start a blank new campaign.",
        ];

  const continuationRules =
    kind === "revision"
      ? [
          "CONTINUATION RULES:",
          "- This is a REVISION of the last generated image, not a new brief from a blank slate.",
          "- Read the chat recall + structured package, then apply only the new instruction.",
          "- Re-use the same ingredients and campaign copy unless the user overrides them. Never invent extra reference photos.",
          "- Attached images (when present): the first image is the last output to revise (image-to-image); later images are the original ingredients.",
          "- Prefer specialist image_editor when the last output is attached.",
          "- requestedOutputCount MUST be 1 for orientation/size revisions (แนวตั้ง / แนวนอน / cm resize) unless the user also explicitly asks for N outputs (ขอ N แบบ / สร้าง N รูป) or lists multiple distinct sizes.",
          "- Never invent a variation count for a short revision. One follow-up instruction = one image.",
          "- refinedPrompt must restate the full prior brief in English, then apply the follow-up change, and must include the resolved exact size (swapped custom WxH or flipped named aspect — never a default 9:16 when a custom size exists).",
          "- If this was a brand/shelf-sign job, never invent new slogans or drop the logo.",
        ]
      : [
          "CONTINUATION RULES:",
          "- Keep Shared Anchors identical across all new outputs.",
          "- Produce distinct Layer-2 variations — do not clone the prior image.",
          "- Re-include the same ingredient references. Never invent extras.",
          "- refinedPrompt must restate the full base brief in English, enriched for variation, and must explicitly include the prior aspect ratio unless the user changed it.",
          "- requestedOutputCount must match the follow-up quantity when the user asked for N more images.",
          "- If the user did not ask for N more images and did not list multiple sizes, requestedOutputCount must be 1.",
          "- If this was a brand/shelf-sign job, never invent new copy or move the logo to create variety.",
        ];

  return [
    `User follow-up request: ${countHint}`,
    "",
    ...recallLines,
    packageBlock,
    "",
    ...anchorLines,
    ...(anchorLines.length ? [""] : []),
    ...variantLines,
    "",
    ...continuationRules,
  ].join("\n");
}

export function toContinuityHistory(
  messages: readonly {
    role?: string;
    content?: string;
    kind?: string;
    generationContext?: PriorImageGenerationContext;
  }[],
): ContinuityHistoryMessage[] {
  const history: ContinuityHistoryMessage[] = [];
  for (const message of messages) {
    if (message.kind === "progress") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (typeof message.content !== "string") continue;
    history.push({
      role: message.role,
      content: message.content,
      ...(message.generationContext ? { generationContext: message.generationContext } : {}),
    });
  }
  return history;
}

/**
 * Serializes recent chat for the Director / recall APIs.
 * Annotates the latest generation package onto that assistant turn so history
 * is not just thin completion copy.
 */
export function serializeConversationHistoryForDirector(
  history: readonly ContinuityHistoryMessage[] | undefined,
  options?: { currentPrompt?: string; limit?: number },
): { role: "user" | "assistant"; content: string }[] {
  const limit = options?.limit ?? DIRECTOR_CONVERSATION_HISTORY_LIMIT;
  const rows = (history ?? []).filter((message) => message.content.trim().length > 0);
  const sliced = rows.slice(-limit);
  let packageIndex = -1;
  for (let i = sliced.length - 1; i >= 0; i--) {
    if (sliced[i]?.role === "assistant" && sliced[i]?.generationContext?.refinedPrompt) {
      packageIndex = i;
      break;
    }
  }

  const serialized: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = 0; i < sliced.length; i++) {
    const message = sliced[i]!;
    let content = message.content.slice(0, DIRECTOR_HISTORY_MESSAGE_MAX_CHARS);
    if (i === packageIndex && message.generationContext) {
      content =
        `${content}\n\n${formatGenerationPackageForPrompt(message.generationContext)}`.slice(
          0,
          12_000,
        );
    }
    if (
      options?.currentPrompt &&
      message.role === "user" &&
      message.content.trim() === options.currentPrompt.trim() &&
      i === sliced.length - 1
    ) {
      continue;
    }
    serialized.push({ role: message.role, content });
  }
  return serialized;
}

/**
 * Finds the most recent successful image generation context from chat history.
 * Prefers structured generationContext on assistant turns; falls back to scanning
 * prior user prompts that look like image briefs.
 */
export function extractPriorImageGenerationContext(
  history: readonly ContinuityHistoryMessage[] | undefined,
): PriorImageGenerationContext | null {
  if (!history?.length) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === "assistant" && msg.generationContext?.refinedPrompt) {
      return msg.generationContext;
    }
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role !== "user") continue;
    const looksLikeImageBrief =
      hasExplicitDimensionsInText(msg.content) ||
      /(?:สร้าง|วาด|ทำ|เจน|ออกแบบ|generate|create|draw).{0,60}(?:รูป|ภาพ|image|poster|banner|ป้าย)/iu.test(
        msg.content,
      );
    if (!looksLikeImageBrief) continue;
    if (isImageFollowUpPrompt(msg.content) && msg.content.length < 80) continue;

    const dims = hasExplicitDimensionsInText(msg.content)
      ? resolveImageGenerationDimensions(msg.content)
      : { width: 1024, height: 1024, aspectRatio: "1:1" as const };
    const assistantAfter = history.slice(i + 1).find((m) => m.role === "assistant");
    return snapshotGenerationContext({
      userPrompt: msg.content,
      refinedPrompt: msg.content,
      summary: assistantAfter?.content?.slice(0, 500),
      width: dims.width,
      height: dims.height,
      aspectRatio: dims.aspectRatio,
      ratioClamped: dims.ratioClamped,
      printWidth: dims.printWidth,
      printHeight: dims.printHeight,
    });
  }

  return null;
}

/**
 * Resolves dimensions for a follow-up turn: current prompt → prior context → history scan.
 * Orientation-only commands invert the remembered custom size (29×7cm → 7×29cm)
 * or flip a named aspect (16:9 → 9:16) instead of defaulting to 9:16 / 16:9.
 */
export function resolveFollowUpDimensions(options: {
  prompt: string;
  prior?: PriorImageGenerationContext | null;
  conversationHistory?: readonly ContinuityHistoryMessage[];
  clarificationOriginalPrompt?: string;
  directionRefinedPrompt?: string;
  directionSummary?: string;
}): FollowUpResolvedSize | null {
  const {
    prompt,
    prior,
    conversationHistory,
    clarificationOriginalPrompt,
    directionRefinedPrompt,
    directionSummary,
  } = options;

  const command = followUpCommandText(prompt);
  const orientation = parseFollowUpOrientation(command);
  const hasConcreteSize = hasNumericOrNamedSizeInText(command);
  const priorFromHistory = prior ?? extractPriorImageGenerationContext(conversationHistory);

  if (hasConcreteSize) {
    return resolveImageGenerationDimensions(command);
  }
  if (clarificationOriginalPrompt && hasNumericOrNamedSizeInText(clarificationOriginalPrompt)) {
    return resolveImageGenerationDimensions(clarificationOriginalPrompt);
  }

  if (orientation && isImageFollowUpPrompt(command) && priorFromHistory) {
    return toPublicFollowUpSize(applyOrientationToPriorSize(priorFromHistory, orientation));
  }

  // Fresh requests (and follow-ups with no prior size) still honor แนวตั้ง→9:16 / แนวนอน→16:9.
  if (hasExplicitDimensionsInText(command)) {
    return resolveImageGenerationDimensions(command);
  }
  if (clarificationOriginalPrompt && hasExplicitDimensionsInText(clarificationOriginalPrompt)) {
    return resolveImageGenerationDimensions(clarificationOriginalPrompt);
  }

  if (!isImageFollowUpPrompt(command)) return null;

  if (priorFromHistory?.aspectRatio && priorFromHistory.width > 0 && priorFromHistory.height > 0) {
    return toPublicFollowUpSize(resolvePriorRequestedSize(priorFromHistory));
  }

  if (conversationHistory?.length) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg?.role === "assistant" && msg.generationContext) {
        return toPublicFollowUpSize(resolvePriorRequestedSize(msg.generationContext));
      }
      if (msg?.role === "user" && hasNumericOrNamedSizeInText(msg.content)) {
        return resolveImageGenerationDimensions(msg.content);
      }
    }
  }

  if (directionRefinedPrompt && hasNumericOrNamedSizeInText(directionRefinedPrompt)) {
    return resolveImageGenerationDimensions(directionRefinedPrompt);
  }
  if (directionSummary && hasNumericOrNamedSizeInText(directionSummary)) {
    return resolveImageGenerationDimensions(directionSummary);
  }
  if (directionRefinedPrompt && hasExplicitDimensionsInText(directionRefinedPrompt)) {
    return resolveImageGenerationDimensions(directionRefinedPrompt);
  }
  if (directionSummary && hasExplicitDimensionsInText(directionSummary)) {
    return resolveImageGenerationDimensions(directionSummary);
  }

  return null;
}
