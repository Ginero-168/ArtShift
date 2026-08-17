import { describe, expect, it } from "vitest";
import { PRESET_BRAND_KITS } from "../lib/brand/brandKit";
import { checkBrandCompliance } from "../lib/brand/brandRules";
import { createText } from "../lib/engine/factory";
import type { EngineSlide } from "../lib/engine/types";

describe("Brand Rules Compliance Checker", () => {
  const brandKit = PRESET_BRAND_KITS[0]; // Siam Editorial (Requires Logo, ISBN, Price)

  it("flags missing logo and ISBN on non-compliant slide", () => {
    const emptySlide: EngineSlide = {
      id: "s1",
      name: "Empty Slide",
      width: 1080,
      height: 1080,
      background: "#ffffff",
      layers: [],
      elements: [createText({ x: 100, y: 100, text: "Just some text", fontSize: 20 })],
    };

    const report = checkBrandCompliance(emptySlide, brandKit);
    expect(report.passed).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.ruleId === "brand-logo-required")).toBe(true);
    expect(report.issues.some((i) => i.ruleId === "isbn-required")).toBe(true);
  });

  it("passes compliant slide with publisher logo, ISBN, and price", () => {
    const compliantSlide: EngineSlide = {
      id: "s2",
      name: "Compliant Slide",
      width: 1080,
      height: 1080,
      background: "#ffffff",
      layers: [],
      elements: [
        createText({ x: 100, y: 100, text: "สำนักพิมพ์สยามวรรณ", fontSize: 16 }),
        createText({ x: 100, y: 300, text: "ISBN 978-616-12345-6-7", fontSize: 14 }),
        createText({ x: 100, y: 500, text: "ราคาพิเศษ 295 บาท", fontSize: 24 }),
      ],
    };

    const report = checkBrandCompliance(compliantSlide, brandKit);
    expect(report.passed).toBe(true);
    expect(report.scorePercent).toBe(100);
    expect(report.issues.length).toBe(0);
  });
});
