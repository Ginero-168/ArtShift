import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");
const studioSource = readFileSync("components/AI/AIImageGeneratorModal.tsx", "utf8");

describe("Creative Director consent copy", () => {
  it("discloses planning, optional external image search, generation, and review", () => {
    for (const source of [chatSource, studioSource]) {
      expect(source).toContain("gpt-oss-120b Creative Director");
      expect(source).toContain("Unsplash/Pexels");
      expect(source).toContain("ตรวจผลลัพธ์");
    }
  });
});
