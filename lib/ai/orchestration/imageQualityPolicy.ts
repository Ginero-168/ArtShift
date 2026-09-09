import type { AiImageRenderQuality } from "@/lib/ai-runtime/contracts";
import {
  type ImageFailureReason,
  type ImageIntentFeatures,
  type ImageOperation,
  type ImageRenderQuality,
  type ImageRouteDecision,
  type ImageRouteReason,
  type ImageWorkSpec,
  extractIntentFeatures,
} from "./imageWorkSpec";
import { resolveCreatingModel } from "./creatingModelCatalog";

export type {
  ImageFailureReason,
  ImageIntentFeatures,
  ImageOperation,
  ImageRenderQuality,
  ImageRouteDecision,
  ImageRouteReason,
  ImageWorkSpec,
};

export type ImageQualityDecision = {
  quality: AiImageRenderQuality;
  rationale: string;
  maxAttempts: number;
  /** Reason codes for logging/testing — do not expose to clients. */
  reasonCodes: ImageQualityReasonCode[];
};

export type ImageQualityReasonCode =
  | "GENERAL_DEFAULT"
  | "DETAIL_RICH"
  | "FAST_DRAFT"
  | "USER_OVERRIDE_LOW"
  | "FINAL_USE";

export type ImageQualityInput = {
  prompt: string;
  taskClass: "simple" | "complex";
  hasReference: boolean;
  requiresExactText?: boolean;
  finalUse?: boolean;
  /**
   * Structured features extracted from the brief.
   * When provided, these take precedence over keyword heuristics.
   */
  features?: Partial<ImageIntentFeatures>;
};

/**
 * Compute a 0–10 detail score from intent features.
 * Rules match the routing policy in the orchestration plan doc:
 * +2 exact text or dense typography
 * +2 invariants/constraints >= 4
 * +2 multiple subjects with spatial relations >= 3
 * +1 brand/palette rules or high brand sensitivity
 * +1 lighting or composition lock
 * +1 multiple references (or hasReference)
 * +1 final-use asset
 */
export function computeDetailScore(features: Partial<ImageIntentFeatures>): number {
  let score = 0;
  if (
    (features.exactTextCount && features.exactTextCount > 0) ||
    features.typographyDensity === "dense" ||
    features.requiresExactText
  ) {
    score += 2;
  }
  const constraints = Math.max(features.invariantCount ?? 0, features.constraintCount ?? 0);
  if (constraints >= 4) {
    score += 2;
  }
  if (
    features.subjectCount &&
    features.subjectCount > 1 &&
    features.spatialRelationCount &&
    features.spatialRelationCount >= 3
  ) {
    score += 2;
  }
  if (features.brandAssetSensitivity === "high") {
    score += 1;
  }
  if (features.lightingLock || features.compositionLock) {
    score += 1;
  }
  if ((features.referenceCount && features.referenceCount > 1) || features.hasReference) {
    score += 1;
  }
  if (features.finalUse) {
    score += 1;
  }
  return Math.min(score, 10);
}

/**
 * Compute a 0–10 edit precision score from intent features:
 * +3 face, person, character, or likeness preservation
 * +3 logo, packaging, geometry, or camera angle preservation
 * +2 small-target edit (other areas preserved)
 * +1 exact text modification
 * +1 iteration round >= 2 / cumulative drift constraint
 */
export function computeEditPrecisionScore(features: Partial<ImageIntentFeatures>): number {
  let score = 0;
  if (features.identitySensitivity === "high") {
    score += 3;
  }
  if (features.brandAssetSensitivity === "high" || features.compositionLock) {
    score += 3;
  }
  if (features.editLocality === "small-target") {
    score += 2;
  }
  if ((features.exactTextCount && features.exactTextCount > 0) || features.requiresExactText) {
    score += 1;
  }
  if (
    (features.variantCount && features.variantCount > 1) ||
    (features.priorFailureReasons && features.priorFailureReasons.length > 0)
  ) {
    score += 1;
  }
  return Math.min(score, 10);
}

export type ChooseImageRouteOptions = {
  /** When true, falls back to baseline if the preferred model is not yet available in catalog. */
  resolveAvailable?: boolean;
};

/**
 * Deterministic Image Routing Policy v1.
 * Pure function mapping intent features to model alias, quality, reason codes, and attempts.
 */
export function chooseImageRoute(
  input: ImageIntentFeatures | (Partial<ImageWorkSpec> & { prompt?: string }),
  options: ChooseImageRouteOptions = {},
): ImageRouteDecision {
  const extracted = extractIntentFeatures(input as Partial<ImageWorkSpec>);
  const features: ImageIntentFeatures = {
    ...extracted,
    ...(input as Partial<ImageIntentFeatures>),
  };

  // 1. User override check
  if (features.requestedModelAlias) {
    const alias = features.requestedModelAlias;
    const capability =
      alias === "image-precision"
        ? "IMAGE_PRECISION"
        : alias === "image-fast"
          ? "IMAGE_FAST"
          : "IMAGE_GENERAL";
    const modelAlias =
      alias === "image-precision"
        ? "image-precision"
        : alias === "image-fast"
          ? "image-fast"
          : "image-general";
    return {
      capabilityAlias: capability,
      modelAlias,
      renderQuality: features.requestedQuality || "high",
      reasonCodes: ["USER_OVERRIDE"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
    };
  }

  let decision: ImageRouteDecision;

  // 2. Routing logic by operation
  if (features.operation === "generate") {
    const detailScore = computeDetailScore(features);

    if (detailScore <= 3) {
      decision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "medium",
        reasonCodes: ["GENERAL_DEFAULT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };
    } else if (detailScore <= 6) {
      decision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "high",
        reasonCodes: ["DETAIL_RICH"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
      };
    } else {
      // detail 7–10
      const needsSpeedOrVariants =
        features.speedPreference === "fast" ||
        features.variantCount > 1 ||
        features.typographyDensity === "dense";

      if (needsSpeedOrVariants) {
        const reasonCodes: ImageRouteReason[] =
          features.typographyDensity === "dense"
            ? ["DENSE_TEXT", "FAST_COMPLEX"]
            : ["FAST_COMPLEX"];
        decision = {
          capabilityAlias: "IMAGE_FAST",
          modelAlias: "image-fast",
          renderQuality: "high",
          reasonCodes,
          maxSemanticAttempts: 3,
          fallbackPolicy: "same-capability-only",
        };
      } else {
        // final and high precision
        decision = {
          capabilityAlias: "IMAGE_PRECISION",
          modelAlias: "image-precision",
          renderQuality: "high",
          reasonCodes: ["FINAL_PRECISION"],
          maxSemanticAttempts: 3,
          fallbackPolicy: "same-capability-only",
        };
      }
    }
  } else if (features.operation === "edit" || features.operation === "iterate") {
    const precisionScore = computeEditPrecisionScore(features);

    if (precisionScore <= 2 && features.speedPreference === "fast") {
      decision = {
        capabilityAlias: "IMAGE_FAST",
        modelAlias: "image-fast",
        renderQuality: "medium",
        reasonCodes: ["EVERYDAY_EDIT_DRAFT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };
    } else if (precisionScore <= 3) {
      decision = {
        capabilityAlias: "IMAGE_FAST",
        modelAlias: "image-fast",
        renderQuality: "high",
        reasonCodes: ["EVERYDAY_EDIT"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
      };
    } else {
      // precision 4–10: preservation critical
      decision = {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "high",
        reasonCodes: ["PRESERVATION_CRITICAL"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
      };
    }
  } else if (features.operation === "compose") {
    const prioritizeSpeed = features.speedPreference === "fast" || features.variantCount > 1;
    if (prioritizeSpeed) {
      decision = {
        capabilityAlias: "IMAGE_FAST",
        modelAlias: "image-fast",
        renderQuality: "high",
        reasonCodes: ["MULTI_REF_FAST"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
      };
    } else {
      decision = {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "high",
        reasonCodes: ["MULTI_REF_PRECISION"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
      };
    }
  } else {
    // Default fallback
    decision = {
      capabilityAlias: "IMAGE_GENERAL",
      modelAlias: "image-general",
      renderQuality: "medium",
      reasonCodes: ["GENERAL_DEFAULT"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
    };
  }

  // Optional: check availability in catalog and fallback if requested
  if (options.resolveAvailable) {
    const resolution = resolveCreatingModel(
      features.operation === "edit" ? "edit" : "generate",
      decision.modelAlias,
    );
    if (!resolution.ok && resolution.reason === "model-unavailable") {
      // Flare or Sunburst unavailable -> route back to GPT Image 2 baseline safely
      if (decision.capabilityAlias === "IMAGE_FAST") {
        return {
          capabilityAlias: "IMAGE_GENERAL",
          modelAlias: "image-general",
          renderQuality: decision.renderQuality === "medium" ? "medium" : "high",
          reasonCodes: [...decision.reasonCodes, "FALLBACK_BASELINE"],
          maxSemanticAttempts: decision.maxSemanticAttempts,
          fallbackPolicy: "same-capability-only",
        };
      }
      if (decision.capabilityAlias === "IMAGE_PRECISION") {
        // Critical edits do not silent-downgrade unless non-critical
        if (!decision.reasonCodes.includes("PRESERVATION_CRITICAL")) {
          return {
            capabilityAlias: "IMAGE_GENERAL",
            modelAlias: "image-general",
            renderQuality: "high",
            reasonCodes: [...decision.reasonCodes, "FALLBACK_BASELINE"],
            maxSemanticAttempts: decision.maxSemanticAttempts,
            fallbackPolicy: "same-capability-only",
          };
        }
      }
    }
  }

  return decision;
}

/**
 * Route Escalation Ladder.
 * Escalates route based on failure diagnosis without blind retries:
 * GPT2 medium -> detail miss -> GPT2 high
 * GPT2 medium -> dense text + speed -> Flare high
 * Flare medium -> quality miss -> Flare high
 * Flare medium -> preservation miss -> Sunburst high
 * GPT2 high / Flare high -> preservation miss -> Sunburst high
 * Sunburst high -> fidelity miss on final/critical -> Sunburst xhigh
 * Sunburst xhigh -> one justified attempt -> Sunburst max (FINAL_CRITICAL_AFTER_FAILED_GATE)
 */
export function escalateRoute(
  current: ImageRouteDecision,
  failureReason: ImageFailureReason,
): ImageRouteDecision {
  const { modelAlias, renderQuality } = current;

  // 1. GPT2 medium
  if (modelAlias === "image-general" && renderQuality === "medium") {
    if (failureReason === "text-miss") {
      return {
        capabilityAlias: "IMAGE_FAST",
        modelAlias: "image-fast",
        renderQuality: "high",
        reasonCodes: ["ESCALATION_DETAIL_MISS", "DENSE_TEXT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };
    }
    return {
      capabilityAlias: "IMAGE_GENERAL",
      modelAlias: "image-general",
      renderQuality: "high",
      reasonCodes: ["ESCALATION_DETAIL_MISS"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
    };
  }

  // 2. Flare medium
  if (modelAlias === "image-fast" && renderQuality === "medium") {
    if (failureReason === "preservation-miss") {
      return {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "high",
        reasonCodes: ["ESCALATION_PRESERVATION_MISS"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };
    }
    return {
      capabilityAlias: "IMAGE_FAST",
      modelAlias: "image-fast",
      renderQuality: "high",
      reasonCodes: ["ESCALATION_QUALITY_MISS"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
    };
  }

  // 3. GPT2 high or Flare high
  if (
    (modelAlias === "image-general" || modelAlias === "image-fast") &&
    renderQuality === "high"
  ) {
    if (failureReason === "preservation-miss") {
      return {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "high",
        reasonCodes: ["ESCALATION_PRESERVATION_MISS"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };
    }
    if (failureReason === "detail-miss" && modelAlias === "image-general") {
      return {
        capabilityAlias: "IMAGE_FAST",
        modelAlias: "image-fast",
        renderQuality: "high",
        reasonCodes: ["ESCALATION_DETAIL_MISS"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
      };
    }
  }

  // 4. Sunburst high
  if (modelAlias === "image-precision" && renderQuality === "high") {
    if (failureReason === "fidelity-miss" || failureReason === "preservation-miss") {
      return {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "xhigh",
        reasonCodes: ["ESCALATION_FIDELITY_MISS"],
        maxSemanticAttempts: 1,
        fallbackPolicy: "same-capability-only",
      };
    }
  }

  // 5. Sunburst xhigh
  if (modelAlias === "image-precision" && renderQuality === "xhigh") {
    return {
      capabilityAlias: "IMAGE_PRECISION",
      modelAlias: "image-precision",
      renderQuality: "max",
      reasonCodes: ["FINAL_CRITICAL_AFTER_FAILED_GATE"],
      maxSemanticAttempts: 1,
      fallbackPolicy: "same-capability-only",
    };
  }

  // 6. Max reached or no further escalation
  return {
    ...current,
    maxSemanticAttempts: Math.max(0, current.maxSemanticAttempts - 1),
  };
}

/**
 * Choose render quality for image generation using structured features when
 * available, falling back to prompt keyword heuristics.
 *
 * Plan requirement: general generation defaults to "medium", not "high".
 * High quality is chosen when the detail score or prompt signals justify it.
 */
export function chooseImageQuality(input: ImageQualityInput): ImageQualityDecision {
  // User explicitly requested a draft/fast pass — but never downgrade final-use assets
  const isDraftRequest =
    !input.hasReference &&
    !input.requiresExactText &&
    !input.finalUse &&
    !(input.features?.finalUse) &&
    /(?:quick|draft|ร่าง|ทดลอง|เร็ว|ด่วน)/iu.test(input.prompt);

  if (isDraftRequest) {
    return {
      quality: "low",
      rationale: "ผู้ใช้ระบุว่าเป็นงานร่าง/ทดลองและไม่มี reference หรือข้อความที่ต้องรักษา",
      maxAttempts: 1,
      reasonCodes: ["FAST_DRAFT"],
    };
  }

  // Use structured features when available
  if (input.features) {
    const score = computeDetailScore(input.features);
    if (input.features.finalUse && score >= 4) {
      return {
        quality: "high",
        rationale: "เป็น final-use asset ที่มีรายละเอียดสูง ใช้ high quality",
        maxAttempts: 3,
        reasonCodes: ["DETAIL_RICH", "FINAL_USE"],
      };
    }
    if (score >= 4) {
      return {
        quality: "high",
        rationale: `detail score ${score}/10 — brief มีข้อกำหนดหรือองค์ประกอบซับซ้อน`,
        maxAttempts: 3,
        reasonCodes: ["DETAIL_RICH"],
      };
    }
    // score 0–3: general default = medium
    return {
      quality: "medium",
      rationale: "งานสร้างภาพทั่วไป ใช้ medium quality ตาม default policy",
      maxAttempts: 2,
      reasonCodes: ["GENERAL_DEFAULT"],
    };
  }

  // Prompt-based heuristics fallback (when structured features not available)
  const prompt = input.prompt.toLocaleLowerCase();
  const requiresHighQuality =
    input.hasReference ||
    input.requiresExactText ||
    input.finalUse ||
    input.taskClass === "complex" ||
    /(?:product|สินค้า|packaging|บรรจุภัณฑ์|typography|ข้อความ|poster|โปสเตอร์|print|พิมพ์|โลโก้|logo)/iu.test(
      prompt,
    );

  if (requiresHighQuality) {
    return {
      quality: "high",
      rationale: "brief มี reference, สินค้า, ข้อความ หรือองค์ประกอบซับซ้อนที่ต้องความแม่นยำสูง",
      maxAttempts: 3,
      reasonCodes: input.finalUse ? ["DETAIL_RICH", "FINAL_USE"] : ["DETAIL_RICH"],
    };
  }

  // Default: medium (was incorrectly "high" before this fix)
  return {
    quality: "medium",
    rationale: "งานสร้างภาพทั่วไป ใช้ medium quality ตาม default policy",
    maxAttempts: 2,
    reasonCodes: ["GENERAL_DEFAULT"],
  };
}
