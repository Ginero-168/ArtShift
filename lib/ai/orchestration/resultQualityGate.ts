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
  const checks: GeneratedImageQualityCheck[] = [
    {
      id: "dimensions",
      passed: aspectRatioMatches(input.outputWidth, input.outputHeight, input.requestedAspectRatio),
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
