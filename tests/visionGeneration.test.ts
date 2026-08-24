import { describe, expect, it } from "vitest";
import { getVisionGenerationConfig } from "@/lib/vision/visionGeneration";

describe("Florence generation tuning", () => {
  it("uses a small deterministic beam search for structured detection", () => {
    expect(getVisionGenerationConfig("<OD>")).toEqual({
      max_new_tokens: 1024,
      num_beams: 3,
      do_sample: false,
    });
    expect(getVisionGenerationConfig("<DENSE_REGION_CAPTION>").num_beams).toBe(3);
  });

  it("keeps caption tasks on deterministic greedy decoding", () => {
    expect(getVisionGenerationConfig("<DETAILED_CAPTION>")).toEqual({
      max_new_tokens: 100,
      num_beams: 1,
      do_sample: false,
    });
    expect(getVisionGenerationConfig("<MORE_DETAILED_CAPTION>").max_new_tokens).toBe(100);
  });
});
