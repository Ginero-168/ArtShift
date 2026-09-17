/** OpenAI Images API model id for GPT Image 2.5 Sunburst. */
export const OPENAI_GPT_IMAGE_25_SUNBURST_MODEL = "gpt-image-2.5-sunburst" as const;

const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;
const MAX_EDGE = 3_840;
const MAX_RATIO = 3;

/** Snap to OpenAI rules: edges are multiples of 16, aspect ≤ 3:1, pixel budget. */
export function formatOpenAiImageSize(width: number, height: number): string {
  let w = Math.max(16, Math.round(width / 16) * 16);
  let h = Math.max(16, Math.round(height / 16) * 16);
  w = Math.min(MAX_EDGE, w);
  h = Math.min(MAX_EDGE, h);

  const ratio = Math.max(w, h) / Math.min(w, h);
  if (ratio > MAX_RATIO + 1e-6) {
    if (w >= h) {
      h = Math.max(16, Math.round(w / MAX_RATIO / 16) * 16);
    } else {
      w = Math.max(16, Math.round(h / MAX_RATIO / 16) * 16);
    }
  }

  let pixels = w * h;
  if (pixels < MIN_PIXELS) {
    const scale = Math.sqrt(MIN_PIXELS / pixels);
    w = Math.min(MAX_EDGE, Math.round((w * scale) / 16) * 16);
    h = Math.min(MAX_EDGE, Math.round((h * scale) / 16) * 16);
    pixels = w * h;
  }
  if (pixels > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / pixels);
    w = Math.max(16, Math.round((w * scale) / 16) * 16);
    h = Math.max(16, Math.round((h * scale) / 16) * 16);
  }

  return `${w}x${h}`;
}

export function parseOpenAiImageSize(size: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/i.exec(size.trim());
  if (!match) return { width: 1024, height: 1024 };
  return { width: Number(match[1]), height: Number(match[2]) };
}
