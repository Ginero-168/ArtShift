/**
 * Shared AI chat reply formatting helpers extracted from AICoPilotBar
 * so the UI shell stays thinner and reply copy stays unit-testable.
 */

import {
  extractPhysicalPrintSizeCm,
  formatPrintUpscaleHint,
} from "@/lib/ai/printUpscaleGuidance";

export function stripComposerMentions(subject: string): string {
  return subject
    .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
    .replace(/@[^\s]+/g, "")
    .trim();
}

export function stripOutputBriefPrefix(brief: string): string {
  return brief
    .replace(/^(?:รูปที่\s*\d+:\s*|(?:ภาพ|รูป)?(?:ที่)?\s*\d+:\s*)/iu, "")
    .trim();
}

export type ImageCompletionReplyOptions = {
  /** Pixel width of generated output — used for print DPI hint when prompt has cm size. */
  outputWidthPx?: number;
  /** Extra text (prompt / brief) to scan for physical print sizes like 60x20cm. */
  printSizeSource?: string;
};

export function formatImageCompletionReply(
  subject: string,
  count: number,
  outputBriefs?: readonly string[],
  isEdit = false,
  options?: ImageCompletionReplyOptions,
): string {
  const cleanSubject = stripComposerMentions(subject);
  const firstBrief = outputBriefs?.[0] ? stripOutputBriefPrefix(outputBriefs[0]) : undefined;
  const headerLine = isEdit
    ? firstBrief || (cleanSubject && !cleanSubject.startsWith("ปรับ") ? cleanSubject : "")
      ? `ปรับแต่งภาพ "${firstBrief || cleanSubject}" เสร็จแล้ว ${count} รูปค่ะ`
      : `ปรับแต่งภาพเรียบร้อยแล้วค่ะ (${count} รูป)`
    : `สร้างรูป${firstBrief || cleanSubject || "ภาพ"}เสร็จแล้ว ${count} รูปค่ะ`;

  const lines: string[] = [headerLine, ""];
  if (outputBriefs && outputBriefs.length > 0) {
    outputBriefs.slice(0, count).forEach((brief, idx) => {
      const cleanBrief = stripOutputBriefPrefix(brief);
      lines.push(
        `• รูปที่ ${idx + 1}: ${cleanBrief || `${cleanSubject || "ภาพ"} แบบที่ ${idx + 1}`}`,
      );
    });
  } else {
    for (let i = 1; i <= count; i++) {
      lines.push(`• รูปที่ ${i}: ${cleanSubject || "ภาพ"} แบบที่ ${i}`);
    }
  }

  const printSource = [options?.printSizeSource, subject, ...(outputBriefs ?? [])]
    .filter(Boolean)
    .join("\n");
  const printSize = extractPhysicalPrintSizeCm(printSource);
  if (printSize && !isEdit) {
    const widthPx = options?.outputWidthPx && options.outputWidthPx > 0 ? options.outputWidthPx : 2048;
    lines.push("", formatPrintUpscaleHint(printSize, widthPx));
  }

  lines.push("", "ถ้าอยากให้ปรับสไตล์ ท่าทาง หรือสีสันเพิ่มเติม บอกได้เลยนะคะ");
  return lines.join("\n");
}
