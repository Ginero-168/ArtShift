/**
 * Domain contracts and feature types for the ArtShift Image Work Orchestrator.
 * Follows /opt/artshift/docs/plans/gpt-image-generation-edit-orchestration-plan.md
 */

import type { AiImageRenderQuality } from "@/lib/ai-runtime/contracts";

export type ImageOperation = "generate" | "edit" | "compose" | "iterate";
export type ImageRenderQuality = AiImageRenderQuality;

export type ImageReferenceRole = "base" | "subject" | "style" | "composition" | "palette";

export type ImageWorkSpec = {
  operation: ImageOperation;
  userPrompt: string;
  refinedPrompt: string;
  outputCount: number;
  target?: {
    artworkId: string;
    artworkRevision: number;
    objectId?: string;
  };
  baseArtifact?: {
    artifactId: string;
    version: number;
    assetRef: string;
    sha256?: string;
  };
  references: Array<{
    assetRef: string;
    role: ImageReferenceRole;
  }>;
  requestedChanges: string[];
  invariants: string[];
  exactText: string[];
  finalUse: boolean;
  speedPreference: "normal" | "fast";
  output: {
    width: number;
    height: number;
    aspectRatio?: string;
    format: "webp" | "png" | "jpeg";
    background: "auto" | "opaque" | "transparent";
  };
};

export type ImageRouteReason =
  | "GENERAL_DEFAULT"
  | "DETAIL_RICH"
  | "FAST_COMPLEX"
  | "DENSE_TEXT"
  | "FINAL_PRECISION"
  | "EVERYDAY_EDIT_DRAFT"
  | "EVERYDAY_EDIT"
  | "PRESERVATION_CRITICAL"
  | "MULTI_REF_FAST"
  | "MULTI_REF_PRECISION"
  | "USER_OVERRIDE"
  | "FALLBACK_BASELINE"
  | "ESCALATION_DETAIL_MISS"
  | "ESCALATION_PRESERVATION_MISS"
  | "ESCALATION_QUALITY_MISS"
  | "ESCALATION_FIDELITY_MISS"
  | "FINAL_CRITICAL_AFTER_FAILED_GATE";

export type ImageFailureReason =
  | "detail-miss"
  | "preservation-miss"
  | "quality-miss"
  | "fidelity-miss"
  | "text-miss"
  | "composition-miss"
  | "technical-failure";

export type ImageRouteDecision = {
  capabilityAlias: "IMAGE_GENERAL" | "IMAGE_FAST" | "IMAGE_PRECISION";
  modelAlias: "image-general" | "image-fast" | "image-precision";
  renderQuality: ImageRenderQuality;
  reasonCodes: ImageRouteReason[];
  maxSemanticAttempts: number;
  fallbackPolicy: "same-capability-only" | "wait-for-provider";
};

export type ImageIntentFeatures = {
  operation: ImageOperation;
  constraintCount: number;
  subjectCount: number;
  spatialRelationCount: number;
  referenceCount: number;
  exactTextCount: number;
  typographyDensity: "none" | "light" | "dense";
  editLocality: "none" | "global" | "regional" | "small-target";
  identitySensitivity: "none" | "normal" | "high";
  brandAssetSensitivity: "none" | "normal" | "high";
  compositionLock: boolean;
  lightingLock: boolean;
  finalUse: boolean;
  variantCount: number;
  speedPreference: "normal" | "fast";
  priorFailureReasons: ImageFailureReason[];
  // Legacy & convenience compatibility flags
  hasInvariants?: boolean;
  invariantCount?: number;
  hasReference?: boolean;
  requiresExactText?: boolean;
  requestedModelAlias?: string;
  requestedQuality?: ImageRenderQuality;
};

/**
 * Derives normalized intent features from an ImageWorkSpec or input object.
 */
export function extractIntentFeatures(spec: Partial<ImageWorkSpec> & { prompt?: string }): ImageIntentFeatures {
  const prompt = (spec.refinedPrompt || spec.userPrompt || spec.prompt || "").trim();
  const invariants = spec.invariants ?? [];
  const requestedChanges = spec.requestedChanges ?? [];
  const exactText = spec.exactText ?? [];
  const references = spec.references ?? [];

  const textCount = exactText.length;
  const typographyDensity: "none" | "light" | "dense" =
    textCount === 0 ? "none" : textCount >= 3 ? "dense" : "light";

  const hasFaceOrPerson =
    /(?:face|person|portrait|model|ใบหน้า|คน|นางแบบ|ตัวละคร|identity|likeness)/iu.test(prompt);
  const identitySensitivity: "none" | "normal" | "high" = hasFaceOrPerson ? "high" : "normal";

  const hasLogoOrBrand =
    /(?:logo|brand|โลโก้|แบรนด์|ตราสินค้า|packaging|บรรจุภัณฑ์)/iu.test(prompt) ||
    invariants.some((inv) => /(?:logo|brand|โลโก้|แบรนด์)/iu.test(inv));
  const brandAssetSensitivity: "none" | "normal" | "high" = hasLogoOrBrand ? "high" : "none";

  const isSmallTarget =
    spec.operation === "edit" &&
    (/(?:small|color only|recolor|เปลี่ยนเฉพาะ|จุดเล็ก|แก้แค่|เปลี่ยนสี)/iu.test(prompt) ||
      requestedChanges.length === 1);
  const editLocality =
    spec.operation !== "edit"
      ? "none"
      : isSmallTarget
        ? "small-target"
        : "regional";

  const compositionLock =
    invariants.some((inv) => /(?:composition|angle|layout|มุมกล้อง|ตำแหน่ง)/iu.test(inv)) ||
    /(?:lock composition|same angle|มุมเดิม|ตำแหน่งเดิม)/iu.test(prompt);

  const lightingLock =
    invariants.some((inv) => /(?:lighting|shadow|แสง|เงา)/iu.test(inv)) ||
    /(?:same lighting|แสงเดิม|เงาเดิม)/iu.test(prompt);

  return {
    operation: spec.operation ?? "generate",
    constraintCount: invariants.length + (exactText.length > 0 ? 1 : 0),
    subjectCount: 1,
    spatialRelationCount: compositionLock ? 1 : 0,
    referenceCount: references.length,
    exactTextCount: exactText.length,
    typographyDensity,
    editLocality,
    identitySensitivity,
    brandAssetSensitivity,
    compositionLock,
    lightingLock,
    finalUse: spec.finalUse ?? false,
    variantCount: spec.outputCount ?? 1,
    speedPreference: spec.speedPreference ?? "normal",
    priorFailureReasons: [],
    hasInvariants: invariants.length > 0,
    invariantCount: invariants.length,
    hasReference: references.length > 0,
    requiresExactText: exactText.length > 0,
  };
}
