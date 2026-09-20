import { describe, expect, it } from "vitest";
import {
  applyTextEffectPreset,
  canvasGaussianBlurRadius,
  canvasPaintPasses,
  canvasShadowPasses,
  changeAppearance,
  getTextEffectPreset,
  hydrateElementAppearance,
  readAppearance,
  TEXT_EFFECT_PRESET_COUNT,
  TEXT_EFFECT_PRESETS,
  validateAppearance,
} from "@/lib/appearance";
import { COLORION_INK } from "@/lib/appearance/textEffectPresets/tokens";
import { createText } from "@/lib/engine/factory";
import { fromJSON, toJSON } from "@/lib/engine/serialize";
import {
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineSlide,
} from "@/lib/engine/types";

const NAMES = [
  "Borealis",
  "Glitchcore",
  "Teletype",
  "Neon-Haus",
  "Aqua-Fill",
  "Chromia",
  "Lens-Drift",
  "Tidal-Type",
  "Bisect",
  "Cipher",
  "Redactor",
  "Emberglow",
  "Echo-Verse",
  "Deep-Type",
  "Wireframe",
  "Prisma",
  "Jitterbug",
  "Anaglyph-3D",
  "Split-Flap",
  "Phosphor",
  "Pop-Riot",
  "Limelight",
  "Rubber-Band",
  "Still-Water",
  "Ransom-Note",
  "Meltdown",
  "Cardio",
  "Hi-Liter",
  "Sundial",
  "Negativ",
  "Holograph",
  "Gold-Foil",
  "Pixel-Sort",
  "Starlight",
  "Blueprint",
  "Vapor-Trail",
  "Kinetic-Type",
  "Blackout",
  "Magnetic",
  "Luma-Mesh",
  "Iridescent",
  "Glass-Type",
  "Datastream",
  "Orbitals",
  "Prism-Cut",
  "Soft-Blur",
  "Laser-Cut",
  "Microchip",
  "Heatmap",
  "Parallax",
  "Ink-Trap",
  "Topographic",
  "Signal-Noise",
  "Portal",
  "Tilt-Shift",
  "Duotone",
  "Glyph-Rain",
  "Zoetrope",
  "Dot-Matrix",
  "Pendulum",
  "Smoke-Signal",
  "Eclipse",
  "Barcode",
  "Frostbite",
  "Moiré",
  "Rubber-Stamp",
  "LED-Board",
  "Light-Leak",
  "Kilovolt",
  "Carrara",
  "Ripple",
  "Shatter",
  "Film-Grain",
  "Caustics",
  "Origami",
  "Domino",
  "Zip-Merge",
  "Equalizer",
  "Mercury",
  "Sonar",
  "Hyperspace",
  "Ghostwrite",
  "Tickertape",
  "Kaboom",
  "Lyric-Fill",
  "Lenti-Card",
  "Helium",
  "Liquid-Lens",
  "Whiplash",
  "Keycap",
];

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

function docWith(elements: EngineElement[]): EngineDoc {
  return {
    id: "doc-text-fx",
    title: "Text effect presets",
    width: 1920,
    height: 1080,
    slides: [slideWith(elements)],
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: 1,
    schemaVersion: ENGINE_SCHEMA_VERSION,
  };
}

describe("Colorion static text effect catalog", () => {
  it("covers all 90 named presets with unique ids and slugs", () => {
    expect(TEXT_EFFECT_PRESETS).toHaveLength(TEXT_EFFECT_PRESET_COUNT);
    expect(TEXT_EFFECT_PRESET_COUNT).toBe(90);
    expect(TEXT_EFFECT_PRESETS.map((preset) => preset.name)).toEqual(NAMES);
    const ids = TEXT_EFFECT_PRESETS.map((preset) => preset.id);
    const slugs = TEXT_EFFECT_PRESETS.map((preset) => preset.slug);
    expect(new Set(ids).size).toBe(90);
    expect(new Set(slugs).size).toBe(90);
    expect(ids[0]).toBe(1);
    expect(ids[89]).toBe(90);
  });

  it("locks static-only recipes (no keyframe motion fields)", () => {
    for (const preset of TEXT_EFFECT_PRESETS) {
      expect(preset.staticStrategy).toBe("freeze_key_visual");
      expect(JSON.stringify(preset.recipe.appearance)).not.toMatch(
        /@keyframes|animationDelay|animationDuration/,
      );
      expect(validateAppearance(preset.recipe.appearance)).toBeNull();
      expect(preset.recipe.appearance.items.length).toBeLessThanOrEqual(24);
      expect(preset.recipe.appearance.items.some((item) => item.kind === "fill")).toBe(true);
    }
  });

  it("expresses gradient, multi-shadow, stroke, blur, blend, and offset layers", () => {
    const aurora = getTextEffectPreset("aurora")!;
    const fill = aurora.recipe.appearance.items.find((item) => item.kind === "fill");
    expect(fill?.kind === "fill" && fill.paint.type).toBe("linearGradient");
    expect(fill?.kind === "fill" && fill.clipToGlyphs).toBe(true);

    const neon = getTextEffectPreset("neon")!;
    const neonShadow = neon.recipe.appearance.items.find(
      (item) => item.kind === "effect" && item.effect.type === "shadow",
    );
    expect(neonShadow?.kind === "effect" && neonShadow.effect.type === "shadow").toBe(true);
    if (neonShadow?.kind === "effect" && neonShadow.effect.type === "shadow") {
      expect((neonShadow.effect.layers?.length ?? 0) + 1).toBeGreaterThan(1);
    }

    const liquid = getTextEffectPreset("liquid")!;
    const stroke = liquid.recipe.appearance.items.find((item) => item.kind === "stroke");
    expect(stroke?.kind === "stroke" && stroke.width).toBeGreaterThan(0);

    const blur = getTextEffectPreset("softblur")!;
    expect(
      blur.recipe.appearance.items.some(
        (item) => item.kind === "effect" && item.effect.type === "gaussianBlur",
      ),
    ).toBe(true);

    const anaglyph = getTextEffectPreset("anaglyph")!;
    const offsets = anaglyph.recipe.appearance.items.filter(
      (item) => item.kind === "fill" && (item.offsetX || item.offsetY),
    );
    expect(offsets.length).toBeGreaterThan(0);

    const duotone = getTextEffectPreset("duotone")!;
    expect(
      duotone.recipe.appearance.items.some(
        (item) => item.kind === "fill" && item.blendMode === "screen",
      ),
    ).toBe(true);

    const iridescent = getTextEffectPreset("iridescent")!;
    const irisFill = iridescent.recipe.appearance.items.find((item) => item.kind === "fill");
    expect(irisFill?.kind === "fill" && irisFill.paint.type).toBe("conicGradient");
  });
});

describe("text effect appearance model round-trip", () => {
  it("applies a preset, dual-writes legacy glyph color, and survives save/load", () => {
    const text = createText({ x: 40, y: 40, width: 280, text: "BOREALIS" });
    const applied = applyTextEffectPreset(text, 1);
    expect(applied).toBeTruthy();
    if (!applied) return;

    const snapshot = readAppearance(applied);
    expect(validateAppearance(snapshot)).toBeNull();
    const fill = snapshot.items.find((item) => item.kind === "fill");
    expect(fill?.kind === "fill" && fill.paint.type).toBe("linearGradient");
    expect(applied.strokeColor === COLORION_INK.ink2 || applied.strokeColor.startsWith("#")).toBe(
      true,
    );

    const saved = toJSON(docWith([applied]));
    expect(saved.schemaVersion).toBe(8);
    const loaded = fromJSON(saved);
    const roundTrip = loaded.slides[0].elements[0];
    expect(loaded.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    const again = readAppearance(roundTrip);
    expect(again.items.find((item) => item.kind === "fill")?.kind).toBe("fill");
    const loadedFill = again.items.find((item) => item.kind === "fill");
    expect(loadedFill?.kind === "fill" && loadedFill.paint.type).toBe("linearGradient");
  });

  it("round-trips multi-shadow layers and offset fills without XOR-dropping glow/shadow", () => {
    const text = createText({ x: 0, y: 0, width: 200, text: "NEON" });
    const applied = applyTextEffectPreset(text, "neon");
    expect(applied).toBeTruthy();
    if (!applied) return;
    const shadowPasses = canvasShadowPasses(applied);
    expect(shadowPasses.length).toBeGreaterThan(1);

    const glitch = applyTextEffectPreset(text, "glitch");
    expect(glitch).toBeTruthy();
    if (!glitch) return;
    const fills = canvasPaintPasses(glitch).filter((pass) => pass.kind === "fill");
    expect(fills.length).toBeGreaterThan(1);

    const hydrated = hydrateElementAppearance(glitch);
    expect(readAppearance(hydrated).items.filter((item) => item.kind === "fill").length).toBe(
      readAppearance(glitch).items.filter((item) => item.kind === "fill").length,
    );
  });

  it("keeps gaussian blur on Soft-Blur after changeAppearance dual-write", () => {
    const text = createText({ x: 0, y: 0, width: 160, text: "BLUR" });
    const applied = applyTextEffectPreset(text, "softblur");
    expect(applied).toBeTruthy();
    if (!applied) return;
    expect(canvasGaussianBlurRadius(applied)).toBeGreaterThan(0);
    const tweaked = changeAppearance(applied, {
      type: "setRoot",
      patch: { opacity: 0.9 },
    });
    expect(tweaked.ok).toBe(true);
    if (!tweaked.ok) return;
    expect(canvasGaussianBlurRadius(tweaked.element)).toBeGreaterThan(0);
  });
});
