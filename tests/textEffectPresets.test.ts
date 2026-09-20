import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyTextEffectPreset,
  canvasGaussianBlurRadius,
  canvasPaintPasses,
  canvasShadowPasses,
  changeAppearance,
  extrudePatchOperation,
  findEffect,
  getTextEffectPreset,
  hydrateElementAppearance,
  readAppearance,
  searchTextEffectPresets,
  TEXT_EFFECT_PRESET_COUNT,
  TEXT_EFFECT_PRESETS,
  textEffectPresetsByFamily,
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

  it("compiles 3D Colorion stills into named extrude/emboss effects", () => {
    const deep = getTextEffectPreset("extrude")!;
    const deepExtrude = deep.recipe.appearance.items.find(
      (item) => item.kind === "effect" && item.effect.type === "extrude",
    );
    expect(deepExtrude?.kind === "effect" && deepExtrude.effect.type).toBe("extrude");
    if (deepExtrude?.kind === "effect" && deepExtrude.effect.type === "extrude") {
      expect(deepExtrude.effect.depth).toBeGreaterThan(0);
      expect(deepExtrude.effect.steps).toBe(6);
      expect(deepExtrude.effect.taper ?? 0).toBe(0);
    }

    const pop = getTextEffectPreset("pop")!;
    expect(
      pop.recipe.appearance.items.some(
        (item) => item.kind === "effect" && item.effect.type === "extrude",
      ),
    ).toBe(true);

    const sundial = getTextEffectPreset("sundial")!;
    const sundialExtrude = sundial.recipe.appearance.items.find(
      (item) => item.kind === "effect" && item.effect.type === "extrude",
    );
    expect(sundialExtrude?.kind === "effect" && sundialExtrude.effect.type).toBe("extrude");

    const parallax = getTextEffectPreset("parallax")!;
    const parallaxEmboss = parallax.recipe.appearance.items.find(
      (item) => item.kind === "effect" && item.effect.type === "emboss",
    );
    expect(parallaxEmboss?.kind === "effect" && parallaxEmboss.effect.type).toBe("emboss");

    const keycap = getTextEffectPreset("keycap")!;
    expect(
      keycap.recipe.appearance.items.some(
        (item) => item.kind === "effect" && item.effect.type === "extrude",
      ),
    ).toBe(true);
    expect(
      keycap.recipe.appearance.items.some(
        (item) => item.kind === "effect" && item.effect.type === "emboss",
      ),
    ).toBe(true);
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
    expect(saved.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
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

describe("text effect renderer + command apply", () => {
  it("writes presets through replaceStack and letter-spacing (undo-safe appearance command)", () => {
    const text = createText({ x: 0, y: 0, width: 200, text: "NEON" });
    const applied = applyTextEffectPreset(text, "neon");
    expect(applied?.type).toBe("text");
    if (applied?.type !== "text") return;
    expect(applied.letterSpacingEm).toBeGreaterThan(0);
    expect(applied.appearance?.items.some((item) => item.kind === "effect")).toBe(true);

    const contour = applyTextEffectPreset(text, "contour");
    expect(contour).toBeTruthy();
    if (!contour) return;
    const stroke = readAppearance(contour).items.find((item) => item.kind === "stroke");
    expect(stroke?.kind === "stroke" && stroke.width).toBeGreaterThan(0);
    const fill = readAppearance(contour).items.find((item) => item.kind === "fill");
    expect(fill?.kind === "fill" && fill.clipToGlyphs).toBe(true);
  });

  it("keeps Deep-Type extrude editable after applying the preset", () => {
    const text = createText({ x: 40, y: 40, width: 280, text: "DEEP" });
    const applied = applyTextEffectPreset(text, "extrude");
    expect(applied).toBeTruthy();
    if (!applied) return;
    const snapshot = readAppearance(applied);
    const extrude = findEffect(snapshot, "extrude");
    expect(extrude?.effect.type).toBe("extrude");
    const passes = canvasShadowPasses(applied);
    expect(passes.some((pass) => pass.source === "extrude")).toBe(true);
    expect(passes.length).toBeGreaterThan(1);

    const edited = changeAppearance(
      applied,
      extrudePatchOperation(applied, { depth: 18, angle: 90 }),
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const next = findEffect(readAppearance(edited.element), "extrude");
    expect(next?.effect.type === "extrude" && next.effect.depth).toBe(18);
    expect(canvasShadowPasses(edited.element).some((pass) => pass.source === "extrude")).toBe(true);
  });

  it("keeps 90 named stills visually distinct after freeze and marks CSS-only gaps", () => {
    const fingerprints = TEXT_EFFECT_PRESETS.map((preset) =>
      JSON.stringify({
        family: preset.family,
        letter: preset.recipe.letterSpacingEm,
        items: preset.recipe.appearance.items.map((item) => ({
          kind: item.kind,
          paint: item.kind === "fill" || item.kind === "background" ? item.paint : undefined,
          offsetX: item.kind === "fill" ? item.offsetX : undefined,
          offsetY: item.kind === "fill" ? item.offsetY : undefined,
          blend: item.kind === "fill" ? item.blendMode : undefined,
          stroke: item.kind === "stroke" ? { width: item.width, color: item.color } : undefined,
          effect: item.kind === "effect" ? item.effect : undefined,
        })),
      }),
    );
    expect(new Set(fingerprints).size).toBe(90);

    const mirror = getTextEffectPreset("mirror")!;
    expect(mirror.rendererSupport).toBe(false);
    expect(mirror.deferredNotes).toContain("box_reflect_css_only");

    const lens = getTextEffectPreset("lens")!;
    expect(lens.rendererSupport).toBe(false);

    const led = getTextEffectPreset("led")!;
    expect(led.rendererSupport).toBe(true);
    const ledFill = led.recipe.appearance.items.find((item) => item.kind === "fill");
    expect(ledFill?.kind === "fill" && ledFill.paint.type).toBe("pattern");

    const duotone = getTextEffectPreset("duotone")!;
    const front = duotone.recipe.appearance.items.filter(
      (item) => item.kind === "fill" && item.blendMode === "screen",
    );
    expect(front.length).toBeGreaterThan(0);
  });

  it("paints glyph-clipped patterns, multi-shadow, and blur without animation", () => {
    const canvas = readFileSync("lib/renderer/canvas.ts", "utf8");
    expect(canvas).toContain("paintGlyphClippedPattern");
    expect(canvas).toContain('globalCompositeOperation = "destination-in"');
    expect(canvas).toContain("appearanceRenderPad");
    expect(canvas).toContain("createConicAppearanceGradient");
    expect(canvas).not.toContain("@keyframes");
    expect(canvas).toContain("ctx.drawImage(cached.canvas, 0, 0);");
  });

  it("groups and filters presets for the picker", () => {
    const grouped = textEffectPresetsByFamily();
    expect(Object.keys(grouped).length).toBeGreaterThanOrEqual(12);
    expect(searchTextEffectPresets("neon-haus").map((preset) => preset.slug)).toEqual(["neon"]);
    expect(searchTextEffectPresets("glitch").length).toBeGreaterThan(0);
    expect(searchTextEffectPresets("zzzz-missing")).toEqual([]);
  });
});
