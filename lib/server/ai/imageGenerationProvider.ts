type Environment = Record<string, string | undefined>;

export type ImageGenerationBackend = "openai" | "replicate";

/** Which backend serves GPT Image 2.5 Sunburst for `image.generate`. */
export function resolveImageGenerationBackend(
  environment: Environment = process.env,
): ImageGenerationBackend {
  const pref = (environment.IMAGE_GENERATION_PROVIDER || "auto").trim().toLowerCase();
  const hasOpenAi = Boolean(environment.OPENAI_API_KEY?.trim());

  if (pref === "openai") return hasOpenAi ? "openai" : "replicate";
  if (pref === "replicate") return "replicate";
  // auto: prefer OpenAI direct (custom sizes / 3:1) when configured
  if (hasOpenAi) return "openai";
  return "replicate";
}

export function imageGenerationFallbackEnabled(
  environment: Environment = process.env,
  sessionReplicateToken?: string,
): boolean {
  if (resolveImageGenerationBackend(environment) !== "openai") return false;
  return Boolean(
    sessionReplicateToken?.trim() || environment.REPLICATE_API_TOKEN?.trim(),
  );
}
