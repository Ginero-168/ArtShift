import type { RasterPixelBuffer } from "./processor";

/** Diffuse known RGB into the inpaint mask (1 = hole). Not clone-stamp. */
export function fillUnknownFromNeighbors(buffer: RasterPixelBuffer, inpaint: Uint8Array): void {
  const { width, height, data } = buffer;
  const unknown = new Uint8Array(width * height);
  for (let i = 0; i < unknown.length; i++) unknown[i] = inpaint[i] > 32 ? 1 : 0;
  const next = new Uint8ClampedArray(data);
  const passes = Math.max(8, Math.min(36, Math.ceil(Math.max(width, height) * 0.85)));
  for (let pass = 0; pass < passes; pass++) {
    next.set(data);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (!unknown[index]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (pass === 0 && unknown[ni]) continue;
            const offset = ni * 4;
            r += data[offset];
            g += data[offset + 1];
            b += data[offset + 2];
            a += data[offset + 3];
            count++;
          }
        }
        if (count === 0) continue;
        const offset = index * 4;
        next[offset] = r / count;
        next[offset + 1] = g / count;
        next[offset + 2] = b / count;
        next[offset + 3] = a / count;
      }
    }
    data.set(next);
  }
}

/** Light 3×3 box blur on hole pixels after neighbor fill. */
export function blurUnknownRgb(buffer: RasterPixelBuffer, inpaint: Uint8Array): void {
  const { width, height, data } = buffer;
  const copy = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (inpaint[index] <= 32) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const offset = (ny * width + nx) * 4;
          r += copy[offset];
          g += copy[offset + 1];
          b += copy[offset + 2];
          count++;
        }
      }
      if (count === 0) continue;
      const offset = index * 4;
      data[offset] = r / count;
      data[offset + 1] = g / count;
      data[offset + 2] = b / count;
    }
  }
}
