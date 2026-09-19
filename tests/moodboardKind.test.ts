import { describe, expect, it } from "vitest";
import { normalizeDocumentLayers } from "@/lib/engine/layers";
import { fromJSON } from "@/lib/engine/serialize";
import { createEmptyEngineDoc, useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION, type EngineDoc } from "@/lib/engine/types";
import { migrateSlideKind } from "@/lib/moodboard/migrate";
import { isMoodboardSlide, resolveSlideKind } from "@/lib/moodboard/types";

function legacyArtworkDoc(): EngineDoc {
  return {
    id: "legacy",
    title: "Legacy",
    width: 1920,
    height: 1080,
    slides: [
      {
        id: "s1",
        name: "1",
        background: "#ffffff",
        elements: [],
        layers: [],
        width: 1920,
        height: 1080,
      },
    ],
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: 1,
    schemaVersion: 4,
  };
}

describe("moodboard slide kind migration", () => {
  it("treats a missing kind as artwork", () => {
    expect(resolveSlideKind(undefined)).toBe("artwork");
    expect(resolveSlideKind("moodboard")).toBe("moodboard");
    const migrated = migrateSlideKind(legacyArtworkDoc().slides[0]);
    expect(migrated.kind).toBe("artwork");
    expect(isMoodboardSlide(migrated)).toBe(false);
  });

  it("migrates persisted documents without kind through fromJSON", () => {
    const restored = fromJSON(legacyArtworkDoc());
    expect(restored.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    expect(restored.slides[0].kind).toBe("artwork");
    expect(restored.slides[0].moodboard).toBeUndefined();
  });

  it("fills empty moodboard state when kind is moodboard", () => {
    const doc = normalizeDocumentLayers({
      ...legacyArtworkDoc(),
      slides: [
        {
          ...legacyArtworkDoc().slides[0],
          kind: "moodboard",
        },
      ],
    });
    expect(doc.slides[0].kind).toBe("moodboard");
    expect(doc.slides[0].moodboard).toEqual({
      viewport: { x: 0, y: 0, zoom: 1 },
      items: [],
    });
  });

  it("creates artwork slides by default and moodboard slides from the rail action", () => {
    const empty = createEmptyEngineDoc("New");
    expect(empty.slides[0].kind).toBe("artwork");

    useEngine.getState().loadDoc(empty);
    const artworkId = useEngine.getState().addSlide();
    const moodboardId = useEngine.getState().addMoodboardSlide();
    const doc = useEngine.getState().doc;
    expect(doc.slides.find((slide) => slide.id === artworkId)?.kind).toBe("artwork");
    const moodboard = doc.slides.find((slide) => slide.id === moodboardId);
    expect(moodboard?.kind).toBe("moodboard");
    expect(moodboard?.elements).toEqual([]);
    expect(moodboard?.moodboard?.items).toEqual([]);
  });

  it("treats expand replacement as one undo step", () => {
    useEngine.getState().loadDoc(createEmptyEngineDoc("Undo"));
    useEngine.getState().addMoodboardSlide();
    const pastBefore = useEngine.getState().history.past.length;
    useEngine.getState().replaceMoodboard(
      [
        {
          id: "item-1",
          kind: "placeholder",
          role: "subject",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          rotation: 0,
          text: "tuk-tuk",
          placeholder: true,
        },
      ],
      "Bangkok",
      "expand moodboard",
    );
    expect(useEngine.getState().currentSlide()?.moodboard?.items).toHaveLength(1);
    expect(useEngine.getState().history.past.length).toBe(pastBefore + 1);
    useEngine.getState().undo();
    expect(useEngine.getState().currentSlide()?.moodboard?.items).toEqual([]);
  });
});
