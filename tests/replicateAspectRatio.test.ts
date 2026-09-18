import { describe, expect, it } from "vitest";
import {
  aspectRatioFromDimensions,
  normalizeReplicateAspectRatio,
  REPLICATE_GPT_IMAGE_ASPECT_RATIOS,
} from "@/lib/server/ai/replicateAspectRatio";

describe("normalizeReplicateAspectRatio", () => {
  it("only emits values Replicate GPT Image accepts", () => {
    const allowed = new Set<string>(REPLICATE_GPT_IMAGE_ASPECT_RATIOS);
    for (const sample of [
      "2048x688",
      "2048x1024",
      "688x2048",
      "3:1",
      "2:1",
      "1:3",
      "29:7",
      "5:2",
      "16:9",
      "1:1",
    ]) {
      expect(allowed.has(normalizeReplicateAspectRatio(sample))).toBe(true);
    }
  });

  it("maps ultra-wide print ratios (29x7 / 3:1) onto the widest allowed landscape token", () => {
    expect(normalizeReplicateAspectRatio("3:1")).toBe("2048x1152");
    expect(normalizeReplicateAspectRatio("29:7")).toBe("2048x1152");
    expect(normalizeReplicateAspectRatio("2048x688")).toBe("2048x1152");
  });

  it("maps tall ratios onto the tallest allowed portrait token", () => {
    expect(normalizeReplicateAspectRatio("1:3")).toBe("1152x2048");
    expect(normalizeReplicateAspectRatio("688x2048")).toBe("1152x2048");
  });

  it("keeps standard named ratios", () => {
    expect(normalizeReplicateAspectRatio("16:9")).toBe("16:9");
    expect(normalizeReplicateAspectRatio("1:1")).toBe("1:1");
    expect(normalizeReplicateAspectRatio("9:16")).toBe("9:16");
  });
});

describe("aspectRatioFromDimensions", () => {
  it("snaps non-standard sizes onto an allowed Replicate token", () => {
    expect(aspectRatioFromDimensions(2048, 688)).toBe("2048x1152");
    // 2:1 is closer to 16:9 family than 3:2
    expect(aspectRatioFromDimensions(2048, 1024)).toBe("2048x1152");
  });

  it("keeps 16:9 family for true landscape video ratio", () => {
    expect(["16:9", "2048x1152", "3840x2160"]).toContain(aspectRatioFromDimensions(1280, 720));
  });
});
