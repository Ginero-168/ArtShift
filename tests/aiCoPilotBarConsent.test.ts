import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");

describe("CoPilot cloud consent gate", () => {
  it("does not hardcode Creative Director consent as true", () => {
    expect(source).toContain("ensureCloudConsent");
    expect(source).not.toContain("const consent = true");
    expect(source).not.toContain("const remoteConsent = true");
  });

  it("still answers local canvas inventory without requiring consent first", () => {
    expect(source).toContain("isCanvasInventoryPrompt");
    const inventoryIndex = source.indexOf("isCanvasInventoryPrompt(promptToSend)");
    const consentIndex = source.indexOf("const consent = ensureCloudConsent()");
    expect(inventoryIndex).toBeGreaterThan(0);
    expect(consentIndex).toBeGreaterThan(inventoryIndex);
  });

  it("asks consent before reference vision and sends cloudConsent to Gemini analysis", () => {
    const analysisIndex = source.indexOf("hasImageContext && analysesForTurn.length === 0");
    const visionConsentIndex = source.indexOf("const visionConsent = ensureCloudConsent()");
    const directorConsentIndex = source.indexOf("const consent = ensureCloudConsent()");
    expect(analysisIndex).toBeGreaterThan(0);
    expect(visionConsentIndex).toBeGreaterThan(analysisIndex);
    expect(visionConsentIndex).toBeLessThan(directorConsentIndex);
    expect(source).toContain("{ cloudConsent: true }");
    expect(source).toContain("DEFAULT_CLOUD_VISION_LABEL");
    expect(source).toContain("cloudVisionStatusMessage");
  });
});
