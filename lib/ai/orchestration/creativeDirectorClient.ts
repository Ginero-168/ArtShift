import type {
  CreativeDirection,
  CreativeDirectorInput,
  CreativeOutputReview,
  CreativeOutputReviewInput,
} from "@/lib/ai/orchestration/creativeDirector";
import { parseCreativeDirection } from "@/lib/ai/orchestration/creativeDirector";

export async function prepareRemoteCreativeDirection(
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
  if (!response.ok || !isCreativeDirection(payload?.direction, input)) {
    throw new Error(payload?.error || `Creative Director request failed: ${response.status}`);
  }
  return payload.direction;
}

export async function reviewRemoteCreativeOutput(
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
