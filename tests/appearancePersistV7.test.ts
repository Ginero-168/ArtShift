import { beforeEach, describe, expect, it } from "vitest";
import {
  addFillOperation,
  addShadowOperation,
  appearanceToLegacyPatch,
  changeAppearance,
  findEffect,
  findFill,
  hydrateElementAppearance,
  readAppearance,
} from "@/lib/appearance";
import { createRect, createText } from "@/lib/engine/factory";
import { fromJSON, toJSON } from "@/lib/engine/serialize";
import { useEngine } from "@/lib/engine/store";
import {
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineSlide,
  type TextElement,
} from "@/lib/engine/types";

function slideWith(elements: EngineElement[]): EngineSlide {
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

function docWith(elements: EngineElement[], schemaVersion: number): EngineDoc {
  return {
    id: "doc-appearance-v7",
    title: "Appearance persist",
    width: 1920,
    height: 1080,
    slides: [slideWith(elements)],
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: 1,
    schemaVersion,
  };
}

function styledRect(): EngineElement {
  return {
    ...createRect({ x: 40, y: 50, width: 120, height: 80 }),
    backgroundColor: "#ff0000",
    fillStyle: "solid",
    strokeColor: "#00ff00",
    strokeWidth: 4,
    opacity: 0.75,
    blendMode: "multiply",
    shadow: { color: "#111111", blur: 8, offsetX: 2, offsetY: 3 },
    glow: { color: "#00ffff", blur: 10 },
  };
}

describe("schema v7 appearance persist", () => {
  it("migrates v6 legacy-only documents to v7 without dropping flat fields", () => {
    const rect = styledRect();
    const text = {
      ...createText({ x: 200, y: 40, width: 240, text: "Arc" }),
      pathCurvature: 35,
    } as TextElement;
    expect(rect.appearance).toBeUndefined();
    expect(text.appearance).toBeUndefined();

    const migrated = fromJSON(docWith([rect, text], 6));
    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);

    const loadedRect = migrated.slides[0].elements.find((el) => el.id === rect.id)!;
    const loadedText = migrated.slides[0].elements.find((el) => el.id === text.id)! as TextElement;

    expect(loadedRect.appearance).toBeTruthy();
    expect(loadedRect.backgroundColor).toBe("#ff0000");
    expect(loadedRect.strokeColor).toBe("#00ff00");
    expect(loadedRect.strokeWidth).toBe(4);
    expect(loadedRect.shadow).toEqual(rect.shadow);
    expect(loadedRect.glow).toEqual(rect.glow);
    expect(loadedRect.opacity).toBe(0.75);
    expect(loadedRect.blendMode).toBe("multiply");

    const snapshot = readAppearance(loadedRect);
    expect(snapshot.fromLegacy).toBe(false);
    expect(findFill(snapshot)?.kind).toBe("fill");
    expect(findEffect(snapshot, "shadow")?.effect).toMatchObject({ type: "shadow", blur: 8 });
    expect(findEffect(snapshot, "glow")?.effect).toMatchObject({ type: "glow", blur: 10 });

    expect(loadedText.pathCurvature).toBe(35);
    expect(loadedText.appearance).toBeTruthy();
  });

  it("is idempotent: v7 documents stay v7 with the same appearance ids", () => {
    const migrated = fromJSON(docWith([styledRect()], 6));
    const again = fromJSON(migrated);
    expect(again.schemaVersion).toBe(7);
    expect(again.slides[0].elements[0].appearance).toEqual(
      migrated.slides[0].elements[0].appearance,
    );
  });

  it("dual-writes appearance and legacy fields through save/load", () => {
    const rect = createRect({ x: 0, y: 0, width: 50, height: 50 });
    const changed = changeAppearance(rect, addShadowOperation());
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;

    expect(changed.element.appearance).toBeTruthy();
    expect(changed.element.shadow).toEqual(expect.objectContaining({ blur: 12, offsetY: 6 }));

    const saved = toJSON(docWith([changed.element], ENGINE_SCHEMA_VERSION));
    expect(saved.schemaVersion).toBe(7);
    const persisted = saved.slides[0].elements[0];
    expect(persisted.appearance?.items.some((item) => item.kind === "effect")).toBe(true);
    expect(persisted.shadow).toEqual(changed.element.shadow);

    const loaded = fromJSON(saved);
    const roundTrip = loaded.slides[0].elements[0];
    expect(loaded.schemaVersion).toBe(7);
    expect(roundTrip.shadow).toEqual(changed.element.shadow);
    expect(readAppearance(roundTrip).fromLegacy).toBe(false);
    expect(findEffect(readAppearance(roundTrip), "shadow")).toBeTruthy();
  });

  it("loads a document that only has legacy fields (no appearance) via synthesis", () => {
    const rect = styledRect();
    const { appearance: _ignored, ...legacyOnly } = hydrateElementAppearance(rect);
    expect("appearance" in legacyOnly ? legacyOnly.appearance : undefined).toBeUndefined();

    const loaded = fromJSON(docWith([legacyOnly as EngineElement], 6));
    const element = loaded.slides[0].elements[0];
    expect(element.appearance).toBeTruthy();
    expect(readAppearance(element).items.map((item) => item.kind)).toEqual([
      "fill",
      "stroke",
      "effect",
      "effect",
    ]);
    expect(appearanceToLegacyPatch(element.appearance!).backgroundColor).toBe("#ff0000");
  });

  it("prefers appearance over disagreeing legacy fields on load", () => {
    const rect = {
      ...styledRect(),
      backgroundColor: "#ff0000",
      appearance: {
        schemaVersion: 1 as const,
        opacity: 1,
        blendMode: "source-over" as const,
        items: [
          {
            id: "fill:canonical",
            kind: "fill" as const,
            visible: true,
            opacity: 1,
            paint: { type: "solid" as const, color: "#00ff00" },
            fillStyle: "solid" as const,
          },
        ],
      },
    };
    const loaded = fromJSON(docWith([rect], 7));
    const element = loaded.slides[0].elements[0];
    expect(element.backgroundColor).toBe("#00ff00");
    expect(readAppearance(element).fromLegacy).toBe(false);
    const fill = findFill(readAppearance(element));
    expect(fill?.kind === "fill" && fill.paint.type === "solid" ? fill.paint.color : null).toBe(
      "#00ff00",
    );
  });

  it("keeps extra appearance items that do not fit in a single legacy fill", () => {
    const rect = createRect({ x: 0, y: 0, width: 20, height: 20 });
    const withFill = changeAppearance(rect, addFillOperation());
    expect(withFill.ok).toBe(true);
    if (!withFill.ok) return;
    const fills = withFill.element.appearance?.items.filter((item) => item.kind === "fill") ?? [];
    expect(fills.length).toBeGreaterThanOrEqual(2);

    const loaded = fromJSON(toJSON(docWith([withFill.element], ENGINE_SCHEMA_VERSION)));
    const roundTrip = loaded.slides[0].elements[0];
    expect(roundTrip.appearance?.items.filter((item) => item.kind === "fill")).toHaveLength(
      fills.length,
    );
    expect(roundTrip.backgroundColor).toBeDefined();
  });
});

describe("runtime dual-write stays consistent", () => {
  beforeEach(() => {
    useEngine.getState().loadDoc(docWith([], ENGINE_SCHEMA_VERSION));
  });

  it("updateAppearance writes both appearance and legacy shadow", () => {
    const rect = createRect({ x: 8, y: 8, width: 40, height: 40 });
    useEngine.getState().addElement(rect);
    const result = useEngine.getState().updateAppearance([rect.id], addShadowOperation(), "shadow");
    expect(result.ok).toBe(true);
    const next = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === rect.id);
    expect(next?.shadow).toBeTruthy();
    expect(next?.appearance).toBeTruthy();
    expect(findEffect(readAppearance(next!), "shadow")).toBeTruthy();
    expect(readAppearance(next!).fromLegacy).toBe(false);
  });

  it("legacy updateElements fill patches resync appearance instead of drifting", () => {
    const rect = createRect({ x: 8, y: 8, width: 40, height: 40 });
    useEngine.getState().addElement(rect);
    useEngine.getState().updateAppearance([rect.id], addShadowOperation(), "shadow");
    useEngine
      .getState()
      .updateElements([{ id: rect.id, patch: { backgroundColor: "#abcdef" } }], "fill color");
    const next = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === rect.id);
    expect(next?.backgroundColor).toBe("#abcdef");
    expect(next?.shadow).toBeTruthy();
    const fill = findFill(readAppearance(next!));
    expect(fill?.kind === "fill" && fill.paint.type === "solid" ? fill.paint.color : null).toBe(
      "#abcdef",
    );
    expect(findEffect(readAppearance(next!), "shadow")).toBeTruthy();
  });
});
