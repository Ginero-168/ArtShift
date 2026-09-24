import { describe, expect, it } from "vitest";
import {
  absorbModelDelta,
  decodeReplicateOutputData,
  drainSseBuffer,
  encodeDirectorSse,
  extractDirectorStreamThought,
  parseDirectorSseFrame,
} from "@/lib/ai/orchestration/directorStream";

describe("director stream text", () => {
  it("grows a partial summary without revealing the image prompt", () => {
    const partial =
      '{"kind":"image-task","summary":"แมวนั่งริมหน้าต่าง","refinedPrompt":"a photorealistic cat';
    expect(extractDirectorStreamThought(partial)).toBe("แมวนั่งริมหน้าต่าง");
    expect(extractDirectorStreamThought(partial)).not.toContain("photorealistic");
  });

  it("reads the nested answer inside a tool-call envelope as tokens arrive", () => {
    const early =
      '{"kind":"tool_calls","text":"","calls":[{"name":"propose_creative_direction","input":{"kind":"answer","text":"สวัสดี"}}]}';
    const later =
      '{"kind":"tool_calls","text":"","calls":[{"name":"propose_creative_direction","input":{"kind":"answer","text":"สวัสดีครับ"}}]}';
    expect(extractDirectorStreamThought(early)).toBe("สวัสดี");
    expect(extractDirectorStreamThought(later)).toBe("สวัสดีครับ");
  });

  it("prefers a clarification question and unescapes json strings", () => {
    const raw = '{"kind":"clarification","question":"โทนไหนดี\\nอบอุ่นหรือเย็น","options":["อบอุ่น"]}';
    expect(extractDirectorStreamThought(raw)).toBe("โทนไหนดี\nอบอุ่นหรือเย็น");
  });

  it("shows plain prose before any json object starts", () => {
    expect(extractDirectorStreamThought("สวัสดีครับ")).toBe("สวัสดีครับ");
    expect(extractDirectorStreamThought('{"kind":"image-task","refinedPrompt":"cat"')).toBe("");
  });

  it("absorbs cumulative provider snapshots and ignores duplicate tails", () => {
    expect(absorbModelDelta("", "สวัสดี")).toBe("สวัสดี");
    expect(absorbModelDelta("สวัสดี", "สวัสดีครับ")).toBe("สวัสดีครับ");
    expect(absorbModelDelta("สวัสดีครับ", "ครับ")).toBe("สวัสดีครับ");
    expect(absorbModelDelta("สวัสดี", "ครับ")).toBe("สวัสดีครับ");
  });

  it("parses director SSE frames and replicate output data", () => {
    const encoded = [
      encodeDirectorSse("thought", { text: "สวัสดี" }),
      encodeDirectorSse("done", {
        direction: { kind: "answer", text: "สวัสดีครับ" },
        model: "google/gemini-3-flash",
      }),
    ].join("");
    const drained = drainSseBuffer(encoded);
    expect(drained.rest).toBe("");
    expect(parseDirectorSseFrame(drained.events[0]!)).toEqual({
      event: "thought",
      text: "สวัสดี",
    });
    expect(parseDirectorSseFrame(drained.events[1]!)).toMatchObject({
      event: "done",
      model: "google/gemini-3-flash",
    });

    const split = drainSseBuffer('event: output\ndata: "สวัสดี"\n\nevent: output\ndata: "ครับ"');
    expect(split.events).toHaveLength(1);
    expect(decodeReplicateOutputData(split.events[0]!.data)).toBe("สวัสดี");
    expect(split.rest.startsWith("event: output")).toBe(true);
    expect(decodeReplicateOutputData('"ครับ"')).toBe("ครับ");
  });
});
