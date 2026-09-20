import {
  hasExplicitDimensionsInText,
  resolveImageGenerationDimensions,
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

/**
 * Short revision of the last image: orientation, style, "ปรับ…", "ทำให้เป็น…".
 * Does not invent a new brief — relies on prior generation package + chat.
 */
export function isImageRevisionFollowUpPrompt(prompt: string): boolean {
  const text = (prompt || "").trim();
  if (!text || text.length > 240) return false;
  if (isBuiltinImageToolPrompt(text)) return false;
  if (isImageVariationFollowUpPrompt(text)) return false;

  if (
    /^(?:ช่วย|กรุณา)?\s*(?:ปรับ|ทำให้|เปลี่ยน|แปลง|make|change|convert|switch)?\s*(?:เป็น|ให้เป็น|to|it(?:\s+to)?)?\s*(?:แนวตั้ง|แนวนอน|vertical|horizontal|portrait|landscape)/iu.test(
      text,
    )
  ) {
    return true;
  }

  if (/(?:ปรับเป็น|ทำให้เป็น|เปลี่ยนเป็น|แปลงเป็น)\s*(?:แนวตั้ง|แนวนอน|แนวตั้งใหม่)/iu.test(text)) {
    return true;
  }

  if (
    /\b(?:make\s+it|change\s+(?:it\s+)?to|convert\s+to|switch\s+to)\s+(?:vertical|horizontal|portrait|landscape|tall|wide)\b/iu.test(
      text,
    )
  ) {
    return true;
  }

  if (/(?:ปรับ|ทำให้|เปลี่ยน|แปลง)\s*(?:รูป|ภาพ|ป้าย|งาน|แบนเนอร์|มัน|อันนี้)?\s*(?:ให้)?\s*เป็น/iu.test(text)) {
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
  if (isImageVariationFollowUpPrompt(prompt)) return "variation";
  if (isImageRevisionFollowUpPrompt(prompt)) return "revision";
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

export function snapshotGenerationContext(input: {
  userPrompt: string;
  refinedPrompt: string;
  summary?: string;
  width: number;
  height: number;
  aspectRatio: string;
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
  return {
    userPrompt: input.userPrompt,
    refinedPrompt: input.refinedPrompt,
    ...(input.summary ? { summary: input.summary } : {}),
    width: input.width,
    height: input.height,
    aspectRatio: input.aspectRatio,
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
  if (!recall?.summary && !recall?.followUpIntent) return [];
  return [
    "=== SMART RECALL (Gemini 3 Flash summary of chat + last package) ===",
    ...(recall.summary ? [recall.summary.slice(0, 4_000)] : []),
    ...(recall.followUpIntent
      ? [`Interpreted follow-up intent: ${recall.followUpIntent.slice(0, 1_000)}`]
      : []),
    ...(recall.styleNotes ? [`Recalled style: ${recall.styleNotes.slice(0, 500)}`] : []),
    ...(recall.campaignNotes ? [`Recalled campaign: ${recall.campaignNotes.slice(0, 800)}`] : []),
    ...(recall.agreedConstraints?.length
      ? [
          "Agreed constraints:",
          ...recall.agreedConstraints.slice(0, 12).map((item) => `- ${item.slice(0, 300)}`),
        ]
      : []),
    "Use this recall together with the structured package below. The package wins if they disagree on ingredients or copy.",
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
          "If the user changes orientation/ratio (e.g. แนวตั้ง / vertical / 9:16), change aspect accordingly and rebuild the layout for that frame — do not start a blank new campaign.",
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
          "- refinedPrompt must restate the full prior brief in English, then apply the follow-up change, and must include the resolved aspect ratio.",
          "- If this was a brand/shelf-sign job, never invent new slogans or drop the logo.",
        ]
      : [
          "CONTINUATION RULES:",
          "- Keep Shared Anchors identical across all new outputs.",
          "- Produce distinct Layer-2 variations — do not clone the prior image.",
          "- Re-include the same ingredient references. Never invent extras.",
          "- refinedPrompt must restate the full base brief in English, enriched for variation, and must explicitly include the prior aspect ratio unless the user changed it.",
          "- requestedOutputCount must match the follow-up quantity when the user asked for N more images.",
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
    return {
      userPrompt: msg.content,
      refinedPrompt: msg.content,
      summary: assistantAfter?.content?.slice(0, 500),
      width: dims.width,
      height: dims.height,
      aspectRatio: dims.aspectRatio,
    };
  }

  return null;
}

/**
 * Resolves dimensions for a follow-up turn: current prompt → prior context → history scan.
 */
export function resolveFollowUpDimensions(options: {
  prompt: string;
  prior?: PriorImageGenerationContext | null;
  conversationHistory?: readonly ContinuityHistoryMessage[];
  clarificationOriginalPrompt?: string;
  directionRefinedPrompt?: string;
  directionSummary?: string;
}): { width: number; height: number; aspectRatio: string } | null {
  const {
    prompt,
    prior,
    conversationHistory,
    clarificationOriginalPrompt,
    directionRefinedPrompt,
    directionSummary,
  } = options;

  if (hasExplicitDimensionsInText(prompt)) {
    return resolveImageGenerationDimensions(prompt);
  }
  if (clarificationOriginalPrompt && hasExplicitDimensionsInText(clarificationOriginalPrompt)) {
    return resolveImageGenerationDimensions(clarificationOriginalPrompt);
  }
  if (!isImageFollowUpPrompt(prompt)) return null;

  if (prior?.aspectRatio && prior.width > 0 && prior.height > 0) {
    return {
      width: prior.width,
      height: prior.height,
      aspectRatio: prior.aspectRatio,
    };
  }

  if (conversationHistory?.length) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg?.role === "assistant" && msg.generationContext) {
        const ctx = msg.generationContext;
        return { width: ctx.width, height: ctx.height, aspectRatio: ctx.aspectRatio };
      }
      if (msg?.role === "user" && hasExplicitDimensionsInText(msg.content)) {
        return resolveImageGenerationDimensions(msg.content);
      }
    }
  }

  if (directionRefinedPrompt && hasExplicitDimensionsInText(directionRefinedPrompt)) {
    return resolveImageGenerationDimensions(directionRefinedPrompt);
  }
  if (directionSummary && hasExplicitDimensionsInText(directionSummary)) {
    return resolveImageGenerationDimensions(directionSummary);
  }

  return null;
}
