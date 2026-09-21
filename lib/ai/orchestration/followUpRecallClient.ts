import { serializeConversationHistoryForDirector } from "@/lib/ai/orchestration/chatContinuity";
import {
  buildLocalFollowUpRecall,
  type FollowUpRecallInput,
  type FollowUpRecallResult,
  parseFollowUpRecallPayload,
} from "@/lib/ai/orchestration/followUpRecall";

export async function recallFollowUpContext(
  input: FollowUpRecallInput,
  options: { signal?: AbortSignal; cloudConsent?: boolean } = {},
): Promise<FollowUpRecallResult> {
  if (options.cloudConsent !== true) {
    return buildLocalFollowUpRecall(input);
  }

  try {
    const response = await fetch("/api/ai/recall", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        followUpPrompt: input.followUpPrompt,
        conversationHistory: serializeConversationHistoryForDirector(input.conversationHistory, {
          currentPrompt: input.followUpPrompt,
        }),
        lastGeneration: input.lastGeneration,
        insertedPromptImages: (input.insertedRefs ?? [])
          .filter(
            (ref) => (ref.sourceWidth || ref.width) > 0 && (ref.sourceHeight || ref.height) > 0,
          )
          .slice(0, 4)
          .map((ref) => ({
            objectId: ref.objectId,
            fileId: ref.fileId,
            displayName: ref.displayName,
            sourceWidth: ref.sourceWidth || ref.width,
            sourceHeight: ref.sourceHeight || ref.height,
            width: ref.width,
            height: ref.height,
          })),
        cloudConsent: true,
      }),
      signal: options.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      recall?: unknown;
      model?: unknown;
      error?: string;
    } | null;
    if (!response.ok || !payload) {
      return buildLocalFollowUpRecall(input);
    }
    return parseFollowUpRecallPayload(
      payload.recall,
      input,
      typeof payload.model === "string" ? payload.model : null,
    );
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return buildLocalFollowUpRecall(input);
  }
}
