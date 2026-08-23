/** Stable generation settings for Florence-2 structured vision tasks. */
export type VisionGenerationConfig = {
  max_new_tokens: number;
  num_beams: number;
  do_sample: boolean;
};

/**
 * Structured tasks benefit from a small beam search because one output contains
 * labels and location tokens for multiple objects. Caption-only tasks stay
 * greedy so the extra work is not paid for when it cannot improve extraction.
 */
export function getVisionGenerationConfig(task: string): VisionGenerationConfig {
  const isStructuredTask =
    task === "<OD>" ||
    task === "<DENSE_REGION_CAPTION>" ||
    task.startsWith("<CAPTION_TO_PHRASE_GROUNDING>");

  return {
    max_new_tokens: 1024,
    num_beams: isStructuredTask ? 3 : 1,
    do_sample: false,
  };
}
