export type VisualQualityCandidate = {
  dataUrl: unknown;
  prompt: unknown;
  width: unknown;
  height: unknown;
  outputCount?: unknown;
};

export type VisualQualityCheck = {
  id: "prompt" | "image-data" | "dimensions" | "output-count";
  passed: boolean;
  detail: string;
};

export type VisualQualityGateResult = {
  passed: boolean;
  checks: VisualQualityCheck[];
  blockers: string[];
};

const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MIN_IMAGE_DIMENSION = 256;
const MAX_IMAGE_DIMENSION = 16_384;

export function runVisualQualityGate(candidate: VisualQualityCandidate): VisualQualityGateResult {
  const checks: VisualQualityCheck[] = [
    {
      id: "prompt",
      passed: typeof candidate.prompt === "string" && candidate.prompt.trim().length > 0,
      detail: "A non-empty generation prompt is present.",
    },
    {
      id: "image-data",
      passed: typeof candidate.dataUrl === "string" && IMAGE_DATA_URL.test(candidate.dataUrl),
      detail: "The generated asset is an allowlisted image data URL.",
    },
    {
      id: "dimensions",
      passed:
        Number.isInteger(candidate.width) &&
        Number.isInteger(candidate.height) &&
        Number(candidate.width) >= MIN_IMAGE_DIMENSION &&
        Number(candidate.height) >= MIN_IMAGE_DIMENSION &&
        Number(candidate.width) <= MAX_IMAGE_DIMENSION &&
        Number(candidate.height) <= MAX_IMAGE_DIMENSION,
      detail: `Image dimensions must be integer values from ${MIN_IMAGE_DIMENSION}px to ${MAX_IMAGE_DIMENSION}px.`,
    },
    {
      id: "output-count",
      passed: (candidate.outputCount ?? 1) === 1,
      detail: "Exactly one generated output is expected for this editor insertion path.",
    },
  ];
  const blockers = checks.filter((check) => !check.passed).map((check) => check.detail);
  return { passed: blockers.length === 0, checks, blockers };
}
