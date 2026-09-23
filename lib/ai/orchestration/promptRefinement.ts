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
import type { PlannedVariantAxis, PromptHelperVariantPlan } from "./promptHelperVariantPlan";
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

const CATALOG_AXIS_META: Record<string, { title: string; hint?: string }> = {
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

const MAX_PLANNED_AXES = 10;
const MAX_PLANNED_OPTIONS = 15;

function sanitizePlanId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function uniqueAxisId(raw: string, seen: Set<string>, index: number): string {
  const base = sanitizePlanId(raw, `axis${index + 1}`);
  if (!seen.has(base)) return base;
  let n = 2;
  while (seen.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`.slice(0, 48);
}

function resolvePlannedOptions(
  axis: PlannedVariantAxis,
  axisId: string,
  pool: Map<string, RefinementOption>,
): RefinementOption[] {
  const custom = axis.options ?? [];
  if (custom.length > 0) {
    const resolved: RefinementOption[] = [];
    const seen = new Set<string>();
    custom.forEach((opt, index) => {
      const label = opt.label.trim().slice(0, 40);
      const modifier = (opt.modifier || label).trim().slice(0, 180);
      if (!label || !modifier) return;
      const known = pool.get(opt.id);
      const useKnown = Boolean(known && known.label === label);
      const id = useKnown
        ? opt.id
        : `${axisId}__${sanitizePlanId(opt.id || label, `opt${index + 1}`)}`;
      if (seen.has(id)) return;
      seen.add(id);
      resolved.push(
        withPreview(
          useKnown && known
            ? known
            : {
                id,
                label,
                modifier,
                character: opt.character?.trim().slice(0, 16) || undefined,
              },
        ),
      );
    });
    if (resolved.length > 0) return resolved.slice(0, MAX_PLANNED_OPTIONS);
  }

  const fromIds: RefinementOption[] = [];
  const seen = new Set<string>();
  for (const id of axis.optionIds) {
    const known = pool.get(id);
    if (!known || seen.has(known.id)) continue;
    seen.add(known.id);
    fromIds.push(withPreview(known));
  }
  return fromIds.slice(0, MAX_PLANNED_OPTIONS);
}

function catalogDimension(dim: RefinementDimension): RefinementDimension {
  return mapDimension({
    id: dim.id,
    title: dim.title,
    hint: dim.hint,
    options: dim.options.map((opt) => ({
      id: opt.id,
      label: opt.label,
      character: opt.character,
      modifier: opt.modifier,
    })),
  });
}

/**
 * Cats and dogs keep coat color + breed when the plan uses palette tones
 * or omits those axes. Other subjects are not forced onto a preset pack.
 */
function ensurePetCoatAndBreed(
  data: PromptRefinementCardData,
  planned: RefinementDimension[],
): RefinementDimension[] {
  if (data.subjectType !== "cat" && data.subjectType !== "dog") return planned;
  const source = data.subjectType === "cat" ? createCatDimensions() : createDogDimensions();
  const colorCat = source.find((dim) => dim.id === "color");
  const breedCat = source.find((dim) => dim.id === "breed");
  if (!colorCat || !breedCat) return planned;

  const align = (
    axis: RefinementDimension | undefined,
    catalog: RefinementDimension,
  ): RefinementDimension => {
    const mapped = catalogDimension(catalog);
    if (!axis) return { ...mapped, options: mapped.options.slice(0, MAX_PLANNED_OPTIONS) };
    const allowed = new Set(mapped.options.map((opt) => opt.id));
    const preferred = axis.options.filter((opt) => allowed.has(opt.id));
    if (preferred.length === 0) {
      return { ...mapped, options: mapped.options.slice(0, MAX_PLANNED_OPTIONS) };
    }
    return {
      id: mapped.id,
      title: mapped.title,
      hint: axis.hint || mapped.hint,
      options: preferred.slice(0, MAX_PLANNED_OPTIONS),
    };
  };

  const color = align(
    planned.find((dim) => dim.id === "color"),
    colorCat,
  );
  const breed = align(
    planned.find((dim) => dim.id === "breed"),
    breedCat,
  );
  const rest = planned.filter((dim) => dim.id !== "color" && dim.id !== "breed");
  return [color, breed, ...rest].slice(0, MAX_PLANNED_AXES);
}

/**
 * Apply a Gemini Level-2 plan onto a baseline refinement card.
 * The plan's axes replace the baseline. Unknown catalog ids are dropped.
 * Invented option cards (label + modifier) are kept even when they are not
 * in the fallback catalog. An empty or unusable plan leaves the card unchanged.
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

  const existingMeta = new Map(
    data.dimensions.map((dim) => [dim.id, { title: dim.title, hint: dim.hint }]),
  );

  const nextDimensions: RefinementDimension[] = [];
  const seenAxisIds = new Set<string>();
  plan.axes.forEach((axis, index) => {
    const axisId = uniqueAxisId(axis.id, seenAxisIds, index);
    seenAxisIds.add(axisId);
    const options = resolvePlannedOptions(axis, axisId, optionPool);
    if (options.length === 0) return;
    const meta = CATALOG_AXIS_META[axisId];
    const existing = existingMeta.get(axisId);
    nextDimensions.push({
      id: axisId,
      title: axis.title?.trim() || existing?.title || meta?.title || axisId,
      hint: axis.hint?.trim() || existing?.hint || meta?.hint,
      options,
    });
  });

  if (nextDimensions.length === 0) return data;

  const resolved = ensurePetCoatAndBreed(data, nextDimensions).slice(0, MAX_PLANNED_AXES);
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

/**
 * Catalog chips worth showing the planner. Pets get coat color + breed.
 * Brand briefs get brand axes. Every other subject gets an empty catalog
 * so the model invents axes instead of copying the generic photography pack.
 */
export function listPromptHelperPlanningCatalog(prompt: string): {
  axisId: string;
  options: { id: string; label: string }[];
}[] {
  const toAxis = (dim: RefinementDimension) => ({
    axisId: dim.id,
    options: dim.options.map((option) => ({ id: option.id, label: option.label })),
  });

  if (isBrandVariantBrief(prompt)) {
    return createBrandVariantDimensions().map((dim) =>
      toAxis({
        id: dim.id,
        title: dim.title,
        hint: dim.hint,
        options: dim.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          modifier: opt.modifier,
          character: opt.character,
        })),
      }),
    );
  }

  const preset = PRESETS.find((item) => item.matcher(prompt));
  if (preset?.subjectType === "cat" || preset?.subjectType === "dog") {
    return preset.dimensions.filter((dim) => dim.id === "color" || dim.id === "breed").map(toAxis);
  }
  return [];
}
