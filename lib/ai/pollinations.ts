/**
 * Provider-neutral AI Image Studio client.
 * Provider credentials and concrete model routing stay on the ArtShift server.
 */

import { loadDataURL } from "@/lib/engine/imageCache";

export type PollinationsModel = "flux" | "flux-realism" | "flux-anime" | "flux-3d" | "turbo";

export interface AspectRatioOption {
  id: string;
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

export interface PollinationsOptions {
  prompt: string;
  model?: PollinationsModel;
  width?: number;
  height?: number;
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
  /^(?:(?:ช่วย|ขอ)\s*)?(?:สร้างรูปภาพ|สร้างรูป|วาดรูปภาพ|วาดรูป|สร้างภาพ|วาดภาพ|generate image|create image|picture of|image of|รูปภาพ|รูป|ภาพ|draw)\s*/iu;
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
    prompt.includes("วาดภาพ") ||
    prompt.includes("ขอรูป") ||
    prompt.includes("ขอภาพ") ||
    prompt.includes("generate image") ||
    prompt.includes("create image") ||
    (prompt.startsWith("รูป") && prompt.length > 5) ||
    (prompt.startsWith("ภาพ") && prompt.length > 5) ||
    prompt.includes("draw ") ||
    prompt.includes("picture of") ||
    prompt.includes("image of")
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
 * Generates an image through the server-owned AI Runtime and loads it into
 * the ArtShift image cache.
 */
export async function generateAIImage(
  options: PollinationsOptions,
  signal?: AbortSignal,
): Promise<GeneratedImageResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error("Please enter a prompt to generate an image.");
  }

  let apiRes: Response;
  try {
    apiRes = await fetch("/api/ai/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
      signal,
    });
  } catch (error) {
    throw new Error("AI Image Studio could not reach the ArtShift server.", { cause: error });
  }

  const data = (await apiRes.json().catch(() => ({}))) as {
    dataUrl?: string;
    seed?: number;
    error?: string;
  };
  if (!apiRes.ok) {
    throw new Error(data.error || `AI Image Studio failed with status ${apiRes.status}.`);
  }
  if (!data.dataUrl?.startsWith("data:image/")) {
    throw new Error("AI Image Studio returned an invalid image payload.");
  }

  // Cache in local engine image cache
  const cached = await loadDataURL(data.dataUrl);

  return {
    dataUrl: cached.dataURL,
    fileId: cached.fileId,
    width: cached.width,
    height: cached.height,
    seed: data.seed ?? options.seed ?? 0,
    model: options.model ?? "flux",
    prompt,
  };
}
