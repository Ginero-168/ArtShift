import type {
  BriefDivider,
  BriefObject,
  BriefPartition,
  BriefText,
  ConvertToBriefData,
} from "./briefParser";

/**
 * Helper to convert RGB to HEX
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert RGB to a soft, readable pastel wireframe tint
 */
function toPastelHex(r: number, g: number, b: number, factor = 0.65): string {
  const pr = r + (255 - r) * factor;
  const pg = g + (255 - g) * factor;
  const pb = b + (255 - b) * factor;
  return rgbToHex(pr, pg, pb);
}

/**
 * Compute the difference between adjacent columns to detect vertical split points
 */
function computeVerticalSplitScore(
  pixels: Uint8ClampedArray,
  sampleW: number,
  sampleH: number,
): { splitX: number; score: number } {
  let maxDelta = -1;
  let bestX = Math.round(sampleW * 0.4);

  const startX = Math.floor(sampleW * 0.2);
  const endX = Math.floor(sampleW * 0.65);

  for (let x = startX; x < endX; x++) {
    let colDiff = 0;
    for (let y = 0; y < sampleH; y += 3) {
      const idx1 = (y * sampleW + x) * 4;
      const idx2 = (y * sampleW + Math.min(x + 1, sampleW - 1)) * 4;
      colDiff +=
        Math.abs(pixels[idx1] - pixels[idx2]) +
        Math.abs(pixels[idx1 + 1] - pixels[idx2 + 1]) +
        Math.abs(pixels[idx1 + 2] - pixels[idx2 + 2]);
    }
    if (colDiff > maxDelta) {
      maxDelta = colDiff;
      bestX = x;
    }
  }

  return { splitX: bestX, score: maxDelta };
}

/**
 * Compute the difference between adjacent rows to detect horizontal split points
 */
function computeHorizontalSplitScore(
  pixels: Uint8ClampedArray,
  sampleW: number,
  sampleH: number,
): { splitY: number; score: number } {
  let maxDelta = -1;
  let bestY = Math.round(sampleH * 0.45);

  const startY = Math.floor(sampleH * 0.25);
  const endY = Math.floor(sampleH * 0.7);

  for (let y = startY; y < endY; y++) {
    let rowDiff = 0;
    for (let x = 0; x < sampleW; x += 3) {
      const idx1 = (y * sampleW + x) * 4;
      const idx2 = (Math.min(y + 1, sampleH - 1) * sampleW + x) * 4;
      rowDiff +=
        Math.abs(pixels[idx1] - pixels[idx2]) +
        Math.abs(pixels[idx1 + 1] - pixels[idx2 + 1]) +
        Math.abs(pixels[idx1 + 2] - pixels[idx2 + 2]);
    }
    if (rowDiff > maxDelta) {
      maxDelta = rowDiff;
      bestY = y;
    }
  }

  return { splitY: bestY, score: maxDelta };
}

/**
 * Sample average color of a rectangular region
 */
function sampleRegionColor(
  pixels: Uint8ClampedArray,
  sampleW: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pastelFactor = 0.72,
): string {
  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      const idx = (y * sampleW + x) * 4;
      r += pixels[idx];
      g += pixels[idx + 1];
      b += pixels[idx + 2];
      count++;
    }
  }
  if (count === 0) return "#e2e8f0";
  return toPastelHex(r / count, g / count, b / count, pastelFactor);
}

/**
 * Find high-saturation badge cluster in a region
 */
function findBadgeCluster(
  pixels: Uint8ClampedArray,
  sampleW: number,
  sampleH: number,
  regionXStart: number,
  regionYStart: number,
  regionXEnd: number,
  regionYEnd: number,
): { cx: number; cy: number; color: string; found: boolean } {
  let maxSat = 0;
  let cx = Math.floor((regionXStart + regionXEnd) / 2);
  let cy = Math.floor((regionYStart + regionYEnd) / 2);
  let badgeColor = "#fcd34d";
  let found = false;

  const step = 4;
  for (let y = regionYStart; y < regionYEnd; y += step) {
    for (let x = regionXStart; x < regionXEnd; x += step) {
      const idx = (y * sampleW + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;

      if (sat > maxSat && sat > 0.25) {
        maxSat = sat;
        cx = x;
        cy = y;
        badgeColor = toPastelHex(r, g, b, 0.35);
        found = true;
      }
    }
  }

  return { cx, cy, color: badgeColor, found };
}

/**
 * Dynamically analyzes an image from its dataURL directly in the browser/canvas
 * to compute real aspect ratios, detect composition splits, and generate
 * a structured Art Direction wireframe brief.
 */
export async function analyzeImageDynamic(
  dataUrl: string,
  elementWidth?: number,
  elementHeight?: number,
): Promise<ConvertToBriefData> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(createDefaultDynamicBrief(elementWidth || 1000, elementHeight || 1000));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width || 800;
        const natH = img.naturalHeight || img.height || 600;
        const isLandscape = natW >= natH;

        // Downscale for fast pixel analysis
        const sampleW = 200;
        const sampleH = Math.round((natH / natW) * sampleW);

        const canvas = document.createElement("canvas");
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (!ctx) {
          resolve(createDefaultDynamicBrief(natW, natH));
          return;
        }

        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        const pixels = imgData.data;

        // Detect the dominant split direction
        const verticalSplit = computeVerticalSplitScore(pixels, sampleW, sampleH);
        const horizontalSplit = computeHorizontalSplitScore(pixels, sampleW, sampleH);

        // Normalize scores by dimensions to compare fairly
        const vScore = verticalSplit.score / sampleH;
        const hScore = horizontalSplit.score / sampleW;

        // Determine composition type: side-by-side (vertical split) or top-bottom (horizontal split)
        const useVerticalSplit = isLandscape
          ? vScore >= hScore * 0.6 // For landscape images, prefer vertical split unless horizontal is clearly stronger
          : vScore > hScore * 1.3; // For portrait images, only use vertical if it's significantly stronger

        const normH = Math.round((natH / natW) * 1000);

        if (useVerticalSplit) {
          // Side-by-side composition (e.g. hero subject left, background right)
          const normalizedSplitX = Math.round((verticalSplit.splitX / sampleW) * 1000);
          const clampedSplitX = Math.max(200, Math.min(700, normalizedSplitX));

          // Sample colors from each partition
          const leftColor = sampleRegionColor(pixels, sampleW, 0, 0, verticalSplit.splitX, sampleH);
          const rightColor = sampleRegionColor(
            pixels,
            sampleW,
            verticalSplit.splitX,
            0,
            sampleW,
            sampleH,
          );

          // Search for badge in the upper-right quadrant
          const badge = findBadgeCluster(
            pixels,
            sampleW,
            sampleH,
            Math.floor(sampleW * 0.65),
            Math.floor(sampleH * 0.05),
            Math.floor(sampleW * 0.98),
            Math.floor(sampleH * 0.5),
          );

          const badgeRadius = Math.max(14, Math.round(sampleW * 0.08));
          const bx1 = Math.max(0, Math.round(((badge.cx - badgeRadius) / sampleW) * 1000));
          const by1 = Math.max(0, Math.round(((badge.cy - badgeRadius) / sampleH) * 1000));
          const bx2 = Math.min(1000, Math.round(((badge.cx + badgeRadius) / sampleW) * 1000));
          const by2 = Math.min(1000, Math.round(((badge.cy + badgeRadius) / sampleH) * 1000));

          // Headline card placement: center-right area
          const hlLeft = Math.round(clampedSplitX + 120);
          const hlRight = Math.min(960, Math.round(1000 - 160));
          const hlTop = 220;
          const hlBottom = 600;

          // Subtext placement: below headline
          const stLeft = Math.round(clampedSplitX + 80);
          const stRight = Math.min(960, Math.round(1000 - 100));
          const stTop = 665;
          const stBottom = 765;

          resolve({
            aspectRatio: { width: 1000, height: normH },
            heroSubject: {
              box: [0, 0, 1000, clampedSplitX],
              description: "ตัวแบบหลัก (Subject)",
              color: leftColor || "#dbeafe",
            },
            backgroundZone: {
              box: [0, clampedSplitX, 1000, 1000],
              description: "พื้นหลัง / ฉากประกอบ (Background)",
              color: rightColor || "#f5f0eb",
            },
            headlineCard: {
              box: [hlTop, hlLeft, hlBottom, hlRight],
              text: "พาดหัวหลัก\n(Headline)",
              color: "#e2e8f0",
            },
            badge: {
              box: [
                Math.max(100, by1),
                Math.max(clampedSplitX + 200, bx1),
                Math.min(500, by2),
                Math.min(980, bx2),
              ],
              shape: "ellipse",
              text: "ป้ายเด่น\n(Badge)",
              color: badge.found ? badge.color : "#fcd34d",
            },
            subtextCard: {
              box: [stTop, stLeft, stBottom, stRight],
              text: "คำบรรยายรอง / สโลแกน (Subtext)",
              color: "#e2e8f0",
            },
            backgroundPartitions: [
              {
                name: "ตัวแบบหลัก (Subject)",
                box: [0, 0, 1000, clampedSplitX],
                color: leftColor || "#dbeafe",
                labelPlacement: "center",
              },
              {
                name: "พื้นหลัง / ฉากประกอบ (Background)",
                box: [0, clampedSplitX, 1000, 1000],
                color: rightColor || "#f5f0eb",
                labelPlacement: "top-center",
              },
            ],
            dividers: [
              {
                start: [clampedSplitX, 0],
                end: [clampedSplitX, 1000],
                color: "#0f172a",
                strokeWidth: 1.5,
              },
            ],
            focalObjects: [],
            texts: [],
          });
          return;
        }

        // Top-bottom composition (portrait or landscape with horizontal split)
        const normalizedSplitY = Math.round((horizontalSplit.splitY / sampleH) * 1000);
        const clampedSplitY = Math.max(250, Math.min(750, normalizedSplitY));

        // Sample colors
        const topColor = sampleRegionColor(pixels, sampleW, 0, 0, sampleW, horizontalSplit.splitY);
        const bottomColor = sampleRegionColor(
          pixels,
          sampleW,
          0,
          horizontalSplit.splitY,
          sampleW,
          sampleH,
        );

        // Search for badge in the upper-right area
        const badge = findBadgeCluster(
          pixels,
          sampleW,
          sampleH,
          Math.floor(sampleW * 0.6),
          Math.floor(sampleH * 0.05),
          Math.floor(sampleW * 0.98),
          Math.floor(sampleH * 0.45),
        );

        const badgeRadius = Math.max(12, Math.round(sampleW * 0.07));
        const bx1 = Math.max(0, Math.round(((badge.cx - badgeRadius) / sampleW) * 1000));
        const by1 = Math.max(0, Math.round(((badge.cy - badgeRadius) / sampleH) * 1000));
        const bx2 = Math.min(1000, Math.round(((badge.cx + badgeRadius) / sampleW) * 1000));
        const by2 = Math.min(1000, Math.round(((badge.cy + badgeRadius) / sampleH) * 1000));

        // Headline below the split
        const hlTop = Math.round(clampedSplitY + 50);
        const hlBottom = Math.min(1000, Math.round(clampedSplitY + 250));

        // Subtext below headline
        const stTop = Math.min(1000, Math.round(clampedSplitY + 300));
        const stBottom = Math.min(1000, Math.round(clampedSplitY + 400));

        resolve({
          aspectRatio: { width: 1000, height: normH },
          heroSubject: {
            box: [0, 0, clampedSplitY, 1000],
            description: "ตัวแบบหลัก (Subject)",
            color: topColor || "#dbeafe",
          },
          backgroundZone: {
            box: [clampedSplitY, 0, 1000, 1000],
            description: "พื้นหลัง / ฉากประกอบ (Background)",
            color: bottomColor || "#f5f0eb",
          },
          headlineCard: {
            box: [hlTop, 100, hlBottom, 900],
            text: "พาดหัวหลัก\n(Headline)",
            color: "#e2e8f0",
          },
          badge: {
            box: [
              Math.max(50, by1),
              Math.max(650, bx1),
              Math.min(Math.round(clampedSplitY - 50), by2),
              Math.min(960, bx2),
            ],
            shape: "ellipse",
            text: "ป้ายเด่น\n(Badge)",
            color: badge.found ? badge.color : "#fcd34d",
          },
          subtextCard: {
            box: [stTop, 100, stBottom, 900],
            text: "คำบรรยายรอง / สโลแกน (Subtext)",
            color: "#e2e8f0",
          },
          backgroundPartitions: [
            {
              name: "ตัวแบบหลัก (Subject)",
              box: [0, 0, clampedSplitY, 1000],
              color: topColor || "#dbeafe",
              labelPlacement: "center",
            },
            {
              name: "พื้นหลัง / ฉากประกอบ (Background)",
              box: [clampedSplitY, 0, 1000, 1000],
              color: bottomColor || "#f5f0eb",
              labelPlacement: "top-center",
            },
          ],
          dividers: [
            {
              start: [0, clampedSplitY],
              end: [1000, clampedSplitY],
              color: "#0f172a",
              strokeWidth: 1.5,
            },
          ],
          focalObjects: [],
          texts: [],
        });
      } catch {
        resolve(createDefaultDynamicBrief(img.naturalWidth || 1000, img.naturalHeight || 1000));
      }
    };

    img.onerror = () => {
      resolve(createDefaultDynamicBrief(elementWidth || 1000, elementHeight || 1000));
    };

    img.src = dataUrl;
  });
}

function createDefaultDynamicBrief(width: number, height: number): ConvertToBriefData {
  const normHeight = Math.round((height / width) * 1000);
  const isLandscape = width >= height;

  if (isLandscape) {
    const splitX = 396;
    return {
      aspectRatio: { width: 1000, height: normHeight },
      heroSubject: {
        box: [0, 0, 1000, splitX],
        description: "ตัวแบบหลัก (Subject)",
        color: "#dbeafe",
      },
      backgroundZone: {
        box: [0, splitX, 1000, 1000],
        description: "พื้นหลัง / ฉากประกอบ (Background)",
        color: "#f5f0eb",
      },
      headlineCard: {
        box: [220, 520, 600, 840],
        text: "พาดหัวหลัก\n(Headline)",
        color: "#e2e8f0",
      },
      badge: {
        box: [180, 810, 410, 950],
        shape: "ellipse",
        text: "ป้ายเด่น\n(Badge)",
        color: "#fcd34d",
      },
      subtextCard: {
        box: [665, 480, 765, 900],
        text: "คำบรรยายรอง / สโลแกน (Subtext)",
        color: "#e2e8f0",
      },
      backgroundPartitions: [
        {
          name: "ตัวแบบหลัก (Subject)",
          box: [0, 0, 1000, splitX],
          color: "#dbeafe",
          labelPlacement: "center",
        },
        {
          name: "พื้นหลัง / ฉากประกอบ (Background)",
          box: [0, splitX, 1000, 1000],
          color: "#f5f0eb",
          labelPlacement: "top-center",
        },
      ],
      dividers: [
        {
          start: [splitX, 0],
          end: [splitX, 1000],
          color: "#0f172a",
          strokeWidth: 1.5,
        },
      ],
      focalObjects: [],
      texts: [],
    };
  }

  const splitY = Math.round(normHeight * 0.45);
  return {
    aspectRatio: { width: 1000, height: normHeight },
    heroSubject: {
      box: [0, 0, splitY, 1000],
      description: "ตัวแบบหลัก (Subject)",
      color: "#dbeafe",
    },
    backgroundZone: {
      box: [splitY, 0, 1000, 1000],
      description: "พื้นหลัง / ฉากประกอบ (Background)",
      color: "#f5f0eb",
    },
    headlineCard: {
      box: [Math.round(splitY + 50), 100, Math.round(splitY + 250), 900],
      text: "พาดหัวหลัก\n(Headline)",
      color: "#e2e8f0",
    },
    badge: {
      box: [Math.round(splitY + 20), 750, Math.round(splitY + 160), 920],
      shape: "ellipse",
      text: "ป้ายเด่น\n(Badge)",
      color: "#fcd34d",
    },
    subtextCard: {
      box: [Math.round(splitY + 300), 100, Math.round(splitY + 400), 900],
      text: "คำบรรยายรอง / สโลแกน (Subtext)",
      color: "#e2e8f0",
    },
    backgroundPartitions: [
      {
        name: "ตัวแบบหลัก (Subject)",
        box: [0, 0, splitY, 1000],
        color: "#dbeafe",
        labelPlacement: "center",
      },
      {
        name: "พื้นหลัง / ฉากประกอบ (Background)",
        box: [splitY, 0, 1000, 1000],
        color: "#f5f0eb",
        labelPlacement: "top-center",
      },
    ],
    dividers: [
      {
        start: [0, splitY],
        end: [1000, splitY],
        color: "#0f172a",
        strokeWidth: 1.5,
      },
    ],
    focalObjects: [],
    texts: [],
  };
}
