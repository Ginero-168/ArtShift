/**
 * Shared AI chat reply formatting helpers extracted from AICoPilotBar
 * so the UI shell stays thinner and reply copy stays unit-testable.
 */

import {
  type BuildImageResultSummaryOptions,
  buildImageResultSummary,
  formatHumanThoughtText,
  formatImageResultSummaryText,
  type ImageResultSummary,
} from "@/lib/ai/imageResultPresentation";
import { cleanTechnicalPromptText } from "@/lib/ai/orchestration/inlineTagSynthesis";

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

export function extractSubject(prompt: string, summary?: string): string {
  let effectivePrompt = prompt;
  if (effectivePrompt.includes("User reply:")) {
    effectivePrompt = effectivePrompt.slice(effectivePrompt.lastIndexOf("User reply:") + 11).trim();
  } else if (effectivePrompt.includes("\n\n")) {
    const segments = effectivePrompt
      .split("\n\n")
      .map((s) => s.trim())
      .filter(Boolean);
    effectivePrompt = segments[segments.length - 1] || effectivePrompt;
  }
  effectivePrompt = effectivePrompt
    .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
    .replace(/@[^\s]+/g, "")
    .trim();

  if (summary && summary.trim().length > 0 && !summary.includes("Director question:")) {
    let cleanFromSummary = cleanTechnicalPromptText(summary);
    if (cleanFromSummary.includes("User reply:")) {
      cleanFromSummary = cleanFromSummary
        .slice(cleanFromSummary.lastIndexOf("User reply:") + 11)
        .trim();
    }
    cleanFromSummary = cleanFromSummary
      .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
      .replace(/@[^\s]+/g, "")
      .trim()
      .replace(
        /^(?:ช่วย|กรุณา)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา|ปรับ|แก้ไข)?\s*(?:รูป|ภาพ|รูปภาพ)?\s*/iu,
        "",
      )
      .replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "")
      .replace(/^(?:รูปภาพ|ภาพ|รูป)\s*/iu, "")
      .replace(/\s*(?:ตามที่ขอ|เรียบร้อยแล้ว|สมจริง|สวยๆ|สไตล์.*|ในฉาก.*)\s*$/iu, "")
      .trim();
    if (
      cleanFromSummary.length > 0 &&
      cleanFromSummary.length < 60 &&
      !cleanFromSummary.includes("\n")
    ) {
      return cleanFromSummary;
    }
  }

  let cleaned = effectivePrompt
    .replace(
      /^(?:ช่วย|กรุณา|อยากได้|อยากให้|ขอ)?\s*(?:สร้าง|วาด|ทำ|เนรมิต|เจน|เอา|ปรับ|แก้ไข)?\s*(?:รูป|ภาพ|รูปภาพ)?/iu,
      "",
    )
    .replace(/\s*\d+\s*(?:รูป|ภาพ|แบบ|ชิ้น|อัน)?\s*$/iu, "")
    .replace(/\s*(?:ให้หน่อย|คิดให้หน่อย|สวยๆ|เจ๋งๆ|น่ารัก|สมจริง|ด้วยนะ|ด้วยครับ|ด้วยค่ะ|ด้วย)\s*$/iu, "")
    .trim();
  if (cleaned.includes("\n")) cleaned = cleaned.split("\n")[0].trim();
  return cleaned || "ภาพ";
}

export function formatThoughtText(
  rawPrompt: string,
  directionSummary?: string,
  count = 1,
  isEdit = false,
  dims?: { width?: number; height?: number; aspectRatio?: string },
  plannedAspects?: readonly string[],
): string {
  const multiAspectNote =
    plannedAspects && plannedAspects.length > 1
      ? ` จะแยกสร้างตามสัดส่วน ${plannedAspects.join(" · ")}`
      : "";
  const base = formatHumanThoughtText({
    rawPrompt,
    directionSummary,
    count,
    isEdit,
    width: dims?.width,
    height: dims?.height,
    aspectRatio: dims?.aspectRatio,
  });
  return multiAspectNote ? `${base}${multiAspectNote}` : base;
}

export type { ImageResultSummary };
