import { describe, expect, it } from "vitest";
import { createText } from "../lib/engine/factory";
import { layoutText } from "../lib/engine/textLayout";

describe("Text on Path & Curved Text Engine", () => {
  it("initializes TextElement with default straight curvature and allows curve adjustments", () => {
    const textEl = createText({
      x: 100,
      y: 100,
      text: "BESTSELLER OF THE YEAR",
      fontSize: 24,
    });

    expect(textEl.pathCurvature).toBeUndefined();

    // Set upward arc
    textEl.pathCurvature = 50;
    expect(textEl.pathCurvature).toBe(50);

    // Set downward arc
    textEl.pathCurvature = -40;
    expect(textEl.pathCurvature).toBe(-40);
  });

  it("lays out text properly regardless of curvature setting", () => {
    const textEl = createText({
      x: 50,
      y: 50,
      width: 300,
      text: "วรรณกรรมยอดเยี่ยม",
      fontSize: 20,
    });
    textEl.pathCurvature = 60;

    const measure = (t: string) => t.length * 12;
    const layout = layoutText(textEl, measure);

    expect(layout.lines.length).toBeGreaterThan(0);
    expect(layout.lines[0].text).toContain("วรรณกรรมยอดเยี่ยม");
  });
});
