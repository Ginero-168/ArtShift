import { GPT_IMAGE_2_MAX_COST_USD } from "@/lib/ai/pricing";
import type { AiExecutionProfile, AiTaskKind } from "@/lib/ai-runtime/contracts";
import type { AiRouteTable, AiRouteTarget } from "@/lib/ai-runtime/runtime";

type Environment = Record<string, string | undefined>;

const DEFAULT_REPLICATE_GPT4O_MINI_VERSION =
  "7a6099b47d623cc4a5c75037ab4616059a7066dec31fdbe409d671bddf7681d";
const DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION =
  "e27b7b83f67f5865920667591a2a08a41cdc82906bd29306fe79581ab0646b8b";
const REPLICATE_GPT_IMAGE_2_MODEL = "openai/gpt-image-2";
const REPLICATE_GPT_IMAGE_25_FLARE_MODEL = "openai/gpt-image-2.5-flare";
const REPLICATE_GPT_IMAGE_25_SUNBURST_MODEL = "openai/gpt-image-2.5-sunburst";
const REPLICATE_P_IMAGE_UPSCALE_MODEL = "prunaai/p-image-upscale";
const DEFAULT_REPLICATE_P_IMAGE_UPSCALE_VERSION =
  "391b1558e068ac45d7df06b75e3e34e485b78769c6e9c634cacf21e1dfa239bf";

/**
 * Pricing per image at the quality tiers available from the provider.
 * Updated 2026-09-09. Re-verify before any production rollout.
 */
const IMAGE_PRICING_PER_RUN = {
  general: GPT_IMAGE_2_MAX_COST_USD, // medium=$0.047, high=$0.128; ceiling covers high
  fast: 0.13, // Flare: same tier pricing as GPT Image 2; xhigh=$0.250
  precision: 0.13, // Sunburst: same tier pricing as GPT Image 2; xhigh=$0.250
} as const;

export const AI_DEFAULT_PROFILES: Partial<Record<AiTaskKind, AiExecutionProfile>> = {
  "assistant.chat": "quality",
  "vision.describe": "economy",
  "vision.propose": "quality",
  "vision.ocr": "economy",
  "vectorize.recraft": "quality",
  "prompt.enhance": "quality",
  "image.generate": "quality",
  "image.upscale": "quality",
};

export function createAiRouteTable(environment: Environment = process.env): AiRouteTable {
  const googleModel = environment.GEMINI_MODEL || "gemini-2.5-flash";
  const openAiModel = environment.OPENAI_MODEL || "gpt-4o-mini";
  const creativeDirectorModel = withVersion(
    environment.REPLICATE_BRAIN_MODEL ||
      environment.REPLICATE_CHAT_QUALITY_MODEL ||
      "google/gemini-2.5-flash",
    environment.REPLICATE_BRAIN_MODEL_VERSION || environment.REPLICATE_CHAT_QUALITY_MODEL_VERSION,
  );
  const replicateGpt = `openai/gpt-4o-mini@${environment.REPLICATE_GPT4O_MINI_VERSION || DEFAULT_REPLICATE_GPT4O_MINI_VERSION}`;
  const replicateGemini = `google/gemini-3-flash@${environment.REPLICATE_GEMINI_3_FLASH_VERSION || DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION}`;
  const replicateRecraft = withVersion(
    environment.REPLICATE_RECRAFT_VECTORIZE_MODEL || "recraft-ai/recraft-vectorize",
    environment.REPLICATE_RECRAFT_VECTORIZE_MODEL_VERSION,
  );
  const replicatePImageUpscale = withVersion(
    REPLICATE_P_IMAGE_UPSCALE_MODEL,
    environment.REPLICATE_P_IMAGE_UPSCALE_MODEL_VERSION ||
      DEFAULT_REPLICATE_P_IMAGE_UPSCALE_VERSION,
  );

  // GPT Image 2 — requires pinned 64-char version hash for production stability.
  const replicateGptImage2 = pinnedModel(
    REPLICATE_GPT_IMAGE_2_MODEL,
    environment.REPLICATE_GPT_IMAGE_2_VERSION,
  );

  // GPT Image 2.5 Flare — latest official model; version pinning optional until stable API.
  // Enabled when IMAGE_FAST_MODEL_ENABLED=true and a version hash is configured.
  const fastModelEnabled = environment.IMAGE_FAST_MODEL_ENABLED === "true";
  const replicateGptImage25Flare = fastModelEnabled
    ? withVersion(
        REPLICATE_GPT_IMAGE_25_FLARE_MODEL,
        environment.REPLICATE_GPT_IMAGE_25_FLARE_VERSION,
      )
    : undefined;

  // GPT Image 2.5 Sunburst — precision lane.
  // Enabled when IMAGE_PRECISION_MODEL_ENABLED=true.
  const precisionModelEnabled = environment.IMAGE_PRECISION_MODEL_ENABLED === "true";
  const replicateGptImage25Sunburst = precisionModelEnabled
    ? withVersion(
        REPLICATE_GPT_IMAGE_25_SUNBURST_MODEL,
        environment.REPLICATE_GPT_IMAGE_25_SUNBURST_VERSION,
      )
    : undefined;

  const orchestratorProvider = (environment.AI_ORCHESTRATOR_PROVIDER || "replicate").toLowerCase();
  const orchestratorModel = environment.AI_ORCHESTRATOR_MODEL || googleModel;
  const chatRoute =
    orchestratorProvider === "google"
      ? googleCreativeDirectorRoute(orchestratorModel)
      : creativeDirectorRoute(creativeDirectorModel);
  const promptRoute =
    orchestratorProvider === "google"
      ? googleCreativeDirectorRoute(orchestratorModel, "prompt-director")
      : creativeDirectorRoute(creativeDirectorModel, "prompt-director");

  const visionEconomy: AiRouteTarget[] = [
    {
      provider: "replicate",
      model: replicateGpt,
      alias: "vision-economy",
      expectedMaxUsd: 0.01,
      pricing: { currency: "USD", inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.6 },
    },
    { provider: "openai", model: openAiModel, alias: "openai-direct" },
    { provider: "google", model: googleModel, alias: "google-direct" },
  ];
  const visionQuality: AiRouteTarget[] = [
    {
      provider: "replicate",
      model: replicateGemini,
      alias: "vision-quality",
      expectedMaxUsd: 0.03,
      pricing: { currency: "USD", inputPerMillionTokens: 0.5, outputPerMillionTokens: 3 },
    },
    { provider: "google", model: googleModel, alias: "google-direct" },
  ];

  // Build image generation route table.
  // Route aliases map to semantic image model aliases used by the routing policy.
  const imageGenerateRoutes: AiRouteTarget[] = [];

  // image-general (GPT Image 2) — always the baseline route.
  if (replicateGptImage2) {
    imageGenerateRoutes.push(imageModelRoute(replicateGptImage2, "image-general", IMAGE_PRICING_PER_RUN.general));
    // Keep legacy alias for compatibility until all callers migrate.
    imageGenerateRoutes.push(imageModelRoute(replicateGptImage2, "image-gpt-2", IMAGE_PRICING_PER_RUN.general));
  }

  // image-fast (GPT Image 2.5 Flare) — enabled by feature flag.
  if (replicateGptImage25Flare) {
    imageGenerateRoutes.push(imageModelRoute(replicateGptImage25Flare, "image-fast", IMAGE_PRICING_PER_RUN.fast));
  }

  // image-precision (GPT Image 2.5 Sunburst) — enabled by feature flag.
  if (replicateGptImage25Sunburst) {
    imageGenerateRoutes.push(imageModelRoute(replicateGptImage25Sunburst, "image-precision", IMAGE_PRICING_PER_RUN.precision));
  }

  return {
    "assistant.chat": {
      economy: [chatRoute],
      quality: [chatRoute],
    },
    "prompt.enhance": {
      economy: [promptRoute],
      quality: [promptRoute],
    },
    "vision.describe": { economy: visionEconomy, quality: visionQuality },
    "vision.propose": { economy: visionEconomy, quality: visionQuality },
    "vision.ocr": { economy: visionEconomy, quality: visionQuality },
    "vectorize.recraft": {
      quality: [
        {
          provider: "replicate",
          model: replicateRecraft,
          alias: "recraft-vectorize",
        },
      ],
    },
    "image.upscale": {
      quality: [
        {
          provider: "replicate",
          model: replicatePImageUpscale,
          alias: "p-image-upscale",
          expectedMaxUsd: 0.04,
          pricing: { currency: "USD", perRunUsd: 0.04 },
        },
      ],
    },

    "image.generate":
      imageGenerateRoutes.length > 0
        ? { economy: imageGenerateRoutes, quality: imageGenerateRoutes }
        : { economy: [], quality: [] },
  };
}

function creativeDirectorRoute(model: string, alias = "creative-director"): AiRouteTarget {
  const isGemini = model.includes("gemini");
  return {
    provider: "replicate",
    model,
    alias,
    expectedMaxUsd: 0.01,
    pricing: isGemini
      ? { currency: "USD", inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 }
      : { currency: "USD", inputPerMillionTokens: 0.18, outputPerMillionTokens: 0.72 },
  };
}

function googleCreativeDirectorRoute(model: string, alias = "creative-director"): AiRouteTarget {
  return {
    provider: "google",
    model,
    alias,
    expectedMaxUsd: 0.01,
    pricing: { currency: "USD", inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
  };
}

function imageModelRoute(model: string, alias: string, expectedMaxUsd: number): AiRouteTarget {
  return {
    provider: "replicate",
    model,
    alias,
    expectedMaxUsd,
    pricing: { currency: "USD", perRunUsd: expectedMaxUsd },
  };
}

function pinnedModel(model: string, version: string | undefined): string | undefined {
  if (!version || !/^[a-f0-9]{64}$/iu.test(version)) return undefined;
  return `${model}@${version}`;
}

function withVersion(model: string, version: string | undefined): string {
  if (!version || model.includes("@")) return model;
  return `${model}@${version}`;
}
