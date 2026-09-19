import { describe, expect, it } from "vitest";
import { blurUnknownRgb, fillUnknownFromNeighbors } from "@/lib/raster/localInpaint";

function bufferFromRgb(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

describe("heal local inpaint fallback", () => {
  it("fills a hole from neighboring colors instead of a displaced clone", () => {
    const buffer = bufferFromRgb(8, 8, [220, 20, 20]);
    for (let y = 0; y < 8; y++) {
      for (let x = 4; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        buffer.data[i] = 0;
        buffer.data[i + 1] = 220;
        buffer.data[i + 2] = 220;
      }
    }
    const inpaint = new Uint8Array(64);
    inpaint[8 * 2 + 2] = 255;
    inpaint[8 * 2 + 3] = 255;
    inpaint[8 * 3 + 2] = 255;
    inpaint[8 * 3 + 3] = 255;
    for (const index of [8 * 2 + 2, 8 * 2 + 3, 8 * 3 + 2, 8 * 3 + 3]) {
      const offset = index * 4;
      buffer.data[offset] = 0;
      buffer.data[offset + 1] = 0;
      buffer.data[offset + 2] = 0;
    }

    fillUnknownFromNeighbors(buffer, inpaint);
    blurUnknownRgb(buffer, inpaint);

    const hole = 8 * 2 + 2;
    expect(buffer.data[hole * 4]).toBeGreaterThan(80);
    expect(buffer.data[hole * 4 + 1]).toBeLessThan(80);
    expect(buffer.data[hole * 4 + 2]).toBeLessThan(80);
  });
});
