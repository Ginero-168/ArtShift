export type AIProgressStatus = "started" | "step" | "success" | "fallback" | "error";

export type AIProgressEvent = {
  taskId: string;
  operation: string;
  stage: string;
  message: string;
  status: AIProgressStatus;
  presentation?: "progress" | "result";
  progress?: number;
  timestamp: number;
};

type AIProgressListener = (event: AIProgressEvent) => void;

const listeners = new Set<AIProgressListener>();

export function reportAIProgress(
  event: Omit<AIProgressEvent, "timestamp"> & { timestamp?: number },
): void {
  const nextEvent: AIProgressEvent = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
    progress:
      typeof event.progress === "number"
        ? Math.max(0, Math.min(100, Math.round(event.progress)))
        : undefined,
  };

  for (const listener of listeners) listener(nextEvent);
}

export function subscribeAIProgress(listener: AIProgressListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Publish a completed tool result as a normal assistant message in AI Assistance Chat. */
export function reportAIResult(event: {
  taskId: string;
  operation: string;
  message: string;
  timestamp?: number;
}): void {
  reportAIProgress({
    ...event,
    stage: "result",
    status: "success",
    presentation: "result",
    progress: 100,
  });
}
