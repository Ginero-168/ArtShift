/**
 * Image Auto-Crop & Letterbox Trimming Utility
 *
 * Automatically crops generated AI images to exact target aspect ratios (e.g. 60x20cm = 3:1).
 * When diffusion models generate in standard base ratios (e.g. 16:9) with letterbox padding,
 * this utility trims black bars and center-crops the content to the exact user-specified aspect ratio.
 */

export interface AutoCropResult {
  dataUrl: string;
  width: number;
  height: number;
  wasCropped: boolean;
}

export function computeCropBounds(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number,
  letterboxTop = 0,
  letterboxBottom = 0,
): { cropX: number; cropY: number; cropWidth: number; cropHeight: number } {
  const currentRatio = sourceWidth / Math.max(1, sourceHeight);

  if (Math.abs(currentRatio - targetRatio) <= 0.03) {
    return { cropX: 0, cropY: 0, cropWidth: sourceWidth, cropHeight: sourceHeight };
  }

  if (currentRatio < targetRatio) {
    // Source is taller than target (e.g. 16:9 = 1.78 vs 3:1 = 3.0)
    // Needs horizontal wide banner crop (trim top and bottom)
    const cropWidth = sourceWidth;
    const cropHeight = Math.max(1, Math.round(sourceWidth / targetRatio));

    let cropY: number;
    if (letterboxTop > 0 || letterboxBottom > 0) {
      const activeContentCenter = Math.round(
        (letterboxTop + (sourceHeight - letterboxBottom)) / 2,
      );
      cropY = Math.max(
        0,
        Math.min(sourceHeight - cropHeight, activeContentCenter - Math.floor(cropHeight / 2)),
      );
    } else {
      cropY = Math.max(0, Math.floor((sourceHeight - cropHeight) / 2));
    }

    return { cropX: 0, cropY, cropWidth, cropHeight };
  }

  // Source is wider than target (e.g. 16:9 vs 1:1 or 9:16)
  // Needs vertical crop (trim left and right)
  const cropHeight = sourceHeight;
  const cropWidth = Math.max(1, Math.round(sourceHeight * targetRatio));
  const cropX = Math.max(0, Math.floor((sourceWidth - cropWidth) / 2));

  return { cropX, cropY: 0, cropWidth, cropHeight };
}

export async function autoCropImageToTargetRatio(
  dataUrl: string,
  targetWidth: number,
  targetHeight: number,
): Promise<AutoCropResult> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !dataUrl.startsWith("data:image/")
  ) {
    return { dataUrl, width: targetWidth, height: targetHeight, wasCropped: false };
  }

  const targetRatio = targetWidth / Math.max(1, targetHeight);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sourceWidth = img.naturalWidth || img.width;
      const sourceHeight = img.naturalHeight || img.height;
      const currentRatio = sourceWidth / Math.max(1, sourceHeight);

      if (Math.abs(currentRatio - targetRatio) <= 0.03) {
        resolve({ dataUrl, width: sourceWidth, height: sourceHeight, wasCropped: false });
        return;
      }

      let letterboxTop = 0;
      let letterboxBottom = 0;

      const testCanvas = document.createElement("canvas");
      testCanvas.width = sourceWidth;
      testCanvas.height = sourceHeight;
      const testCtx = testCanvas.getContext("2d", { willReadFrequently: true });

      if (testCtx) {
        testCtx.drawImage(img, 0, 0);

        if (currentRatio < targetRatio) {
          // Check top and bottom rows for black letterbox bars
          const cropHeight = Math.round(sourceWidth / targetRatio);
          const maxCheckRows = Math.floor((sourceHeight - cropHeight) / 2);
          const sampleCols = [
            Math.floor(sourceWidth * 0.2),
            Math.floor(sourceWidth * 0.5),
            Math.floor(sourceWidth * 0.8),
          ];

          try {
            for (let y = 0; y < maxCheckRows; y += 2) {
              const isDark = sampleCols.every((x) => {
                const p = testCtx.getImageData(x, y, 1, 1).data;
                return p[0] < 30 && p[1] < 30 && p[2] < 30;
              });
              if (isDark) letterboxTop = y;
              else break;
            }

            for (let y = sourceHeight - 1; y > sourceHeight - 1 - maxCheckRows; y -= 2) {
              const isDark = sampleCols.every((x) => {
                const p = testCtx.getImageData(x, y, 1, 1).data;
                return p[0] < 30 && p[1] < 30 && p[2] < 30;
              });
              if (isDark) letterboxBottom = sourceHeight - 1 - y;
              else break;
            }
          } catch {
            // Context read security restriction fallback
          }
        }
      }

      const bounds = computeCropBounds(
        sourceWidth,
        sourceHeight,
        targetRatio,
        letterboxTop,
        letterboxBottom,
      );

      const outCanvas = document.createElement("canvas");
      outCanvas.width = targetWidth;
      outCanvas.height = targetHeight;
      const outCtx = outCanvas.getContext("2d");

      if (!outCtx) {
        resolve({ dataUrl, width: sourceWidth, height: sourceHeight, wasCropped: false });
        return;
      }

      outCtx.drawImage(
        img,
        bounds.cropX,
        bounds.cropY,
        bounds.cropWidth,
        bounds.cropHeight,
        0,
        0,
        targetWidth,
        targetHeight,
      );

      const croppedDataUrl = outCanvas.toDataURL("image/jpeg", 0.95);
      resolve({
        dataUrl: croppedDataUrl,
        width: targetWidth,
        height: targetHeight,
        wasCropped: true,
      });
    };

    img.onerror = () => {
      resolve({ dataUrl, width: targetWidth, height: targetHeight, wasCropped: false });
    };

    img.src = dataUrl;
  });
}
