/**
 * Client for Prompt Helper thumbnail generation.
 * Cloud generation is paid BYOK work and must not run without explicit consent.
 */

export type PromptHelperThumbQueueOption = {
  id: string;
  label?: string;
  modifier?: string;
};

export async function requestPromptHelperThumbGeneration(
  optionIds: string[],
  request: {
    cloudConsent?: boolean;
    /** Invented chips need label/modifier; catalog ids are resolved server-side. */
    options?: PromptHelperThumbQueueOption[];
    baseSubject?: string;
  } = {},
): Promise<boolean> {
  if (request.cloudConsent !== true) return false;
  if (optionIds.length === 0) return false;
  const body: {
    optionIds: string[];
    cloudConsent: true;
    options?: PromptHelperThumbQueueOption[];
    baseSubject?: string;
  } = { optionIds, cloudConsent: true };
  if (request.options && request.options.length > 0) body.options = request.options;
  const baseSubject = request.baseSubject?.trim();
  if (baseSubject) body.baseSubject = baseSubject;
  const res = await fetch("/api/ai/prompt-helper/thumbs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}
