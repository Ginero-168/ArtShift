import { describe, expect, it } from "vitest";
import { chooseImageQuality } from "@/lib/ai/orchestration/imageQualityPolicy";

describe("automatic image quality policy (Tier 1: Low, Tier 2: Medium, Tier 3: High)", () => {
  // ===== Tier 1: Low default =====
  it("defaults ordinary generation to low (Tier 1) per policy requirement", () => {
    expect(
      chooseImageQuality({ prompt: "a cat in a room", taskClass: "simple", hasReference: false }),
    ).toMatchObject({ quality: "low" });
  });

  it("returns GENERAL_DEFAULT reason code for simple requests", () => {
    const result = chooseImageQuality({
      prompt: "สร้างภาพแมว",
      taskClass: "simple",
      hasReference: false,
    });
    expect(result.reasonCodes).toContain("GENERAL_DEFAULT");
    expect(result.quality).toBe("low");
  });

  it("allows more attempts for high quality than draft", () => {
    const high = chooseImageQuality({
      prompt: "ultra detailed masterwork print 8k",
      taskClass: "complex",
      hasReference: true,
    });
    const low = chooseImageQuality({
      prompt: "quick draft sketch of a cat",
      taskClass: "simple",
      hasReference: false,
    });
    expect(high.maxAttempts).toBeGreaterThan(low.maxAttempts);
  });

  it("uses high for complex masterwork/print fidelity (Tier 3)", () => {
    expect(
      chooseImageQuality({
        prompt: "masterwork signage print 8k ultra-detailed headline",
        taskClass: "complex",
        hasReference: true,
      }),
    ).toMatchObject({ quality: "high" });
  });

  it("never downgrades final or product work to low", () => {
    expect(
      chooseImageQuality({
        prompt: "quick draft product packaging for final print",
        taskClass: "complex",
        hasReference: false,
        finalUse: true,
      }),
    ).toMatchObject({ quality: "high" });
  });

  it("uses low for an explicit draft request", () => {
    expect(
      chooseImageQuality({
        prompt: "quick draft sketch of a cat",
        taskClass: "simple",
        hasReference: false,
      }),
    ).toMatchObject({ quality: "low" });
  });

  it("uses low for Thai draft keywords", () => {
    expect(
      chooseImageQuality({
        prompt: "ทดลองสร้างภาพร่าง",
        taskClass: "simple",
        hasReference: false,
      }),
    ).toMatchObject({ quality: "low", maxAttempts: 1 });
  });

  it("uses medium when prompt contains โลโก้/logo keyword (Tier 2)", () => {
    const result = chooseImageQuality({
      prompt: "สร้างภาพโลโก้บริษัท",
      taskClass: "simple",
      hasReference: false,
    });
    expect(result.quality).toBe("medium");
    expect(result.reasonCodes).toContain("DETAIL_RICH");
  });

  // ===== Structured features: Tier 1 (0–3), Tier 2 (4–7), Tier 3 (8–10) =====
  it("uses low when detail score 0–3 via structured features (Tier 1: Low)", () => {
    const result = chooseImageQuality({
      prompt: "a landscape",
      taskClass: "simple",
      hasReference: false,
      features: {
        constraintCount: 1,
        subjectCount: 1,
        spatialRelationCount: 0,
        referenceCount: 0,
        exactTextCount: 0,
        typographyDensity: "none",
        finalUse: false,
        speedPreference: "normal",
      },
    });
    expect(result.quality).toBe("low");
    expect(result.reasonCodes).toContain("GENERAL_DEFAULT");
  });

  it("uses medium when detail score 4–7 via structured features (Tier 2: Medium)", () => {
    const result = chooseImageQuality({
      prompt: "poster with constraints",
      taskClass: "simple",
      hasReference: false,
      features: {
        constraintCount: 4, // +2
        exactTextCount: 1, // +2 -> score 4
        subjectCount: 1,
        spatialRelationCount: 0,
        referenceCount: 0,
        typographyDensity: "none",
        finalUse: false,
        speedPreference: "normal",
      },
    });
    expect(result.quality).toBe("medium");
    expect(result.reasonCodes).toContain("DETAIL_RICH");
  });

  it("uses high when detail score >= 8 via structured features (Tier 3: High)", () => {
    const result = chooseImageQuality({
      prompt: "complex masterwork banner",
      taskClass: "complex",
      hasReference: true,
      features: {
        constraintCount: 5, // +2
        subjectCount: 3,
        spatialRelationCount: 4, // +2
        exactTextCount: 2, // +2
        brandAssetSensitivity: "high" as const, // +1
        lightingLock: true, // +1 -> score 8
        typographyDensity: "dense",
        finalUse: true,
        speedPreference: "normal",
      },
    });
    expect(result.quality).toBe("high");
    expect(result.reasonCodes).toContain("DETAIL_RICH");
  });

  it("adds FINAL_USE reason code when finalUse=true and score >= 7 (Tier 3)", () => {
    const result = chooseImageQuality({
      prompt: "final asset",
      taskClass: "simple",
      hasReference: false,
      features: {
        constraintCount: 4, // +2
        subjectCount: 2,
        spatialRelationCount: 3, // +2
        exactTextCount: 1, // +2
        brandAssetSensitivity: "high" as const, // +1 -> score 7
        finalUse: true,
        speedPreference: "normal",
      },
    });
    expect(result.quality).toBe("high");
    expect(result.reasonCodes).toContain("FINAL_USE");
  });

  it("structured features override taskClass=complex to return low (Tier 1) when score is low", () => {
    const result = chooseImageQuality({
      prompt: "simple landscape",
      taskClass: "complex",
      hasReference: false,
      features: {
        constraintCount: 0,
        subjectCount: 1,
        spatialRelationCount: 0,
        referenceCount: 0,
        exactTextCount: 0,
        typographyDensity: "none",
        finalUse: false,
        speedPreference: "normal",
      },
    });
    // Structured features: score=0, so Tier 1 low
    expect(result.quality).toBe("low");
  });
});
