export type BriefQualityGateInput = {
  prompt: string;
  outputWidth: number;
  outputHeight: number;
  outputCount: number;
  requestedAspectRatio?: string;
  referenceCount: number;
  submittedReferenceCount: number;
};

export type BriefQualityCheck = {
  id: "prompt" | "output-count" | "dimensions" | "aspect-ratio" | "references";
  passed: boolean;
  detail: string;
};

export type BriefQualityGateResult = {
  passed: boolean;
  checks: BriefQualityCheck[];
  blockers: string[];
  semanticReview: "deferred-to-local-asset-analysis";
};

export function runBriefQualityGate(input: BriefQualityGateInput): BriefQualityGateResult {
  const checks: BriefQualityCheck[] = [
    {
      id: "prompt",
      passed: input.prompt.trim().length >= 8 && !containsSensitivePayload(input.prompt),
      detail: "The task contains a meaningful prompt without a raw secret or image payload.",
    },
    {
      id: "output-count",
      passed: input.outputCount === 1,
      detail: "Exactly one output is expected for one atomic Canvas insertion.",
    },
    {
      id: "dimensions",
      passed:
        Number.isInteger(input.outputWidth) &&
        Number.isInteger(input.outputHeight) &&
        input.outputWidth >= 256 &&
        input.outputHeight >= 256 &&
        input.outputWidth <= 16_384 &&
        input.outputHeight <= 16_384,
      detail: "Output dimensions must be integer values in the supported image range.",
    },
    {
      id: "aspect-ratio",
      passed: aspectRatioMatches(input.outputWidth, input.outputHeight, input.requestedAspectRatio),
      detail:
        "Output aspect ratio must match the requested ratio within a small rounding tolerance.",
    },
    {
      id: "references",
      passed: input.referenceCount === input.submittedReferenceCount,
      detail: "Every selected reference must be verified and submitted as part of the task.",
    },
  ];
  const blockers = checks.filter((check) => !check.passed).map((check) => check.detail);
  return {
    passed: blockers.length === 0,
    checks,
    blockers,
    semanticReview: "deferred-to-local-asset-analysis",
  };
}

function aspectRatioMatches(width: number, height: number, requested?: string): boolean {
  if (!requested || requested === "auto") return true;
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/u.exec(requested);
  if (!match) return true;
  const expected = Number(match[1]) / Number(match[2]);
  return Math.abs(width / Math.max(1, height) - expected) <= 0.02;
}

function containsSensitivePayload(value: string): boolean {
  return /data:image\/|(?:api[_-]?key|bearer\s+[a-z0-9._-]+)/iu.test(value);
}
