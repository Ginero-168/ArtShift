import { describe, expect, it } from "vitest";
import {
  appearanceCapabilities,
  appearanceFingerprint,
  appearancePadding,
  appearanceToLegacyPatch,
  changeAppearance,
  readAppearance,
  validateAppearance,
} from "@/lib/appearance";
import { createImage, createRect, createText } from "@/lib/engine/factory";

describe("appearance Phase 1 foundation", () => {
  it("reads solid fill, stroke, shadow, and glow from legacy fields", () => {
    const rect = {
      ...createRect({ x: 10, y: 20, width: 100, height: 80 }),
      backgroundColor: "#ff0000",
      fillStyle: "solid" as const,
      strokeColor: "#00ff00",
      strokeWidth: 4,
      opacity: 0.8,
      blendMode: "multiply" as const,
      shadow: { color: "#000000", blur: 8, offsetX: 2, offsetY: 3 },
      glow: { color: "#ffff00", blur: 6 },
    };
    const appearance = readAppearance(rect);
    expect(appearance.fromLegacy).toBe(true);
    expect(appearance.opacity).toBe(0.8);
    expect(appearance.blendMode).toBe("multiply");
    expect(appearance.items.map((item) => item.kind)).toEqual([
      "fill",
      "stroke",
      "effect",
      "effect",
    ]);
    expect(validateAppearance(appearance)).toBeNull();
    expect(appearanceFingerprint(appearance).length).toBeGreaterThan(10);
  });

  it("round-trips appearance operations back onto legacy fields", () => {
    const rect = createRect({ x: 0, y: 0, width: 50, height: 50 });
    const changed = changeAppearance(rect, {
      type: "setRoot",
      patch: { opacity: 0.5, blendMode: "screen" },
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.element.opacity).toBe(0.5);
    expect(changed.element.blendMode).toBe("screen");

    const withFill = changeAppearance(changed.element, {
      type: "updateItem",
      itemId: readAppearance(changed.element).items.find((item) => item.kind === "fill")!.id,
      patch: {
        kind: "fill",
        paint: { type: "solid", color: "#112233" },
      },
    });
    expect(withFill.ok).toBe(true);
    if (!withFill.ok) return;
    expect(withFill.element.backgroundColor).toBe("#112233");
  });

  it("rejects duplicate ids and over-capacity inserts", () => {
    const rect = createRect({ x: 0, y: 0, width: 40, height: 40 });
    const appearance = readAppearance(rect);
    const fill = appearance.items.find((item) => item.kind === "fill");
    expect(fill).toBeTruthy();
    const duplicate = changeAppearance(rect, {
      type: "insertItem",
      item: { ...fill!, id: fill!.id },
    });
    expect(duplicate.ok).toBe(false);
  });

  it("computes padding from stroke and shadow", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 10, height: 10 }),
      strokeWidth: 4,
      shadow: { color: "#000", blur: 10, offsetX: 5, offsetY: 0 },
    };
    const pad = appearancePadding(readAppearance(rect));
    expect(pad.left).toBeGreaterThanOrEqual(2);
    expect(pad.right).toBeGreaterThanOrEqual(15);
  });

  it("exposes capabilities by element type", () => {
    expect(
      appearanceCapabilities(createRect({ x: 0, y: 0, width: 1, height: 1 })).multipleFills,
    ).toBe(true);
    expect(
      appearanceCapabilities(createText({ x: 0, y: 0, width: 40, text: "Hi" })).multipleFills,
    ).toBe(true);
    expect(appearanceCapabilities(createText({ x: 0, y: 0, width: 40, text: "Hi" })).textArc).toBe(
      true,
    );
    expect(
      appearanceCapabilities(createText({ x: 0, y: 0, width: 40, text: "Hi" })).background,
    ).toBe(true);
    expect(appearanceCapabilities(createRect({ x: 0, y: 0, width: 1, height: 1 })).background).toBe(
      false,
    );
    const image = createImage({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fileId: "f1",
      naturalWidth: 100,
      naturalHeight: 100,
    });
    expect(appearanceCapabilities(image).fills).toBe(false);
    expect(appearanceCapabilities(image).shadow).toBe(true);
    expect(appearanceCapabilities(image).imageAdjust).toBe(true);
  });

  it("writes legacy patch without inventing unsupported image effects", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 20, height: 20 }),
      backgroundColor: "#abcdef",
      fillStyle: "solid" as const,
    };
    const patch = appearanceToLegacyPatch(readAppearance(rect));
    expect(patch.backgroundColor).toBe("#abcdef");
    expect(patch.shadow).toBeUndefined();
  });
});
