import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THAI_FONT_FAMILY,
  findThaiFont,
  nextThaiFontCssFamily,
  resolveThaiFontCssFamily,
  THAI_FONTS,
} from "@/lib/fonts";

describe("Thai Google Fonts catalog", () => {
  it("lists the full Thai Google Fonts set with Sarabun as the default", () => {
    expect(THAI_FONTS.length).toBe(33);
    expect(THAI_FONTS[0].family).toBe("Sarabun");
    expect(DEFAULT_THAI_FONT_FAMILY).toContain("Sarabun");
    expect(THAI_FONTS.every((font) => font.weights.length > 0)).toBe(true);
    expect(THAI_FONTS.some((font) => font.family === "Google Sans")).toBe(false);
  });

  it("resolves legacy and partial fontFamily strings back to catalog entries", () => {
    expect(resolveThaiFontCssFamily("'Sarabun', sans-serif")).toBe(DEFAULT_THAI_FONT_FAMILY);
    expect(findThaiFont("Kanit")?.family).toBe("Kanit");
    expect(resolveThaiFontCssFamily("Totally Unknown Font")).toBe(DEFAULT_THAI_FONT_FAMILY);
    // Brief used to store Inter + Mali; Properties already reported Sarabun.
    expect(resolveThaiFontCssFamily("'Inter', 'Mali', 'Noto Sans Thai', sans-serif")).toBe(
      DEFAULT_THAI_FONT_FAMILY,
    );
  });

  it("cycles through Thai fonts for the quick Font action", () => {
    const next = nextThaiFontCssFamily(DEFAULT_THAI_FONT_FAMILY);
    expect(next).not.toBe(DEFAULT_THAI_FONT_FAMILY);
    expect(findThaiFont(next)?.family).toBe(THAI_FONTS[1].family);
  });

  it("is wired through the custom FontFamilyPicker (native option cannot preview faces)", () => {
    const picker = readFileSync("components/FontFamilyPicker.tsx", "utf8");
    const builder = readFileSync("components/Builder/BuilderInspector.tsx", "utf8");
    const textSection = readFileSync("components/Canvas/PropertiesPanel/TextSection.tsx", "utf8");
    expect(picker).toContain("fontFamily: font.cssFamily");
    expect(picker).toContain("กขคงจ");
    expect(builder).toContain("<FontFamilyPicker");
    expect(textSection).toContain("<FontFamilyPicker");
  });
});
