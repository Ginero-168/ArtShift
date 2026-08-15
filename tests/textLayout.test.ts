import { describe, expect, it } from "vitest";
import { getTextMinimumHeight, getTextSafePadding } from "@/lib/engine/textLayout";

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
});
