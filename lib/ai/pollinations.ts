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
  "Watercolor botanical illustration of tropical leaves and exotic flowers, clean white background",
  "Cute fluffy baby red panda wearing a tiny backpack, soft studio lighting, ultra detailed",
  "Abstract geometric 3D glass shapes with vibrant iridescent gradient colors and reflections",
];

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
 * Generates an image using Pollinations.ai and loads it into the ArtShift image cache.
 */
export async function generateAIImage(
  options: PollinationsOptions,
  signal?: AbortSignal,
): Promise<GeneratedImageResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error("Please enter a prompt to generate an image.");
  }

  const { url, seed } = buildPollinationsUrl(options);

  const response = await fetch(url, {
    method: "GET",
    mode: "cors",
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
