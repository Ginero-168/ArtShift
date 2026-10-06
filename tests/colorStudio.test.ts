import { describe, expect, it } from "vitest";
import { recolorArtwork } from "@/lib/color/artwork";
import { paletteAse } from "@/lib/color/export";
import {
  contrast,
  extractPalette,
  generatePalette,
  gradientPalette,
  normalizeHex,
  type PaletteColor,
  simulateVision,
} from "@/lib/color/studio";
import { createRect, createVectorized } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import type { EngineSlide } from "@/lib/engine/types";

describe("Color Studio color core", () => {
  it("keeps locked colors while generating the remaining palette", () => {
    const colors: PaletteColor[] = [
      { hex: "#d64418", locked: true },
      { hex: "#ffffff", locked: false },
      { hex: "#000000", locked: false },
    ];
    const result = generatePalette(colors, "complementary", () => 0.5);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(colors[0]);
    expect(result[1].hex).not.toBe("#ffffff");
  });

  it("uses WCAG opaque sRGB contrast without rounding the threshold", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrast("#777777", "#ffffff")).toBeLessThan(4.5);
  });

  it("builds perceptually smoother endpoints and simulates color vision", () => {
    const ramp = gradientPalette("#000000", "#ffffff", 5);
    expect(ramp).toEqual(["#000000", "#898989", "#bcbcbc", "#e1e1e1", "#ffffff"]);
    expect(simulateVision("#d64418", "deuteranopia")).not.toBe("#d64418");
  });

  it("extracts visible dominant colors without using hidden RGB", () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0,
    ]);
    const palette = extractPalette(pixels, 2);
    expect(palette).toContain("#ff0000");
    expect(palette).toContain("#0000ff");
    expect(palette).not.toContain("#00ff00");
  });

  it("normalizes hex input and writes a valid ASE header", () => {
    expect(normalizeHex("D64")).toBe("#dd6644");
    const ase = paletteAse([{ hex: "#d64418", locked: false }]);
    expect(new TextDecoder().decode(ase.slice(0, 4))).toBe("ASEF");
    expect(new DataView(ase.buffer).getUint32(8)).toBe(1);
  });
});

describe("Color Studio Artwork recolor", () => {
  it("recolors supported paint fields and atomic SVG paints while preserving geometry", () => {
    const rect = createRect({ x: 10, y: 20, width: 100, height: 80 });
    rect.backgroundColor = "#d64418";
    rect.strokeColor = "#ffffff";
    const vector = createVectorized({
      x: 140,
      y: 20,
      width: 80,
      height: 80,
      sourceWidth: 10,
      sourceHeight: 10,
      svg: '<svg viewBox="0 0 10 10"><path fill="#d64418" d="M0 0h10v10z"/></svg>',
    });
    const layer = createEngineLayer();
    layer.objectIds = [rect.id, vector.id];
    const slide: EngineSlide = {
      id: "slide",
      name: "Artwork",
      background: "#ffffff",
      width: 400,
      height: 300,
      elements: [rect, vector],
      layers: [layer],
    };

    const result = recolorArtwork(slide, { "#d64418": "#285289" });
    expect(result.changed).toBe(2);
    expect(result.slide.elements[0].backgroundColor).toBe("#285289");
    expect(result.slide.elements[0].x).toBe(10);
    expect(
      result.slide.elements[1].type === "vectorized" && result.slide.elements[1].svg,
    ).toContain("#285289");
  });

  it("does not recolor locked layers and preserves unsupported SVG stylesheets", () => {
    const vector = createVectorized({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      sourceWidth: 10,
      sourceHeight: 10,
      svg: '<svg viewBox="0 0 10 10"><style>.a{fill:#d64418}</style><path class="a" d="M0 0h10v10z"/></svg>',
    });
    const layer = createEngineLayer({ locked: true });
    layer.objectIds = [vector.id];
    const slide: EngineSlide = {
      id: "slide",
      name: "Artwork",
      background: "#ffffff",
      width: 100,
      height: 100,
      elements: [vector],
      layers: [layer],
    };
    const result = recolorArtwork(slide, { "#d64418": "#285289" });
    expect(result.changed).toBe(0);
    expect(result.slide).toBe(slide);
  });
});
