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
  let rawDirection = payload?.direction;
  if (
    isRecord(rawDirection) &&
    rawDirection.kind === "answer" &&
    typeof rawDirection.text === "string"
  ) {
    try {
      const trimmed = rawDirection.text.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        const parsed = JSON.parse(trimmed);
        if (
          isRecord(parsed) &&
          (parsed.kind === "image-task" ||
            parsed.kind === "clarification" ||
            parsed.kind === "design-plan" ||
            parsed.kind === "sequential-plan")
        ) {
          rawDirection = parsed;
        }
      }
    } catch {}
  }
  if (!response.ok || !isCreativeDirection(rawDirection, input)) {
    throw new Error(payload?.error || `Creative Director request failed: ${response.status}`);
  }
  return rawDirection;
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

function isCreativeDirection(
  value: unknown,
  input: Omit<CreativeDirectorInput, "availableCapabilities" | "cloudConsent" | "accountId">,
): value is CreativeDirection {
  if (!isRecord(value)) return false;
  try {
    parseCreativeDirection(
      value,
      {
        prompt: "validate response",
        canvasSummary: { objectCount: 0, selectedCount: 0, width: 1, height: 1 },
        referenceAnalyses: input.referenceAnalyses,
        availableCapabilities: ["IMAGE_DEFAULT", "IMAGE_EDIT"],
      },
      Array.isArray(value.knowledgeSkillIds) ? value.knowledgeSkillIds : [],
    );
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
