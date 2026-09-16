import { describe, expect, it } from "vitest";
import { formatImageCompletionReply } from "@/lib/ai/imageCompletionReply";
import {
  buildPromptStructure,
  formatAspectOrientationLabel,
  formatFriendlyAspectRatio,
  formatHumanThoughtText,
} from "@/lib/ai/imageResultPresentation";

describe("formatImageCompletionReply", () => {
  it("formats generate replies with Scene / Tone / Framing summary", () => {
    const text = formatImageCompletionReply("ร้านกาแฟ", 2, ["มินิมอล", "อบอุ่น"]);
    expect(text).toContain('เสร็จแล้ว งาน "มินิมอล" พร้อมแล้ว (2 รูป)');
    expect(text).toContain("Scene:");
    expect(text).toContain("Tone:");
    expect(text).toContain("Framing:");
  });

  it("formats edit replies and strips mention tokens", () => {
    const text = formatImageCompletionReply("@[Cover:img1] ปกหนังสือ", 1, undefined, true);
    expect(text).toContain('เสร็จแล้ว ปรับแต่ง "ปกหนังสือ" เรียบร้อย 1 รูป');
  });
});

describe("imageResultPresentation", () => {
  it("labels wide/tall/square orientations", () => {
    expect(formatAspectOrientationLabel(2048, 688)).toBe("Wide");
    expect(formatAspectOrientationLabel(688, 2048)).toBe("Tall");
    expect(formatAspectOrientationLabel(1024, 1024)).toBe("Square");
  });

  it("formats friendly 3:1 from custom pixel size", () => {
    expect(formatFriendlyAspectRatio(2048, 688)).toBe("3:1");
  });

  it("builds human thought without technical jargon", () => {
    const thought = formatHumanThoughtText({
      rawPrompt: "สร้างรูปสงครามไซเบอร์ 60x20cm",
      directionSummary: "งานศิลปะสงครามไซเบอร์อนาคตแบบพาโนรามา",
      count: 1,
      width: 2048,
      height: 688,
      aspectRatio: "2048x688",
    });
    expect(thought).toMatch(/จะสร้าง/);
    expect(thought).not.toMatch(/Detail Score|Precision|Sub-Agent|Creative Director/i);
    expect(thought).toMatch(/3:1|60/);
  });

  it("builds prompt structure fields for How I created this", () => {
    const sections = buildPromptStructure({
      userPrompt: "สร้างรูปสงครามไซเบอร์ในอนาคต 60x20cm",
      summary: "พาโนรามาไซเบอร์นีออนแบบภาพวาด",
      refinedPrompt:
        "futuristic cyber warfare, neon lights, cinematic wide angle, painterly brush texture, sharp dramatic lighting",
      width: 2048,
      height: 688,
      aspectRatio: "2048x688",
    });
    expect(sections.map((s) => s.label)).toEqual([
      "Scene",
      "Color Palette",
      "Style",
      "Camera Angle",
      "Lighting",
      "Art Style",
      "Format",
    ]);
    expect(sections.find((s) => s.label === "Format")?.value).toContain("60x20cm");
  });
});
