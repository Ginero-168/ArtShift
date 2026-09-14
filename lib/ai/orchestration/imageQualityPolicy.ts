import type { AiImageRenderQuality } from "@/lib/ai-runtime/contracts";
import { resolveCreatingModel } from "./creatingModelCatalog";
import {
  extractIntentFeatures,
  type ImageFailureReason,
  type ImageIntentFeatures,
  type ImageOperation,
  type ImageRenderQuality,
  type ImageRouteDecision,
  type ImageRouteReason,
  type ImageWorkSpec,
} from "./imageWorkSpec";

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
 * Deterministic Image Routing Policy v1 (openai/gpt-image-2.5-sunburst baseline).
 * All tiers exclusively route to Sunburst:
 * - Tier 1 (Detail Score 0–3): Low quality ($0.012)
 * - Tier 2 (Detail Score 4–7): Medium quality ($0.047)
 * - Tier 3 (Detail Score 8–10): High quality ($0.128)
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

  const detailScore = computeDetailScore(features);
  const precisionScore = computeEditPrecisionScore(features);

  // 1. User override check
  if (features.requestedModelAlias) {
    const alias = features.requestedModelAlias;
    const capability =
      alias === "image-precision"
        ? "IMAGE_PRECISION"
        : "IMAGE_GENERAL";
    const modelAlias =
      alias === "image-precision"
        ? "image-precision"
        : "image-general";
    return {
      capabilityAlias: capability,
      modelAlias,
      renderQuality: features.requestedQuality || "high",
      reasonCodes: ["USER_OVERRIDE"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
      detailScore,
      precisionScore,
    };
  }

  let decision: ImageRouteDecision;

  // 2. Routing logic by operation (All Sunburst: Tier 1 Low, Tier 2 Med, Tier 3 High)
  if (features.operation === "generate") {
    if (detailScore <= 3) {
      // Tier 1: Low
      decision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "low",
        reasonCodes: ["GENERAL_DEFAULT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
        detailScore,
        precisionScore,
      };
    } else if (detailScore <= 7) {
      // Tier 2: Medium
      decision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "medium",
        reasonCodes: ["DETAIL_RICH"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
        detailScore,
        precisionScore,
      };
    } else {
      // Tier 3: High (detail 8–10)
      const isDenseText = features.typographyDensity === "dense";
      const reasonCodes: ImageRouteReason[] = isDenseText
        ? ["DENSE_TEXT", "FINAL_PRECISION"]
        : ["FINAL_PRECISION"];
      decision = {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "high",
        reasonCodes,
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
        detailScore,
        precisionScore,
      };
    }
  } else if (features.operation === "edit" || features.operation === "iterate") {
    if (precisionScore <= 2 && features.speedPreference === "fast") {
      decision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "low",
        reasonCodes: ["EVERYDAY_EDIT_DRAFT"],
        maxSemanticAttempts: 2,
        fallbackPolicy: "same-capability-only",
        detailScore,
        precisionScore,
      };
    } else if (precisionScore <= 3) {
      decision = {
        capabilityAlias: "IMAGE_GENERAL",
        modelAlias: "image-general",
        renderQuality: "medium",
        reasonCodes: ["EVERYDAY_EDIT"],
        maxSemanticAttempts: 3,
        fallbackPolicy: "same-capability-only",
        detailScore,
        precisionScore,
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
        detailScore,
        precisionScore,
      };
    }
  } else if (features.operation === "compose") {
    decision = {
      capabilityAlias: "IMAGE_PRECISION",
      modelAlias: "image-precision",
      renderQuality: "high",
      reasonCodes: ["MULTI_REF_PRECISION"],
      maxSemanticAttempts: 3,
      fallbackPolicy: "same-capability-only",
      detailScore,
      precisionScore,
    };
  } else {
    // Default fallback: Tier 1 Low
    decision = {
      capabilityAlias: "IMAGE_GENERAL",
      modelAlias: "image-general",
      renderQuality: "low",
      reasonCodes: ["GENERAL_DEFAULT"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
      detailScore,
      precisionScore,
    };
  }

  // Optional: check availability in catalog and fallback if requested
  if (options.resolveAvailable) {
    const resolution = resolveCreatingModel(
      features.operation === "edit" ? "edit" : "generate",
      decision.modelAlias,
    );
    if (!resolution.ok && resolution.reason === "model-unavailable") {
      if (decision.capabilityAlias === "IMAGE_PRECISION") {
        if (!decision.reasonCodes.includes("PRESERVATION_CRITICAL")) {
          return {
            capabilityAlias: "IMAGE_GENERAL",
            modelAlias: "image-general",
            renderQuality: "medium",
            reasonCodes: [...decision.reasonCodes, "FALLBACK_BASELINE"],
            maxSemanticAttempts: decision.maxSemanticAttempts,
            fallbackPolicy: "same-capability-only",
            detailScore,
            precisionScore,
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
 * Sunburst low -> detail miss -> Sunburst medium
 * Sunburst medium -> detail miss -> Sunburst high
 * Sunburst high -> fidelity/preservation miss -> Sunburst xhigh
 * Sunburst xhigh -> one justified attempt -> Sunburst max (FINAL_CRITICAL_AFTER_FAILED_GATE)
 */
export function escalateRoute(
  current: ImageRouteDecision,
  failureReason: ImageFailureReason,
): ImageRouteDecision {
  const { renderQuality } = current;

  // 1. Low quality -> escalate to medium
  if (renderQuality === "low") {
    return {
      capabilityAlias: "IMAGE_GENERAL",
      modelAlias: "image-general",
      renderQuality: "medium",
      reasonCodes: ["ESCALATION_DETAIL_MISS"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
    };
  }

  // 2. Medium quality -> escalate to high
  if (renderQuality === "medium") {
    return {
      capabilityAlias: "IMAGE_PRECISION",
      modelAlias: "image-precision",
      renderQuality: "high",
      reasonCodes: failureReason === "preservation-miss"
        ? ["ESCALATION_PRESERVATION_MISS"]
        : ["ESCALATION_DETAIL_MISS"],
      maxSemanticAttempts: 2,
      fallbackPolicy: "same-capability-only",
    };
  }

  // 3. High quality -> escalate to xhigh on fidelity or preservation miss
  if (renderQuality === "high") {
    if (failureReason === "fidelity-miss" || failureReason === "preservation-miss") {
      return {
        capabilityAlias: "IMAGE_PRECISION",
        modelAlias: "image-precision",
        renderQuality: "xhigh",
        reasonCodes: failureReason === "preservation-miss"
          ? ["ESCALATION_PRESERVATION_MISS"]
          : ["ESCALATION_FIDELITY_MISS"],
        maxSemanticAttempts: 1,
        fallbackPolicy: "same-capability-only",
      };
    }
  }

  // 4. XHigh quality -> escalate to max
  if (renderQuality === "xhigh") {
    return {
      capabilityAlias: "IMAGE_PRECISION",
      modelAlias: "image-precision",
      renderQuality: "max",
      reasonCodes: ["FINAL_CRITICAL_AFTER_FAILED_GATE"],
      maxSemanticAttempts: 1,
      fallbackPolicy: "same-capability-only",
    };
  }

  // 5. Max reached or no further escalation
  return {
    ...current,
    maxSemanticAttempts: Math.max(0, current.maxSemanticAttempts - 1),
  };
}

/**
 * Choose render quality for image generation using structured features when
 * available, falling back to prompt keyword heuristics.
 *
 * Tier 1 (Detail Score 0-3): Low ($0.012)
 * Tier 2 (Detail Score 4-7): Medium ($0.047)
 * Tier 3 (Detail Score 8-10): High ($0.128)
 */
export function chooseImageQuality(input: ImageQualityInput): ImageQualityDecision {
  // User explicitly requested a draft/fast pass — but never downgrade final-use assets
  const isDraftRequest =
    !input.hasReference &&
    !input.requiresExactText &&
    !input.finalUse &&
    !input.features?.finalUse &&
    /(?:quick|draft|ร่าง|ทดลอง|เร็ว|ด่วน)/iu.test(input.prompt);

  if (isDraftRequest) {
    return {
      quality: "low",
      rationale: "ผู้ใช้ระบุว่าเป็นงานร่าง/ทดลอง ใช้ Tier 1 (low quality)",
      maxAttempts: 1,
      reasonCodes: ["FAST_DRAFT"],
    };
  }

  // Use structured features when available
  if (input.features) {
    const score = computeDetailScore(input.features);
    // Tier 3: Detail Score 8-10 -> High
    if (score >= 8 || (input.features.finalUse && score >= 7)) {
      return {
        quality: "high",
        rationale: `Tier 3 (detail score ${score}/10) — มีความซับซ้อน/ข้อกำหนดสูง ใช้ High quality`,
        maxAttempts: 3,
        reasonCodes: input.features.finalUse ? ["DETAIL_RICH", "FINAL_USE"] : ["DETAIL_RICH"],
      };
    }
    // Tier 2: Detail Score 4-7 -> Medium
    if (score >= 4) {
      return {
        quality: "medium",
        rationale: `Tier 2 (detail score ${score}/10) — brief มีรายละเอียดปานกลาง ใช้ Medium quality`,
        maxAttempts: 3,
        reasonCodes: ["DETAIL_RICH"],
      };
    }
    // Tier 1: Detail Score 0-3 -> Low
    return {
      quality: "low",
      rationale: `Tier 1 (detail score ${score}/10) — งานสร้างภาพทั่วไป/พื้นฐาน ใช้ Low quality ตาม Tier 1 policy`,
      maxAttempts: 2,
      reasonCodes: ["GENERAL_DEFAULT"],
    };
  }

  // Prompt-based heuristics fallback (when structured features not available)
  const prompt = input.prompt.toLocaleLowerCase();
  const requiresHighQuality =
    input.finalUse ||
    input.taskClass === "complex" ||
    /(?:print|พิมพ์|signage|ป้าย|masterwork|hyper-detailed|ละเอียดสูง|ultra-detailed|8k)/iu.test(
      prompt,
    );

  if (requiresHighQuality) {
    return {
      quality: "high",
      rationale: "Tier 3 — brief มีความซับซ้อน/สำหรับงานจริงที่ต้องความแม่นยำสูง ใช้ High quality",
      maxAttempts: 3,
      reasonCodes: input.finalUse ? ["DETAIL_RICH", "FINAL_USE"] : ["DETAIL_RICH"],
    };
  }

  const requiresMediumQuality =
    input.hasReference ||
    input.requiresExactText ||
    /(?:product|สินค้า|packaging|บรรจุภัณฑ์|typography|ข้อความ|poster|โปสเตอร์|โลโก้|logo)/iu.test(
      prompt,
    );

  if (requiresMediumQuality) {
    return {
      quality: "medium",
      rationale: "Tier 2 — brief มี reference, สินค้า หรือข้อความ ใช้ Medium quality",
      maxAttempts: 3,
      reasonCodes: ["DETAIL_RICH"],
    };
  }

  // Tier 1 default: Low
  return {
    quality: "low",
    rationale: "Tier 1 — งานสร้างภาพทั่วไป ใช้ Low quality ตาม default policy",
    maxAttempts: 2,
    reasonCodes: ["GENERAL_DEFAULT"],
  };
}
