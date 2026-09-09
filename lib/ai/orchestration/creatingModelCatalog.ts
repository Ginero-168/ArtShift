import type { AiImageRenderQuality } from "@/lib/ai-runtime/contracts";

export type CreatingCapability = "generate" | "edit" | "vectorize" | "upscale";

/**
 * Semantic model aliases used by routing policy and Creative Director.
 * image-general / image-fast / image-precision are the new canonical aliases.
 * image-gpt-2 is kept as a compatibility alias during migration.
 */
export type CreatingModelAlias =
  | "image-general"
  | "image-fast"
  | "image-precision"
  | "image-gpt-2"
  | "local-vtracer"
  | "recraft-vectorize"
  | "p-image-upscale"
  | "nano-banana-pro"
  | "flux-2-max"
  | "flux-1.1-pro"
  | "ideogram"
  | "recraft-v3";

export type CreatingModelEntry = {
  alias: CreatingModelAlias;
  provider: "replicate" | "local" | "unconfigured";
  modelId: string | null;
  status: "available" | "unavailable";
  capabilities: readonly CreatingCapability[];
  /** Render quality values supported by this model. */
  supportedQualities: readonly AiImageRenderQuality[];
  role: "creating" | "transforming";
  notes: string;
};

/** Render qualities supported by all current GPT Image models. */
const GPT_IMAGE_2_QUALITIES: readonly AiImageRenderQuality[] = ["low", "medium", "high", "auto"];

/** Extended quality tiers available on GPT Image 2.5 (Flare, Sunburst). */
const GPT_IMAGE_25_QUALITIES: readonly AiImageRenderQuality[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
];

export const CREATING_MODEL_CATALOG: readonly CreatingModelEntry[] = [
  {
    alias: "image-general",
    provider: "replicate",
    modelId: "openai/gpt-image-2",
    status: "available",
    capabilities: ["generate", "edit"],
    supportedQualities: GPT_IMAGE_2_QUALITIES,
    role: "creating",
    notes: "General-purpose generation and editing baseline. Default route for most requests.",
  },
  {
    // Compatibility alias — resolves to image-general internally.
    alias: "image-gpt-2",
    provider: "replicate",
    modelId: "openai/gpt-image-2",
    status: "available",
    capabilities: ["generate", "edit"],
    supportedQualities: GPT_IMAGE_2_QUALITIES,
    role: "creating",
    notes:
      "Legacy compatibility alias for image-general. Will be retired after callers migrate to image-general.",
  },
  {
    alias: "image-fast",
    provider: "replicate",
    modelId: "openai/gpt-image-2.5-flare",
    // Unavailable until IMAGE_FAST_MODEL_ENABLED feature flag is set.
    status: "unavailable",
    capabilities: ["generate", "edit"],
    supportedQualities: GPT_IMAGE_25_QUALITIES,
    role: "creating",
    notes:
      "Fast lane for everyday generation/editing, dense-text, and multi-variant tasks. Requires IMAGE_FAST_MODEL_ENABLED flag and passing ArtShift benchmark.",
  },
  {
    alias: "image-precision",
    provider: "replicate",
    modelId: "openai/gpt-image-2.5-sunburst",
    // Unavailable until IMAGE_PRECISION_MODEL_ENABLED feature flag is set.
    status: "unavailable",
    capabilities: ["generate", "edit"],
    supportedQualities: GPT_IMAGE_25_QUALITIES,
    role: "creating",
    notes:
      "Precision lane for edits requiring high identity/logo/composition preservation fidelity. Requires IMAGE_PRECISION_MODEL_ENABLED flag and passing blinded preservation benchmark.",
  },
  {
    alias: "local-vtracer",
    provider: "local",
    modelId: "vtracer-wasm",
    status: "available",
    capabilities: ["vectorize"],
    supportedQualities: [],
    role: "transforming",
    notes: "Local-first raster-to-vector path; no cloud credential required.",
  },
  {
    alias: "recraft-vectorize",
    provider: "replicate",
    modelId: "recraft-ai/recraft-vectorize",
    status: "available",
    capabilities: ["vectorize"],
    supportedQualities: [],
    role: "transforming",
    notes: "Cloud vectorization adapter; requires explicit cloud consent.",
  },
  {
    alias: "p-image-upscale",
    provider: "replicate",
    modelId: "prunaai/p-image-upscale",
    status: "available",
    capabilities: ["upscale"],
    supportedQualities: [],
    role: "transforming",
    notes: "Cloud upscaling adapter; requires explicit cloud consent.",
  },
  ...unavailableModels(),
];

export type CreatingModelResolution =
  | { ok: true; model: CreatingModelEntry }
  | {
      ok: false;
      reason: "model-unknown" | "model-unavailable" | "capability-mismatch" | "no-route" | "quality-unsupported";
      requestedAlias?: string;
      requestedQuality?: AiImageRenderQuality;
    };

export function resolveCreatingModel(
  capability: CreatingCapability,
  requestedAlias?: string,
  requestedQuality?: AiImageRenderQuality,
): CreatingModelResolution {
  if (requestedAlias) {
    const requested = CREATING_MODEL_CATALOG.find((entry) => entry.alias === requestedAlias);
    if (!requested) return { ok: false, reason: "model-unknown", requestedAlias };
    if (requested.status !== "available") {
      return { ok: false, reason: "model-unavailable", requestedAlias };
    }
    if (!requested.capabilities.includes(capability)) {
      return { ok: false, reason: "capability-mismatch", requestedAlias };
    }
    if (
      requestedQuality &&
      requested.supportedQualities.length > 0 &&
      !requested.supportedQualities.includes(requestedQuality)
    ) {
      return { ok: false, reason: "quality-unsupported", requestedAlias, requestedQuality };
    }
    return { ok: true, model: requested };
  }

  const defaults: Record<CreatingCapability, CreatingModelAlias> = {
    generate: "image-general",
    edit: "image-general",
    vectorize: "local-vtracer",
    upscale: "p-image-upscale",
  };
  const model = CREATING_MODEL_CATALOG.find((entry) => entry.alias === defaults[capability]);
  return model?.status === "available" && model.capabilities.includes(capability)
    ? { ok: true, model }
    : { ok: false, reason: "no-route" };
}

/** Check whether a quality is valid for the given model alias. */
export function isQualitySupportedByAlias(
  alias: CreatingModelAlias,
  quality: AiImageRenderQuality,
): boolean {
  const entry = CREATING_MODEL_CATALOG.find((e) => e.alias === alias);
  if (!entry || entry.supportedQualities.length === 0) return true;
  return entry.supportedQualities.includes(quality);
}

export function detectRequestedCreatingModel(prompt: string): CreatingModelAlias | undefined {
  const normalized = prompt.trim().toLocaleLowerCase();
  if (/\bnano[\s-]*banana(?:[\s-]*pro)?\b/iu.test(normalized)) return "nano-banana-pro";
  if (/\bflux[\s-]*1(?:\.1)?(?:[\s-]*pro)?\b/iu.test(normalized)) return "flux-1.1-pro";
  if (/\bflux(?:[\s-]*2(?:[\s-]*max)?)?\b/iu.test(normalized)) return "flux-2-max";
  if (/\bideogram\b/iu.test(normalized)) return "ideogram";
  if (/\brecraft(?:[\s-]*v?3)?\b/iu.test(normalized)) return "recraft-v3";
  if (/\bgpt[\s-]*image(?:[\s-]*2)?\b/iu.test(normalized)) return "image-general";
  return undefined;
}

function unavailableModels(): CreatingModelEntry[] {
  const candidates: Array<[CreatingModelAlias, string]> = [
    ["nano-banana-pro", "Nano Banana Pro generation/editing adapter has not been integrated."],
    ["flux-2-max", "Flux 2 Max adapter, price, and license have not been validated."],
    ["flux-1.1-pro", "Flux 1.1 Pro adapter, price, and license have not been validated."],
    ["ideogram", "Ideogram generation adapter has not been integrated."],
    ["recraft-v3", "Recraft V3 generation adapter has not been integrated; vectorize is separate."],
  ];
  return candidates.map(([alias, notes]) => ({
    alias,
    provider: "unconfigured",
    modelId: null,
    status: "unavailable",
    capabilities: ["generate", "edit"] as const,
    supportedQualities: [] as const,
    role: "creating" as const,
    notes,
  }));
}
