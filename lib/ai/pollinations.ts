/**
 * Pollinations.ai Text-to-Image Client for ArtShift
 * Free, zero-setup, open-source AI image generation (FLUX.1 / SDXL Turbo).
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
  nologo?: boolean;
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

export function enrichPrompt(rawPrompt: string): string {
  let prompt = rawPrompt
    .replace(/^(ช่วย)?(สร้างรูป|วาดรูป|generate image|create image|รูปภาพ|รูป|draw|ภาพ)/gi, "")
    .replace(/(ให้หน่อย|ครับ|ค่ะ|จ้า|หน่อย|of|about|เกี่ยวกับ)/gi, "")
    .trim();

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
 * Builds the direct Pollinations.ai image URL.
 */
export function buildPollinationsUrl(options: PollinationsOptions): {
  url: string;
  seed: number;
} {
  const {
    prompt,
    model = "flux",
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 10000000),
    enhance = true,
    nologo = true,
  } = options;

  const encodedPrompt = encodeURIComponent(prompt.trim());
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model,
    nologo: String(nologo),
    enhance: String(enhance),
  });

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;
  return { url, seed };
}

/**
 * Generates an image using AI (via server proxy with Pollinations/FLUX backend)
 * and loads it into the ArtShift image cache.
 */
export async function generateAIImage(
  options: PollinationsOptions,
  signal?: AbortSignal,
): Promise<GeneratedImageResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error("Please enter a prompt to generate an image.");
  }

  // 1. Try Next.js server proxy route first (prevents browser CORS & Cloudflare 403 blocks)
  try {
    const apiRes = await fetch("/api/ai/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
      signal,
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.dataUrl) {
        const cached = await loadDataURL(data.dataUrl);
        return {
          dataUrl: cached.dataURL,
          fileId: cached.fileId,
          width: cached.width,
          height: cached.height,
          seed: data.seed ?? 12345,
          model: options.model ?? "flux",
          prompt,
        };
      }
    }
  } catch {
    // If API route fails or in unit tests, try direct upstream
  }

  // 2. Direct upstream fallback
  const { url, seed } = buildPollinationsUrl(options);

  const response = await fetch(url, {
    method: "GET",
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to generate image from AI (Status ${response.status}). Please check your internet connection or try again.`,
    );
  }

  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Cache in local engine image cache
  const cached = await loadDataURL(dataUrl);

  return {
    dataUrl: cached.dataURL,
    fileId: cached.fileId,
    width: cached.width,
    height: cached.height,
    seed,
    model: options.model ?? "flux",
    prompt,
  };
}
