import { describe, expect, it } from "vitest";
import {
  createInitialSessionState,
  summarizeArtworkObjects,
} from "@/lib/ai/orchestration/sessionState";

describe("Creative Director Session State & Snapshot Prototype", () => {
  it("initializes an empty session state correctly", () => {
    const session = createInitialSessionState("slide-1", "test-session-123");
    expect(session.sessionId).toBe("test-session-123");
    expect(session.activeSlideId).toBe("slide-1");
    expect(session.turns).toEqual([]);
    expect(session.snapshots).toEqual({});
    expect(session.currentSnapshotId).toBeUndefined();
    expect(session.activeGhostVariationId).toBeUndefined();
  });

  it("summarizes artwork objects into a lightweight payload without binary bloat", () => {
    const rawElements = [
      {
        id: "img-1",
        type: "image",
        layerId: "layer-bg",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        label: "Background",
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        locked: true,
      },
      {
        id: "text-1",
        type: "text",
        layerId: "layer-content",
        x: 200,
        y: 350,
        width: 600,
        height: 120,
        text: "หนังสือพัฒนาตนเองฉบับพรีเมียม เล่มใหม่ล่าสุดประจำปี",
      },
    ];

    const summaries = summarizeArtworkObjects(rawElements);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toEqual({
      id: "img-1",
      type: "image",
      layerId: "layer-bg",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      label: "Background",
      textSnippet: undefined,
      isLocked: true,
    });
    // Ensure heavy src base64 was stripped
    expect((summaries[0] as Record<string, unknown>).src).toBeUndefined();

    expect(summaries[1]).toEqual({
      id: "text-1",
      type: "text",
      layerId: "layer-content",
      x: 200,
      y: 350,
      width: 600,
      height: 120,
      label: undefined,
      textSnippet: "หนังสือพัฒนาตนเองฉบับพรีเมียม เล่มใหม่ล่าสุดประจำปี",
      isLocked: false,
    });
  });
});
