import { GPT_IMAGE_2_MAX_COST_USD } from "@/lib/ai/pricing";
import type { AiExecutionProfile, AiTaskKind } from "@/lib/ai-runtime/contracts";
import type { AiRouteTable, AiRouteTarget } from "@/lib/ai-runtime/runtime";

type Environment = Record<string, string | undefined>;

const DEFAULT_REPLICATE_GPT4O_MINI_VERSION =
  "7a6099b47d623cc4a5c75037ab4616059a7066dec31fdbe409d671bddf7681d";
const DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION =
  "e27b7b83f67f5865920667591a2a08a41cdc82906bd29306fe79581ab0646b8b";
const REPLICATE_GPT_IMAGE_2_MODEL = "openai/gpt-image-2";
const REPLICATE_P_IMAGE_UPSCALE_MODEL = "prunaai/p-image-upscale";
const DEFAULT_REPLICATE_P_IMAGE_UPSCALE_VERSION =
  "391b1558e068ac45d7df06b75e3e34e485b78769c6e9c634cacf21e1dfa239bf";

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
      "openai/gpt-oss-120b",
    environment.REPLICATE_BRAIN_MODEL_VERSION || environment.REPLICATE_CHAT_QUALITY_MODEL_VERSION,
  );
  const replicateGpt = `openai/gpt-4o-mini@${environment.REPLICATE_GPT4O_MINI_VERSION || DEFAULT_REPLICATE_GPT4O_MINI_VERSION}`;
  const replicateGemini = `google/gemini-3-flash@${environment.REPLICATE_GEMINI_3_FLASH_VERSION || DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION}`;
  const replicateRecraft = withVersion(
    environment.REPLICATE_RECRAFT_VECTORIZE_MODEL || "recraft-ai/recraft-vectorize",
    environment.REPLICATE_RECRAFT_VECTORIZE_MODEL_VERSION,
  );
  const replicateGptImage2 = pinnedModel(
    REPLICATE_GPT_IMAGE_2_MODEL,
    environment.REPLICATE_GPT_IMAGE_2_VERSION,
  );
  const replicatePImageUpscale = withVersion(
    REPLICATE_P_IMAGE_UPSCALE_MODEL,
    environment.REPLICATE_P_IMAGE_UPSCALE_MODEL_VERSION ||
      DEFAULT_REPLICATE_P_IMAGE_UPSCALE_VERSION,
  );

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

  return {
    "assistant.chat": {
      economy: [creativeDirectorRoute(creativeDirectorModel)],
      quality: [creativeDirectorRoute(creativeDirectorModel)],
    },
    "prompt.enhance": {
      economy: [creativeDirectorRoute(creativeDirectorModel, "prompt-director")],
      quality: [creativeDirectorRoute(creativeDirectorModel, "prompt-director")],
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

    "image.generate": replicateGptImage2
      ? {
          economy: [imageGptRoute(replicateGptImage2)],
          quality: [imageGptRoute(replicateGptImage2)],
        }
      : { economy: [], quality: [] },
  };
}

function creativeDirectorRoute(model: string, alias = "creative-director"): AiRouteTarget {
  return {
    provider: "replicate",
    model,
    alias,
    expectedMaxUsd: 0.01,
    pricing: { currency: "USD", inputPerMillionTokens: 0.18, outputPerMillionTokens: 0.72 },
  };
}

function imageGptRoute(model: string): AiRouteTarget {
  return {
    provider: "replicate",
    model,
    alias: "image-gpt-2",
    expectedMaxUsd: GPT_IMAGE_2_MAX_COST_USD,
    pricing: { currency: "USD", perRunUsd: GPT_IMAGE_2_MAX_COST_USD },
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
