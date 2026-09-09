import { describe, expect, it } from "vitest";
import { chooseImageQuality } from "@/lib/ai/orchestration/imageQualityPolicy";

describe("automatic image quality policy", () => {
  // ===== Critical fix: default is now MEDIUM, not HIGH =====
  it("defaults ordinary generation to medium (not high) per plan requirement", () => {
    expect(
      chooseImageQuality({ prompt: "a cat in a room", taskClass: "simple", hasReference: false }),
    ).toMatchObject({ quality: "medium" });
  });

  it("returns GENERAL_DEFAULT reason code for simple requests", () => {
    const result = chooseImageQuality({
      prompt: "สร้างภาพแมว",
      taskClass: "simple",
      hasReference: false,
    });
    expect(result.reasonCodes).toContain("GENERAL_DEFAULT");
  });

  it("allows more attempts for high quality than draft", () => {
    const med = chooseImageQuality({ prompt: "a cat in a room", taskClass: "simple", hasReference: false });
    const low = chooseImageQuality({ prompt: "quick draft sketch of a cat", taskClass: "simple", hasReference: false });
    expect(med.maxAttempts).toBeGreaterThan(low.maxAttempts);
  });

  it("uses high for product/reference/text fidelity", () => {
    expect(
      chooseImageQuality({
        prompt: "product photo with exact Thai headline",
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

  it("uses low only for an explicit draft request", () => {
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

  it("uses high when prompt contains โลโก้/logo keyword", () => {
    const result = chooseImageQuality({
      prompt: "สร้างภาพโลโก้บริษัท",
      taskClass: "simple",
      hasReference: false,
    });
    expect(result.quality).toBe("high");
    expect(result.reasonCodes).toContain("DETAIL_RICH");
  });

  // ===== Structured features =====
  it("uses medium when detail score 0–3 via structured features", () => {
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
    expect(result.quality).toBe("medium");
    expect(result.reasonCodes).toContain("GENERAL_DEFAULT");
  });

  it("uses high when detail score ≥4 via structured features", () => {
    const result = chooseImageQuality({
      prompt: "complex poster",
      taskClass: "simple",
      hasReference: false,
      features: {
        constraintCount: 5, // +2
        subjectCount: 2,
        spatialRelationCount: 4, // +2
        referenceCount: 1, // +1
        exactTextCount: 0,
        typographyDensity: "none",
        finalUse: false,
        speedPreference: "normal",
      },
    });
    expect(result.quality).toBe("high");
    expect(result.reasonCodes).toContain("DETAIL_RICH");
  });

  it("adds FINAL_USE reason code when finalUse=true and score≥4", () => {
    const result = chooseImageQuality({
      prompt: "final asset",
      taskClass: "simple",
      hasReference: false,
      features: {
        constraintCount: 4, // +2
        subjectCount: 2,
        spatialRelationCount: 3, // +2
        referenceCount: 0,
        exactTextCount: 0,
        typographyDensity: "none",
        finalUse: true,
        speedPreference: "normal",
      },
    });
    expect(result.quality).toBe("high");
    expect(result.reasonCodes).toContain("FINAL_USE");
  });

  it("structured features override taskClass=complex to return medium when score is low", () => {
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
    // Structured features: score=0, so medium
    expect(result.quality).toBe("medium");
  });
});
