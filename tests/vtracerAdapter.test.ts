import { describe, expect, it } from "vitest";
import { getSvgViewport, parseVTracerSvgToElements } from "@/lib/vectorize/vtracerAdapter";

describe("VTracer SVG adapter", () => {
  it("turns grouped SVG paths and cubic commands into editable ArtShift paths", () => {
    const svg = `
      <svg viewBox="0 0 100 80">
        <g fill="#ef4444">
          <path d="M 10 10 H 90 V 70 H 10 Z" />
        </g>
        <path fill="#2563eb" d="M20 20 C20 10 40 10 40 20 S60 30 70 20 Z" />
        <path fill="none" d="M0 0 L100 80 Z" />
      </svg>
    `;

    const elements = parseVTracerSvgToElements(svg, {
      targetBounds: { x: 12, y: 24, width: 240, height: 192 },
      sourceWidth: 100,
      sourceHeight: 80,
    });

    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe("path");
    expect(elements[0].backgroundColor).toBe("#ef4444");
    expect(elements[0].closed).toBe(true);
    expect(elements[0].nodes).toHaveLength(4);
    expect(elements[0].nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(elements[0].nodes[1]).toMatchObject({ x: 1, y: 0 });
    expect(elements[0].x).toBe(36);
    expect(elements[0].y).toBe(48);
    expect(elements[0].width).toBe(192);
    expect(elements[0].height).toBe(144);

    expect(elements[1].backgroundColor).toBe("#2563eb");
    expect(elements[1].nodes[0].out).toBeDefined();
    expect(elements[1].nodes[1].in).toBeDefined();
    expect(elements[1].nodes.every((node) => node.x >= 0 && node.x <= 1)).toBe(true);
    expect(elements[1].nodes.every((node) => node.y >= 0 && node.y <= 1)).toBe(true);
  });

  it("rejects malformed paths instead of creating invalid editor objects", () => {
    expect(() =>
      parseVTracerSvgToElements(
        '<svg viewBox="0 0 20 20"><path fill="#000" d="M 1 1 A 5 5 0 0 1 10 10 Z"/></svg>',
        {
          targetBounds: { x: 0, y: 0, width: 20, height: 20 },
          sourceWidth: 20,
          sourceHeight: 20,
        },
      ),
    ).toThrow(/unsupported SVG path command/i);
  });

  it("enforces a path limit before the result reaches the editor", () => {
    const paths = Array.from(
      { length: 3 },
      (_, index) => `<path fill="#000000" d="M${index} 0 L${index + 1} 0 L${index} 1 Z"/>`,
    ).join("");

    expect(() =>
      parseVTracerSvgToElements(`<svg>${paths}</svg>`, {
        targetBounds: { x: 0, y: 0, width: 20, height: 20 },
        sourceWidth: 20,
        sourceHeight: 20,
        maxElements: 2,
      }),
    ).toThrow(/too many vector paths/i);
  });

  it("keeps multiple SVG subpaths in one compound editable element", () => {
    const svg = `
      <svg>
        <path fill="#111827" fill-rule="evenodd"
          d="M10 10 H90 V70 H10 Z M35 25 H65 V55 H35 Z" />
      </svg>
    `;

    const elements = parseVTracerSvgToElements(svg, {
      targetBounds: { x: 0, y: 0, width: 200, height: 120 },
      sourceWidth: 100,
      sourceHeight: 80,
    });

    expect(elements).toHaveLength(1);
    expect(elements[0].subpathStarts).toEqual([0, 4]);
    expect(elements[0].nodes).toHaveLength(8);
    expect(elements[0].fillRule).toBe("evenodd");
  });

  it("preserves SVG opacity on the editable element", () => {
    const elements = parseVTracerSvgToElements(
      '<svg><g fill="#ef4444" opacity="0.5"><path d="M0 0 H10 V10 Z"/></g></svg>',
      {
        targetBounds: { x: 0, y: 0, width: 10, height: 10 },
        sourceWidth: 10,
        sourceHeight: 10,
      },
    );

    expect(elements).toHaveLength(1);
    expect(elements[0].opacity).toBeCloseTo(0.5);
  });

  it("rejects an SVG before parsing when it exceeds the configured budget", () => {
    expect(() =>
      parseVTracerSvgToElements("<svg>0123456789</svg>", {
        targetBounds: { x: 0, y: 0, width: 10, height: 10 },
        sourceWidth: 10,
        sourceHeight: 10,
        maxSvgChars: 10,
      }),
    ).toThrow(/too large/i);
  });

  it("rejects excessive SVG path data before building editor elements", () => {
    const pathData = `M0 0 ${"L1 1 ".repeat(20)}Z`;
    expect(() =>
      parseVTracerSvgToElements(`<svg><path fill="#000" d="${pathData}"/></svg>`, {
        targetBounds: { x: 0, y: 0, width: 10, height: 10 },
        sourceWidth: 10,
        sourceHeight: 10,
        maxPathDataChars: 20,
      }),
    ).toThrow(/path data/i);
  });

  it("reads a Recraft SVG viewBox before normalizing its paths", () => {
    expect(getSvgViewport('<svg width="512px" height="256px" viewBox="0 0 1024 512">')).toEqual({
      width: 1024,
      height: 512,
    });
  });

  it("rejects a vector SVG without a usable viewport", () => {
    expect(() => getSvgViewport('<svg><path d="M0 0"/></svg>')).toThrow(/viewport/i);
  });

  it("preserves a Recraft linear gradient as an editable ArtShift gradient", () => {
    const svg = `
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="Gradient1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="100">
            <stop offset="0" stop-color="rgb(10,20,30)" />
            <stop offset="1" stop-color="rgb(200,210,220)" />
          </linearGradient>
        </defs>
        <path fill="url(#Gradient1)" d="M0 0 H100 V100 H0 Z" />
      </svg>
    `;

    const elements = parseVTracerSvgToElements(svg, {
      targetBounds: { x: 0, y: 0, width: 200, height: 200 },
      sourceWidth: 100,
      sourceHeight: 100,
    });

    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      fillType: "linear",
      gradientColors: ["rgb(10,20,30)", "rgb(200,210,220)"],
      gradientStops: [0, 1],
      backgroundColor: "rgb(10,20,30)",
    });
  });
});
