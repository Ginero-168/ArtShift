/**
 * Human-facing presentation helpers for chat image results:
 * aspect badges, prompt-structure fields, and post-gen summary copy.
 */

import { extractPhysicalPrintSizeCm, formatPrintUpscaleHint } from "@/lib/ai/printUpscaleGuidance";

function stripComposerMentions(subject: string): string {
  return subject
    .replace(/@\[([^\]:]+)(?::[^\]]+)?\]/g, "")
    .replace(/@[^\s]+/g, "")
    .trim();
}

function stripOutputBriefPrefix(brief: string): string {
  return brief.replace(/^(?:รูปที่\s*\d+:\s*|(?:ภาพ|รูป)?(?:ที่)?\s*\d+:\s*)/iu, "").trim();
}

export type ImageResultField = {
  label: string;
  value: string;
};

export type ImageResultSummary = {
  headline: string;
  fields: ImageResultField[];
  pills: string[];
  footer?: string;
  printHint?: string;
};

export type PromptStructureSection = {
  label: string;
  value: string;
};

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** Friendly ratio string like "3:1", "16:9", "1:1". */
export function formatFriendlyAspectRatio(
  width?: number,
  height?: number,
  aspectRatio?: string,
): string {
  if (width && height && width > 0 && height > 0) {
    const simplified = (() => {
      const g = gcd(width, height);
      const rw = Math.round(width / g);
      const rh = Math.round(height / g);
      // Keep readable for ultra-wide custom sizes (e.g. 2048×688 ≈ 3:1)
      if (rw > 32 || rh > 32) {
        const r = width / height;
        if (Math.abs(r - 3) < 0.08) return "3:1";
        if (Math.abs(r - 1 / 3) < 0.03) return "1:3";
        if (Math.abs(r - 16 / 9) < 0.05) return "16:9";
        if (Math.abs(r - 9 / 16) < 0.05) return "9:16";
        if (Math.abs(r - 2) < 0.06) return "2:1";
        if (Math.abs(r - 0.5) < 0.04) return "1:2";
        if (Math.abs(r - 1) < 0.04) return "1:1";
        return `${r.toFixed(2).replace(/\.?0+$/, "")}:1`;
      }
      return `${rw}:${rh}`;
    })();
    return simplified;
  }
  if (aspectRatio) {
    if (/^\d+:\d+$/.test(aspectRatio)) return aspectRatio;
    const m = /^(\d+)x(\d+)$/i.exec(aspectRatio);
    if (m) return formatFriendlyAspectRatio(Number(m[1]), Number(m[2]));
  }
  return "1:1";
}

/** Thumbnail corner badge — Wide / Tall / Square. */
export function formatAspectOrientationLabel(width?: number, height?: number): string {
  if (!width || !height || width <= 0 || height <= 0) return "Square";
  const r = width / height;
  if (r >= 1.35) return "Wide";
  if (r <= 0.75) return "Tall";
  return "Square";
}

function firstSentence(text: string, max = 140): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const cut = cleaned.split(/(?<=[.!?。])\s+/)[0] || cleaned;
  return cut.length > max ? `${cut.slice(0, max - 1).trim()}…` : cut;
}

function inferColorPalette(source: string): string {
  if (/(?:neon|นีออน)/i.test(source)) return "โทนสีนีออนเรืองแสง";
  if (/(?:pastel|พาสเทล)/i.test(source)) return "โทนสีพาสเทลนุ่มนวล";
  if (/(?:warm|อบอุ่น|golden hour)/i.test(source)) return "โทนอุ่นแสงทอง";
  if (/(?:cool|เย็น|cyan|blue)/i.test(source)) return "โทนเย็นฟ้า–น้ำเงิน";
  if (/(?:monochrome|ขาวดำ|black and white)/i.test(source)) return "โทนขาวดำ";
  if (/(?:vibrant|สดใส|saturated)/i.test(source)) return "โทนสีสดคมชัด";
  return "โทนสีที่กลมกลืนกับบรรยากาศภาพ";
}

function inferStyle(source: string): string {
  if (/(?:cyber|ไซเบอร์)/i.test(source)) return "สไตล์ไซเบอร์โมเดิร์น";
  if (/(?:painterly|brush|ฝีแปรง|ภาพวาด)/i.test(source)) return "สไตล์ภาพวาดศิลปะ";
  if (/(?:photoreal|photo.?real|ถ่ายจริง|photography)/i.test(source)) return "สไตล์ถ่ายภาพสมจริง";
  if (/(?:illustration|วาดเส้น|flat design|graphic)/i.test(source)) return "สไตล์กราฟิก/ภาพประกอบ";
  if (/(?:anime|อนิเมะ|cartoon|การ์ตูน)/i.test(source)) return "สไตล์การ์ตูน/อนิเมะ";
  return "สไตล์ที่เข้ากับคอนเซปต์";
}

function inferCamera(source: string): string {
  if (/(?:ultra.?wide|panoramic|พาโนรามา|มุมกว้าง|wide.?angle)/i.test(source))
    return "มุมกล้อง Cinematic มุมกว้าง";
  if (/(?:close.?up|มาโคร|macro)/i.test(source)) return "มุมกล้องใกล้ เน้นรายละเอียด";
  if (/(?:aerial|drone|มุมสูง|top.?down)/i.test(source)) return "มุมกล้องจากด้านบน";
  if (/(?:cinematic|ซินีมา)/i.test(source)) return "มุมกล้อง Cinematic";
  return "มุมกล้องที่จัดองค์ประกอบชัดเจน";
}

function inferLighting(source: string): string {
  if (/(?:sharp|dramatic|คมชัด|แสงเงาคม)/i.test(source)) return "แสงเงาคมชัด";
  if (/(?:soft|นุ่ม|gentle|ambient)/i.test(source)) return "แสงนุ่ม บรรยากาศอบอุ่น";
  if (/(?:neon|นีออน)/i.test(source)) return "แสงนีออนตัดเงา";
  if (/(?:studio|สตูดิโอ)/i.test(source)) return "แสงสตูดิโอควบคุมทิศทาง";
  return "แสงเงาที่ช่วยเล่าอารมณ์ภาพ";
}

function inferArtStyle(source: string): string {
  if (/(?:brush|texture|painterly|ฝีแปรง|เนื้อสี)/i.test(source))
    return "สไตล์ภาพวาดศิลปะ มีเนื้อสีและฝีแปรงที่มีเอกลักษณ์";
  if (/(?:photoreal|photography|ถ่ายจริง)/i.test(source)) return "สไตล์ภาพถ่ายความละเอียดสูง คมชัดสมจริง";
  if (/(?:vector|flat 2d|graphic design)/i.test(source))
    return "สไตล์กราฟิกแบน เรียบคม สำหรับงานออกแบบ";
  return "สไตล์ที่รักษาเอกลักษณ์ของงาน";
}

function inferScene(userPrompt: string, summary?: string, brief?: string): string {
  const fromBrief = brief ? stripOutputBriefPrefix(brief) : "";
  if (fromBrief && fromBrief.length >= 4) {
    return `สร้างรูป${fromBrief}`;
  }
  if (summary && summary.length > 8) {
    return firstSentence(summary, 120);
  }
  const clean = stripComposerMentions(userPrompt);
  if (clean) return `สร้างรูป${firstSentence(clean, 80)}`;
  return "สร้างภาพตามคำขอ";
}

function inferFormat(opts: {
  userPrompt: string;
  summary?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
}): string {
  const printSource = [opts.userPrompt, opts.summary].filter(Boolean).join("\n");
  const printSize = extractPhysicalPrintSizeCm(printSource);
  if (printSize) {
    return `ขนาด ${printSize.widthCm}x${printSize.heightCm}cm`;
  }
  const ratio = formatFriendlyAspectRatio(opts.width, opts.height, opts.aspectRatio);
  if (opts.width && opts.height) {
    return `สัดส่วน ${ratio} (${opts.width}×${opts.height} px)`;
  }
  return `สัดส่วน ${ratio}`;
}

/** Build "How I created this" prompt-structure rows. */
export function buildPromptStructure(opts: {
  userPrompt: string;
  summary?: string;
  refinedPrompt?: string;
  brief?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
}): PromptStructureSection[] {
  const source = [opts.refinedPrompt, opts.summary, opts.userPrompt].filter(Boolean).join("\n");
  return [
    { label: "Scene", value: inferScene(opts.userPrompt, opts.summary, opts.brief) },
    { label: "Color Palette", value: inferColorPalette(source) },
    { label: "Style", value: inferStyle(source) },
    { label: "Camera Angle", value: inferCamera(source) },
    { label: "Lighting", value: inferLighting(source) },
    { label: "Art Style", value: inferArtStyle(source) },
    {
      label: "Format",
      value: inferFormat(opts),
    },
  ];
}

export type BuildImageResultSummaryOptions = {
  subject: string;
  count: number;
  outputBriefs?: readonly string[];
  isEdit?: boolean;
  userPrompt?: string;
  summary?: string;
  refinedPrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  /** All aspect ratios that actually succeeded (multi-size runs). */
  succeededAspects?: readonly string[];
  /** Aspect ratios that failed in a multi-size run. */
  failedAspects?: readonly string[];
  modelLabel?: string;
  quality?: string;
  printSizeSource?: string;
  outputWidthPx?: number;
};

/** Structured post-generation summary for chat (Scene / Tone / Framing + pills). */
export function buildImageResultSummary(opts: BuildImageResultSummaryOptions): ImageResultSummary {
  const cleanSubject = stripComposerMentions(opts.subject);
  const succeededAspects = (opts.succeededAspects ?? [])
    .map((ratio) => formatFriendlyAspectRatio(undefined, undefined, ratio))
    .filter(Boolean);
  const failedAspects = (opts.failedAspects ?? [])
    .map((ratio) => formatFriendlyAspectRatio(undefined, undefined, ratio))
    .filter(Boolean);
  const firstBrief = opts.outputBriefs?.[0]
    ? stripOutputBriefPrefix(opts.outputBriefs[0])
    : undefined;
  // Prefer a neutral title for multi-size runs so we don't claim e.g. "…16:9"
  // when that size failed and only other ratios landed.
  const titleBit =
    succeededAspects.length > 1 ? cleanSubject || "ภาพ" : firstBrief || cleanSubject || "ภาพ";

  const headline = opts.isEdit
    ? `เสร็จแล้ว ปรับแต่ง "${titleBit}" เรียบร้อย ${opts.count} รูป`
    : `เสร็จแล้ว งาน "${titleBit}" พร้อมแล้ว${opts.count > 1 ? ` (${opts.count} รูป)` : ""}`;

  const source = [opts.refinedPrompt, opts.summary, opts.userPrompt, cleanSubject]
    .filter(Boolean)
    .join("\n");
  const primaryRatio =
    succeededAspects[0] || formatFriendlyAspectRatio(opts.width, opts.height, opts.aspectRatio);
  const printSource = [
    opts.printSizeSource,
    opts.userPrompt,
    opts.summary,
    ...(opts.outputBriefs ?? []),
  ]
    .filter(Boolean)
    .join("\n");
  const printSize = extractPhysicalPrintSizeCm(printSource);

  const sceneValue =
    succeededAspects.length > 1
      ? cleanSubject || firstSentence(opts.summary || opts.userPrompt || "ตามคำขอ", 160)
      : firstBrief && firstBrief.length > 3
        ? firstBrief
        : opts.summary
          ? firstSentence(opts.summary, 160)
          : titleBit;

  const toneParts = [inferColorPalette(source), inferStyle(source), inferLighting(source)];
  const toneValue = toneParts.join(", ");

  let framingValue: string;
  if (succeededAspects.length > 1) {
    framingValue = `เฟรม ${succeededAspects.join(" · ")}`;
    if (failedAspects.length > 0) {
      framingValue += ` (ยังไม่ได้: ${failedAspects.join(" · ")})`;
    }
  } else if (printSize && opts.width && opts.height) {
    framingValue = `พาโนรามา ${primaryRatio} (${opts.width}×${opts.height} px) สัดส่วนเดียวกับงานพิมพ์ ${printSize.widthCm}×${printSize.heightCm} ซม.`;
  } else if (opts.width && opts.height) {
    framingValue = `เฟรม ${primaryRatio} (${opts.width}×${opts.height} px)`;
  } else {
    framingValue = `เฟรม ${primaryRatio}`;
  }

  const fields: ImageResultField[] = opts.isEdit
    ? [
        { label: "Change", value: sceneValue },
        { label: "Tone", value: toneValue },
        { label: "Framing", value: framingValue },
      ]
    : [
        { label: "Scene", value: sceneValue },
        { label: "Tone", value: toneValue },
        { label: "Framing", value: framingValue },
      ];

  // Compact meta fields matching the Lighting / Art Style / Format reference
  // are available via buildPromptStructure; pills carry model / ratio / quality.
  const qualityLabel = (opts.quality || "auto").toLowerCase();
  const modelPill = opts.modelLabel
    ? `${opts.modelLabel}${qualityLabel === "auto" ? " Auto" : ` ${qualityLabel}`}`
    : undefined;
  const ratioPill = succeededAspects.length > 1 ? succeededAspects.join(" · ") : primaryRatio;
  const pills = [modelPill, ratioPill, qualityLabel].filter(Boolean) as string[];

  let printHint: string | undefined;
  if (printSize && !opts.isEdit) {
    const widthPx =
      opts.outputWidthPx && opts.outputWidthPx > 0
        ? opts.outputWidthPx
        : opts.width && opts.width > 0
          ? opts.width
          : 2048;
    printHint = formatPrintUpscaleHint(printSize, widthPx);
  }

  return {
    headline,
    fields,
    pills,
    printHint,
    footer: opts.isEdit
      ? "ถ้าอยากให้ปรับสไตล์ ท่าทาง หรือสีสันเพิ่มเติม บอกได้เลยนะคะ"
      : printHint
        ? "ถ้าอยากให้ Upscale หรือปรับโทน / องค์ประกอบ / รายละเอียด บอกได้เลยนะคะ"
        : "ถ้าอยากให้ปรับโทน / องค์ประกอบ / รายละเอียด บอกได้เลยนะคะ",
  };
}

/** Flat text used when structured UI is unavailable. */
export function formatImageResultSummaryText(summary: ImageResultSummary): string {
  const lines: string[] = [summary.headline, ""];
  for (const field of summary.fields) {
    lines.push(`${field.label}: ${field.value}`);
  }
  if (summary.printHint) {
    lines.push("", summary.printHint);
  }
  if (summary.footer) {
    lines.push("", summary.footer);
  }
  return lines.join("\n");
}

/** Minimal human Thought — no scores, model IDs, or agent jargon. */
export function formatHumanThoughtText(opts: {
  rawPrompt: string;
  directionSummary?: string;
  count?: number;
  isEdit?: boolean;
  width?: number;
  height?: number;
  aspectRatio?: string;
}): string {
  const count = opts.count ?? 1;
  const cleanSummary = (opts.directionSummary || "").replace(/\s+/g, " ").trim();
  const cleanPrompt = stripComposerMentions(opts.rawPrompt).replace(/\s+/g, " ").trim();
  const ratio = formatFriendlyAspectRatio(opts.width, opts.height, opts.aspectRatio);
  const printSize = extractPhysicalPrintSizeCm(`${opts.rawPrompt}\n${opts.directionSummary || ""}`);
  const sizeClause = printSize
    ? `ขนาด ${printSize.widthCm}×${printSize.heightCm} ซม. เป็นสัดส่วน ${ratio} จะจัดบนแคนวาสให้ตรงสัดส่วนจริง`
    : ratio !== "1:1"
      ? `จะใช้แคนวาสสัดส่วน ${ratio}`
      : null;

  if (opts.isEdit) {
    const editBit =
      cleanSummary && cleanSummary.length > 5 ? cleanSummary : cleanPrompt || "ตามคำขอ";
    return `จะปรับแต่งภาพตาม "${firstSentence(editBit, 100)}" โดยคงแสง เงา และบรรยากาศเดิมให้ดูเป็นธรรมชาติ`;
  }

  const subject =
    cleanSummary && cleanSummary.length > 5 && !cleanSummary.startsWith("สร้างภาพ")
      ? firstSentence(cleanSummary, 110)
      : cleanPrompt
        ? firstSentence(cleanPrompt, 90)
        : "ภาพตามคำขอ";

  const countClause =
    count === 1 ? "ภาพเดียวชัดเจนแล้ว เลยสร้างตรงๆ ได้เลย" : `จะสร้าง ${count} ภาพในทิศทางเดียวกัน`;

  if (sizeClause) {
    return `จะสร้าง "${subject}" ให้เลยนะครับ ${sizeClause} ${countClause}`;
  }
  return `จะสร้าง "${subject}" ให้เลยนะครับ ${countClause}`;
}
