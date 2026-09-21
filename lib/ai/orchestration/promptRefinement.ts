/**
 * Interactive Prompt Refinement Engine
 * Builds structured pickers (with visual previews) that feed the Orchestrator:
 * - Shared Anchors (Layer 1) lock identity across turns
 * - Variant axes (Layer 2) are the only safe differences on follow-ups
 */

import type { SharedAnchorLock, VariantSelectionLock } from "./chatContinuity";
import { deriveGeneratedImageName } from "./imageNaming";
import {
  createCatDimensions,
  createDogDimensions,
  createGenericOptionSetDimensions,
  createLandscapeDimensions,
  createPortraitDimensions,
} from "./promptHelperOptionSets";
import type { PromptHelperVariantPlan } from "./promptHelperVariantPlan";
import {
  createBrandVariantDimensions,
  inferSharedAnchors,
  isBrandVariantBrief,
  type OptionPreview,
  resolveOptionPreview,
  type SharedAnchorHint,
} from "./promptOptionCatalog";

export interface RefinementOption {
  id: string;
  label: string;
  modifier: string;
  /** Short character pole shown under thumbnail */
  character?: string;
  preview?: OptionPreview;
}

export interface RefinementDimension {
  id: string;
  title: string;
  /** One-line guidance under the row title */
  hint?: string;
  options: RefinementOption[];
}

export type RefinementMode = "subject" | "brand-variant" | "generic";

export interface PromptRefinementCardData {
  id: string;
  originalPrompt: string;
  baseSubject: string;
  subjectType: "cat" | "dog" | "portrait" | "landscape" | "generic" | "brand";
  mode: RefinementMode;
  /** Layer-1 locks shown as read-only chips (brand / ratio / refs) */
  sharedAnchors: SharedAnchorHint[];
  dimensions: RefinementDimension[];
  /** Alias for dimensions to support various caller conventions */
  categories: RefinementDimension[];
  selectedOptions: Record<string, string | null>;
}

function withPreview(option: RefinementOption): RefinementOption {
  if (option.preview) return option;
  const preview = resolveOptionPreview(option.id);
  return preview ? { ...option, preview } : option;
}

function mapDimension(
  dim: Omit<RefinementDimension, "options"> & { options: RefinementOption[] },
): RefinementDimension {
  return {
    ...dim,
    options: dim.options.map(withPreview),
  };
}

/** Determines if a user prompt is broad and could benefit from interactive refinement */
export function isBroadImagePrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;

  if (
    /^(สวัสดี|hello|hi|hey|ช่วยอะไรได้บ้าง|ทำอะไรได้บ้าง|ลบ|ย้าย|เปลี่ยนสีพื้นหลังสไลด์|แก้ข้อความ|undo|redo)/i.test(
      trimmed,
    )
  ) {
    return false;
  }

  // Brand / shelf / ad briefs always benefit from Anchor+Variant picker
  if (isBrandVariantBrief(trimmed)) return true;

  const imageKeywords = [
    "สร้างรูป",
    "สร้างภาพ",
    "วาดรูป",
    "วาดภาพ",
    "ขอรูป",
    "ขอภาพ",
    "ทำรูป",
    "ทำภาพ",
    "รูปแมว",
    "รูปหมา",
    "รูปคน",
    "รูปวิว",
    "ภาพแมว",
    "ภาพหมา",
    "ภาพคน",
    "ภาพวิว",
    "draw",
    "generate",
    "create image",
    "paint",
    "photo of",
    "picture of",
  ];

  const hasImageKeyword = imageKeywords.some((kw) =>
    trimmed.toLowerCase().includes(kw.toLowerCase()),
  );
  if (!hasImageKeyword) return false;

  if (trimmed.length > 100 || trimmed.split(/\s+/).length > 18) {
    // Long brand briefs still open helper; long subject briefs do not
    return isBrandVariantBrief(trimmed);
  }

  const detailIndicators = [
    /มุมกล้อง|close-up|wide angle|eye-level|bird eye/i.test(trimmed),
    /แสง|lighting|golden hour|cinematic|neon/i.test(trimmed),
    /พื้นหลัง|ฉาก|background|environment|ริมทะเล|บนเตียง|ในห้อง/i.test(trimmed),
    /สไตล์|style|realistic|anime|3d|photorealistic|8k/i.test(trimmed),
    /นั่งอยู่บน|กำลังวิ่ง|สวมใส่|ใส่ชุด/i.test(trimmed),
  ].filter(Boolean).length;

  return detailIndicators < 2;
}

interface SubjectDimensionPreset {
  subjectType: "cat" | "dog" | "portrait" | "landscape";
  matcher: (text: string) => boolean;
  baseSubjectName: (text: string) => string;
  dimensions: RefinementDimension[];
}

const PRESETS: SubjectDimensionPreset[] = [
  {
    subjectType: "cat",
    matcher: (text) => /แมว|cat|kitten|ลูกแมว/i.test(text),
    baseSubjectName: () => "ภาพแมว",
    dimensions: createCatDimensions(),
  },
  {
    subjectType: "dog",
    matcher: (text) => /หมา|สุนัข|dog|puppy|ลูกหมา/i.test(text),
    baseSubjectName: () => "ภาพสุนัข",
    dimensions: createDogDimensions(),
  },
  {
    subjectType: "portrait",
    matcher: (text) => /คน|ผู้หญิง|ผู้ชาย|เด็ก|สาว|หนุ่ม|person|woman|man|girl|boy|portrait/i.test(text),
    baseSubjectName: () => "ภาพบุคคล",
    dimensions: createPortraitDimensions(),
  },
  {
    subjectType: "landscape",
    matcher: (text) => /วิว|ธรรมชาติ|ภูเขา|ทะเล|ท้องฟ้า|landscape|nature|mountain|beach|sky/i.test(text),
    baseSubjectName: () => "ภาพทิวทัศน์ธรรมชาติ",
    dimensions: createLandscapeDimensions(),
  },
];

function createGenericRefinementDimensions(): RefinementDimension[] {
  return createGenericOptionSetDimensions();
}

/**
 * Creates a structured PromptRefinementCardData for a given user prompt.
 * Brand/ad/shelf briefs → Shared Anchor + Variant axes (Orchestrator-aligned).
 */
export function createPromptRefinement(originalPrompt: string): PromptRefinementCardData {
  if (isBrandVariantBrief(originalPrompt)) {
    const brandDims = createBrandVariantDimensions().map((dim) =>
      mapDimension({
        id: dim.id,
        title: dim.title,
        hint: dim.hint,
        options: dim.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          character: opt.character,
          modifier: opt.modifier,
          preview: opt.preview,
        })),
      }),
    );
    return {
      id: `refinement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originalPrompt,
      baseSubject: deriveGeneratedImageName(originalPrompt),
      subjectType: "brand",
      mode: "brand-variant",
      sharedAnchors: inferSharedAnchors(originalPrompt),
      dimensions: brandDims,
      categories: brandDims,
      selectedOptions: {},
    };
  }

  const baseName = deriveGeneratedImageName(originalPrompt);
  const matchedPreset = PRESETS.find((preset) => preset.matcher(originalPrompt));
  const rawDimensions = matchedPreset
    ? matchedPreset.dimensions
    : createGenericRefinementDimensions();
  const dimensions = rawDimensions.map(mapDimension);
  const baseSubject = matchedPreset ? matchedPreset.baseSubjectName(originalPrompt) : baseName;
  const subjectType = matchedPreset ? matchedPreset.subjectType : "generic";
  const mode: RefinementMode = matchedPreset ? "subject" : "generic";

  return {
    id: `refinement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    originalPrompt,
    baseSubject,
    subjectType,
    mode,
    sharedAnchors: inferSharedAnchors(originalPrompt),
    dimensions,
    categories: dimensions,
    selectedOptions: {},
  };
}

/**
 * Builds the live dynamic prompt string from active user selections on the card.
 */
export function buildRefinedPromptString(
  data: PromptRefinementCardData,
  selections: Record<string, string | null>,
): string {
  const base = data.originalPrompt?.trim() || data.baseSubject;
  const parts: string[] = [base];

  if (data.mode === "brand-variant" && data.sharedAnchors.length > 0) {
    parts.push(`[Shared anchors locked: ${data.sharedAnchors.map((a) => a.label).join(", ")}]`);
  }

  for (const dim of data.dimensions) {
    const selected = selections[dim.id];
    if (!selected) continue;
    const option = dim.options.find(
      (opt) => opt.id === selected || opt.label.toLowerCase() === selected.toLowerCase(),
    );
    if (option) {
      parts.push(option.modifier);
    } else {
      parts.push(`${dim.title}${selected}`);
    }
  }

  return parts.join(" ");
}

/** Structured payload for Orchestrator generationContext from helper selections. */
export function buildRefinementOrchestratorLocks(
  data: PromptRefinementCardData,
  selections: Record<string, string | null>,
): {
  refinementMode: RefinementMode;
  sharedAnchors: SharedAnchorLock[];
  variantSelections: VariantSelectionLock[];
} {
  const sharedAnchors: SharedAnchorLock[] = data.sharedAnchors.map((a) => ({
    id: a.id,
    label: a.label,
    detail: a.detail,
  }));

  const variantSelections: VariantSelectionLock[] = [];
  for (const dim of data.dimensions) {
    const selected = selections[dim.id];
    if (!selected) continue;
    const option = dim.options.find(
      (opt) => opt.id === selected || opt.label.toLowerCase() === selected.toLowerCase(),
    );
    if (!option) continue;
    variantSelections.push({
      axisId: dim.id,
      axisTitle: dim.title,
      optionId: option.id,
      label: option.label,
      character: option.character,
      modifier: option.modifier,
    });
  }

  return {
    refinementMode: data.mode,
    sharedAnchors,
    variantSelections,
  };
}

function collectCatalogOptionPool(): Map<string, RefinementOption> {
  const pool = new Map<string, RefinementOption>();
  const dims = [
    ...createGenericOptionSetDimensions(),
    ...createLandscapeDimensions(),
    ...createBrandVariantDimensions(),
    ...createCatDimensions(),
    ...createDogDimensions(),
    ...createPortraitDimensions(),
  ];
  for (const dim of dims) {
    for (const opt of dim.options) {
      if (!pool.has(opt.id)) {
        pool.set(
          opt.id,
          withPreview({
            id: opt.id,
            label: opt.label,
            character: opt.character,
            modifier: opt.modifier,
          }),
        );
      }
    }
  }
  return pool;
}

/**
 * Apply a Gemini Level-2 plan onto a baseline refinement card.
 * Unknown axes/options are ignored; empty plans leave the card unchanged.
 */
export function applyPromptHelperVariantPlan(
  data: PromptRefinementCardData,
  plan: PromptHelperVariantPlan | null | undefined,
): PromptRefinementCardData {
  if (!plan?.axes?.length) return data;

  const optionPool = collectCatalogOptionPool();
  for (const dim of data.dimensions) {
    for (const opt of dim.options) optionPool.set(opt.id, opt);
  }

  const titleByAxis: Record<string, { title: string; hint?: string }> = {
    mood: { title: "คาแรคเตอร์", hint: "เลือกทิศทางความรู้สึก — แต่ละขั้วคนละบุคลิก" },
    structure: { title: "โครงสร้างพื้น", hint: "การจัดวางสีพื้นหลัง" },
    signature: { title: "ลายเซ็นกราฟิก", hint: "บทบาทขององค์ประกอบซิกเนเจอร์" },
    density: { title: "ความหนาแน่น", hint: "จัดวางแน่นหรือโล่ง" },
    color: { title: "โทนสี", hint: "ขั้วสีของภาพ" },
    background: { title: "พื้นหลัง", hint: "ฉากที่รองรับตัวแบบ" },
    camera: { title: "มุมกล้อง", hint: "มุมมองและการจัดเฟรม" },
    style: { title: "สไตล์ภาพ", hint: "ภาษาภาพหลัก" },
    scenery: { title: "บรรยากาศฉาก", hint: "ฉากทิวทัศน์" },
    atmosphere: { title: "อารมณ์ภาพ", hint: "ความรู้สึกหลักของภาพ" },
    creative: { title: "ทวิสต์สร้างสรรค์", hint: "แนวคิดเสริมที่ทำให้ prompt มีชีวิต" },
    lighting: { title: "แสง", hint: "ทิศทางและคุณภาพแสง" },
    detail: { title: "รายละเอียดผิว", hint: "ความละเอียดและวัสดุผิว" },
    weather: { title: "เวลา/อากาศ", hint: "ช่วงวันและสภาพอากาศ" },
    composition: { title: "องค์ประกอบ", hint: "การจัดวางในเฟรม" },
    breed: { title: "สายพันธุ์", hint: "สายพันธุ์ของตัวแบบ" },
    look: { title: "ลักษณะ", hint: "บุคลิกและลักษณะของบุคคล" },
  };

  const existingMeta = new Map(
    data.dimensions.map((dim) => [dim.id, { title: dim.title, hint: dim.hint }]),
  );

  const fullAxisOptions = new Map<string, RefinementOption[]>();
  for (const dim of [
    ...createGenericOptionSetDimensions(),
    ...createLandscapeDimensions(),
    ...createBrandVariantDimensions(),
    ...createCatDimensions(),
    ...createDogDimensions(),
    ...createPortraitDimensions(),
  ]) {
    if (!fullAxisOptions.has(dim.id)) {
      fullAxisOptions.set(
        dim.id,
        dim.options.map((opt) =>
          withPreview({
            id: opt.id,
            label: opt.label,
            character: opt.character,
            modifier: opt.modifier,
          }),
        ),
      );
    }
  }

  const TARGET_OPTIONS_PER_AXIS = 15;
  const nextDimensions: RefinementDimension[] = [];
  for (const axis of plan.axes) {
    const preferred = axis.optionIds
      .map((id) => optionPool.get(id))
      .filter((opt): opt is RefinementOption => Boolean(opt))
      .map(withPreview);
    if (preferred.length === 0) continue;

    const seen = new Set(preferred.map((o) => o.id));
    const padded = [...preferred];
    for (const opt of fullAxisOptions.get(axis.id) ?? []) {
      if (padded.length >= TARGET_OPTIONS_PER_AXIS) break;
      if (seen.has(opt.id)) continue;
      padded.push(opt);
      seen.add(opt.id);
    }

    const meta = existingMeta.get(axis.id) ??
      titleByAxis[axis.id] ?? {
        title: axis.id,
        hint: undefined,
      };
    nextDimensions.push({
      id: axis.id,
      title: meta.title,
      hint: meta.hint,
      options: padded.slice(0, TARGET_OPTIONS_PER_AXIS),
    });
  }

  if (nextDimensions.length === 0) return data;

  const TARGET_AXES = 10;
  let resolved =
    data.mode === "subject" && data.dimensions.length > 0
      ? mergeSubjectLockedAxes(
          data.dimensions,
          nextDimensions,
          TARGET_AXES,
          TARGET_OPTIONS_PER_AXIS,
        )
      : nextDimensions;

  if (
    !plan.preferBrandAxes &&
    data.mode !== "brand-variant" &&
    plan.situation !== "style_locked" &&
    plan.situation !== "strict_ci" &&
    resolved.length < TARGET_AXES
  ) {
    const used = new Set(resolved.map((d) => d.id));
    for (const dim of createGenericOptionSetDimensions()) {
      if (resolved.length >= TARGET_AXES) break;
      if (used.has(dim.id)) continue;
      resolved.push({
        id: dim.id,
        title: dim.title,
        hint: dim.hint,
        options: dim.options
          .slice(0, TARGET_OPTIONS_PER_AXIS)
          .map((opt) =>
            withPreview({
              id: opt.id,
              label: opt.label,
              character: opt.character,
              modifier: opt.modifier,
            }),
          ),
      });
      used.add(dim.id);
    }
  }

  const mode: RefinementMode =
    plan.preferBrandAxes || data.mode === "brand-variant" ? "brand-variant" : data.mode;

  return {
    ...data,
    mode,
    subjectType: mode === "brand-variant" ? "brand" : data.subjectType,
    dimensions: resolved,
    categories: resolved,
    selectedOptions: {},
  };
}

function mergeSubjectLockedAxes(
  locked: RefinementDimension[],
  planned: RefinementDimension[],
  maxAxes: number,
  maxOptions: number,
): RefinementDimension[] {
  const lockedClone = locked.map((dim) => ({
    id: dim.id,
    title: dim.title,
    hint: dim.hint,
    options: dim.options.slice(0, maxOptions).map(withPreview),
  }));
  const lockedById = new Map(lockedClone.map((dim) => [dim.id, dim]));

  for (const dim of planned) {
    const subjectAxis = lockedById.get(dim.id);
    if (!subjectAxis) continue;
    const allowed = new Set(subjectAxis.options.map((opt) => opt.id));
    const preferred = dim.options.filter((opt) => allowed.has(opt.id));
    if (preferred.length === 0) continue;
    const seen = new Set(preferred.map((opt) => opt.id));
    const merged = [...preferred];
    for (const opt of subjectAxis.options) {
      if (merged.length >= maxOptions) break;
      if (seen.has(opt.id)) continue;
      merged.push(opt);
      seen.add(opt.id);
    }
    subjectAxis.options = merged.slice(0, maxOptions);
  }

  const used = new Set(lockedClone.map((dim) => dim.id));
  const extras = planned.filter((dim) => !used.has(dim.id));
  return [...lockedClone, ...extras].slice(0, maxAxes);
}

/** Flattened catalog snapshot for Gemini planning prompts. */
export function listPromptHelperCatalogAxes(): {
  axisId: string;
  options: { id: string; label: string }[];
}[] {
  const sources = [
    ...createGenericOptionSetDimensions(),
    ...createLandscapeDimensions(),
    ...createBrandVariantDimensions(),
    ...createCatDimensions(),
    ...createDogDimensions(),
    ...createPortraitDimensions(),
  ];
  const byId = new Map<string, { axisId: string; options: { id: string; label: string }[] }>();
  for (const dim of sources) {
    const existing = byId.get(dim.id);
    if (!existing) {
      byId.set(dim.id, {
        axisId: dim.id,
        options: dim.options.map((o) => ({ id: o.id, label: o.label })),
      });
      continue;
    }
    const seen = new Set(existing.options.map((o) => o.id));
    for (const opt of dim.options) {
      if (!seen.has(opt.id)) {
        existing.options.push({ id: opt.id, label: opt.label });
        seen.add(opt.id);
      }
    }
  }
  return [...byId.values()];
}
