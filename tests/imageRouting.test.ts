import { describe, expect, it } from "vitest";
import {
  chooseImageRoute,
  computeDetailScore,
  computeEditPrecisionScore,
  escalateRoute,
} from "@/lib/ai/orchestration/imageQualityPolicy";
import type {
  ImageFailureReason,
  ImageIntentFeatures,
  ImageRouteDecision,
} from "@/lib/ai/orchestration/imageWorkSpec";

describe("deterministic image routing policy v1", () => {
  describe("scoring functions", () => {
    it("computes detail score accurately across boundaries", () => {
      // Base features: 0 score
      const base: Partial<ImageIntentFeatures> = {
        operation: "generate",
        exactTextCount: 0,
        constraintCount: 0,
        subjectCount: 1,
        spatialRelationCount: 0,
        referenceCount: 0,
        finalUse: false,
      };
      expect(computeDetailScore(base)).toBe(0);

      // +2 exact text, +2 constraints >= 4, +1 final use = 5
      const complex: Partial<ImageIntentFeatures> = {
        ...base,
        exactTextCount: 1,
        constraintCount: 4,
        finalUse: true,
      };
      expect(computeDetailScore(complex)).toBe(5);

      // Maxes out at 10
      const maxFeatures: Partial<ImageIntentFeatures> = {
        exactTextCount: 2,
        constraintCount: 6,
        subjectCount: 3,
        spatialRelationCount: 4,
        brandAssetSensitivity: "high",
        lightingLock: true,
        referenceCount: 3,
        finalUse: true,
      };
      expect(computeDetailScore(maxFeatures)).toBe(10);
    });

    it("computes edit precision score accurately", () => {
      // Identity + logo + small target = 3 + 3 + 2 = 8
      const precisionFeatures: Partial<ImageIntentFeatures> = {
        operation: "edit",
        identitySensitivity: "high",
        brandAssetSensitivity: "high",
        editLocality: "small-target",
      };
      expect(computeEditPrecisionScore(precisionFeatures)).toBe(8);
    });
  });

  describe("generation routing table", () => {
    it("routes detail 0–3 to image-general medium (GENERAL_DEFAULT)", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 1,
        subjectCount: 1,
        spatialRelationCount: 0,
        referenceCount: 0,
        exactTextCount: 0,
        typographyDensity: "none",
        finalUse: false,
        speedPreference: "normal",
      });

      expect(route.modelAlias).toBe("image-general");
      expect(route.capabilityAlias).toBe("IMAGE_GENERAL");
      expect(route.renderQuality).toBe("medium");
      expect(route.reasonCodes).toContain("GENERAL_DEFAULT");
      expect(route.maxSemanticAttempts).toBe(2);
    });

    it("routes detail 4–6 to image-general high (DETAIL_RICH)", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 4, // +2
        exactTextCount: 1, // +2
        finalUse: true, // +1 -> total 5
        subjectCount: 1,
        spatialRelationCount: 0,
        referenceCount: 0,
        typographyDensity: "light",
        speedPreference: "normal",
      });

      expect(route.modelAlias).toBe("image-general");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("DETAIL_RICH");
      expect(route.maxSemanticAttempts).toBe(3);
    });

    it("routes detail 7–10 + speed/variants/dense text to image-fast high (FAST_COMPLEX / DENSE_TEXT)", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 4, // +2
        exactTextCount: 3, // +2
        typographyDensity: "dense",
        subjectCount: 2,
        spatialRelationCount: 3, // +2
        finalUse: true, // +1 -> total 7
        speedPreference: "fast",
      });

      expect(route.modelAlias).toBe("image-fast");
      expect(route.capabilityAlias).toBe("IMAGE_FAST");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("DENSE_TEXT");
      expect(route.reasonCodes).toContain("FAST_COMPLEX");
    });

    it("routes detail 7–10 final without speed preference to image-precision high (FINAL_PRECISION)", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 5, // +2
        exactTextCount: 1, // +2
        subjectCount: 3,
        spatialRelationCount: 3, // +2
        brandAssetSensitivity: "high", // +1
        finalUse: true, // +1 -> total 8
        speedPreference: "normal",
        variantCount: 1,
        typographyDensity: "light",
      });

      expect(route.modelAlias).toBe("image-precision");
      expect(route.capabilityAlias).toBe("IMAGE_PRECISION");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("FINAL_PRECISION");
    });
  });

  describe("edit routing table", () => {
    it("routes everyday edit draft (precision 0–2, fast) to image-fast medium (EVERYDAY_EDIT_DRAFT)", () => {
      const route = chooseImageRoute({
        operation: "edit",
        identitySensitivity: "normal" as const,
        brandAssetSensitivity: "none" as const,
        editLocality: "regional" as const,
        speedPreference: "fast" as const,
      });

      expect(route.modelAlias).toBe("image-fast");
      expect(route.renderQuality).toBe("medium");
      expect(route.reasonCodes).toContain("EVERYDAY_EDIT_DRAFT");
    });

    it("routes everyday edit production (precision 0–3) to image-fast high (EVERYDAY_EDIT)", () => {
      const route = chooseImageRoute({
        operation: "edit",
        identitySensitivity: "normal" as const,
        brandAssetSensitivity: "none" as const,
        editLocality: "small-target" as const, // precision = 2
        speedPreference: "normal" as const,
      });

      expect(route.modelAlias).toBe("image-fast");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("EVERYDAY_EDIT");
    });

    it("routes critical edit (precision 4–10) to image-precision high (PRESERVATION_CRITICAL)", () => {
      const route = chooseImageRoute({
        operation: "edit",
        identitySensitivity: "high" as const, // +3
        brandAssetSensitivity: "high" as const, // +3 -> total 6
        editLocality: "small-target" as const,
      });

      expect(route.modelAlias).toBe("image-precision");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("PRESERVATION_CRITICAL");
    });
  });

  describe("compose and user override routing", () => {
    it("routes compose with speed preference to image-fast (MULTI_REF_FAST)", () => {
      const route = chooseImageRoute({
        operation: "compose",
        referenceCount: 3,
        speedPreference: "fast" as const,
      });
      expect(route.modelAlias).toBe("image-fast");
      expect(route.reasonCodes).toContain("MULTI_REF_FAST");
    });

    it("routes compose with identity/layout focus to image-precision (MULTI_REF_PRECISION)", () => {
      const route = chooseImageRoute({
        operation: "compose",
        referenceCount: 2,
        speedPreference: "normal" as const,
        variantCount: 1,
      });
      expect(route.modelAlias).toBe("image-precision");
      expect(route.reasonCodes).toContain("MULTI_REF_PRECISION");
    });

    it("honors user override when requestedModelAlias is specified", () => {
      const route = chooseImageRoute({
        operation: "generate",
        requestedModelAlias: "image-precision",
        requestedQuality: "xhigh" as const,
      });
      expect(route.modelAlias).toBe("image-precision");
      expect(route.renderQuality).toBe("xhigh");
      expect(route.reasonCodes).toContain("USER_OVERRIDE");
    });
  });

  describe("catalog fallback behavior", () => {
    it("resolves available fast route directly to image-fast when resolveAvailable is true", () => {
      const route = chooseImageRoute(
        {
          operation: "generate",
          constraintCount: 4,
          exactTextCount: 3,
          subjectCount: 2,
          spatialRelationCount: 3,
          finalUse: true,
          speedPreference: "fast" as const,
        },
        { resolveAvailable: true },
      );

      // Flare is available in catalog -> resolves to image-fast
      expect(route.modelAlias).toBe("image-fast");
      expect(route.reasonCodes).toContain("FAST_COMPLEX");
    });
  });

  describe("escalation ladder", () => {
    it("escalates GPT2 medium on detail miss to GPT2 high", () => {
      const current: ImageRouteDecision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "medium",
        reasonCodes: ["GENERAL_DEFAULT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };

      const next = escalateRoute(current, "detail-miss");
      expect(next.modelAlias).toBe("image-general");
      expect(next.renderQuality).toBe("high");
      expect(next.reasonCodes).toContain("ESCALATION_DETAIL_MISS");
    });

    it("escalates Flare medium on quality miss to Flare high", () => {
      const current: ImageRouteDecision = {
        capabilityAlias: "IMAGE_FAST",
        modelAlias: "image-fast",
        renderQuality: "medium",
        reasonCodes: ["EVERYDAY_EDIT_DRAFT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };

      const next = escalateRoute(current, "quality-miss");
      expect(next.modelAlias).toBe("image-fast");
      expect(next.renderQuality).toBe("high");
      expect(next.reasonCodes).toContain("ESCALATION_QUALITY_MISS");
    });

    it("escalates high quality on preservation miss to Sunburst high", () => {
      const current: ImageRouteDecision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "high",
        reasonCodes: ["DETAIL_RICH"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
      };

      const next = escalateRoute(current, "preservation-miss");
      expect(next.modelAlias).toBe("image-precision");
      expect(next.renderQuality).toBe("high");
      expect(next.reasonCodes).toContain("ESCALATION_PRESERVATION_MISS");
    });

    it("escalates Sunburst high on fidelity miss to Sunburst xhigh", () => {
      const current: ImageRouteDecision = {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "high",
        reasonCodes: ["FINAL_PRECISION"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
      };

      const next = escalateRoute(current, "fidelity-miss");
      expect(next.modelAlias).toBe("image-precision");
      expect(next.renderQuality).toBe("xhigh");
      expect(next.reasonCodes).toContain("ESCALATION_FIDELITY_MISS");
    });

    it("escalates Sunburst xhigh to Sunburst max with FINAL_CRITICAL_AFTER_FAILED_GATE", () => {
      const current: ImageRouteDecision = {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "xhigh",
        reasonCodes: ["ESCALATION_FIDELITY_MISS"],
        maxSemanticAttempts: 1,
        fallbackPolicy: "same-capability-only",
      };

      const next = escalateRoute(current, "fidelity-miss");
      expect(next.modelAlias).toBe("image-precision");
      expect(next.renderQuality).toBe("max");
      expect(next.reasonCodes).toContain("FINAL_CRITICAL_AFTER_FAILED_GATE");
    });
  });
});
