import type { CoPilotMessage } from "@/lib/ai/coPilot";
import type { PendingClarification } from "@/lib/ai/orchestration/turnOrchestrator";

export const CHAT_HISTORY_STORAGE_PREFIX = "artshift.chatHistory.v1:";
export const CHAT_HISTORY_MAX_MESSAGES = 24;
export const CHAT_HISTORY_MAX_CHARS = 350_000;
export const CHAT_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PersistedChatQuality = "auto" | "low" | "medium" | "high" | "xhigh" | "max";

export type PersistedChatSnapshot = {
  version: 1;
  projectId: string;
  savedAt: number;
  messages: CoPilotMessage[];
  input?: string;
  pendingClarification?: PendingClarification | null;
  selectedQuality?: PersistedChatQuality;
};

function storageKey(projectId: string): string {
  return `${CHAT_HISTORY_STORAGE_PREFIX}${projectId}`;
}

/** Drop payloads that die across reloads or blow localStorage. */
function stripEphemeralUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return undefined;
  return url;
}

/** Drop ephemeral progress rows and strip heavy data-URL payloads. */
export function sanitizeMessageForPersist(message: CoPilotMessage): CoPilotMessage | null {
  if (message.kind === "progress") return null;
  const images = message.images
    ?.map((image) => {
      const url = stripEphemeralUrl(image.url);
      if (!url && !image.fileId) return null;
      return {
        ...image,
        ...(url ? { url } : { url: "" }),
      };
    })
    .filter((image): image is NonNullable<typeof image> => Boolean(image));

  return {
    ...message,
    ...(images && images.length > 0 ? { images } : { images: undefined }),
  };
}

export function trimMessagesForPersist(
  messages: readonly CoPilotMessage[],
  maxMessages = CHAT_HISTORY_MAX_MESSAGES,
): CoPilotMessage[] {
  const cleaned: CoPilotMessage[] = [];
  for (const message of messages) {
    const next = sanitizeMessageForPersist(message);
    if (next) cleaned.push(next);
  }
  if (cleaned.length <= maxMessages) return cleaned;
  return cleaned.slice(cleaned.length - maxMessages);
}

export function buildChatHistorySnapshot(input: {
  projectId: string;
  messages: readonly CoPilotMessage[];
  draft?: string;
  pendingClarification?: PendingClarification | null;
  selectedQuality?: PersistedChatQuality;
  savedAt?: number;
}): PersistedChatSnapshot {
  return {
    version: 1,
    projectId: input.projectId,
    savedAt: input.savedAt ?? Date.now(),
    messages: trimMessagesForPersist(input.messages),
    input: (input.draft ?? "").slice(0, 8_000),
    pendingClarification: input.pendingClarification ?? null,
    selectedQuality: input.selectedQuality,
  };
}

function isPersistedChatSnapshot(value: unknown): value is PersistedChatSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedChatSnapshot;
  return (
    candidate.version === 1 &&
    typeof candidate.projectId === "string" &&
    typeof candidate.savedAt === "number" &&
    Array.isArray(candidate.messages)
  );
}

export function loadChatHistorySnapshot(projectId: string): PersistedChatSnapshot | null {
  if (!projectId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedChatSnapshot(parsed) || parsed.projectId !== projectId) return null;
    if (Date.now() - parsed.savedAt > CHAT_HISTORY_MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(projectId));
      return null;
    }
    return {
      ...parsed,
      messages: trimMessagesForPersist(parsed.messages),
      input: typeof parsed.input === "string" ? parsed.input : "",
    };
  } catch {
    return null;
  }
}

export function saveChatHistorySnapshot(snapshot: PersistedChatSnapshot): boolean {
  if (!snapshot.projectId || typeof window === "undefined") return false;
  try {
    let payload = buildChatHistorySnapshot({
      projectId: snapshot.projectId,
      messages: snapshot.messages,
      draft: snapshot.input,
      pendingClarification: snapshot.pendingClarification,
      selectedQuality: snapshot.selectedQuality,
      savedAt: snapshot.savedAt,
    });
    let encoded = JSON.stringify(payload);
    // Shrink older messages if the payload is still too large.
    while (encoded.length > CHAT_HISTORY_MAX_CHARS && payload.messages.length > 4) {
      payload = {
        ...payload,
        messages: payload.messages.slice(Math.ceil(payload.messages.length / 2)),
      };
      encoded = JSON.stringify(payload);
    }
    if (encoded.length > CHAT_HISTORY_MAX_CHARS) {
      payload = { ...payload, messages: payload.messages.slice(-4), input: "" };
      encoded = JSON.stringify(payload);
    }
    window.localStorage.setItem(storageKey(payload.projectId), encoded);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(storageKey(snapshot.projectId));
    } catch {
      // ignore quota/cleanup failures
    }
    return false;
  }
}

export function clearChatHistorySnapshot(projectId: string): void {
  if (!projectId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
}

export function readProjectIdFromPath(pathname = typeof window !== "undefined" ? window.location.pathname : ""): string {
  const match = pathname.match(/\/projects\/([^/]+)\/editor(?:\/|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}
