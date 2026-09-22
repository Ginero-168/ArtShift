import type { AiExecutionProfile, AiTaskKind } from "@/lib/ai-runtime/contracts";
import type { AiRouteTable, AiRouteTarget } from "@/lib/ai-runtime/runtime";
import { resolveImageGenerationBackend } from "@/lib/server/ai/imageGenerationProvider";
import { OPENAI_GPT_IMAGE_25_SUNBURST_MODEL } from "@/lib/server/ai/openaiImageSize";

type Environment = Record<string, string | undefined>;

const DEFAULT_REPLICATE_GPT4O_MINI_VERSION =
  "7a6099b47d623cc4a5c75037ab4616059a7066dec31fdbe409d671bddf7681d";
const DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION =
  "e27b7b83f67f5865920667591a2a08a41cdc82906bd29306fe79581ab0646b8b";
// Flare retired: all fast routes resolve to Sunburst.
const REPLICATE_GPT_IMAGE_25_FLARE_MODEL = "openai/gpt-image-2.5-sunburst";
const REPLICATE_GPT_IMAGE_25_SUNBURST_MODEL = "openai/gpt-image-2.5-sunburst";
const REPLICATE_P_IMAGE_UPSCALE_MODEL = "prunaai/p-image-upscale";
const DEFAULT_REPLICATE_P_IMAGE_UPSCALE_VERSION =
  "391b1558e068ac45d7df06b75e3e34e485b78769c6e9c634cacf21e1dfa239bf";
const REPLICATE_QWEN_IMAGE_LAYERED_MODEL = "qwen/qwen-image-layered";

/**
 * Pricing per image at the quality tiers available from the provider.
 * Updated 2026-09-14: openai/gpt-image-2 replaced by openai/gpt-image-2.5-sunburst baseline.
 */
const IMAGE_PRICING_PER_RUN = {
  general: 0.13, // Sunburst: medium=$0.047, high=$0.128; ceiling covers high
  fast: 0.13, // Flare: same tier pricing as Sunburst; xhigh=$0.250
  precision: 0.13, // Sunburst: same tier pricing; xhigh=$0.250
} as const;

export const AI_DEFAULT_PROFILES: Partial<Record<AiTaskKind, AiExecutionProfile>> = {
  "assistant.chat": "quality",
  "vision.describe": "quality",
  "vision.propose": "quality",
  "vision.ocr": "quality",
  "vectorize.recraft": "quality",
  "prompt.enhance": "quality",
  "image.generate": "quality",
  "image.upscale": "quality",
  "image.decomposeLayers": "quality",
};

export function createAiRouteTable(environment: Environment = process.env): AiRouteTable {
  const defaultGoogleModel = "gemini-3-flash-preview";
  const googleModel = environment.GEMINI_MODEL || defaultGoogleModel;
  const openAiModel = environment.OPENAI_MODEL || "gpt-4o-mini";
  const defaultBrainModel = "google/gemini-3-flash";
  const defaultBrainVersion = DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION;
  const brainModel =
    environment.REPLICATE_BRAIN_MODEL ||
    environment.REPLICATE_CHAT_QUALITY_MODEL ||
    defaultBrainModel;
  const brainVersion =
    environment.REPLICATE_BRAIN_MODEL_VERSION ||
    environment.REPLICATE_CHAT_QUALITY_MODEL_VERSION ||
    (brainModel === defaultBrainModel
      ? environment.REPLICATE_GEMINI_3_FLASH_VERSION || defaultBrainVersion
      : undefined);
  const creativeDirectorModel = withVersion(brainModel, brainVersion);
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
  const replicateQwenImageLayered = withVersion(
    environment.REPLICATE_QWEN_IMAGE_LAYERED_MODEL || REPLICATE_QWEN_IMAGE_LAYERED_MODEL,
    environment.REPLICATE_QWEN_IMAGE_LAYERED_MODEL_VERSION,
  );
  // Moodboard-only. Slug is fixed; only the version may be pinned.
  const replicateMoodboardFlare = withVersion(
    "openai/gpt-image-2.5-flare",
    environment.REPLICATE_MOODBOARD_FLARE_VERSION,
  );

  // GPT Image 2.5 Sunburst — primary baseline and precision route (replaces gpt-image-2).
  // Version pinning via REPLICATE_GPT_IMAGE_25_SUNBURST_VERSION (optional until stable API).
  const sunburstVersion = environment.REPLICATE_GPT_IMAGE_25_SUNBURST_VERSION;
  const replicateGptImage25Sunburst = withVersion(
    REPLICATE_GPT_IMAGE_25_SUNBURST_MODEL,
    sunburstVersion,
  );

  // GPT Image 2.5 Flare — fast lane.
  // Enabled when IMAGE_FAST_MODEL_ENABLED=true.
  const fastModelEnabled = environment.IMAGE_FAST_MODEL_ENABLED === "true";
  const replicateGptImage25Flare = fastModelEnabled
    ? withVersion(
        REPLICATE_GPT_IMAGE_25_FLARE_MODEL,
        environment.REPLICATE_GPT_IMAGE_25_FLARE_VERSION,
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
  const imageBackend = resolveImageGenerationBackend(environment);

  const pushSunburstAliases = (target: AiRouteTarget) => {
    for (const alias of [
      "image-general",
      "image-precision",
      "image-gpt-2",
      ...(fastModelEnabled ? (["image-fast"] as const) : []),
    ]) {
      imageGenerateRoutes.push({ ...target, alias });
    }
  };

  if (imageBackend === "openai") {
    pushSunburstAliases(openAiImageModelRoute(IMAGE_PRICING_PER_RUN.general));
  }

  // Replicate Sunburst — fallback when OpenAI is primary, or sole backend.
  if (replicateGptImage25Sunburst) {
    const replicateTarget = imageModelRoute(
      replicateGptImage25Sunburst,
      "image-general",
      IMAGE_PRICING_PER_RUN.general,
    );
    if (imageBackend === "replicate") {
      pushSunburstAliases(replicateTarget);
    } else {
      // OpenAI first: duplicate aliases for fallback attempts.
      imageGenerateRoutes.push(
        { ...replicateTarget, alias: "image-general" },
        { ...replicateTarget, alias: "image-precision" },
        { ...replicateTarget, alias: "image-gpt-2" },
        ...(fastModelEnabled ? [{ ...replicateTarget, alias: "image-fast" as const }] : []),
      );
    }
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
    "image.decomposeLayers": {
      quality: [
        {
          provider: "replicate",
          model: replicateQwenImageLayered,
          alias: "qwen-image-layered",
          expectedMaxUsd: 0.08,
          pricing: { currency: "USD", perRunUsd: 0.05 },
        },
      ],
    },

    "image.generate":
      imageGenerateRoutes.length > 0
        ? {
            economy: [
              ...imageGenerateRoutes,
              imageModelRoute(replicateMoodboardFlare, "gpt-image-2.5-flare", 0.047),
            ],
            quality: [
              ...imageGenerateRoutes,
              imageModelRoute(replicateMoodboardFlare, "gpt-image-2.5-flare", 0.047),
            ],
          }
        : {
            economy: [imageModelRoute(replicateMoodboardFlare, "gpt-image-2.5-flare", 0.047)],
            quality: [imageModelRoute(replicateMoodboardFlare, "gpt-image-2.5-flare", 0.047)],
          },
  };
}

function creativeDirectorRoute(model: string, alias = "creative-director"): AiRouteTarget {
  const isGemini3 = model.includes("gemini-3");
  const isGemini = model.includes("gemini");
  return {
    provider: "replicate",
    model,
    alias,
    expectedMaxUsd: 0.01,
    pricing: isGemini3
      ? { currency: "USD", inputPerMillionTokens: 0.5, outputPerMillionTokens: 3.0 }
      : isGemini
        ? { currency: "USD", inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 }
        : { currency: "USD", inputPerMillionTokens: 0.18, outputPerMillionTokens: 0.72 },
  };
}

function googleCreativeDirectorRoute(model: string, alias = "creative-director"): AiRouteTarget {
  const isGemini3 = model.includes("gemini-3");
  return {
    provider: "google",
    model,
    alias,
    expectedMaxUsd: 0.01,
    pricing: isGemini3
      ? { currency: "USD", inputPerMillionTokens: 0.5, outputPerMillionTokens: 3.0 }
      : { currency: "USD", inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
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

function openAiImageModelRoute(expectedMaxUsd: number): AiRouteTarget {
  return {
    provider: "openai",
    model: OPENAI_GPT_IMAGE_25_SUNBURST_MODEL,
    expectedMaxUsd,
    pricing: {
      currency: "USD",
      inputPerMillionTokens: 8,
      outputPerMillionTokens: 30,
      perRunUsd: expectedMaxUsd,
    },
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
