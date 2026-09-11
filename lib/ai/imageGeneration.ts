/**
 * Provider-neutral AI Image Studio client.
 * The server routes every generation request to the server-owned GPT Image 2 route.
 */

import type { AiImageAspectRatio, AiImageRenderQuality } from "@/lib/ai-runtime/contracts";
import { loadDataURL } from "@/lib/engine/imageCache";
import { GPT_IMAGE_2_MAX_COST_USD } from "./pricing";
import { runVisualQualityGate } from "./visualQualityGate";

export const GPT_IMAGE_2_MODEL = "openai/gpt-image-2" as const;
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
];

export function resolveImageGenerationDimensions(prompt: string) {
  const value = prompt.toLocaleLowerCase();
  if (/(?:9:16|แนวตั้ง|story|reel)/iu.test(value)) {
    return { width: 720, height: 1280, aspectRatio: "9:16" as const };
  }
  if (/(?:16:9|แนวนอน|banner|cover)/iu.test(value)) {
    return { width: 1280, height: 720, aspectRatio: "16:9" as const };
  }
  if (/(?:4:3)/u.test(value)) return { width: 1024, height: 768, aspectRatio: "4:3" as const };
  if (/(?:3:4)/u.test(value)) return { width: 768, height: 1024, aspectRatio: "3:4" as const };
  return { width: 1024, height: 1024, aspectRatio: "1:1" as const };
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

/** Identifies common Thai and English requests that should be handled by image generation. */
export function isImageGenerationPrompt(userPrompt: string): boolean {
  const prompt = userPrompt.trim().toLowerCase();
  return (
    prompt.includes("สร้างรูป") ||
    prompt.includes("วาดรูป") ||
    prompt.includes("สร้างภาพ") ||
    prompt.includes("ทำภาพ") ||
    prompt.includes("ทำรูป") ||
    prompt.includes("วาดภาพ") ||
    prompt.includes("ขอรูป") ||
    prompt.includes("ขอภาพ") ||
    prompt.includes("generate image") ||
    prompt.includes("create image") ||
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

  // Poster / Advertisement
  if (/โปสเตอร์|แบนเนอร์|poster|banner|โฆษณา|advertising/i.test(rawPrompt)) {
    visualComponents.push("commercial advertising poster design, vibrant professional layout");
  }

  // Thai Food / Cuisine
  if (/อาหารไทย/i.test(rawPrompt)) {
    visualComponents.push(
      "grand banquet feast of popular authentic Thai cuisine dishes, pad thai, tom yum, green curry, fresh herbs, appetizing presentation",
    );
  } else if (/อาหาร/i.test(rawPrompt)) {
    visualComponents.push("delicious gourmet meal banquet, professional culinary photography");
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

  // If bubble text was requested, transform into clean typography or celebratory slogan
  if (bubbleText) {
    if (/^[A-Za-z0-9\s.,!'-]+$/.test(bubbleText)) {
      visualComponents.push(`clean text badge with "${bubbleText}"`);
    } else {
      visualComponents.push("festive advertising ribbon badge with celebratory mood");
    }
  }

  // Add standard quality modifiers
  visualComponents.push(
    "8k resolution, cinematic lighting, sharp focus, masterwork commercial art",
  );

  if (visualComponents.length > 1) {
    return visualComponents.join(", ");
  }

  return enrichPrompt(rawPrompt);
}

/**
 * Pre-flight sanitization for prompts before sending to image generation.
 * Strips conversational constructs that fail diffusion models (like Thai text in bubbles).
 */
export function sanitizeAndPrepareImagePrompt(rawPrompt: string): string {
  const containsProblematicBubble =
    /(?:bubble|บอลลูน|กล่องคำพูด)/i.test(rawPrompt) && /[\u0E00-\u0E7F]/.test(rawPrompt);
  if (containsProblematicBubble) {
    return streamlinePromptForImageGen(rawPrompt);
  }
  return cleanImagePrompt(rawPrompt) || rawPrompt.trim();
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

  // Cache in local engine image cache
  const cached = await loadDataURL(data.dataUrl);
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
