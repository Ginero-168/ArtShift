/**
 * Shared AI chat reply formatting helpers extracted from AICoPilotBar
 * so the UI shell stays thinner and reply copy stays unit-testable.
 */

import {
  type BuildImageResultSummaryOptions,
  buildImageResultSummary,
  formatImageResultSummaryText,
  type ImageResultSummary,
} from "@/lib/ai/imageResultPresentation";

export function stripComposerMentions(subject: string): string {
  return subject
    .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
    .replace(/@[^\s]+/g, "")
    .trim();
}

export function stripOutputBriefPrefix(brief: string): string {
  return brief.replace(/^(?:รูปที่\s*\d+:\s*|(?:ภาพ|รูป)?(?:ที่)?\s*\d+:\s*)/iu, "").trim();
}

export type ImageCompletionReplyOptions = {
  /** Pixel width of generated output — used for print DPI hint when prompt has cm size. */
  outputWidthPx?: number;
  /** Extra text (prompt / brief) to scan for physical print sizes like 60x20cm. */
  printSizeSource?: string;
  summary?: string;
  refinedPrompt?: string;
  userPrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  succeededAspects?: readonly string[];
  failedAspects?: readonly string[];
  modelLabel?: string;
  quality?: string;
};

export function buildImageCompletionSummary(
  subject: string,
  count: number,
  outputBriefs?: readonly string[],
  isEdit = false,
  options?: ImageCompletionReplyOptions,
): ImageResultSummary {
  const opts: BuildImageResultSummaryOptions = {
    subject,
    count,
    outputBriefs,
    isEdit,
    userPrompt: options?.userPrompt ?? subject,
    summary: options?.summary,
    refinedPrompt: options?.refinedPrompt,
    width: options?.width,
    height: options?.height,
    aspectRatio: options?.aspectRatio,
    succeededAspects: options?.succeededAspects,
    failedAspects: options?.failedAspects,
    modelLabel: options?.modelLabel,
    quality: options?.quality,
    printSizeSource: options?.printSizeSource,
    outputWidthPx: options?.outputWidthPx,
  };
  return buildImageResultSummary(opts);
}

export function formatImageCompletionReply(
  subject: string,
  count: number,
  outputBriefs?: readonly string[],
  isEdit = false,
  options?: ImageCompletionReplyOptions,
): string {
  return formatImageResultSummaryText(
    buildImageCompletionSummary(subject, count, outputBriefs, isEdit, options),
  );
}

export type { ImageResultSummary };
