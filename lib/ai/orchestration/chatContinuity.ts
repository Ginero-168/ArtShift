import {
  hasExplicitDimensionsInText,
  resolveImageGenerationDimensions,
} from "@/lib/ai/imageGeneration";

/**
 * Chat continuity helpers for image follow-ups
 * (e.g. "สร้างมาอีก 3 รูป" should keep prior aspect ratio + base prompt).
 */

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
};

/** Detects short follow-up / more-variations requests that rely on prior turn context. */
export function isImageFollowUpPrompt(prompt: string): boolean {
  const text = (prompt || "").trim();
  if (!text) return false;

  // Explicit continuation / more-of-the-same phrasing
  if (
    /(?:ขอตัวเลือก|ตัวเลือกเพิ่ม|เอาอีก|สร้างเพิ่ม|ทำเพิ่ม|เจนเพิ่ม|วาดเพิ่ม|ขอเพิ่ม|เพิ่มอีก|อีกแบบ|อีกรูป|อีกภาพ|variation|more\s+(?:like\s+)?(?:th(?:is|ese)|of\s+th)|another\s+(?:\d+\s+)?(?:image|variation|option))/iu.test(
      text,
    )
  ) {
    return true;
  }

  // "สร้างมาอีก 3 รูป", "ทำอีก 2 แบบ", "วาดอีกสามภาพ", "ขออีก 3"
  if (
    /(?:สร้าง|ทำ|เอา|วาด|เจน|ผลิต|ออกแบบ|ขอ|generate|create|make)\s*(?:มา|ให้|เพิ่ม)?\s*อีก(?:\s*(?:\d+|[๑-๕]|หนึ่ง|สอง|สาม|สี่|ห้า|one|two|three|four|five))?\s*(?:แบบ|รูป|ภาพ|ตัวเลือก|ชิ้น|variations?|options?|images?)?/iu.test(
      text,
    )
  ) {
    return true;
  }

  // Bare "อีก 3 รูป" / "3 แบบเพิ่ม"
  if (
    /(?:^|\s)อีก\s*(?:\d+|[๑-๕]|หนึ่ง|สอง|สาม|สี่|ห้า)?\s*(?:แบบ|รูป|ภาพ|ตัวเลือก)/iu.test(text) ||
    /(?:\d+|[๑-๕]|สอง|สาม|สี่|ห้า)\s*(?:แบบ|รูป|ภาพ|ตัวเลือก)\s*(?:เพิ่ม|อีก)/iu.test(text)
  ) {
    return true;
  }

  return false;
}

/**
 * Builds director-facing prompt text that carries prior refinedPrompt + dimensions
 * when the user asks for more variations without restating the brief.
 */
export function composeFollowUpDirectorPrompt(
  currentPrompt: string,
  prior: PriorImageGenerationContext,
): string {
  const countHint = currentPrompt.trim();
  const anchorLines =
    prior.sharedAnchors && prior.sharedAnchors.length > 0
      ? [
          "=== SHARED ANCHORS (Layer 1 — LOCKED, identical on every variant) ===",
          ...prior.sharedAnchors.map((a) => `- ${a.label}: ${a.detail}`),
          "Never change text/logo/brand colors/ratio/hierarchy listed above to create variety.",
        ]
      : [];
  const variantLines =
    prior.variantSelections && prior.variantSelections.length > 0
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
        ];

  return [
    `User follow-up request: ${countHint}`,
    "",
    "=== PRIOR IMAGE GENERATION TO CONTINUE ===",
    `Original user brief: ${prior.userPrompt.slice(0, 4_000)}`,
    ...(prior.summary ? [`Prior summary: ${prior.summary.slice(0, 1_000)}`] : []),
    `Refinement mode: ${prior.refinementMode ?? "generic"}`,
    `Prior aspect ratio / dimensions: ${prior.aspectRatio} (${prior.width}×${prior.height}) — KEEP unless the user explicitly changes ratio or size.`,
    "Prior refinedPrompt (use as BASE; create distinct variations of the same subject/style/constraints):",
    prior.refinedPrompt.slice(0, 12_000),
    "",
    ...anchorLines,
    ...(anchorLines.length ? [""] : []),
    ...variantLines,
    "",
    "CONTINUATION RULES:",
    "- Keep Shared Anchors identical across all new outputs.",
    "- Produce distinct Layer-2 variations — do not clone the prior image.",
    "- refinedPrompt must restate the full base brief in English, enriched for variation, and must explicitly include the prior aspect ratio.",
    "- requestedOutputCount must match the follow-up quantity when the user asked for N more images.",
    "- If this was a brand/shelf-sign job, never invent new copy or move the logo to create variety.",
  ].join("\n");
}

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  generationContext?: PriorImageGenerationContext;
};

/**
 * Finds the most recent successful image generation context from chat history.
 * Prefers structured generationContext on assistant turns; falls back to scanning
 * prior user prompts that look like image briefs.
 */
export function extractPriorImageGenerationContext(
  history: readonly HistoryMessage[] | undefined,
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
  conversationHistory?: readonly HistoryMessage[];
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
      if (msg.role === "assistant" && msg.generationContext) {
        const ctx = msg.generationContext;
        return { width: ctx.width, height: ctx.height, aspectRatio: ctx.aspectRatio };
      }
      if (msg.role === "user" && hasExplicitDimensionsInText(msg.content)) {
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
