import { describe, expect, it } from "vitest";
import { createText } from "@/lib/engine/factory";
import {
  fitTextElementToBox,
  getTextMinimumHeight,
  getTextSafePadding,
  layoutText,
  measureRichText,
} from "@/lib/engine/textLayout";

describe("text layout safety", () => {
  it("keeps a font-relative inset even when requested padding is zero", () => {
    expect(getTextSafePadding(24, 0)).toBe(6);
    expect(getTextSafePadding(110, 0)).toBe(14);
  });

  it("preserves larger intentional padding", () => {
    expect(getTextSafePadding(70, 28)).toBe(28);
  });

  it("includes both safe edges in the minimum text box height", () => {
    expect(getTextMinimumHeight({ fontSize: 110, lineHeight: 1.08, padding: 0 }, 1)).toBeCloseTo(
      146.8,
      5,
    );
  });

  it("wraps Thai copy and splits an oversized unspaced token by grapheme", () => {
    const text = createText({
      x: 0,
      y: 0,
      width: 62,
      height: 40,
      fontSize: 10,
      text: "ภาษาไทยยาวมากโดยไม่มีช่องว่าง",
    });
    const measure = (value: string) => Array.from(value).length * 10;
    const layout = layoutText(text, measure);
    const availableWidth = text.width - layout.padding * 2;

    expect(layout.lines.length).toBeGreaterThan(1);
    expect(
      layout.lines.every((line) => measureRichText(line.text, measure) <= availableWidth),
    ).toBe(true);
    expect(layout.minimumHeight).toBeGreaterThan(text.height);
  });

  it("fits fixed template typography without changing its box", () => {
    const text = createText({
      x: 0,
      y: 0,
      width: 220,
      height: 60,
      fontSize: 72,
      text: "หัวข้อโปรโมตหนังสือ",
    });
    const fitted = fitTextElementToBox(text);
    expect(fitted.height).toBe(60);
    expect(fitted.fontSize).toBeLessThan(72);
    expect(layoutText(fitted).minimumHeight).toBeLessThanOrEqual(60.01);
  });
});
