import type {
  CreativeDirection,
  CreativeDirectorInput,
  CreativeOutputReview,
  CreativeOutputReviewInput,
} from "@/lib/ai/orchestration/creativeDirector";
import { parseCreativeDirection } from "@/lib/ai/orchestration/creativeDirector";

export async function prepareRemoteOrchestratorTurn(
  input: Omit<CreativeDirectorInput, "availableCapabilities" | "cloudConsent" | "accountId">,
  options: { signal?: AbortSignal; cloudConsent?: boolean } = {},
): Promise<CreativeDirection> {
  const response = await fetch("/api/ai/director", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ ...input, cloudConsent: options.cloudConsent === true }),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => null)) as {
    direction?: unknown;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || `Creative Director request failed: ${response.status}`);
  }

  let rawDirection = payload?.direction;
  if (
    isRecord(rawDirection) &&
    rawDirection.kind === "answer" &&
    typeof rawDirection.text === "string"
  ) {
    try {
      const trimmed = rawDirection.text.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        const sanitized = trimmed
          .replace(/\\'/g, "'")
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = JSON.parse(sanitized);
        }
        if (isRecord(parsed)) {
          if (
            parsed.kind === "image-task" ||
            parsed.kind === "clarification" ||
            parsed.kind === "design-plan" ||
            parsed.kind === "sequential-plan"
          ) {
            rawDirection = parsed;
          } else if (
            (parsed.kind === "tool_calls" || parsed.kind === "tool_call") &&
            Array.isArray(parsed.calls)
          ) {
            const firstCall = parsed.calls.find(
              (c: unknown) => isRecord(c) && isRecord(c.input),
            ) as { input: unknown } | undefined;
            if (firstCall && isRecord(firstCall.input)) {
              rawDirection = firstCall.input;
            }
          }
        }
      }
    } catch {}
  }

  try {
    return normalizeCreativeDirection(rawDirection, input);
  } catch (err) {
    throw new Error(payload?.error || `Invalid Creative Director response: ${(err as Error).message}`);
  }
}

/** @deprecated Use prepareRemoteOrchestratorTurn. */
export const prepareRemoteCreativeDirection = prepareRemoteOrchestratorTurn;

export async function reviewRemoteOrchestratorOutput(
  input: Omit<CreativeOutputReviewInput, "cloudConsent" | "accountId">,
  options: { signal?: AbortSignal; cloudConsent?: boolean } = {},
): Promise<CreativeOutputReview> {
  const response = await fetch("/api/ai/director/review", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ ...input, cloudConsent: options.cloudConsent === true }),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => null)) as {
    review?: unknown;
    error?: string;
  } | null;
  if (!response.ok || !isCreativeReview(payload?.review)) {
    throw new Error(payload?.error || `Creative Director review failed: ${response.status}`);
  }
  return payload.review;
}

/** @deprecated Use reviewRemoteOrchestratorOutput. */
export const reviewRemoteCreativeOutput = reviewRemoteOrchestratorOutput;

export function normalizeCreativeDirection(
  value: unknown,
  input: Omit<CreativeDirectorInput, "availableCapabilities" | "cloudConsent" | "accountId">,
): CreativeDirection {
  if (!isRecord(value)) {
    throw new Error("Creative Director response must be an object");
  }

  const validationInput: CreativeDirectorInput = {
    prompt: input.prompt || "validate response",
    canvasSummary: input.canvasSummary ?? { objectCount: 0, selectedCount: 0, width: 1, height: 1 },
    designContext: input.designContext,
    conversationHistory: input.conversationHistory,
    artworkContext: input.artworkContext,
    referenceAnalyses: input.referenceAnalyses ?? [],
    availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
  };

  const knowledgeIds = Array.isArray(value.knowledgeSkillIds)
    ? (value.knowledgeSkillIds as string[])
    : [];

  return parseCreativeDirection(value, validationInput, knowledgeIds);
}

export function isCreativeDirection(
  value: unknown,
  input: Omit<CreativeDirectorInput, "availableCapabilities" | "cloudConsent" | "accountId">,
): value is CreativeDirection {
  try {
    normalizeCreativeDirection(value, input);
    return true;
  } catch {
    return false;
  }
}

function isCreativeReview(value: unknown): value is CreativeOutputReview {
  return (
    isRecord(value) &&
    typeof value.passed === "boolean" &&
    typeof value.summary === "string" &&
    (value.repairInstruction === undefined || typeof value.repairInstruction === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

