import { DEFAULT_DIRECTOR_MODEL_ID, normalizeRuntimeModelId } from "@/lib/ai/chatModelAttribution";
import { hasNumericOrNamedSizeInText } from "@/lib/ai/imageGeneration";
import {
  applyOrientationToPriorSize,
  type ContinuityHistoryMessage,
  formatGenerationPackageForPrompt,
  type PriorImageGenerationContext,
  parseFollowUpOrientation,
  resolvePriorRequestedSize,
  serializeConversationHistoryForDirector,
} from "@/lib/ai/orchestration/chatContinuity";
import type { AiAssistantChatInput, AiExecution, AiRuntime } from "@/lib/ai-runtime/contracts";

export const FOLLOW_UP_RECALL_STATUS_MESSAGE =
  "กำลังทบทวนบทสนทนาและแพ็กเกจภาพล่าสุดด้วย Gemini 3 Flash...";

/** Minimum time the Gemini recall / Director chip stays visible before image-gen. */
export const GEMINI_PLANNING_MIN_VISIBLE_MS = 900;

/**
 * Keep the Gemini summarize/plan phase on screen long enough to read
 * `google/gemini-3-flash` before the UI switches to the image model.
 */
export function holdGeminiStepVisible(
  startedAt: number,
  options: { minMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const minMs = options.minMs ?? GEMINI_PLANNING_MIN_VISIBLE_MS;
  const wait = minMs - (Date.now() - startedAt);
  if (options.signal?.aborted) {
    return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
  }
  if (wait <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      options.signal?.removeEventListener("abort", onAbort);
      resolve();
    }, wait);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export const FOLLOW_UP_RECALL_SYSTEM = [
  "You are ArtShift Memory Recall running on Gemini 3 Flash.",
  "This is step 1 of follow-up image work: SUMMARIZE requirements from the full prior chat plus the LAST IMAGE GENERATION PACKAGE before any Creative Director plan or image generate.",
  "The user sent a short follow-up that revises or continues the last generated image.",
  "Read the conversation plus the structured LAST IMAGE GENERATION PACKAGE (prompt, exact size/aspect including cm such as 29x7cm, style, model, refs, briefs/constraints).",
  "Summarize only what was actually discussed or stored. Never invent ingredients, brands, slogans, book titles, or photos that are not in the package or chat.",
  "If the package lists ingredients, those are the only allowed reference photos.",
  "Return JSON only with this shape:",
  '{ "summary": string, "agreedConstraints": string[], "styleNotes": string, "campaignNotes": string, "followUpIntent": string, "keepCopy": boolean, "keepIngredients": boolean, "priorExactSize": string | null, "resolvedExactSize": string | null, "aspectOverride": string | null }',
  "summary: 2–6 sentences covering prior brief, agreed style/copy, ingredients, last output, prior exact size, resolved follow-up size, and how the new command should apply.",
  "summary MUST name the prior exact size (e.g. 29x7cm) AND the resolved follow-up size. Orientation-only (แนวตั้ง / portrait / แนวนอน): SWAP custom WxH (29x7cm → 7x29cm) or FLIP a named aspect (16:9 → 9:16). Never write 9:16 when a custom WxH exists.",
  "followUpIntent: the new instruction interpreted in light of that memory, including the resolved exact size (not a blank new brief and not a default 9:16).",
  "priorExactSize: last stored size label (29x7cm, 16:9, …). resolvedExactSize: size to generate now (7x29cm after a vertical follow-up on 29x7cm).",
  "aspectOverride: same as resolvedExactSize when size changes; otherwise null.",
].join(" ");

export type FollowUpRecallResult = {
  summary: string;
  agreedConstraints: string[];
  styleNotes?: string;
  campaignNotes?: string;
  followUpIntent: string;
  keepCopy: boolean;
  keepIngredients: boolean;
  aspectOverride?: string;
  priorExactSize?: string;
  resolvedExactSize?: string;
  model?: string;
  source: "cloud-api" | "local-fallback";
};

export type FollowUpRecallInput = {
  followUpPrompt: string;
  conversationHistory?: readonly ContinuityHistoryMessage[];
  lastGeneration: PriorImageGenerationContext;
};

function clip(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

const PRESET_PORTRAIT_SIZE_RE = /9\s*:\s*16|3\s*:\s*4/giu;

export function priorExactSizeLabel(prior: PriorImageGenerationContext): string {
  const resolved = resolvePriorRequestedSize(prior);
  if (resolved.sizeLabel?.trim()) return resolved.sizeLabel.trim();
  if (prior.sizeLabel?.trim()) return prior.sizeLabel.trim();
  return prior.aspectRatio;
}

function resolvedOrientationAspectOverride(input: FollowUpRecallInput): string | undefined {
  const orientation = parseFollowUpOrientation(input.followUpPrompt);
  if (!orientation || hasNumericOrNamedSizeInText(input.followUpPrompt)) return undefined;
  const inverted = applyOrientationToPriorSize(input.lastGeneration, orientation);
  return inverted.sizeLabel || inverted.aspectRatio;
}

/** Size the next generate must use: flipped custom/named size, or the prior size if orientation did not change. */
export function resolvedFollowUpSizeLabel(input: FollowUpRecallInput): string {
  return resolvedOrientationAspectOverride(input) || priorExactSizeLabel(input.lastGeneration);
}

function isPresetPortraitSize(value: string): boolean {
  return /^\s*(9\s*:\s*16|3\s*:\s*4)\s*$/i.test(value);
}

export function stampResolvedSizeIntoRecallText(
  text: string,
  resolvedSize: string,
  priorSize: string,
): string {
  let next = (text || "").trim();
  if (!resolvedSize) return next;
  if (!isPresetPortraitSize(resolvedSize)) {
    next = next.replace(PRESET_PORTRAIT_SIZE_RE, resolvedSize);
  }
  if (!next.toLowerCase().includes(resolvedSize.toLowerCase())) {
    next =
      `${next} Prior exact size ${priorSize}; resolved follow-up size ${resolvedSize} (do not substitute a portrait preset when a custom WxH was stored).`.trim();
  }
  return next;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength));
}

export function buildFollowUpRecallUserPrompt(input: FollowUpRecallInput): string {
  const history = serializeConversationHistoryForDirector(input.conversationHistory, {
    currentPrompt: input.followUpPrompt,
  });
  const historyBlock =
    history.length > 0
      ? history.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n")
      : "(no earlier chat turns)";

  const priorSize = priorExactSizeLabel(input.lastGeneration);
  const orientationSize = resolvedOrientationAspectOverride(input);

  return [
    `User follow-up command: ${clip(input.followUpPrompt, 2_000)}`,
    "",
    `Prior exact size (authoritative): ${priorSize}`,
    orientationSize
      ? `Orientation-only follow-up: resolved size MUST be ${orientationSize} — never default แนวตั้ง/portrait to 9:16 when a custom WxH exists.`
      : `Keep the prior exact size ${priorSize} unless the user named a new size.`,
    "",
    "=== RECENT CHAT ===",
    historyBlock.slice(0, 60_000),
    "",
    formatGenerationPackageForPrompt(input.lastGeneration),
    "",
    "Summarize the chat + package (including exact size), then interpret the follow-up. Do not invent ingredients.",
  ].join("\n");
}

export function buildLocalFollowUpRecall(input: FollowUpRecallInput): FollowUpRecallResult {
  const prior = input.lastGeneration;
  const recentUserTurns = (input.conversationHistory ?? [])
    .filter((message) => message.role === "user" && message.content.trim())
    .slice(-6)
    .map((message) => message.content.replace(/\s+/g, " ").trim().slice(0, 240));
  const ingredientNames = prior.ingredients?.map((item) => item.displayName).filter(Boolean) ?? [];
  const priorSize = priorExactSizeLabel(prior);
  const resolvedSize = resolvedFollowUpSizeLabel(input);
  const aspectOverride = resolvedOrientationAspectOverride(input);
  const constraintBits = [
    ...(prior.sharedAnchors?.map((anchor) => `${anchor.label}: ${anchor.detail}`) ?? []),
    `exact size ${resolvedSize}`,
    prior.aspectRatio ? `aspect ${prior.aspectRatio}` : "",
    prior.campaignNotes ?? "",
  ].filter(Boolean);

  const summary = stampResolvedSizeIntoRecallText(
    [
      `Prior brief: ${clip(prior.userPrompt, 400) || "image generation"}`,
      prior.summary ? `Last result: ${clip(prior.summary, 280)}` : "",
      `Prior exact size: ${priorSize}.`,
      ingredientNames.length
        ? `Ingredients: ${ingredientNames.join(", ")}`
        : "No stored ingredient photos.",
      prior.outputElementId || prior.outputFileId
        ? "Last generated output is available to revise."
        : "",
      recentUserTurns.length ? `Recent user requests: ${recentUserTurns.join(" · ")}` : "",
      `New command: ${clip(input.followUpPrompt, 200)}`,
    ]
      .filter(Boolean)
      .join(" "),
    resolvedSize,
    priorSize,
  );

  return {
    summary,
    agreedConstraints: constraintBits.slice(0, 12),
    styleNotes: prior.styleTags?.join(", ") || undefined,
    campaignNotes: prior.campaignNotes || prior.summary,
    followUpIntent: stampResolvedSizeIntoRecallText(
      clip(input.followUpPrompt, 500) || "Revise the last generated image.",
      resolvedSize,
      priorSize,
    ),
    keepCopy: true,
    keepIngredients: true,
    ...(aspectOverride ? { aspectOverride } : {}),
    priorExactSize: priorSize,
    resolvedExactSize: resolvedSize,
    source: "local-fallback",
  };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Parse a Gemini recall payload. Ingredients are intentionally ignored —
 * only the structured last-generation package may supply reference ids.
 */
export function parseFollowUpRecallPayload(
  raw: unknown,
  input: FollowUpRecallInput,
  model?: string | null,
): FollowUpRecallResult {
  const fallback = buildLocalFollowUpRecall(input);
  const record =
    typeof raw === "string"
      ? extractJsonObject(raw)
      : raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
  if (!record) return fallback;

  const priorExactSize = priorExactSizeLabel(input.lastGeneration);
  const resolvedExactSize = resolvedFollowUpSizeLabel(input);
  const summary = stampResolvedSizeIntoRecallText(
    clip(typeof record.summary === "string" ? record.summary : fallback.summary, 4_000),
    resolvedExactSize,
    priorExactSize,
  );
  const followUpIntent = stampResolvedSizeIntoRecallText(
    clip(
      typeof record.followUpIntent === "string" ? record.followUpIntent : fallback.followUpIntent,
      1_000,
    ),
    resolvedExactSize,
    priorExactSize,
  );
  const styleNotes = clip(
    typeof record.styleNotes === "string" ? record.styleNotes : fallback.styleNotes,
    500,
  );
  const campaignNotes = clip(
    typeof record.campaignNotes === "string" ? record.campaignNotes : fallback.campaignNotes,
    800,
  );
  const aspectOverride =
    resolvedOrientationAspectOverride(input) ||
    clip(typeof record.aspectOverride === "string" ? record.aspectOverride : "", 32);

  return {
    summary: clip(summary || fallback.summary, 4_000),
    agreedConstraints: stringArray(record.agreedConstraints, 12, 300),
    ...(styleNotes ? { styleNotes } : {}),
    ...(campaignNotes ? { campaignNotes } : {}),
    followUpIntent: clip(followUpIntent || fallback.followUpIntent, 1_000),
    keepCopy: record.keepCopy !== false,
    keepIngredients: record.keepIngredients !== false,
    ...(aspectOverride ? { aspectOverride } : {}),
    priorExactSize,
    resolvedExactSize,
    ...(model ? { model } : {}),
    source: "cloud-api",
  };
}

export async function executeFollowUpRecall(
  runtime: Pick<AiRuntime, "execute">,
  input: FollowUpRecallInput,
  options: { signal?: AbortSignal; accountId?: string } = {},
): Promise<FollowUpRecallResult> {
  const execution = (await runtime.execute(
    "assistant.chat",
    {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildFollowUpRecallUserPrompt(input) }],
        },
      ],
      system: FOLLOW_UP_RECALL_SYSTEM,
      maxTokens: 2_048,
    } satisfies AiAssistantChatInput,
    {
      profile: "quality",
      modelAlias: "creative-director",
      cloudConsent: true,
      allowFallback: false,
      cache: false,
      accountId: options.accountId,
      signal: options.signal,
    },
  )) as AiExecution<import("@/lib/ai-runtime/contracts").AiAssistantChatOutput>;

  const model =
    normalizeRuntimeModelId(
      typeof execution.metadata?.model === "string" ? execution.metadata.model : null,
    ) ?? DEFAULT_DIRECTOR_MODEL_ID;

  return parseFollowUpRecallPayload(execution.output?.text ?? "", input, model);
}
