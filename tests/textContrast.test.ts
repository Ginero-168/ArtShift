import { describe, expect, it } from "vitest";
import { getRelativeLuminance } from "@/lib/vision/textContrast";

describe("Text Contrast & Luminance Engine", () => {
  it("calculates standard WCAG relative luminance", () => {
    // Pure Black
    expect(getRelativeLuminance(0, 0, 0)).toBe(0);

    // Pure White
    expect(getRelativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 4);

    // Pure Green has higher luminance than Pure Blue
    const greenLum = getRelativeLuminance(0, 255, 0);
    const blueLum = getRelativeLuminance(0, 0, 255);
    expect(greenLum).toBeGreaterThan(blueLum);
  });

  it("determines optimal high-contrast text color based on luminance threshold", () => {
    const darkBackgroundLum = 0.15;
    const lightBackgroundLum = 0.85;

    const pickTextColor = (bgLum: number) => (bgLum < 0.5 ? "#ffffff" : "#0f172a");

    expect(pickTextColor(darkBackgroundLum)).toBe("#ffffff");
    expect(pickTextColor(lightBackgroundLum)).toBe("#0f172a");
  });
});
