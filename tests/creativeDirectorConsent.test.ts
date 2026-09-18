import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");
const studioSource = readFileSync("components/AI/AIImageGeneratorModal.tsx", "utf8");

describe("Creative Director consent copy", () => {
  it("discloses planning, optional external image search, generation, and review in CoPilot", () => {
    expect(chatSource).toContain("Gemini 3 Flash Creative Director");
    expect(chatSource).toContain("Unsplash/Pexels");
    expect(chatSource).toContain("ตรวจผลลัพธ์");
  });

  it("Image Studio gates generation on ensureCloudConsent instead of hardcoded true", () => {
    expect(studioSource).toContain("ensureCloudConsent");
    expect(studioSource).toContain("cloudConsent: consent");
    expect(studioSource).not.toContain("const consent = true");
  });
});
