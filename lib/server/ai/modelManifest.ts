import type { AiExecutionProfile, AiTaskKind } from "@/lib/ai-runtime/contracts";
import type { AiRouteTable, AiRouteTarget } from "@/lib/ai-runtime/runtime";

type Environment = Record<string, string | undefined>;

const DEFAULT_REPLICATE_GPT4O_MINI_VERSION =
  "7a6099b47d623cc4a5c75037ab4616059a7066dec31fdbe409d671bddf7681d";
const DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION =
  "e27b7b83f67f5865920667591a2a08a41cdc82906bd29306fe79581ab0646b8b";

export const AI_DEFAULT_PROFILES: Partial<Record<AiTaskKind, AiExecutionProfile>> = {
  "assistant.chat": "quality",
  "vision.describe": "economy",
  "vision.propose": "quality",
  "vision.ocr": "economy",
  "prompt.enhance": "economy",
  "image.generate": "economy",
};

export function createAiRouteTable(environment: Environment = process.env): AiRouteTable {
  const anthropicModel = environment.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  const googleModel = environment.GEMINI_MODEL || "gemini-2.5-flash";
  const openAiModel = environment.OPENAI_MODEL || "gpt-4o-mini";
  const replicateGpt = `openai/gpt-4o-mini@${environment.REPLICATE_GPT4O_MINI_VERSION || DEFAULT_REPLICATE_GPT4O_MINI_VERSION}`;
  const replicateGemini = `google/gemini-3-flash@${environment.REPLICATE_GEMINI_3_FLASH_VERSION || DEFAULT_REPLICATE_GEMINI_3_FLASH_VERSION}`;

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
      economy: [{ provider: "anthropic", model: anthropicModel, alias: "chat-primary" }],
      quality: [{ provider: "anthropic", model: anthropicModel, alias: "chat-primary" }],
    },
    "vision.describe": { economy: visionEconomy, quality: visionQuality },
    "vision.propose": { economy: visionEconomy, quality: visionQuality },
    "vision.ocr": { economy: visionEconomy, quality: visionQuality },
    "prompt.enhance": {
      economy: [
        {
          provider: "anthropic",
          model: anthropicModel,
          alias: "prompt-primary",
          expectedMaxUsd: 0.02,
        },
        { provider: "google", model: googleModel, alias: "google-direct" },
        { provider: "openai", model: openAiModel, alias: "openai-direct" },
      ],
      quality: [
        {
          provider: "anthropic",
          model: anthropicModel,
          alias: "prompt-primary",
          expectedMaxUsd: 0.02,
        },
      ],
    },
    "image.generate": {
      economy: [
        imageRoute(environment.POLLINATIONS_MODEL_PRIMARY || "flux", "image-primary"),
        imageRoute(environment.POLLINATIONS_MODEL_REALISM || "flux", "image-realism"),
        imageRoute(environment.POLLINATIONS_MODEL_ANIME || "flux", "image-anime"),
        imageRoute(environment.POLLINATIONS_MODEL_3D || "flux", "image-3d"),
        imageRoute(environment.POLLINATIONS_MODEL_FAST || "turbo", "image-fast"),
      ],
      quality: [imageRoute(environment.POLLINATIONS_MODEL_PRIMARY || "flux", "image-primary")],
    },
  };
}

function imageRoute(model: string, alias: string): AiRouteTarget {
  return { provider: "pollinations", model, alias };
}
