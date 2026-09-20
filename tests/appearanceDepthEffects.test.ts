import { describe, expect, it } from "vitest";
import {
  addEmbossOperation,
  addExtrudeOperation,
  appearanceCapabilities,
  appearancePadding,
  appearanceStackRows,
  canvasShadowPasses,
  changeAppearance,
  darkenColor,
  embossPatchOperation,
  expandEmbossPasses,
  expandExtrudePasses,
  extrudePatchOperation,
  findEffect,
  offsetFromAngle,
  readAppearance,
  validateAppearance,
} from "@/lib/appearance";
import { DEFAULT_EMBOSS, DEFAULT_EXTRUDE } from "@/lib/appearance/defaults";
import { createRect, createText, createVectorPath } from "@/lib/engine/factory";
import { fromJSON, toJSON } from "@/lib/engine/serialize";
import { ENGINE_SCHEMA_VERSION, type EngineDoc, type EngineSlide } from "@/lib/engine/types";

function slideWith(elements: EngineDoc["slides"][number]["elements"]): EngineSlide {
  return {
    id: "slide-1",
    name: "Artwork 1",
    background: "#ffffff",
    elements,
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        objectIds: elements.map((element) => element.id),
        visible: true,
        locked: false,
        z: 1,
      },
    ],
    width: 1920,
    height: 1080,
  };
}

function docWith(elements: EngineDoc["slides"][number]["elements"]): EngineDoc {
  return {
    id: "doc-depth",
    title: "Depth effects",
    width: 1920,
    height: 1080,
    slides: [slideWith(elements)],
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: 1,
    schemaVersion: ENGINE_SCHEMA_VERSION,
  };
}

describe("extrude / emboss model", () => {
  it("adds named extrude and emboss items that persist without dual-writing legacy shadow", () => {
    const text = createText({ x: 0, y: 0, width: 160, text: "DEPTH" });
    const withExtrude = changeAppearance(text, addExtrudeOperation());
    expect(withExtrude.ok).toBe(true);
    if (!withExtrude.ok) return;
    const extrude = findEffect(readAppearance(withExtrude.element), "extrude");
    expect(extrude?.effect.type).toBe("extrude");
    if (extrude?.effect.type === "extrude") {
      expect(extrude.effect.depth).toBe(DEFAULT_EXTRUDE.depth);
      expect(extrude.effect.angle).toBe(DEFAULT_EXTRUDE.angle);
      expect(extrude.effect.steps).toBe(0);
      expect(extrude.effect.sideFromFill).toBe(true);
    }
    expect(withExtrude.element.shadow).toBeUndefined();
    expect(validateAppearance(readAppearance(withExtrude.element))).toBeNull();

    const withBoth = changeAppearance(withExtrude.element, addEmbossOperation());
    expect(withBoth.ok).toBe(true);
    if (!withBoth.ok) return;
    const emboss = findEffect(readAppearance(withBoth.element), "emboss");
    expect(emboss?.effect.type).toBe("emboss");
    if (emboss?.effect.type === "emboss") {
      expect(emboss.effect.mode).toBe(DEFAULT_EMBOSS.mode);
      expect(emboss.effect.softness).toBe(0);
    }
    expect(
      appearanceStackRows(withBoth.element).some(
        (row) => row.kind === "item" && row.item.kind === "effect",
      ),
    ).toBe(true);

    const saved = toJSON(docWith([withBoth.element]));
    expect(saved.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    const loaded = fromJSON(saved);
    const roundTrip = loaded.slides[0].elements[0];
    expect(findEffect(readAppearance(roundTrip), "extrude")?.effect.type).toBe("extrude");
    expect(findEffect(readAppearance(roundTrip), "emboss")?.effect.type).toBe("emboss");
  });

  it("patches depth and angle live without dropping sibling effects", () => {
    const text = createText({ x: 0, y: 0, width: 120, text: "LIVE" });
    const started = changeAppearance(text, addExtrudeOperation());
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const withEmboss = changeAppearance(started.element, addEmbossOperation());
    expect(withEmboss.ok).toBe(true);
    if (!withEmboss.ok) return;
    const next = changeAppearance(
      withEmboss.element,
      extrudePatchOperation(withEmboss.element, {
        depth: 22,
        angle: 90,
        steps: 4,
        sideFromFill: false,
      }),
    );
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const extrude = findEffect(readAppearance(next.element), "extrude");
    expect(extrude?.effect.type === "extrude" && extrude.effect.depth).toBe(22);
    expect(extrude?.effect.type === "extrude" && extrude.effect.steps).toBe(4);
    expect(findEffect(readAppearance(next.element), "emboss")?.effect.type).toBe("emboss");

    const softened = changeAppearance(
      next.element,
      embossPatchOperation(next.element, { softness: 6, mode: "deboss", depth: 3 }),
    );
    expect(softened.ok).toBe(true);
    if (!softened.ok) return;
    const emboss = findEffect(readAppearance(softened.element), "emboss");
    expect(emboss?.effect.type === "emboss" && emboss.effect.mode).toBe("deboss");
    expect(emboss?.effect.type === "emboss" && emboss.effect.softness).toBe(6);
  });
});

describe("extrude / emboss renderer expansion", () => {
  it("expands stepped extrude farthest-first along the canvas angle", () => {
    const unit = offsetFromAngle(0, 10);
    expect(unit.x).toBeCloseTo(10);
    expect(unit.y).toBeCloseTo(0);

    const passes = expandExtrudePasses(
      { type: "extrude", depth: 6, angle: 0, steps: 3, sideColor: "#112233", sideFromFill: false },
      { color: "#112233" },
    );
    expect(passes).toHaveLength(3);
    expect(passes[0].offsetX).toBeCloseTo(6);
    expect(passes[0].blur).toBe(0);
    expect(passes[2].offsetX).toBeCloseTo(2);
    expect(passes[0].offsetX).toBeGreaterThan(passes[2].offsetX);

    const smooth = expandExtrudePasses({
      type: "extrude",
      depth: 4,
      angle: 90,
      steps: 0,
      sideColor: "#000",
    });
    expect(smooth).toHaveLength(4);
    expect(smooth[0].offsetY).toBeCloseTo(4);
    expect(smooth[3].offsetY).toBeCloseTo(1);
  });

  it("expands emboss into opposite highlight/shadow pairs and inverts for deboss", () => {
    const emboss = expandEmbossPasses({
      type: "emboss",
      mode: "emboss",
      depth: 4,
      angle: 45,
      softness: 0,
      highlightColor: "#ffffff",
      shadowColor: "#000000",
    });
    expect(emboss).toHaveLength(2);
    expect(emboss[0].color).toBe("#000000");
    expect(emboss[1].color).toBe("#ffffff");
    expect(emboss[0].offsetX).toBeCloseTo(-emboss[1].offsetX);
    expect(emboss[0].offsetY).toBeCloseTo(-emboss[1].offsetY);

    const deboss = expandEmbossPasses({
      type: "emboss",
      mode: "deboss",
      depth: 4,
      angle: 45,
      softness: 2,
      highlightColor: "#fff",
      shadowColor: "#000",
    });
    expect(deboss[0].offsetX).toBeCloseTo(-emboss[0].offsetX);
    expect(deboss[0].blur).toBe(2);

    const bevel = expandEmbossPasses({
      type: "emboss",
      mode: "bevel",
      depth: 4,
      angle: 0,
      softness: 2,
      highlightColor: "#fff",
      shadowColor: "#000",
    });
    expect(bevel.length).toBe(4);
  });

  it("paints extrude and emboss through canvasShadowPasses on text and path", () => {
    const text = createText({ x: 0, y: 0, width: 100, text: "3D" });
    const extruded = changeAppearance(text, addExtrudeOperation());
    expect(extruded.ok).toBe(true);
    if (!extruded.ok) return;
    const tweaked = changeAppearance(
      extruded.element,
      extrudePatchOperation(extruded.element, {
        depth: 8,
        steps: 4,
        sideFromFill: false,
        sideColor: "#334455",
      }),
    );
    expect(tweaked.ok).toBe(true);
    if (!tweaked.ok) return;
    const passes = canvasShadowPasses(tweaked.element);
    expect(passes.every((pass) => pass.source === "extrude")).toBe(true);
    expect(passes).toHaveLength(4);
    expect(appearancePadding(readAppearance(tweaked.element)).right).toBeGreaterThan(0);

    const path = createVectorPath(
      [
        { x: 0, y: 0 },
        { x: 40, y: 10 },
        { x: 20, y: 40 },
      ],
      true,
    );
    expect(appearanceCapabilities(path).extrude).toBe(true);
    expect(appearanceCapabilities(path).emboss).toBe(true);
    const pathEmboss = changeAppearance(path, addEmbossOperation());
    expect(pathEmboss.ok).toBe(true);
    if (!pathEmboss.ok) return;
    expect(canvasShadowPasses(pathEmboss.element).some((pass) => pass.source === "emboss")).toBe(
      true,
    );

    const rect = createRect({ x: 0, y: 0, width: 20, height: 20 });
    expect(appearanceCapabilities(rect).extrude).toBe(true);
    expect(darkenColor("#ffffff", 0.5)).toBe("#808080");
  });
});
