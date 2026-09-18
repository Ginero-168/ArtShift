/**
 * Client for Prompt Helper thumbnail generation.
 * Cloud generation is paid BYOK work and must not run without explicit consent.
 */

export async function requestPromptHelperThumbGeneration(
  optionIds: string[],
  options: { cloudConsent?: boolean } = {},
): Promise<boolean> {
  if (options.cloudConsent !== true) return false;
  if (optionIds.length === 0) return false;
  const res = await fetch("/api/ai/prompt-helper/thumbs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionIds, cloudConsent: true }),
  });
  return res.ok;
}
