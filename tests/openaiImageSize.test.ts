import { describe, expect, it } from "vitest";
import { formatOpenAiImageSize, parseOpenAiImageSize } from "@/lib/server/ai/openaiImageSize";

describe("formatOpenAiImageSize", () => {
  it("preserves true 3:1 banner sizes for OpenAI direct", () => {
    expect(formatOpenAiImageSize(2048, 688)).toBe("2048x688");
    expect(formatOpenAiImageSize(1536, 512)).toBe("1536x512");
  });

  it("snaps edges to multiples of 16", () => {
    expect(formatOpenAiImageSize(2050, 690)).toBe("2048x688");
  });
});

describe("parseOpenAiImageSize", () => {
  it("parses WIDTHxHEIGHT", () => {
    expect(parseOpenAiImageSize("2048x688")).toEqual({ width: 2048, height: 688 });
  });
});
