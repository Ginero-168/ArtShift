import { describe, expect, it } from "vitest";
import {
  promptHelperThumbPath,
  promptHelperThumbSrc,
} from "@/lib/ai/orchestration/promptHelperThumbManifest";

describe("promptHelperThumbManifest", () => {
  it("serves thumbs through the dynamic API so post-build files are visible", () => {
    expect(promptHelperThumbPath("scottish")).toBe("/api/ai/prompt-helper/thumbs/scottish");
    expect(promptHelperThumbSrc("maine-coon")).toBe("/api/ai/prompt-helper/thumbs/maine-coon");
    expect(promptHelperThumbPath("vibrant")).toContain("/api/ai/prompt-helper/thumbs/");
    expect(promptHelperThumbPath("vibrant")).not.toContain(".jpg");
  });
});
