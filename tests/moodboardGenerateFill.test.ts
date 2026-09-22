import { describe, expect, it, vi } from "vitest";
import { MOODBOARD_IMAGE_COUNT } from "@/lib/moodboard/constants";
import type { MoodboardImagePrompt } from "@/lib/moodboard/expandSchema";
import { generateMoodboardImages } from "@/lib/moodboard/generateFill";

const prompts: MoodboardImagePrompt[] = Array.from(
  { length: MOODBOARD_IMAGE_COUNT },
  (_, index) => ({
    label: `idea ${index + 1}`,
    role: index % 2 === 0 ? "subject" : "setting",
    prompt: `Prompt number ${index + 1}`,
  }),
);

describe("moodboard generate fill batch", () => {
  it("returns 9 images when every generation succeeds", async () => {
    const generateOne = vi.fn(async ({ prompt }: { prompt: string }) => ({
      dataUrl: `data:image/webp;base64,${prompt.length}`,
      width: 1024,
      height: 1024,
    }));
    const result = await generateMoodboardImages(prompts, {
      generateOne,
      concurrency: 3,
    });
    expect(result.images).toHaveLength(9);
    expect(result.failures).toHaveLength(0);
    expect(generateOne).toHaveBeenCalledTimes(9);
  });

  it("keeps partial successes when some of 9 fail", async () => {
    const generateOne = vi.fn(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes("3") || prompt.includes("7")) {
        throw new Error("provider failed");
      }
      return { dataUrl: "data:image/webp;base64,OK", width: 1024, height: 1024 };
    });
    const result = await generateMoodboardImages(prompts, {
      generateOne,
      concurrency: 3,
    });
    expect(result.images).toHaveLength(7);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((item) => item.index).sort()).toEqual([2, 6]);
  });
});
