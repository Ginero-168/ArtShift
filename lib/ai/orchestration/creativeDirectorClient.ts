import { normalizeRuntimeModelId } from "@/lib/ai/chatModelAttribution";
import type {
  CreativeDirection,
  CreativeDirectorInput,
  CreativeOutputReview,
  CreativeOutputReviewInput,
} from "@/lib/ai/orchestration/creativeDirector";
import { parseCreativeDirection } from "@/lib/ai/orchestration/creativeDirector";
import { drainSseBuffer, parseDirectorSseFrame } from "@/lib/ai/orchestration/directorStream";

type RemoteDirectorInput = Omit<
  CreativeDirectorInput,
  "availableCapabilities" | "cloudConsent" | "accountId"
>;

export async function prepareRemoteOrchestratorTurn(
  input: RemoteDirectorInput,
  options: {
    signal?: AbortSignal;
    cloudConsent?: boolean;
    /** Growing user-visible Director text. Omit to keep the JSON request/response path. */
    onThoughtText?: (text: string) => void;
  } = {},
): Promise<CreativeDirection> {
  const wantsStream = typeof options.onThoughtText === "function";
  const response = await fetch("/api/ai/director", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      accept: wantsStream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify({ ...input, cloudConsent: options.cloudConsent === true }),
    signal: options.signal,
  });
  if (
    wantsStream &&
    response.ok &&
    (response.headers.get("content-type") ?? "").includes("text/event-stream")
  ) {
    return consumeDirectorEventStream(response, input, options.onThoughtText);
  }
  const payload = (await response.json().catch(() => null)) as {
    direction?: unknown;
    model?: unknown;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || `Creative Director request failed: ${response.status}`);
  }

  return directionFromPayload(payload?.direction, payload?.model, input);
}

async function consumeDirectorEventStream(
  response: Response,
  input: RemoteDirectorInput,
  onThoughtText?: (text: string) => void,
): Promise<CreativeDirection> {
  if (!response.body) {
    throw new Error("Creative Director stream was empty.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let direction: unknown;
  let model: unknown;
  let sawDone = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const drained = drainSseBuffer(buffer);
    buffer = drained.rest;
    for (const frame of drained.events) {
      const event = parseDirectorSseFrame(frame);
      if (!event) continue;
      if (event.event === "thought") {
        onThoughtText?.(event.text);
        // Let the Thought body paint this snapshot before the next one, and
        // before `done` returns into the caller that clears the live turn.
        await afterNextPaint();
      } else if (event.event === "done") {
        sawDone = true;
        direction = event.direction;
        model = event.model;
      } else if (event.event === "error") {
        throw new Error(event.error);
      }
    }
  }
  if (!sawDone) {
    throw new Error("Creative Director stream ended before a plan was ready.");
  }
  return directionFromPayload(direction, model, input);
}

/** Wait until the browser has had a chance to paint the latest Thought snapshot. */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => {
            setTimeout(() => callback(0), 16);
          };
    raf(() => raf(() => finish()));
    setTimeout(finish, 48);
  });
}

function directionFromPayload(
  directionValue: unknown,
  model: unknown,
  input: RemoteDirectorInput,
): CreativeDirection {
  let rawDirection = directionValue;
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
          // biome-ignore lint/suspicious/noControlCharactersInRegex: sanitize control characters
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
            const firstCall = parsed.calls.find((c: unknown) => isRecord(c) && isRecord(c.input)) as
              | { input: unknown }
              | undefined;
            if (firstCall && isRecord(firstCall.input)) {
              rawDirection = firstCall.input;
            }
          }
        }
      }
    } catch {}
  }

  try {
    const direction = normalizeCreativeDirection(rawDirection, input);
    const runtimeModel =
      normalizeRuntimeModelId(typeof model === "string" ? model : null) ??
      (isRecord(rawDirection) && typeof rawDirection.runtimeModel === "string"
        ? normalizeRuntimeModelId(rawDirection.runtimeModel)
        : null);
    return runtimeModel ? { ...direction, runtimeModel } : direction;
  } catch (err) {
    throw new Error(`Invalid Creative Director response: ${(err as Error).message}`);
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
