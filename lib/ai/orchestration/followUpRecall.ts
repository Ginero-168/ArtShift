import { DEFAULT_DIRECTOR_MODEL_ID, normalizeRuntimeModelId } from "@/lib/ai/chatModelAttribution";
import {
  type ContinuityHistoryMessage,
  formatGenerationPackageForPrompt,
  type PriorImageGenerationContext,
  serializeConversationHistoryForDirector,
} from "@/lib/ai/orchestration/chatContinuity";
import type { AiAssistantChatInput, AiExecution, AiRuntime } from "@/lib/ai-runtime/contracts";

export const FOLLOW_UP_RECALL_STATUS_MESSAGE =
  "กำลังทบทวนบทสนทนาและแพ็กเกจภาพล่าสุดด้วย Gemini 3 Flash...";

export const FOLLOW_UP_RECALL_SYSTEM = [
  "You are ArtShift Memory Recall running on Gemini 3 Flash.",
  "The user sent a short follow-up that revises or continues the last generated image.",
  "Read the conversation plus the structured LAST IMAGE GENERATION PACKAGE.",
  "Summarize only what was actually discussed or stored. Never invent ingredients, brands, slogans, book titles, or photos that are not in the package or chat.",
  "If the package lists ingredients, those are the only allowed reference photos.",
  "Return JSON only with this shape:",
  '{ "summary": string, "agreedConstraints": string[], "styleNotes": string, "campaignNotes": string, "followUpIntent": string, "keepCopy": boolean, "keepIngredients": boolean, "aspectOverride": string | null }',
  "summary: 2–6 sentences covering prior brief, agreed style/copy, ingredients, last output, and how the new command should apply.",
  "followUpIntent: the new instruction interpreted in light of that memory (not a blank new brief).",
  "aspectOverride: only if the user clearly changes ratio/orientation (e.g. 9:16, แนวตั้ง); otherwise null.",
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

  return [
    `User follow-up command: ${clip(input.followUpPrompt, 2_000)}`,
    "",
    "=== RECENT CHAT ===",
    historyBlock.slice(0, 60_000),
    "",
    formatGenerationPackageForPrompt(input.lastGeneration),
    "",
    "Summarize the chat + package, then interpret the follow-up. Do not invent ingredients.",
  ].join("\n");
}

export function buildLocalFollowUpRecall(input: FollowUpRecallInput): FollowUpRecallResult {
  const prior = input.lastGeneration;
  const recentUserTurns = (input.conversationHistory ?? [])
    .filter((message) => message.role === "user" && message.content.trim())
    .slice(-6)
    .map((message) => message.content.replace(/\s+/g, " ").trim().slice(0, 240));
  const ingredientNames = prior.ingredients?.map((item) => item.displayName).filter(Boolean) ?? [];
  const constraintBits = [
    ...(prior.sharedAnchors?.map((anchor) => `${anchor.label}: ${anchor.detail}`) ?? []),
    prior.aspectRatio ? `aspect ${prior.aspectRatio}` : "",
    prior.campaignNotes ?? "",
  ].filter(Boolean);

  const summary = [
    `Prior brief: ${clip(prior.userPrompt, 400) || "image generation"}`,
    prior.summary ? `Last result: ${clip(prior.summary, 280)}` : "",
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
    .join(" ");

  return {
    summary,
    agreedConstraints: constraintBits.slice(0, 12),
    styleNotes: prior.styleTags?.join(", ") || undefined,
    campaignNotes: prior.campaignNotes || prior.summary,
    followUpIntent: clip(input.followUpPrompt, 500) || "Revise the last generated image.",
    keepCopy: true,
    keepIngredients: true,
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

  const summary = clip(
    typeof record.summary === "string" ? record.summary : fallback.summary,
    4_000,
  );
  const followUpIntent = clip(
    typeof record.followUpIntent === "string" ? record.followUpIntent : fallback.followUpIntent,
    1_000,
  );
  const styleNotes = clip(
    typeof record.styleNotes === "string" ? record.styleNotes : fallback.styleNotes,
    500,
  );
  const campaignNotes = clip(
    typeof record.campaignNotes === "string" ? record.campaignNotes : fallback.campaignNotes,
    800,
  );
  const aspectOverride = clip(
    typeof record.aspectOverride === "string" ? record.aspectOverride : "",
    32,
  );

  return {
    summary: summary || fallback.summary,
    agreedConstraints: stringArray(record.agreedConstraints, 12, 300),
    ...(styleNotes ? { styleNotes } : {}),
    ...(campaignNotes ? { campaignNotes } : {}),
    followUpIntent: followUpIntent || fallback.followUpIntent,
    keepCopy: record.keepCopy !== false,
    keepIngredients: record.keepIngredients !== false,
    ...(aspectOverride ? { aspectOverride } : {}),
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
