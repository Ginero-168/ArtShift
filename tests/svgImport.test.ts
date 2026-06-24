import { describe, expect, it } from "vitest";
import { extractSvgFromHtml, svgToSlideObjects } from "@/lib/svgImport";
import type { ShapeObject, TextObject } from "@/lib/types";

const asShape = (o: unknown) => o as ShapeObject;
const asText = (o: unknown) => o as TextObject;

describe("svgToSlideObjects", () => {
  it("returns null for non-svg / malformed input", () => {
    expect(svgToSlideObjects("not svg")).toBeNull();
    expect(svgToSlideObjects("<div>hello</div>")).toBeNull();
  });

  it("parses a rect with fill/stroke and preserves corner radius", () => {
    const svg = `<svg viewBox="0 0 200 100"><rect x="10" y="20" width="80" height="40"
      rx="8" fill="#ff0000" stroke="#333" stroke-width="2"/></svg>`;
    const out = svgToSlideObjects(svg);
    expect(out).toHaveLength(1);
    const s = asShape(out![0]);
    expect(s.type).toBe("shape");
    expect(s.shape).toBe("rect");
    expect(s.fill).toBe("#ff0000");
    expect(s.stroke).toBe("#333");
    expect(s.strokeWidth).toBe(2);
    expect(s.cornerRadius).toBeGreaterThan(0);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });

  it("converts <circle> and <ellipse> to ellipse shape", () => {
    const svg = `<svg viewBox="0 0 200 200">
      <circle cx="50" cy="50" r="20" fill="#0af"/>
      <ellipse cx="150" cy="100" rx="30" ry="10" fill="#fa0"/>
    </svg>`;
    const out = svgToSlideObjects(svg);
    expect(out).toHaveLength(2);
    expect(asShape(out![0]).shape).toBe("ellipse");
    expect(asShape(out![1]).shape).toBe("ellipse");
    expect(asShape(out![1]).fill).toBe("#fa0");
  });

  it("classifies <line> as arrow when marker-end is set, else line", () => {
    const svg = `<svg viewBox="0 0 400 100">
      <defs><marker id="a"/></defs>
      <line x1="10" y1="50" x2="100" y2="50" stroke="#000" stroke-width="3"/>
      <line x1="150" y1="50" x2="300" y2="50" stroke="#000" stroke-width="3" marker-end="url(#a)"/>
    </svg>`;
    const out = svgToSlideObjects(svg)!;
    expect(out).toHaveLength(2);
    expect(asShape(out[0]).shape).toBe("line");
    expect(asShape(out[1]).shape).toBe("arrow");
    // Both should be horizontal → rotation ≈ 0.
    expect(Math.abs(asShape(out[0]).rotation)).toBeLessThan(0.01);
  });

  it("maps a 3-point polygon to triangle with a bounding box", () => {
    const svg = `<svg viewBox="0 0 200 200">
      <polygon points="100,20 180,180 20,180" fill="#3b82f6"/>
    </svg>`;
    const out = svgToSlideObjects(svg)!;
    expect(out).toHaveLength(1);
    expect(asShape(out[0]).shape).toBe("triangle");
    expect(asShape(out[0]).fill).toBe("#3b82f6");
  });

  it("reads simple M/L <path> as a line/arrow", () => {
    const svg = `<svg viewBox="0 0 300 200">
      <defs><marker id="arrow"/></defs>
      <path d="M 20 20 L 200 80" stroke="#222" stroke-width="4" marker-end="url(#arrow)"/>
    </svg>`;
    const out = svgToSlideObjects(svg)!;
    expect(out).toHaveLength(1);
    expect(asShape(out[0]).shape).toBe("arrow");
    expect(asShape(out[0]).width).toBeGreaterThan(10);
  });

  it("applies translate/rotate transforms to positions", () => {
    const svg = `<svg viewBox="0 0 400 400">
      <g transform="translate(100 100)">
        <rect x="0" y="0" width="40" height="40" fill="#000"/>
      </g>
    </svg>`;
    const out = svgToSlideObjects(svg)!;
    const s = asShape(out[0]);
    // Should be offset so it's past the origin after translate + auto re-anchor.
    expect(s.x).toBeGreaterThanOrEqual(200);
    expect(s.y).toBeGreaterThanOrEqual(160);
  });

  it("parses <text> into TextObject with font props", () => {
    const svg = `<svg viewBox="0 0 300 100">
      <text x="10" y="40" font-size="24" font-family="Inter" font-weight="bold"
        text-anchor="middle" fill="#111">Hello</text>
    </svg>`;
    const out = svgToSlideObjects(svg)!;
    const t = asText(out[0]);
    expect(t.type).toBe("text");
    expect(t.text).toBe("Hello");
    expect(t.fontStyle).toBe("bold");
    expect(t.align).toBe("center");
    expect(t.fill).toBe("#111");
  });

  it("ignores zero-sized / invisible elements", () => {
    const svg = `<svg viewBox="0 0 100 100">
      <rect x="0" y="0" width="0" height="40" fill="red"/>
      <rect x="0" y="0" width="10" height="10" fill="red"/>
    </svg>`;
    const out = svgToSlideObjects(svg)!;
    expect(out).toHaveLength(1);
  });
});

describe("extractSvgFromHtml", () => {
  it("pulls inline <svg> out of an HTML clipboard payload", () => {
    const html = `<meta charset="utf-8"><b><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg></b>`;
    const svg = extractSvgFromHtml(html);
    expect(svg).toContain("<svg");
    expect(svg).toContain("rect");
  });

  it("returns null when no <svg>", () => {
    expect(extractSvgFromHtml("<p>plain</p>")).toBeNull();
    expect(extractSvgFromHtml("")).toBeNull();
  });
});
