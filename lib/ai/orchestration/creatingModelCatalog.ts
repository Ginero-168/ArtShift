export type CreatingCapability = "generate" | "edit" | "vectorize" | "upscale";

export type CreatingModelAlias =
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
  role: "creating" | "transforming";
  notes: string;
};

export const CREATING_MODEL_CATALOG: readonly CreatingModelEntry[] = [
  {
    alias: "image-gpt-2",
    provider: "replicate",
    modelId: "openai/gpt-image-2",
    status: "available",
    capabilities: ["generate", "edit"],
    role: "creating",
    notes: "Current server-owned generation and editing route.",
  },
  {
    alias: "local-vtracer",
    provider: "local",
    modelId: "vtracer-wasm",
    status: "available",
    capabilities: ["vectorize"],
    role: "transforming",
    notes: "Local-first raster-to-vector path; no cloud credential required.",
  },
  {
    alias: "recraft-vectorize",
    provider: "replicate",
    modelId: "recraft-ai/recraft-vectorize",
    status: "available",
    capabilities: ["vectorize"],
    role: "transforming",
    notes: "Cloud vectorization adapter; requires explicit cloud consent.",
  },
  {
    alias: "p-image-upscale",
    provider: "replicate",
    modelId: "prunaai/p-image-upscale",
    status: "available",
    capabilities: ["upscale"],
    role: "transforming",
    notes: "Cloud upscaling adapter; requires explicit cloud consent.",
  },
  ...unavailableModels(),
];

export type CreatingModelResolution =
  | { ok: true; model: CreatingModelEntry }
  | {
      ok: false;
      reason: "model-unknown" | "model-unavailable" | "capability-mismatch" | "no-route";
      requestedAlias?: string;
    };

export function resolveCreatingModel(
  capability: CreatingCapability,
  requestedAlias?: string,
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
    return { ok: true, model: requested };
  }

  const defaults: Record<CreatingCapability, CreatingModelAlias> = {
    generate: "image-gpt-2",
    edit: "image-gpt-2",
    vectorize: "local-vtracer",
    upscale: "p-image-upscale",
  };
  const model = CREATING_MODEL_CATALOG.find((entry) => entry.alias === defaults[capability]);
  return model?.status === "available" && model.capabilities.includes(capability)
    ? { ok: true, model }
    : { ok: false, reason: "no-route" };
}

export function detectRequestedCreatingModel(prompt: string): CreatingModelAlias | undefined {
  const normalized = prompt.trim().toLocaleLowerCase();
  if (/\bnano[\s-]*banana(?:[\s-]*pro)?\b/iu.test(normalized)) return "nano-banana-pro";
  if (/\bflux[\s-]*1(?:\.1)?(?:[\s-]*pro)?\b/iu.test(normalized)) return "flux-1.1-pro";
  if (/\bflux(?:[\s-]*2(?:[\s-]*max)?)?\b/iu.test(normalized)) return "flux-2-max";
  if (/\bideogram\b/iu.test(normalized)) return "ideogram";
  if (/\brecraft(?:[\s-]*v?3)?\b/iu.test(normalized)) return "recraft-v3";
  if (/\bgpt[\s-]*image(?:[\s-]*2)?\b/iu.test(normalized)) return "image-gpt-2";
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
    capabilities: ["generate", "edit"],
    role: "creating",
    notes,
  }));
}
