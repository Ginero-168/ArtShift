/**
 * Text Contrast & Negative Space Safety Engine.
 * Analyzes image luminance under text elements to automatically choose optimal readable text colors
 * and recommend safe negative space placement areas.
 */

export interface TextContrastAnalysis {
  averageLuminance: number; // 0 (black) .. 1 (white)
  recommendedColor: string; // "#ffffff" or "#0f172a"
  recommendedShadow: string | null;
  contrastRatio: number;
}

export interface NegativeSpaceQuadrant {
  quadrant: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  variance: number; // lower variance = cleaner background space
  averageLuminance: number;
  recommendedTextColor: string;
}

/**
 * Calculates relative luminance from RGB components [0..255]
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Analyzes the image region directly beneath a text element and determines optimal readable contrast.
 */
export async function analyzeTextContrastUnderImage(
  imageDataUrl: string,
  normalizedTextRect: { x: number; y: number; width: number; height: number },
): Promise<TextContrastAnalysis> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      const sx = Math.max(0, Math.floor(normalizedTextRect.x * w));
      const sy = Math.max(0, Math.floor(normalizedTextRect.y * h));
      const sw = Math.max(1, Math.min(w - sx, Math.ceil(normalizedTextRect.width * w)));
      const sh = Math.max(1, Math.min(h - sy, Math.ceil(normalizedTextRect.height * h)));

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(100, sw);
      canvas.height = Math.min(100, sh);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve({
          averageLuminance: 0.5,
          recommendedColor: "#ffffff",
          recommendedShadow: "0 2px 8px rgba(0,0,0,0.6)",
          contrastRatio: 4.5,
        });
        return;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      let totalLum = 0;
      const count = canvas.width * canvas.height;

      for (let i = 0; i < count; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        totalLum += getRelativeLuminance(r, g, b);
      }

      const avgLum = totalLum / count;

      const whiteContrast = (1.0 + 0.05) / (avgLum + 0.05);
      const blackContrast = (avgLum + 0.05) / (0.0 + 0.05);

      const recommendedColor = whiteContrast >= blackContrast ? "#ffffff" : "#0f172a";
      const recommendedShadow =
        whiteContrast >= blackContrast
          ? "0 2px 10px rgba(0,0,0,0.7)"
          : "0 2px 10px rgba(255,255,255,0.8)";

      resolve({
        averageLuminance: Number(avgLum.toFixed(3)),
        recommendedColor,
        recommendedShadow,
        contrastRatio: Number(Math.max(whiteContrast, blackContrast).toFixed(2)),
      });
    };

    img.onerror = () => {
      resolve({
        averageLuminance: 0.5,
        recommendedColor: "#ffffff",
        recommendedShadow: null,
        contrastRatio: 4.5,
      });
    };

    img.src = imageDataUrl;
  });
}

/**
 * Finds the cleanest negative-space quadrant in an image for optimal text placement.
 */
export async function findCleanestNegativeSpace(
  imageDataUrl: string,
): Promise<NegativeSpaceQuadrant[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve([]);

      ctx.drawImage(img, 0, 0, 64, 64);
      const imgData = ctx.getImageData(0, 0, 64, 64).data;

      const quadrants: { [key in NegativeSpaceQuadrant["quadrant"]]: number[] } = {
        "top-left": [],
        "top-right": [],
        "bottom-left": [],
        "bottom-right": [],
      };

      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const idx = (y * 64 + x) * 4;
          const lum = getRelativeLuminance(imgData[idx], imgData[idx + 1], imgData[idx + 2]);
          const quadKey =
            y < 32 ? (x < 32 ? "top-left" : "top-right") : x < 32 ? "bottom-left" : "bottom-right";
          quadrants[quadKey].push(lum);
        }
      }

      const results: NegativeSpaceQuadrant[] = (
        Object.keys(quadrants) as NegativeSpaceQuadrant["quadrant"][]
      ).map((q) => {
        const lums = quadrants[q];
        const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
        const variance = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length;
        return {
          quadrant: q,
          variance: Number(variance.toFixed(4)),
          averageLuminance: Number(mean.toFixed(3)),
          recommendedTextColor: mean < 0.5 ? "#ffffff" : "#0f172a",
        };
      });

      // Sort by cleanest space (lowest variance) first
      results.sort((a, b) => a.variance - b.variance);
      resolve(results);
    };

    img.onerror = () => resolve([]);
    img.src = imageDataUrl;
  });
}
