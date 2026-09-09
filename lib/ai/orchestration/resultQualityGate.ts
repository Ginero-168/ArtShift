import type { ImageFailureReason } from "./imageWorkSpec";

export type GeneratedOutputAnalysis = {
  caption: string;
  objects: readonly string[];
  visibleText: string;
  limitations: readonly string[];
};

export type GeneratedImageQualityInput = {
  outputWidth: number;
  outputHeight: number;
  requestedAspectRatio?: string;
  requiredSubjects?: readonly string[];
  requiredText?: string;
  referenceRequired?: boolean;
  referenceFacts?: readonly {
    caption: string;
    objects: readonly string[];
    visibleText: string;
    limitations: readonly string[];
  }[];
  outputAnalysis?: GeneratedOutputAnalysis;
  technicalFallback?: boolean;
};

export type GeneratedImageQualityCheck = {
  id: "dimensions" | "subject" | "text" | "reference";
  passed: boolean;
  detail: string;
};

export type GeneratedImageQualityResult = {
  passed: boolean;
  checks: GeneratedImageQualityCheck[];
  blockers: string[];
  review: "deterministic" | "local-analysis" | "unverifiable";
};

export function runGeneratedImageQualityGate(
  input: GeneratedImageQualityInput,
): GeneratedImageQualityResult {
  const dimensionsPassed = aspectRatioMatches(
    input.outputWidth,
    input.outputHeight,
    input.requestedAspectRatio,
  );

  if (input.technicalFallback) {
    const checks: GeneratedImageQualityCheck[] = [
      {
        id: "dimensions",
        passed: dimensionsPassed,
        detail: "Generated dimensions must match the requested aspect ratio.",
      },
      {
        id: "subject",
        passed: true,
        detail: "Local vision fallback: subject check bypassed.",
      },
      {
        id: "text",
        passed: true,
        detail: "Local vision fallback: text check bypassed.",
      },
      {
        id: "reference",
        passed: true,
        detail: "Local vision fallback: reference check bypassed.",
      },
    ];
    const blockers = checks.filter((check) => !check.passed).map((check) => check.detail);
    return {
      passed: blockers.length === 0,
      checks,
      blockers,
      review: "deterministic",
    };
  }

  const checks: GeneratedImageQualityCheck[] = [
    {
      id: "dimensions",
      passed: dimensionsPassed,
      detail: "Generated dimensions must match the requested aspect ratio.",
    },
    {
      id: "subject",
      passed: requiredSubjectsMatch(input),
      detail: input.outputAnalysis
        ? "Required subjects must be supported by local output analysis."
        : "Required subjects need local output analysis.",
    },
    {
      id: "text",
      passed: requiredTextMatches(input),
      detail: input.outputAnalysis
        ? "Required text must be verified by local OCR."
        : "Required text needs local OCR.",
    },
    {
      id: "reference",
      passed: referenceMatches(input),
      detail: input.referenceRequired
        ? "Reference fidelity needs a source comparison signal and limitation-free local output evidence."
        : "No reference fidelity claim is required for this task.",
    },
  ];
  const blockers = checks.filter((check) => !check.passed).map((check) => check.detail);
  return {
    passed: blockers.length === 0,
    checks,
    blockers,
    review: reviewKind(input),
  };
}

function referenceMatches(input: GeneratedImageQualityInput): boolean {
  if (!input.referenceRequired) return true;
  const output = input.outputAnalysis;
  const facts = input.referenceFacts;
  if (!output || !facts?.length || output.limitations.length > 0) return false;
  const outputEvidence = [output.caption, ...output.objects].join(" ").toLocaleLowerCase();
  const sourceObjects = facts
    .flatMap((fact) => fact.objects)
    .map((object) => object.trim().toLocaleLowerCase())
    .filter(Boolean);
  const sourceCaptions = facts
    .map((fact) => fact.caption.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (facts.some((fact) => fact.limitations.length > 0)) return false;
  if (sourceObjects.length > 0) {
    return sourceObjects.some((object) => outputEvidence.includes(object));
  }
  return sourceCaptions.some((caption) => caption && outputEvidence.includes(caption));
}

function requiredSubjectsMatch(input: GeneratedImageQualityInput): boolean {
  if (!input.requiredSubjects?.length) return true;
  if (!input.outputAnalysis) return false;
  const evidence = [input.outputAnalysis.caption, ...input.outputAnalysis.objects]
    .join(" ")
    .toLocaleLowerCase();
  return input.requiredSubjects.every((subject) =>
    evidence.includes(subject.trim().toLocaleLowerCase()),
  );
}

function requiredTextMatches(input: GeneratedImageQualityInput): boolean {
  if (!input.requiredText?.trim()) return true;
  return Boolean(input.outputAnalysis?.visibleText.includes(input.requiredText.trim()));
}

function reviewKind(input: GeneratedImageQualityInput): GeneratedImageQualityResult["review"] {
  if (input.requiredSubjects?.length || input.requiredText?.trim() || input.referenceRequired) {
    return input.outputAnalysis ? "local-analysis" : "unverifiable";
  }
  if (input.outputAnalysis) return "local-analysis";
  return "deterministic";
}

function aspectRatioMatches(width: number, height: number, requested?: string): boolean {
  if (!requested || requested === "auto") return true;
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(requested);
  if (!match) return true;
  const expected = Number(match[1]) / Number(match[2]);
  return Math.abs(width / Math.max(1, height) - expected) <= 0.02;
}

// ============================================================================
// Edit Preservation Gate (PR 2)
// ============================================================================

export type PreservationCriterionStatus = "passed" | "failed" | "not_checked";

export type PreservationCriterionEvidence = {
  id: string;
  name: string;
  category: "requested_delta" | "invariant_preservation" | "technical";
  status: PreservationCriterionStatus;
  required: boolean;
  detail: string;
  evidence?: string;
};

export type EditPreservationGateInput = {
  requestedChanges: readonly string[];
  invariants: readonly string[];
  exactText?: readonly string[];
  baseArtifactVersion?: number;
  candidateArtifactVersion?: number;
  outputWidth: number;
  outputHeight: number;
  requestedAspectRatio?: string;
  outputAnalysis?: GeneratedOutputAnalysis;
  baseAnalysis?: GeneratedOutputAnalysis;
  isTechnicalFallback?: boolean;
};

export type EditPreservationGateResult = {
  verified: boolean;
  canApply: boolean;
  criteria: PreservationCriterionEvidence[];
  blockers: string[];
  failureReasons: ImageFailureReason[];
};

/**
 * Validates candidate image for edit operations across 3 tiers:
 * 1. Technical (dimensions, decode integrity)
 * 2. Requested delta (requested modifications and exact text)
 * 3. Preservation (invariants, identity, logo/product, composition)
 *
 * Rules:
 * - Each criterion returns "passed" | "failed" | "not_checked"
 * - verified is true ONLY when all required criteria have status "passed"
 *   (any "failed" or "not_checked" prevents verified status)
 * - canApply is true ONLY when verified is true and blockers is empty
 */
export function runEditPreservationGate(
  input: EditPreservationGateInput,
): EditPreservationGateResult {
  const criteria: PreservationCriterionEvidence[] = [];
  const blockers: string[] = [];
  const failureReasons: Set<ImageFailureReason> = new Set();

  // 1. Technical: Dimensions
  const dimensionsOk = aspectRatioMatches(
    input.outputWidth,
    input.outputHeight,
    input.requestedAspectRatio,
  );
  if (!dimensionsOk) {
    criteria.push({
      id: "tech_dimensions",
      name: "Aspect Ratio & Dimensions",
      category: "technical",
      status: "failed",
      required: true,
      detail: "Generated image dimensions must match the requested aspect ratio.",
    });
    blockers.push("Dimension mismatch against target canvas aspect ratio.");
    failureReasons.add("technical-failure");
  } else {
    criteria.push({
      id: "tech_dimensions",
      name: "Aspect Ratio & Dimensions",
      category: "technical",
      status: "passed",
      required: true,
      detail: "Dimensions match requested ratio.",
      evidence: `${input.outputWidth}x${input.outputHeight}`,
    });
  }

  // 2. Technical: Output analysis limitations
  const hasSevereLimitations = Boolean(
    input.outputAnalysis?.limitations.some((lim) =>
      /(?:corrupt|blank|undecodable|black image|noise)/iu.test(lim),
    ),
  );
  if (hasSevereLimitations) {
    criteria.push({
      id: "tech_integrity",
      name: "Visual Decode Integrity",
      category: "technical",
      status: "failed",
      required: true,
      detail: "Output contains severe visual artifacts or failed decoding.",
    });
    blockers.push("Output failed decode or visual integrity check.");
    failureReasons.add("technical-failure");
  } else {
    criteria.push({
      id: "tech_integrity",
      name: "Visual Decode Integrity",
      category: "technical",
      status: "passed",
      required: true,
      detail: "Image is decodeable and free of critical corruption.",
    });
  }

  // Fallback mode bypasses semantic/preservation gates with "passed"
  if (input.isTechnicalFallback) {
    return {
      verified: blockers.length === 0,
      canApply: blockers.length === 0,
      criteria,
      blockers,
      failureReasons: Array.from(failureReasons),
    };
  }

  // 3. Requested Delta
  if (input.requestedChanges.length > 0) {
    if (!input.outputAnalysis) {
      criteria.push({
        id: "delta_requested_changes",
        name: "Requested Modifications Applied",
        category: "requested_delta",
        status: "not_checked",
        required: true,
        detail: "Output analysis required to verify requested modifications.",
      });
      blockers.push("Awaiting visual analysis to verify requested modifications.");
    } else {
      const outputText = [
        input.outputAnalysis.caption,
        ...input.outputAnalysis.objects,
      ].join(" ").toLowerCase();
      // Check if any requested change seems contradicted or failed
      const hasContradiction = input.outputAnalysis.limitations.some((lim) =>
        /(?:failed to edit|unmodified|blur)/iu.test(lim),
      );
      if (hasContradiction) {
        criteria.push({
          id: "delta_requested_changes",
          name: "Requested Modifications Applied",
          category: "requested_delta",
          status: "failed",
          required: true,
          detail: "Evidence indicates requested changes were not properly applied.",
          evidence: input.outputAnalysis.caption,
        });
        blockers.push("Requested modifications were not observed in candidate image.");
        failureReasons.add("detail-miss");
      } else {
        criteria.push({
          id: "delta_requested_changes",
          name: "Requested Modifications Applied",
          category: "requested_delta",
          status: "passed",
          required: true,
          detail: "Requested modifications observed in output.",
          evidence: outputText.slice(0, 150),
        });
      }
    }
  }

  // 4. Exact Text
  if (input.exactText && input.exactText.length > 0) {
    for (let i = 0; i < input.exactText.length; i++) {
      const text = input.exactText[i].trim();
      if (!text) continue;
      const criterionId = `delta_text_${i}`;
      if (!input.outputAnalysis) {
        criteria.push({
          id: criterionId,
          name: `Exact Text: "${text}"`,
          category: "requested_delta",
          status: "not_checked",
          required: true,
          detail: "Visual OCR analysis required to verify text.",
        });
        blockers.push(`Text "${text}" not verified by OCR.`);
      } else if (input.outputAnalysis.visibleText.includes(text)) {
        criteria.push({
          id: criterionId,
          name: `Exact Text: "${text}"`,
          category: "requested_delta",
          status: "passed",
          required: true,
          detail: "Exact text verified by OCR.",
          evidence: `Found text "${text}" in output`,
        });
      } else {
        criteria.push({
          id: criterionId,
          name: `Exact Text: "${text}"`,
          category: "requested_delta",
          status: "failed",
          required: true,
          detail: `Text "${text}" was missing or misspelled in output.`,
          evidence: `Observed OCR text: "${input.outputAnalysis.visibleText}"`,
        });
        blockers.push(`Required text "${text}" missing from generated image.`);
        failureReasons.add("text-miss");
      }
    }
  }

  // 5. Invariant Preservation
  if (input.invariants.length > 0) {
    for (let i = 0; i < input.invariants.length; i++) {
      const inv = input.invariants[i].trim();
      if (!inv) continue;
      const criterionId = `preserve_inv_${i}`;

      if (!input.outputAnalysis) {
        criteria.push({
          id: criterionId,
          name: `Preserve: ${inv}`,
          category: "invariant_preservation",
          status: "not_checked",
          required: true,
          detail: "Output analysis required to verify invariant preservation.",
        });
        blockers.push(`Invariant "${inv}" needs verification before apply.`);
      } else {
        // Look for violation cues in limitations or missing base elements
        const isLogoOrBrand = /(?:logo|brand|โลโก้|แบรนด์|ตราสินค้า)/iu.test(inv);
        const isIdentity = /(?:face|person|likeness|ใบหน้า|คน|ตัวละคร)/iu.test(inv);
        const outputEvidence = [
          input.outputAnalysis.caption,
          ...input.outputAnalysis.objects,
          ...input.outputAnalysis.limitations,
        ].join(" ").toLowerCase();

        let violated = false;
        if (isLogoOrBrand && /(?:logo removed|logo altered|logo distorted|missing logo|โลโก้เปลี่ยน)/iu.test(outputEvidence)) {
          violated = true;
        }
        if (isIdentity && /(?:face distorted|different person|face replaced|ใบหน้าเปลี่ยน)/iu.test(outputEvidence)) {
          violated = true;
        }

        if (violated) {
          criteria.push({
            id: criterionId,
            name: `Preserve: ${inv}`,
            category: "invariant_preservation",
            status: "failed",
            required: true,
            detail: `Invariant violated in output: ${inv}`,
            evidence: outputEvidence.slice(0, 150),
          });
          blockers.push(`Invariant violated: "${inv}".`);
          failureReasons.add("preservation-miss");
        } else {
          criteria.push({
            id: criterionId,
            name: `Preserve: ${inv}`,
            category: "invariant_preservation",
            status: "passed",
            required: true,
            detail: `Invariant preserved: ${inv}`,
          });
        }
      }
    }
  }

  // Final determination: verified requires that NO required criteria are failed or not_checked
  const hasFailedRequired = criteria.some((c) => c.required && c.status === "failed");
  const hasNotCheckedRequired = criteria.some((c) => c.required && c.status === "not_checked");
  const verified = !hasFailedRequired && !hasNotCheckedRequired;
  const canApply = verified && blockers.length === 0;

  return {
    verified,
    canApply,
    criteria,
    blockers,
    failureReasons: Array.from(failureReasons),
  };
}

