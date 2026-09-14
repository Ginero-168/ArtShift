import { describe, expect, it } from "vitest";
import {
  chooseImageQuality,
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

describe("deterministic image routing policy v1 (Tier 1: Low, Tier 2: Medium, Tier 3: High — Sunburst baseline)", () => {
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
        brandAssetSensitivity: "high" as const,
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
        brandAssetSensitivity: "high" as const,
        editLocality: "small-target",
      };
      expect(computeEditPrecisionScore(precisionFeatures)).toBe(8);
    });
  });

  describe("generation routing table (Tier 1: Low, Tier 2: Medium, Tier 3: High)", () => {
    it("routes detail 0–3 (Tier 1) to image-general low (GENERAL_DEFAULT)", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 1,
        subjectCount: 1,
        spatialRelationCount: 0,
        referenceCount: 0,
        exactTextCount: 0,
        typographyDensity: "none",
        finalUse: false,
        speedPreference: "normal" as const,
      });

      expect(route.detailScore).toBe(0);
      expect(route.modelAlias).toBe("image-general");
      expect(route.capabilityAlias).toBe("IMAGE_GENERAL");
      expect(route.renderQuality).toBe("low");
      expect(route.reasonCodes).toContain("GENERAL_DEFAULT");
      expect(route.maxSemanticAttempts).toBe(2);
    });

    it("routes detail 4–7 (Tier 2) to image-general medium (DETAIL_RICH)", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 4, // +2
        exactTextCount: 1, // +2
        subjectCount: 1,
        spatialRelationCount: 0,
        finalUse: true, // +1 -> total 5
        speedPreference: "normal" as const,
      });

      expect(route.detailScore).toBe(5);
      expect(route.modelAlias).toBe("image-general");
      expect(route.capabilityAlias).toBe("IMAGE_GENERAL");
      expect(route.renderQuality).toBe("medium");
      expect(route.reasonCodes).toContain("DETAIL_RICH");
      expect(route.maxSemanticAttempts).toBe(3);
    });

    it("routes detail 7 (Tier 2 boundary) to image-general medium", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 4, // +2
        exactTextCount: 1, // +2
        subjectCount: 2,
        spatialRelationCount: 3, // +2
        brandAssetSensitivity: "high" as const, // +1 -> total 7
        speedPreference: "normal" as const,
      });

      expect(route.detailScore).toBe(7);
      expect(route.modelAlias).toBe("image-general");
      expect(route.capabilityAlias).toBe("IMAGE_GENERAL");
      expect(route.renderQuality).toBe("medium");
      expect(route.reasonCodes).toContain("DETAIL_RICH");
    });

    it("routes detail 8–10 (Tier 3) to image-precision high (FINAL_PRECISION)", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 5, // +2
        exactTextCount: 1, // +2
        subjectCount: 3,
        spatialRelationCount: 3, // +2
        brandAssetSensitivity: "high" as const, // +1
        lightingLock: true, // +1 -> total 8
        finalUse: false,
        speedPreference: "normal" as const,
      });

      expect(route.detailScore).toBe(8);
      expect(route.modelAlias).toBe("image-precision");
      expect(route.capabilityAlias).toBe("IMAGE_PRECISION");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("FINAL_PRECISION");
    });

    it("routes detail 9–10 with dense text (Tier 3) to image-precision high with DENSE_TEXT", () => {
      const route = chooseImageRoute({
        operation: "generate",
        constraintCount: 4, // +2
        exactTextCount: 3, // +2
        typographyDensity: "dense",
        subjectCount: 2,
        spatialRelationCount: 3, // +2
        brandAssetSensitivity: "high" as const, // +1
        lightingLock: true, // +1
        finalUse: true, // +1 -> total 9
        speedPreference: "fast",
      });

      expect(route.detailScore).toBe(9);
      expect(route.modelAlias).toBe("image-precision");
      expect(route.capabilityAlias).toBe("IMAGE_PRECISION");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("DENSE_TEXT");
      expect(route.reasonCodes).toContain("FINAL_PRECISION");
    });
  });

  describe("chooseImageQuality function (Tier 1: Low, Tier 2: Medium, Tier 3: High)", () => {
    it("returns low for detail 0–3", () => {
      const decision = chooseImageQuality({
        prompt: "แมวน่ารัก",
        taskClass: "simple",
        hasReference: false,
        features: { constraintCount: 0, subjectCount: 1 },
      });
      expect(decision.quality).toBe("low");
    });

    it("returns medium for detail 4–7", () => {
      const decision = chooseImageQuality({
        prompt: "แบรนด์ชาเขียวบนพื้นหลังเรียบ",
        taskClass: "simple",
        hasReference: false,
        features: { constraintCount: 4, exactTextCount: 1 }, // score = 4
      });
      expect(decision.quality).toBe("medium");
    });

    it("returns high for detail 8–10", () => {
      const decision = chooseImageQuality({
        prompt: "ป้ายหมวดหนังสือจิตวิทยาและการพัฒนาตนเอง 3:1 ละเอียดสูง",
        taskClass: "complex",
        hasReference: true,
        features: {
          constraintCount: 5,
          exactTextCount: 2,
          spatialRelationCount: 3,
          subjectCount: 2,
          finalUse: true,
        }, // score >= 8
      });
      expect(decision.quality).toBe("high");
    });

    it("returns low for fast draft requests", () => {
      const decision = chooseImageQuality({
        prompt: "วาดรูปร่างๆ แบบด่วน",
        taskClass: "simple",
        hasReference: false,
      });
      expect(decision.quality).toBe("low");
      expect(decision.reasonCodes).toContain("FAST_DRAFT");
    });
  });

  describe("edit routing table", () => {
    it("routes everyday edit draft (precision 0–2, fast) to image-general low (EVERYDAY_EDIT_DRAFT)", () => {
      const route = chooseImageRoute({
        operation: "edit",
        identitySensitivity: "normal" as const,
        brandAssetSensitivity: "none" as const,
        editLocality: "regional" as const,
        speedPreference: "fast" as const,
      });

      expect(route.modelAlias).toBe("image-general");
      expect(route.renderQuality).toBe("low");
      expect(route.reasonCodes).toContain("EVERYDAY_EDIT_DRAFT");
    });

    it("routes everyday edit production (precision 0–3) to image-general medium (EVERYDAY_EDIT)", () => {
      const route = chooseImageRoute({
        operation: "edit",
        identitySensitivity: "normal" as const,
        brandAssetSensitivity: "none" as const,
        editLocality: "small-target" as const, // precision = 2
        speedPreference: "normal" as const,
      });

      expect(route.modelAlias).toBe("image-general");
      expect(route.renderQuality).toBe("medium");
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
    it("routes compose to image-precision high (MULTI_REF_PRECISION)", () => {
      const route = chooseImageRoute({
        operation: "compose",
        referenceCount: 3,
        speedPreference: "fast" as const,
      });
      expect(route.modelAlias).toBe("image-precision");
      expect(route.renderQuality).toBe("high");
      expect(route.reasonCodes).toContain("MULTI_REF_PRECISION");
    });

    it("honors user override when requestedModelAlias and quality are specified", () => {
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

  describe("escalation ladder (Sunburst only)", () => {
    it("escalates baseline low on detail miss to baseline medium", () => {
      const current: ImageRouteDecision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "low",
        reasonCodes: ["GENERAL_DEFAULT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };

      const next = escalateRoute(current, "detail-miss");
      expect(next.modelAlias).toBe("image-general");
      expect(next.renderQuality).toBe("medium");
      expect(next.reasonCodes).toContain("ESCALATION_DETAIL_MISS");
    });

    it("escalates baseline medium on detail miss to precision high", () => {
      const current: ImageRouteDecision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "medium",
        reasonCodes: ["DETAIL_RICH"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };

      const next = escalateRoute(current, "detail-miss");
      expect(next.modelAlias).toBe("image-precision");
      expect(next.renderQuality).toBe("high");
      expect(next.reasonCodes).toContain("ESCALATION_DETAIL_MISS");
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
