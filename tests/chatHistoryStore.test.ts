import { afterEach, describe, expect, it } from "vitest";
import type { CoPilotMessage } from "@/lib/ai/coPilot";
import {
  buildChatHistorySnapshot,
  CHAT_HISTORY_STORAGE_PREFIX,
  clearChatHistorySnapshot,
  loadChatHistorySnapshot,
  readProjectIdFromPath,
  sanitizeMessageForPersist,
  saveChatHistorySnapshot,
  trimMessagesForPersist,
} from "@/lib/ai/orchestration/chatHistoryStore";

const projectId = "proj-chat-history";

afterEach(() => {
  clearChatHistorySnapshot(projectId);
});

describe("chat history persistence", () => {
  it("strips progress rows and ephemeral image payloads", () => {
    const progress: CoPilotMessage = {
      id: "p1",
      role: "system",
      kind: "progress",
      content: "generating",
      timestamp: 1,
    };
    const withDataUrl: CoPilotMessage = {
      id: "a1",
      role: "assistant",
      content: "done",
      timestamp: 2,
      images: [
        { url: "data:image/png;base64,AAA", fileId: "file-1", width: 100, height: 100 },
        { url: "blob:https://example/abc", fileId: "file-blob" },
        { url: "https://cdn.example/x.png", fileId: "file-2" },
      ],
    };

    expect(sanitizeMessageForPersist(progress)).toBeNull();
    const cleaned = sanitizeMessageForPersist(withDataUrl);
    expect(cleaned?.images).toEqual([
      { url: "", fileId: "file-1", width: 100, height: 100 },
      { url: "", fileId: "file-blob" },
      { url: "https://cdn.example/x.png", fileId: "file-2" },
    ]);
  });

  it("keeps only the latest messages for a light resume buffer", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({
      id: `m-${index}`,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg ${index}`,
      timestamp: index,
    }));
    const trimmed = trimMessagesForPersist(messages, 24);
    expect(trimmed).toHaveLength(24);
    expect(trimmed[0]?.id).toBe("m-16");
    expect(trimmed.at(-1)?.id).toBe("m-39");
  });

  it("round-trips a project-scoped snapshot through localStorage", () => {
    const snapshot = buildChatHistorySnapshot({
      projectId,
      messages: [
        { id: "u1", role: "user", content: "สร้างภาพแมว", timestamp: 10 },
        {
          id: "a1",
          role: "assistant",
          content: "สร้างแล้ว",
          timestamp: 11,
          images: [{ url: "data:image/png;base64,AAA", fileId: "gen-1" }],
        },
      ],
      draft: "ปรับโทนอบอุ่นขึ้น",
      selectedQuality: "high",
    });

    expect(saveChatHistorySnapshot(snapshot)).toBe(true);
    const loaded = loadChatHistorySnapshot(projectId);
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[1]?.images?.[0]?.fileId).toBe("gen-1");
    expect(loaded?.messages[1]?.images?.[0]?.url).toBe("");
    expect(loaded?.input).toBe("ปรับโทนอบอุ่นขึ้น");
    expect(loaded?.selectedQuality).toBe("high");
    expect(window.localStorage.getItem(`${CHAT_HISTORY_STORAGE_PREFIX}${projectId}`)).toBeTruthy();
  });

  it("persists last image generation package including ingredients", () => {
    const snapshot = buildChatHistorySnapshot({
      projectId,
      messages: [
        { id: "u1", role: "user", content: "ป้าย Nain ลด 35%", timestamp: 10 },
        {
          id: "a1",
          role: "assistant",
          content: "สร้างแล้ว",
          timestamp: 11,
          generationContext: {
            userPrompt: "ป้าย Nain ลด 35%",
            refinedPrompt: "Pink floral Nain 35% off banner",
            width: 2048,
            height: 688,
            aspectRatio: "3:1",
            outputElementId: "out-1",
            outputFileId: "file-1",
            ingredients: [{ objectId: "cover-a", fileId: "file-a", displayName: "Cover A" }],
          },
        },
      ],
    });
    expect(saveChatHistorySnapshot(snapshot)).toBe(true);
    const loaded = loadChatHistorySnapshot(projectId);
    expect(loaded?.messages[1]?.generationContext?.ingredients).toEqual([
      { objectId: "cover-a", fileId: "file-a", displayName: "Cover A" },
    ]);
    expect(loaded?.messages[1]?.generationContext?.outputElementId).toBe("out-1");
  });

  it("persists usedModels so resumed chat still shows which model replied", () => {
    const snapshot = buildChatHistorySnapshot({
      projectId,
      messages: [
        { id: "u1", role: "user", content: "สวัสดี", timestamp: 10 },
        {
          id: "a1",
          role: "assistant",
          content: "สวัสดีครับ",
          timestamp: 11,
          usedModels: [{ id: "google/gemini-3-flash", role: "chat" }],
        },
      ],
    });
    expect(saveChatHistorySnapshot(snapshot)).toBe(true);
    const loaded = loadChatHistorySnapshot(projectId);
    expect(loaded?.messages[1]?.usedModels).toEqual([
      { id: "google/gemini-3-flash", role: "chat" },
    ]);
  });

  it("reads the project id from the editor path", () => {
    expect(readProjectIdFromPath("/projects/abc%20123/editor")).toBe("abc 123");
    expect(readProjectIdFromPath("/projects")).toBe("");
  });
});
