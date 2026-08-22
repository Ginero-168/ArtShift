import { beforeEach, describe, expect, it } from "vitest";
import { AI_MODE_CONFIG, AI_MODE_STORAGE_KEY, loadAIMode, saveAIMode } from "@/lib/ai/modes";

describe("ArtShift AI execution modes", () => {
  beforeEach(() => {
    window.localStorage.removeItem(AI_MODE_STORAGE_KEY);
  });

  it("exposes the local-first and paid API modes", () => {
    expect(AI_MODE_CONFIG.eco.icon).toBe("🍃");
    expect(AI_MODE_CONFIG.fast.icon).toBe("∞");
    expect(AI_MODE_CONFIG.eco.description).toContain("Local-first");
    expect(AI_MODE_CONFIG.fast.description).toContain("paid API");
  });

  it("persists a user's selected mode without affecting document state", () => {
    expect(loadAIMode()).toBe("eco");
    saveAIMode("fast");
    expect(loadAIMode()).toBe("fast");
  });
});
