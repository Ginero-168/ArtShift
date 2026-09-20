import { describe, expect, it } from "vitest";
import { serializeSlideToSVG } from "@/lib/engine/exportSVG";
import { createRect, createVectorized, createVectorPath } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import { getObjectContextCategory } from "@/lib/engine/objectContext";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION, type EngineSlide } from "@/lib/engine/types";
import {
  canIsolateVectorizedChildren,
  canUngroupVectorized,
  createAtomicVectorizedFromResult,
  createAtomicVectorizedFromSvg,
  getAtomicVectorizedOptionBarLabels,
  isAtomicVectorizedSelection,
  isLockedCompoundObject,
  svgHasVectorContent,
  vectorizedSvgMarkup,
} from "@/lib/vectorize/atomicVectorize";

const SAMPLE_SVG = `<svg viewBox="0 0 100 80"><path fill="#ef4444" d="M10 10 H90 V70 H10 Z"/><path fill="#2563eb" d="M20 20 H40 V40 H20 Z"/></svg>`;

function slideWith(elements: EngineSlide["elements"]): EngineSlide {
  const layer = createEngineLayer("free");
  layer.objectIds = elements.map((element) => element.id);
  return {
    id: "slide",
    name: "Vectorize",
    background: "#ffffff",
    width: 600,
    height: 400,
    elements,
    layers: [layer],
  };
}

describe("atomic Vectorize insert", () => {
  it("inserts many SVG paths as one locked vectorized object", () => {
    const object = createAtomicVectorizedFromSvg({
      svg: SAMPLE_SVG,
      bounds: { x: 40, y: 60, width: 200, height: 160 },
    });

    expect(object.type).toBe("vectorized");
    expect(object.atomic).toBe(true);
    expect(object.lockedChildren).toBe(true);
    expect(object.svg).toContain("<path");
    expect(object.sourceWidth).toBe(100);
    expect(object.sourceHeight).toBe(80);
    expect(object.x).toBe(40);
    expect(object.y).toBe(60);
    expect(object.width).toBe(200);
    expect(object.height).toBe(160);
    expect(isLockedCompoundObject(object)).toBe(true);
    expect(canUngroupVectorized(object)).toBe(false);
    expect(canIsolateVectorizedChildren(object)).toBe(false);
  });

  it("wraps a VTracer result into a single canvas object instead of exploded paths", () => {
    const object = createAtomicVectorizedFromResult(
      {
        svgString: SAMPLE_SVG,
        width: 240,
        height: 192,
      },
      { x: 12, y: 24, width: 240, height: 192 },
    );

    expect(object.type).toBe("vectorized");
    expect(object.width).toBe(240);
    expect(object.height).toBe(192);
  });

  it("rejects SVG without drawable vector content", () => {
    expect(svgHasVectorContent("<svg viewBox='0 0 10 10'></svg>")).toBe(false);
    expect(() =>
      createAtomicVectorizedFromSvg({
        svg: '<svg viewBox="0 0 10 10"></svg>',
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).toThrow(/no vector content/i);
  });

  it("adds one selectable object to the engine instead of hundreds of paths", () => {
    useEngine.getState().loadDoc({
      id: "vectorize-doc",
      title: "Vectorize",
      schemaVersion: ENGINE_SCHEMA_VERSION,
      width: 1920,
      height: 1080,
      snapGrid: null,
      updatedAt: Date.now(),
      slides: [
        {
          id: "s1",
          name: "Slide 1",
          background: "#fff",
          width: 1920,
          height: 1080,
          elements: [],
          layers: [
            {
              id: "layer1",
              name: "Layer 1",
              objectIds: [],
              visible: true,
              locked: false,
              z: 1,
            },
          ],
        },
      ],
    });
    const object = createAtomicVectorizedFromSvg({
      svg: SAMPLE_SVG,
      bounds: { x: 0, y: 0, width: 100, height: 80 },
    });
    useEngine.getState().addElements([object], "vectorize image");
    useEngine.getState().selectOnly([object.id]);

    const slide = useEngine.getState().currentSlide();
    const inserted = slide?.elements.filter((element) => element.type === "vectorized") ?? [];
    expect(inserted).toHaveLength(1);
    expect(useEngine.getState().selectedIds.size).toBe(1);
    expect(useEngine.getState().selectedIds.has(object.id)).toBe(true);

    useEngine.getState().ungroupElements([object.id]);
    const after = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === object.id);
    expect(after?.type).toBe("vectorized");
    expect(after && "svg" in after ? after.svg : "").toContain("<path");
  });
});

describe("atomic Vectorize Option Bar", () => {
  it("exposes only Download as SVG for a vectorized selection", () => {
    const object = createVectorized({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      svg: SAMPLE_SVG,
      sourceWidth: 100,
      sourceHeight: 80,
    });
    expect(isAtomicVectorizedSelection([object])).toBe(true);
    expect(getAtomicVectorizedOptionBarLabels([object])).toEqual(["Download as SVG"]);
    expect(getObjectContextCategory([object])).toEqual({
      category: "Vectorized",
      multiple: false,
    });
  });

  it("does not treat exploded paths or mixed selections as an atomic Vectorize result", () => {
    const pathA = createVectorPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      true,
    );
    const pathB = createVectorPath(
      [
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
      ],
      true,
    );
    const rect = createRect({ x: 0, y: 0, width: 20, height: 20 });
    expect(getAtomicVectorizedOptionBarLabels([pathA, pathB])).toBeNull();
    expect(getAtomicVectorizedOptionBarLabels([pathA])).toBeNull();
    expect(isAtomicVectorizedSelection([pathA, rect])).toBe(false);
  });

  it("keeps original path markup in the downloaded SVG", () => {
    const object = createAtomicVectorizedFromSvg({
      svg: SAMPLE_SVG,
      bounds: { x: 0, y: 0, width: 200, height: 160 },
    });
    const markup = vectorizedSvgMarkup(object);
    expect(markup).toContain('width="200"');
    expect(markup).toContain('height="160"');
    expect(markup).toContain('viewBox="0 0 100 80"');
    expect(markup).toContain('fill="#ef4444"');
    expect(markup).toContain('fill="#2563eb"');
  });
});

describe("atomic Vectorize SVG export", () => {
  it("embeds the vectorized markup as one nested SVG object", () => {
    const object = createAtomicVectorizedFromSvg({
      svg: SAMPLE_SVG,
      bounds: { x: 10, y: 20, width: 120, height: 96 },
    });
    const svg = serializeSlideToSVG(slideWith([object]));
    expect(svg).toContain(`id="object-${object.id}"`);
    expect(svg).toContain('viewBox="0 0 100 80"');
    expect(svg).toContain('fill="#ef4444"');
    expect(svg.match(/<path /g)?.length).toBe(2);
  });
});
