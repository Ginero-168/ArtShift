/**
 * Provider-neutral AI Image Studio client.
 * The server routes every generation request to the server-owned GPT Image 2 route.
 */

import type { AiImageAspectRatio, AiImageRenderQuality } from "@/lib/ai-runtime/contracts";
import { resolveGenerationSizeFromRatio } from "@/lib/ai/generationSize";
import { loadDataURL } from "@/lib/engine/imageCache";
import { GPT_IMAGE_2_MAX_COST_USD } from "./pricing";
import { runVisualQualityGate } from "./visualQualityGate";

export const GPT_IMAGE_2_MODEL = "openai/gpt-image-2.5-sunburst" as const;
export const GPT_IMAGE_25_SUNBURST_MODEL = "openai/gpt-image-2.5-sunburst" as const;
export const GPT_IMAGE_2_QUALITY = "high" as const;
export const GPT_IMAGE_2_ESTIMATED_COST_USD = GPT_IMAGE_2_MAX_COST_USD;
export type GptImageQuality = AiImageRenderQuality;

export interface AspectRatioOption {
  id: AiImageAspectRatio;
  label: string;
  ratio: string;
  width: number;
  height: number;
  icon: string;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: "1:1", label: "Square", ratio: "1:1", width: 1024, height: 1024, icon: "◻" },
  { id: "16:9", label: "Landscape", ratio: "16:9", width: 1280, height: 720, icon: "▭" },
  { id: "9:16", label: "Story/Reel", ratio: "9:16", width: 720, height: 1280, icon: "▯" },
  { id: "4:3", label: "Classic", ratio: "4:3", width: 1024, height: 768, icon: "▱" },
  { id: "3:4", label: "Portrait", ratio: "3:4", width: 768, height: 1024, icon: "▯" },
  { id: "3:1", label: "Banner 3:1", ratio: "3:1", width: 2048, height: 688, icon: "▬" },
  { id: "1:3", label: "Skyscraper 1:3", ratio: "1:3", width: 688, height: 2048, icon: "▮" },
];

const DIMENSION_PAIR_RE =
  /(?:ขนาด\s*)?(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|m|in|นิ้ว|ซม|ซม\.|px|pixels)?/giu;
const COLON_RATIO_RE = /(\d+)\s*:\s*(\d+)/gu;

function textHasDimensionPair(text: string): boolean {
  DIMENSION_PAIR_RE.lastIndex = 0;
  return DIMENSION_PAIR_RE.test(text);
}

export type RequestedSizeSpec = {
  width: number;
  height: number;
  aspectRatio: AiImageAspectRatio;
  ratioClamped?: boolean;
  /** Original mention, e.g. "16:9" or "53x20". */
  label: string;
  sourceWidth: number;
  sourceHeight: number;
};

export function hasExplicitDimensionsInText(text?: string): boolean {
  if (!text || typeof text !== "string") return false;
  const val = text.toLocaleLowerCase();
  return (
    textHasDimensionPair(val) ||
    /\b(?:3\s*:\s*1|1\s*:\s*3|21\s*:\s*9|16\s*:\s*9|9\s*:\s*16|4\s*:\s*3|3\s*:\s*4|1\s*:\s*1)\b/u.test(val) ||
    /(?:60x20|120x40|2048x688|1536x512|wide panoramic|พาโนรามา|แนวตั้ง|แนวนอน|landscape|portrait|สี่เหลี่ยมจัตุรัส|จัตุรัส|square)/iu.test(val)
  );
}

function resolveColonRatioDimensions(
  ratioWidth: number,
  ratioHeight: number,
): {
  width: number;
  height: number;
  aspectRatio: AiImageAspectRatio;
  ratioClamped?: boolean;
} {
  // Prefer named presets for common social/print ratios.
  return resolveImageGenerationDimensions(`${ratioWidth}:${ratioHeight}`);
}

/**
 * Extract every physical/pixel WxH mention in order (for multi-size campaigns).
 * Dedupes consecutive identical pairs so "53x20 cm Endcap 53x20" counts once.
 */
export function extractDimensionSpecsFromText(text?: string): RequestedSizeSpec[] {
  if (!text || typeof text !== "string") return [];
  const specs: RequestedSizeSpec[] = [];
  DIMENSION_PAIR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIMENSION_PAIR_RE.exec(text)) !== null) {
    const sourceWidth = parseFloat(match[1] ?? "");
    const sourceHeight = parseFloat(match[2] ?? "");
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) continue;
    const prev = specs[specs.length - 1];
    if (prev && prev.sourceWidth === sourceWidth && prev.sourceHeight === sourceHeight) {
      continue;
    }
    const resolved = resolveGenerationSizeFromRatio(sourceWidth, sourceHeight);
    specs.push({
      width: resolved.width,
      height: resolved.height,
      aspectRatio: resolved.aspectRatio,
      ratioClamped: resolved.ratioClamped,
      label: `${sourceWidth}x${sourceHeight}`,
      sourceWidth,
      sourceHeight,
    });
  }
  return specs;
}

/**
 * Extract every A:B aspect mention in order (e.g. "16:9, 3:4 และ 9:16").
 * Dedupes by resolved aspect id so repeats do not inflate output count.
 */
export function extractAspectRatioSpecsFromText(text?: string): RequestedSizeSpec[] {
  if (!text || typeof text !== "string") return [];
  const specs: RequestedSizeSpec[] = [];
  const seen = new Set<string>();
  COLON_RATIO_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COLON_RATIO_RE.exec(text)) !== null) {
    const sourceWidth = Number(match[1]);
    const sourceHeight = Number(match[2]);
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) continue;
    // Skip clock-like or version-like tokens (e.g. 2024:01) — keep realistic aspect nums.
    if (sourceWidth > 64 || sourceHeight > 64) continue;
    const resolved = resolveColonRatioDimensions(sourceWidth, sourceHeight);
    if (seen.has(resolved.aspectRatio)) continue;
    seen.add(resolved.aspectRatio);
    specs.push({
      width: resolved.width,
      height: resolved.height,
      aspectRatio: resolved.aspectRatio,
      ratioClamped: resolved.ratioClamped,
      label: `${sourceWidth}:${sourceHeight}`,
      sourceWidth,
      sourceHeight,
    });
  }
  return specs;
}

/**
 * All distinct size targets in a prompt: physical WxH first (print campaigns),
 * then named A:B ratios. Used to drive multi-output runs.
 */
export function extractRequestedSizeSpecsFromText(text?: string): RequestedSizeSpec[] {
  if (!text || typeof text !== "string") return [];
  const fromPixels = extractDimensionSpecsFromText(text);
  if (fromPixels.length > 0) {
    const seen = new Set(fromPixels.map((s) => s.aspectRatio));
    const extras = extractAspectRatioSpecsFromText(text).filter(
      (s) => !seen.has(s.aspectRatio),
    );
    return [...fromPixels, ...extras];
  }
  return extractAspectRatioSpecsFromText(text);
}

export function resolveImageGenerationDimensions(prompt: string): {
  width: number;
  height: number;
  aspectRatio: AiImageAspectRatio;
  ratioClamped?: boolean;
} {
  const value = prompt.toLocaleLowerCase();

  // Explicit physical/custom dimensions e.g. "60x20cm", "60x30", "120 x 40 cm", "2048x688"
  const dimMatch =
    /(?:ขนาด\s*)?(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:cm|mm|m|in|นิ้ว|ซม|ซม\.|px|pixels)?/iu.exec(
      value,
    );
  if (dimMatch) {
    const w = parseFloat(dimMatch[1]);
    const h = parseFloat(dimMatch[2]);
    if (w > 0 && h > 0) {
      const resolved = resolveGenerationSizeFromRatio(w, h);
      return {
        width: resolved.width,
        height: resolved.height,
        aspectRatio: resolved.aspectRatio,
        ratioClamped: resolved.ratioClamped,
      };
    }
  }

  // Named / numeric ratios — standards stay named; any other A:B uses custom pixels.
  if (/(?:1\s*:\s*1|สี่เหลี่ยมจัตุรัส|จัตุรัส|square)/iu.test(value)) {
    return { width: 1024, height: 1024, aspectRatio: "1:1" };
  }
  if (/(?:16\s*:\s*9)/u.test(value)) {
    return { width: 1280, height: 720, aspectRatio: "16:9" };
  }
  if (/(?:9\s*:\s*16)/u.test(value)) {
    return { width: 720, height: 1280, aspectRatio: "9:16" };
  }
  if (/(?:4\s*:\s*3)/u.test(value)) return { width: 1024, height: 768, aspectRatio: "4:3" };
  if (/(?:3\s*:\s*4)/u.test(value)) return { width: 768, height: 1024, aspectRatio: "3:4" };
  if (/(?:3\s*:\s*2)/u.test(value)) return { width: 1536, height: 1024, aspectRatio: "3:2" };
  if (/(?:2\s*:\s*3)/u.test(value)) return { width: 1024, height: 1536, aspectRatio: "2:3" };

  const colonRatio = /(\d+)\s*:\s*(\d+)/u.exec(value);
  if (colonRatio) {
    const rw = Number(colonRatio[1]);
    const rh = Number(colonRatio[2]);
    if (rw > 0 && rh > 0) {
      const resolved = resolveGenerationSizeFromRatio(rw, rh);
      return {
        width: resolved.width,
        height: resolved.height,
        aspectRatio: resolved.aspectRatio,
        ratioClamped: resolved.ratioClamped,
      };
    }
  }

  if (/(?:wide\s+panoramic|พาโนรามา)/iu.test(value)) {
    const resolved = resolveGenerationSizeFromRatio(3, 1);
    return {
      width: resolved.width,
      height: resolved.height,
      aspectRatio: resolved.aspectRatio,
      ratioClamped: resolved.ratioClamped,
    };
  }
  if (/(?:vertical\s+skyscraper)/iu.test(value)) {
    const resolved = resolveGenerationSizeFromRatio(1, 3);
    return {
      width: resolved.width,
      height: resolved.height,
      aspectRatio: resolved.aspectRatio,
      ratioClamped: resolved.ratioClamped,
    };
  }
  if (/(?:แนวตั้ง|\bvertical\b|portrait\s+(?:mode|orientation|ratio)|\bportrait\b(?!\s+of\b|\s+photo|\s+shot|\s+picture))/iu.test(value)) {
    return { width: 720, height: 1280, aspectRatio: "9:16" };
  }
  if (/(?:แนวนอน|\bhorizontal\b|landscape)/iu.test(value)) {
    return { width: 1280, height: 720, aspectRatio: "16:9" };
  }
  return { width: 1024, height: 1024, aspectRatio: "1:1" };
}

/** Map an arbitrary pixel size onto a legal native generation size (same ratio). */
export function resolveDimensionsFromPixelSize(width: number, height: number): {
  width: number;
  height: number;
  aspectRatio: AiImageAspectRatio;
  ratioClamped?: boolean;
} {
  const resolved = resolveGenerationSizeFromRatio(width, height);
  return {
    width: resolved.width,
    height: resolved.height,
    aspectRatio: resolved.aspectRatio,
    ratioClamped: resolved.ratioClamped,
  };
}

export interface ImageGenerationOptions {
  prompt: string;
  aspectRatio?: AiImageAspectRatio;
  width?: number;
  height?: number;
  quality?: GptImageQuality;
  modelAlias?: string;
  inputImages?: Array<{
    dataUrl: string;
    mimeType?: "image/jpeg" | "image/png" | "image/webp";
  }>;
  cloudConsent?: boolean;
  seed?: number;
  enhance?: boolean;
}

export interface GeneratedImageResult {
  dataUrl: string;
  fileId: string;
  width: number;
  height: number;
  seed: number;
  model: string;
  prompt: string;
}

export class OutcomeUnknownError extends Error {
  readonly predictionId?: string;

  constructor(message: string, predictionId?: string) {
    super(message);
    this.name = "OutcomeUnknownError";
    this.predictionId = predictionId;
  }
}

export const INSPIRATION_PROMPTS = [
  "Futuristic cyberpunk city at night with neon lights and flying cars, cinematic lighting, 8k",
  "Minimalist 3D isometric room with pastel colors, cozy reading nook, ambient lighting",
  "Studio product photography of a luxury perfume bottle on marble, soft shadows, golden hour",
  "Cute watercolor illustration of a cat reading a book in a cozy cafe, whimsical, pastel colors",
  "Vibrant flat vector illustration of an astronaut planting a flag on Mars, modern graphic design",
];

export const THAI_KEYWORD_MAP: Record<string, string> = {
  แมว: "cute fluffy cat, adorable, high detail, studio lighting",
  หมา: "cute fluffy puppy dog, adorable, high quality",
  สุนัข: "cute fluffy dog, studio portrait, high quality",
  กาแฟ: "aesthetic iced coffee glass cup on wooden table, warm sunlight",
  แก้วกาแฟ: "aesthetic latte art coffee cup, cafe atmosphere",
  วิว: "beautiful scenic landscape, panoramic view, golden hour",
  ทะเล: "beautiful tropical beach ocean with crystal clear turquoise water, sunny day",
  ภูเขา: "majestic mountain range, misty valley, cinematic lighting",
  ดอกไม้: "vibrant blooming colorful flowers, botanical garden, soft focus",
  อาหาร: "delicious gourmet meal plate, professional food photography, 8k",
  ซูชิ: "delicious Japanese sushi platter, fresh nigiri, appetizing food photography",
  อาหารญี่ปุ่น: "authentic Japanese cuisine feast, appetizing presentation",
  เอิร์ธโทน: "warm natural earth-tone color palette, soft beige and wood tones",
  รถ: "modern sleek luxury sports car, cinematic studio lighting",
  บ้าน: "modern minimalist architecture house, luxury interior exterior design",
  หุ่นยนต์: "futuristic cyber robot, glowing neon details, sci-fi concept art",
  มินิมอล: "minimalist aesthetic composition, clean background, elegant",
  การ์ตูน: "cute 2D cartoon anime illustration, vibrant colors",
};

const IMAGE_COMMAND_PREFIX =
  /^(?:(?:ช่วย|ขอ)\s*)?(?:สร้างรูปภาพ|สร้างรูป|ทำรูปภาพ|ทำรูป|ทำภาพ|วาดรูปภาพ|วาดรูป|สร้างภาพ|วาดภาพ|generate image|create image|picture of|image of|รูปภาพ|รูป|ภาพ|draw)\s*/iu;
const IMAGE_COMMAND_SUFFIX = /\s*(?:ให้หน่อย|หน่อย|นะ|ครับ|ค่ะ|จ้า)\s*$/iu;
const IMAGE_PROMPT_CONTEXT_PREFIX = /^(?:of|about|เกี่ยวกับ)\s*/iu;

/** Removes conversational image-generation commands while preserving the visual request. */
export function cleanImagePrompt(rawPrompt: string): string {
  return rawPrompt
    .trim()
    .replace(IMAGE_COMMAND_PREFIX, "")
    .replace(IMAGE_PROMPT_CONTEXT_PREFIX, "")
    .replace(IMAGE_COMMAND_SUFFIX, "")
    .trim();
}

/** Identifies requests specifically asking to edit or modify an image. */
export function isImageEditPrompt(userPrompt: string): boolean {
  const prompt = userPrompt.trim().toLowerCase();
  if (
    /(?:แก้|แก้ไข|ปรับแต่ง|ปรับ|รีทัช|แต่ง)\s*(?:ให้|หน่อย|\s+)*(?:รูป|ภาพ|รูปภาพ|image|photo|picture)/iu.test(
      prompt,
    ) ||
    /(?:รูป|ภาพ|รูปภาพ|image|photo|picture)\s*(?:แก้|แก้ไข|ปรับแต่ง|ปรับ|รีทัช)/iu.test(prompt) ||
    /\b(?:edit|modify|retouch)\s+(?:image|photo|picture|graphic)\b/iu.test(prompt)
  ) {
    return true;
  }
  return (
    prompt.includes("แก้ไขรูป") ||
    prompt.includes("แก้รูป") ||
    prompt.includes("ปรับแต่งรูป") ||
    prompt.includes("ปรับแต่งภาพ") ||
    prompt.includes("ปรับรูป") ||
    prompt.includes("รีทัชรูป") ||
    prompt.includes("edit image") ||
    prompt.includes("edit photo") ||
    prompt.includes("modify image")
  );
}

/** Identifies common Thai and English requests that should be handled by image generation or editing. */
export function isImageGenerationPrompt(userPrompt: string): boolean {
  const prompt = userPrompt.trim().toLowerCase();
  if (isImageEditPrompt(prompt)) {
    return true;
  }
  // Follow-ups like "สร้างมาอีก 3 รูป" / "อีก 2 แบบ" must stay on the image path.
  if (
    /(?:สร้าง|ทำ|เอา|วาด|เจน|ผลิต|ออกแบบ|ขอ|generate|create|make)\s*(?:มา|ให้|เพิ่ม)?\s*อีก(?:\s*(?:\d+|หนึ่ง|สอง|สาม|สี่|ห้า|one|two|three|four|five))?\s*(?:แบบ|รูป|ภาพ|ตัวเลือก)?/iu.test(
      prompt,
    ) ||
    /(?:^|\s)อีก\s*(?:\d+|หนึ่ง|สอง|สาม|สี่|ห้า)?\s*(?:แบบ|รูป|ภาพ|ตัวเลือก)/iu.test(prompt) ||
    /(?:ขอตัวเลือก|ตัวเลือกเพิ่ม|สร้างเพิ่ม|ทำเพิ่ม|variation)/iu.test(prompt)
  ) {
    return true;
  }
  if (
    /(?:ขอ|สร้าง|ทำ|เอา|ผลิต|เจน|วาด|เพิ่ม|จัดมา|ออกแบบ)\s*(?:มา|ให้|หน่อย|อีก|เพิ่ม|ตัวเลือก|\s+)*(?:รูป|ภาพ|แบบ|ตัวเลือก|ดีไซน์|ชิ้น|งาน)/iu.test(
      prompt,
    ) ||
    /\b\d+\s*(?:แบบ|รูป|ภาพ|ตัวเลือก|variations?|options?)\b/iu.test(prompt)
  ) {
    return true;
  }
  return (
    prompt.includes("สร้างรูป") ||
    prompt.includes("วาดรูป") ||
    prompt.includes("สร้างภาพ") ||
    prompt.includes("ทำภาพ") ||
    prompt.includes("ทำรูป") ||
    prompt.includes("วาดภาพ") ||
    prompt.includes("ขอรูป") ||
    prompt.includes("ขอภาพ") ||
    prompt.includes("ขอแบบ") ||
    prompt.includes("ตัวเลือก") ||
    prompt.includes("generate image") ||
    prompt.includes("create image") ||
    prompt.includes("variation") ||
    (prompt.startsWith("รูป") && prompt.length > 5) ||
    (prompt.startsWith("ภาพ") && prompt.length > 5) ||
    prompt.includes("draw ") ||
    prompt.includes("picture of") ||
    prompt.includes("image of") ||
    prompt.includes("infographic") ||
    prompt.includes("อินโฟกราฟิก") ||
    prompt.includes("information graphic")
  );
}

export function enrichPrompt(rawPrompt: string): string {
  let prompt = cleanImagePrompt(rawPrompt);

  if (!prompt) prompt = "beautiful aesthetic digital art";

  // Check if contains mapped Thai keywords
  for (const [thaiWord, enTranslation] of Object.entries(THAI_KEYWORD_MAP)) {
    if (prompt.includes(thaiWord)) {
      return `${enTranslation}, ${prompt}`;
    }
  }

  return prompt;
}

/**
 * Streamlines and optimizes a complex prompt for image diffusion models.
 * - Extracts titles/headers and formats them as clean typography directives.
 * - Detects and safely transforms speech bubbles / conversational Thai dialogue into visual atmosphere.
 * - Enriches Thai visual concepts with descriptive visual keywords (cuisine, landscape, composition).
 * - Strips conversational fluff and returns a concise, high-aesthetic prompt.
 */
export function streamlinePromptForImageGen(rawPrompt: string): string {
  if (isAlreadyOrchestratedPrompt(rawPrompt)) {
    return cleanImagePrompt(rawPrompt) || rawPrompt.trim();
  }
  let cleaned = cleanImagePrompt(rawPrompt);
  if (!cleaned) return "beautiful aesthetic digital art";

  // 1. Extract Title
  let titleText: string | undefined;
  const titleMatch =
    /(?:(?:มี|ใส่)?\s*(?:title|หัวข้อ|ชื่อเรื่อง|ข้อความหัวเรื่อง|พาดหัว|ข้อความว่า)\s*(?:ว่า|คือ)?\s*["“'「]([^"”'」]+)["”'」])/iu.exec(
      cleaned,
    );
  if (titleMatch) {
    titleText = titleMatch[1].trim();
  }

  // 2. Extract Speech Bubble / Balloon Text
  let bubbleText: string | undefined;
  const bubbleMatch =
    /(?:(?:และ)?(?:มี)?\s*(?:bubble|บอลลูน|กล่องคำพูด|คำพูด|bubble\s*ข้อความ|ข้อความใน\s*bubble)\s*(?:ข้อความ)?\s*(?:เช่น|ว่า|คือ)?\s*["“'「]([^"”'」]+)["”'」])/iu.exec(
      cleaned,
    );
  if (bubbleMatch) {
    bubbleText = bubbleMatch[1].trim();
  }

  // Remove literal title/bubble clauses from base visual description to avoid diffusion text encoder choke
  cleaned = cleaned
    .replace(
      /(?:(?:มี|ใส่)?\s*(?:title|หัวข้อ|ชื่อเรื่อง|ข้อความหัวเรื่อง|พาดหัว)\s*(?:ว่า|คือ)?\s*["“'「][^"”'」]+["”'」])/giu,
      "",
    )
    .replace(
      /(?:(?:และ)?(?:มี)?\s*(?:bubble|บอลลูน|กล่องคำพูด|คำพูด|bubble\s*ข้อความ|ข้อความใน\s*bubble)\s*(?:ข้อความ)?\s*(?:เช่น|ว่า|คือ)?\s*["“'「][^"”'」]+["”'」])/giu,
      "",
    )
    .replace(/(?:และ)?(?:มี)?\s*(?:bubble|บอลลูน|กล่องคำพูด)\s*ข้อความ[^\s,]+/giu, "")
    .trim();

  const visualComponents: string[] = [];

  // Signage / Banner / Shelf Header (Anti-Mockup Rule)
  const isSignage = /ป้าย|ป้ายหมวด|ป้ายติด|แบนเนอร์|signage|banner|shelf sign|artwork\s*ป้าย/i.test(
    rawPrompt,
  );
  const hasAntiMockupConstraint =
    /(?:no\s+3d\s+mockup|no\s+mockup|without\s+mockup|never\s+mockup|completely\s+flat|isolated\s+2d)/i.test(
      rawPrompt,
    );
  const isExplicitMockup =
    !hasAntiMockupConstraint &&
    /(?:ถ่ายภาพจำลอง|วางบนโต๊ะ|ต้องการ\s*mockup|ทำเป็น\s*mockup|3d\s*render\s*mockup|physical\s+stand\s+mockup|mockup\s*scene)/i.test(
      rawPrompt,
    );

  if (isSignage && !isExplicitMockup) {
    visualComponents.push(
      "flat 2D graphic design artwork, direct front-facing 90-degree orthogonal view, clean horizontal panoramic banner layout, modern corporate graphic design, sharp digital vector illustration and typography, pristine flat surface, completely flat composition, no 3D mockup, no room environment, no bookshelf, no wooden shelf, no books underneath, no table, no physical acrylic stand, no angled perspective, isolated 2D graphic artwork file for printing, strict horizontal banner safe area: top 25% and bottom 25% of canvas must have zero text and remain pure dark gradient background, all headlines, brand logos, taglines, and author names strictly confined within the vertical center zone (between 30% and 70% height) with generous breathing room, no text placed above or below the circular halo motif, maximum 2 concise horizontal lines vertically",
    );
  } else if (/โปสเตอร์|แบนเนอร์|poster|banner|โฆษณา|advertising/i.test(rawPrompt)) {
    visualComponents.push("commercial advertising poster design, vibrant professional layout");
  }

  // Manifest Book Theme
  if (/manifest|คิดมาก/i.test(rawPrompt)) {
    if (isSignage) {
      visualComponents.push(
        'Manifest book aesthetic theme, dynamic asymmetric wide panoramic banner composition (rule-of-thirds) avoiding dead-center bullseye symmetry, radiant golden and red circular light halo with volumetric light rays and floating stardust particles, luxurious dual-tone background seamlessly transitioning from deep obsidian matte black on one side to rich crimson red glowing aura on the other, rich editorial typography layout with clear hierarchy: bold prominent category title "หมวดจิตวิทยาและการพัฒนาตนเอง : MANIFEST", compelling book taglines "The Magic of Affirmation" and "เมื่อคำพูดและความคิดของคุณ กำหนดอนาคตได้", author credit "คิดมาก (The Manifest Master)", elegant metallic gold divider lines, sophisticated bookstore shelf category header artwork, strict native 3:1 (2048x688) horizontal banner containment: compose for the full ultra-wide frame, keep modest top/bottom breathing room for Thai tone marks, prefer horizontal multi-column layout, no vertical text stacking exceeding 2 lines, no text floating above or below the circular halo',
      );
    } else {
      visualComponents.push(
        "Manifest book aesthetic theme, deep obsidian matte black and crimson red glowing aura, radiant golden and red circular light halo, manifestation energy ring, elegant glowing circular motif, cinematic ambient glow",
      );
    }
  }

  // Welearn Publishing Brand
  if (/welearn|วีเลิร์น/i.test(rawPrompt)) {
    visualComponents.push(
      'Welearn publishing brand identity, bold clean white modern typography reading "Welearn" and "สำนักพิมพ์ Welearn" cleanly integrated inside the horizontal center strip, high contrast, pristine publishing corporate graphic design',
    );
  }

  // Japanese / Sushi / Asian Cuisine
  if (/ซูชิ|sushi|แซลมอน|อาหารญี่ปุ่น/i.test(rawPrompt)) {
    visualComponents.push(
      "exquisite authentic Japanese sushi platter, fresh salmon and tuna nigiri, maki rolls, appetizing gourmet presentation",
    );
  } else if (/อาหารไทย/i.test(rawPrompt)) {
    visualComponents.push(
      "grand banquet feast of popular authentic Thai cuisine dishes, pad thai, tom yum, green curry, fresh herbs, appetizing presentation",
    );
  } else if (/อาหาร/i.test(rawPrompt)) {
    visualComponents.push("delicious gourmet meal banquet, professional culinary photography");
  }

  // Aesthetic / Colors / Minimal Studio
  if (/เอิร์ธโทน|earth[- ]?tone/i.test(rawPrompt)) {
    visualComponents.push("warm natural earth-tone color palette, soft beige and warm wood tones");
  }
  if (/มินิมอล|สตูดิโอคลีน|สะอาดตา|minimal/i.test(rawPrompt)) {
    visualComponents.push("clean minimalist studio photography, pristine uncluttered background");
  }
  if (/สมจริง|ภาพถ่าย|realistic|photography/i.test(rawPrompt)) {
    visualComponents.push(
      "ultra-realistic commercial food photography, crisp macro detail, soft directional lighting",
    );
  }

  // Wide angle / Perspective
  if (/มุมกว้าง|พาโนรามา|wide[- ]?angle|panoramic/i.test(rawPrompt)) {
    visualComponents.push("cinematic wide-angle perspective, grand expansive depth of field");
  }

  // Temple / Architecture
  if (/วัดไทย|วัด|temple/i.test(rawPrompt)) {
    visualComponents.push(
      "majestic traditional golden Thai Buddhist temple silhouette in the distant horizon",
    );
  }

  // People / Crowd
  if (/ผู้คนมากมาย|คนมากมาย|ผู้คน|crowd|people/i.test(rawPrompt)) {
    visualComponents.push(
      "lively bustling crowd of people in atmospheric warm background with shallow depth of field",
    );
  }

  // Cat / Dog / Animals
  if (/แมว|น้องแมว/i.test(rawPrompt) && !visualComponents.some((c) => c.includes("cat"))) {
    visualComponents.push("cute fluffy cat, highly detailed fur, studio lighting");
  } else if (/หมา|สุนัข/i.test(rawPrompt) && !visualComponents.some((c) => c.includes("dog"))) {
    visualComponents.push("cute playful dog, highly detailed, studio lighting");
  }

  // Add typography directive if title was present
  if (titleText) {
    visualComponents.push(`bold artistic typography header reading "${titleText}"`);
  }

  // If bubble text was requested, transform into clean typography badge
  if (bubbleText) {
    visualComponents.push(`promotional text badge reading "${bubbleText}"`);
  }

  // If no specific thematic subject component was matched, retain cleaned user prompt to avoid generic outputs
  const hasSubject = visualComponents.some(
    (c) =>
      !c.includes("commercial advertising") &&
      !c.includes("8k resolution") &&
      !c.includes("flat 2D graphic design"),
  );
  if (!hasSubject && cleaned) {
    visualComponents.unshift(cleaned);
  }

  // Add standard quality modifiers
  if (isSignage) {
    visualComponents.push(
      "8k resolution, crisp vector graphics, high contrast, sharp focus, masterwork graphic artwork",
    );
  } else {
    visualComponents.push(
      "8k resolution, cinematic lighting, sharp focus, masterwork commercial art",
    );
  }

  if (visualComponents.length > 1) {
    return visualComponents.join(", ");
  }

  return enrichPrompt(rawPrompt);
}

/**
 * Detects whether a prompt is already a compiled/orchestrated English prompt
 * (e.g. from Creative Director or Prompt Compiler) rather than an unparsed raw user query.
 */
export function isAlreadyOrchestratedPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  return (
    /^(?:flat\s+2d\s+graphic\s+design|commercial\s+advertising|a\s+photorealistic|cinematic|modern\s+corporate|\[(?:TYPE|MAIN CONCEPT|COMPOSITION)\])/i.test(
      trimmed,
    ) ||
    /output\s+constraints:\s*one\s+standalone\s+image\s+only/i.test(trimmed) ||
    (/no\s+3d\s+mockup/i.test(trimmed) &&
      /no\s+(?:bookshelf|room\s+environment|wooden\s+shelf)/i.test(trimmed))
  );
}

/**
 * Pre-flight sanitization for prompts before sending to image generation.
 * Enforces flat 2D graphic design for signage and shelf artwork requests,
 * while preserving rich natural user prompts (including Thai text and dialogue badges) intact.
 */
export function sanitizeAndPrepareImagePrompt(rawPrompt: string): string {
  // If the prompt is already an English orchestrated/compiled prompt, preserve it completely
  if (isAlreadyOrchestratedPrompt(rawPrompt)) {
    return cleanImagePrompt(rawPrompt) || rawPrompt.trim();
  }

  // Only specialized signage/shelf headers need strict 2D layout restructuring
  const isSignageOrArtwork = /(?:ออกแบบป้าย|ป้ายหมวด|ป้ายติด|ป้ายขนาด|artwork\s*ป้าย|ป้ายแบนเนอร์)/iu.test(
    rawPrompt,
  );
  if (isSignageOrArtwork) {
    return streamlinePromptForImageGen(rawPrompt);
  }
  return cleanImagePrompt(rawPrompt) || rawPrompt.trim();
}

/**
 * Converts a data URL to JPEG format (image/jpeg) if it is in WebP format.
 * Guarantees that AI-generated assets are delivered to the user as standard JPEG.
 */
export async function convertWebpToJpeg(dataUrl: string, quality = 0.95): Promise<string> {
  if (!dataUrl.startsWith("data:image/webp")) {
    return dataUrl;
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return dataUrl.replace(/^data:image\/webp/, "data:image/jpeg");
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl.replace(/^data:image\/webp/, "data:image/jpeg"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl.replace(/^data:image\/webp/, "data:image/jpeg"));
    img.src = dataUrl;
  });
}

/**
 * Generates an image through the server-owned AI Runtime and loads it into
 * the ArtShift image cache. Model/provider selection is server-owned.
 */
export async function generateAIImage(
  options: ImageGenerationOptions,
  signal?: AbortSignal,
): Promise<GeneratedImageResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error("Please enter a prompt to generate an image.");
  }
  if (options.cloudConsent !== true) {
    throw new Error("Cloud consent is required before sending an image-generation request.");
  }

  let apiRes: Response;
  try {
    apiRes = await fetch("/api/ai/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...options, prompt }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      const abortError = new Error("การสร้างภาพถูกยกเลิกแล้วครับ");
      abortError.name = "AbortError";
      throw abortError;
    }
    throw new Error("AI Image Studio could not reach the ArtShift server.", { cause: error });
  }

  const data = (await apiRes.json().catch(() => ({}))) as {
    dataUrl?: string;
    seed?: number;
    error?: string;
    code?: string;
    predictionId?: string;
  };
  if (!apiRes.ok) {
    if (data.code === "OUTCOME_UNKNOWN") {
      throw new OutcomeUnknownError(
        data.error || "AI provider result is uncertain; no duplicate request was created.",
        typeof data.predictionId === "string" ? data.predictionId : undefined,
      );
    }
    throw new Error(data.error || `AI Image Studio failed with status ${apiRes.status}.`);
  }
  if (!data.dataUrl?.startsWith("data:image/")) {
    throw new Error("AI Image Studio returned an invalid image payload.");
  }

  // Ensure output is JPEG, converting from WebP if provider delivered WebP
  const finalDataUrl = await convertWebpToJpeg(data.dataUrl);

  // Cache in local engine image cache
  const cached = await loadDataURL(finalDataUrl);
  const qualityGate = runVisualQualityGate({
    dataUrl: cached.dataURL,
    prompt,
    width: cached.width,
    height: cached.height,
    outputCount: 1,
  });
  if (!qualityGate.passed) {
    throw new Error(
      `Generated image failed the visual quality gate: ${qualityGate.blockers.join(" ")}`,
    );
  }

  return {
    dataUrl: cached.dataURL,
    fileId: cached.fileId,
    width: cached.width,
    height: cached.height,
    seed: data.seed ?? options.seed ?? 0,
    model: GPT_IMAGE_2_MODEL,
    prompt,
  };
}

export { normalizeUserBriefToV1 } from "./orchestration/briefNormalizer";
export type {
  ImageGenerationBriefV1,
  PromptDecisionTier,
  PromptRiskAnalysis,
  ReferenceImageType,
} from "./orchestration/briefSpecV1";
export { compileBriefToPrompt } from "./orchestration/promptCompiler";
export { analyzePromptRisk } from "./orchestration/promptRiskAnalyzer";

/**
 * Compiles a raw user brief/prompt into a structured modular section prompt
 * according to AI Image Generation Brief Specification v1.
 */
export function compileSpecificationV1Prompt(
  rawPrompt: string,
  options?: Parameters<typeof import("./orchestration/briefNormalizer").normalizeUserBriefToV1>[1],
): string {
  const { normalizeUserBriefToV1 } = require("./orchestration/briefNormalizer");
  const { compileBriefToPrompt } = require("./orchestration/promptCompiler");
  const brief = normalizeUserBriefToV1(rawPrompt, options);
  return compileBriefToPrompt(brief);
}
