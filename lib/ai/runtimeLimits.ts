/**
 * Bounded remote execution limits for long-running image generation.
 * The proxy timeout must remain greater than the provider deadline.
 */
export const GPT_IMAGE_2_EXECUTION_TIMEOUT_MS = 180_000 as const;
export const REPLICATE_PREDICTION_CANCEL_AFTER = "180s" as const;
