import type {
  CreativeDirection,
  CreativeDirectorInput,
  CreativeOutputReview,
  CreativeOutputReviewInput,
} from "@/lib/ai/orchestration/creativeDirector";

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
  if (!response.ok || !isCreativeDirection(payload?.direction)) {
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

function isCreativeDirection(value: unknown): value is CreativeDirection {
  if (!isRecord(value)) return false;
  if (value.kind === "answer") return typeof value.text === "string";
  if (value.kind === "clarification") {
    return (
      typeof value.question === "string" &&
      Array.isArray(value.options) &&
      value.options.every((option) => typeof option === "string")
    );
  }
  if (value.kind !== "image-task") return false;
  return (
    typeof value.summary === "string" &&
    typeof value.refinedPrompt === "string" &&
    (value.specialist === "image_generator" || value.specialist === "image_editor") &&
    (value.capability === "IMAGE_DEFAULT" || value.capability === "IMAGE_EDIT") &&
    value.modelAlias === "image-gpt-2" &&
    Array.isArray(value.knowledgeSkillIds) &&
    Array.isArray(value.reviewCriteria) &&
    isRecord(value.search) &&
    typeof value.search.required === "boolean" &&
    Array.isArray(value.search.queries) &&
    Array.isArray(value.search.sources)
  );
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
