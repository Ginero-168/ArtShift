import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addGlowOperation,
  addShadowOperation,
  appearanceCapabilities,
  appearanceStackRows,
  canvasShadowPasses,
  changeAppearance,
  findEffect,
  glowPatchOperation,
  readAppearance,
  resolveAppearanceExpandedKey,
  shadowPatchOperation,
  toggleAppearanceExpandedKey,
} from "@/lib/appearance";
import { createImage, createRect, createText } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION } from "@/lib/engine/types";

function loadBlankDoc() {
  useEngine.getState().loadDoc({
    id: "doc-appearance",
    title: "appearance",
    schemaVersion: ENGINE_SCHEMA_VERSION,
    width: 1920,
    height: 1080,
    slides: [
      {
        id: "s1",
        name: "Slide 1",
        background: "#fff",
        width: 1920,
        height: 1080,
        elements: [],
        layers: [
          { id: "layer1", name: "Layer 1", objectIds: [], visible: true, locked: false, z: 1 },
        ],
      },
    ],
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: Date.now(),
  });
}

describe("Appearance MVP panel slice", () => {
  it("lists fill/stroke then effects, and text arc for text objects", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 40, height: 40 }),
      shadow: { color: "#000", blur: 8, offsetX: 2, offsetY: 3 },
      glow: { color: "#0ff", blur: 10 },
    };
    const rectRows = appearanceStackRows(rect);
    expect(rectRows.map((row) => (row.kind === "item" ? row.item.kind : row.kind))).toEqual([
      "effect",
      "effect",
      "stroke",
      "fill",
    ]);
    expect(rectRows.some((row) => row.kind === "textArc")).toBe(false);

    const text = createText({ x: 0, y: 0, width: 80, text: "Arc" });
    text.pathCurvature = 35;
    const textRows = appearanceStackRows(text);
    expect(textRows[0]).toMatchObject({ kind: "textArc", value: 35 });
    expect(appearanceCapabilities(text).textArc).toBe(true);
    expect(
      appearanceCapabilities(
        createImage({
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fileId: "f",
          naturalWidth: 10,
          naturalHeight: 10,
        }),
      ).textArc,
    ).toBe(false);
    expect(
      appearanceCapabilities(
        createImage({
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fileId: "f",
          naturalWidth: 10,
          naturalHeight: 10,
        }),
      ).imageAdjust,
    ).toBe(true);
  });

  it("keeps both shadow and glow in stack order instead of XOR", () => {
    const rect = createRect({ x: 0, y: 0, width: 50, height: 50 });
    const withShadow = changeAppearance(rect, addShadowOperation());
    expect(withShadow.ok).toBe(true);
    if (!withShadow.ok) return;
    const withBoth = changeAppearance(withShadow.element, addGlowOperation());
    expect(withBoth.ok).toBe(true);
    if (!withBoth.ok) return;
    expect(withBoth.element.shadow).toEqual(expect.objectContaining({ blur: 12, offsetY: 6 }));
    expect(withBoth.element.glow).toEqual(expect.objectContaining({ blur: 18 }));
    expect(canvasShadowPasses(withBoth.element).map((pass) => pass.source)).toEqual([
      "shadow",
      "glow",
    ]);
  });

  it("patches shadow without clearing glow", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 20, height: 20 }),
      shadow: { color: "#111", blur: 4, offsetX: 1, offsetY: 1 },
      glow: { color: "#0ff", blur: 9 },
    };
    const next = changeAppearance(rect, shadowPatchOperation(rect, { blur: 20 }));
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.element.shadow?.blur).toBe(20);
    expect(next.element.glow?.blur).toBe(9);
    const glowed = changeAppearance(
      next.element,
      glowPatchOperation(next.element, { color: "#f00" }),
    );
    expect(glowed.ok).toBe(true);
    if (!glowed.ok) return;
    expect(glowed.element.shadow?.blur).toBe(20);
    expect(glowed.element.glow?.color).toBe("#f00");
  });
});

describe("updateAppearance store adapter", () => {
  beforeEach(() => loadBlankDoc());

  it("writes shadow and glow onto a selected object as one history step each", () => {
    const st = useEngine.getState();
    const rect = createRect({ x: 10, y: 10, width: 80, height: 60 });
    st.addElement(rect);
    const before = useEngine.getState().history.past.length;

    const shadowResult = useEngine
      .getState()
      .updateAppearance([rect.id], addShadowOperation(), "add shadow");
    expect(shadowResult.ok).toBe(true);
    const withShadow = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === rect.id);
    expect(withShadow?.shadow).toBeTruthy();
    expect(findEffect(readAppearance(withShadow!), "shadow")).toBeTruthy();

    const glowResult = useEngine
      .getState()
      .updateAppearance([rect.id], addGlowOperation(), "add glow");
    expect(glowResult.ok).toBe(true);
    const withBoth = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === rect.id);
    expect(withBoth?.shadow).toBeTruthy();
    expect(withBoth?.glow).toBeTruthy();
    expect(useEngine.getState().history.past.length).toBe(before + 2);

    useEngine.getState().undo();
    const afterUndo = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === rect.id);
    expect(afterUndo?.glow).toBeUndefined();
    expect(afterUndo?.shadow).toBeTruthy();
  });

  it("rejects the whole batch when one element is missing", () => {
    const st = useEngine.getState();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    st.addElement(rect);
    const result = st.updateAppearance(["missing-id", rect.id], addShadowOperation(), "shadow");
    expect(result.ok).toBe(false);
    expect(useEngine.getState().currentSlide()?.elements[0]?.shadow).toBeUndefined();
  });
});

describe("Appearance stack expand/collapse", () => {
  const rowKeys = ["textArc", "stroke-1", "fill-1"] as const;

  function click(current: string | null, key: string): string | null {
    return toggleAppearanceExpandedKey(resolveAppearanceExpandedKey(current, rowKeys), key);
  }

  it("collapses the open item when the same id is selected again", () => {
    expect(click(null, "fill-1")).toBe("fill-1");
    expect(click("fill-1", "fill-1")).toBe(null);
    expect(resolveAppearanceExpandedKey(null, rowKeys)).toBe(null);
  });

  it("still switches to a different item and drops stale ids", () => {
    expect(click("fill-1", "stroke-1")).toBe("stroke-1");
    expect(click("stroke-1", "textArc")).toBe("textArc");
    expect(click("textArc", "textArc")).toBe(null);
    expect(resolveAppearanceExpandedKey("removed-id", rowKeys)).toBe(null);
  });

  it("wires stack headers to toggle instead of radio-select", () => {
    const panel = readFileSync("components/Builder/AppearancePanel.tsx", "utf8");
    expect(panel).toContain("toggleAppearanceExpandedKey");
    expect(panel).toContain("expandRow(row.key)");
    expect(panel).not.toContain("return rows[0]?.key ?? null");
    expect(panel).not.toContain("onClick={() => setExpandedKey(row.key)}");
  });
});

describe("Appearance UI wiring", () => {
  it("mounts the stack panel in the live inspector and not XOR toggles in FillSection", () => {
    const inspector = readFileSync("components/Builder/BuilderInspector.tsx", "utf8");
    const panel = readFileSync("components/Builder/AppearancePanel.tsx", "utf8");
    const picker = readFileSync("components/Builder/TextEffectPresetPicker.tsx", "utf8");
    const fillSection = readFileSync("components/Canvas/PropertiesPanel/FillSection.tsx", "utf8");
    const contract = readFileSync("docs/plans/appearance-phase0-contract.md", "utf8");
    const plan = readFileSync("docs/plans/appearance-system-illustrator-plan-th.md", "utf8");

    expect(inspector).toContain("<AppearancePanel");
    expect(inspector).not.toContain("function StyleOptions");
    expect(panel).toContain("data-appearance-panel");
    expect(panel).toContain("add shadow");
    expect(panel).toContain("add glow");
    expect(panel).toContain("<TextEffectPresetPicker");
    expect(picker).toContain("data-text-effect-presets");
    expect(picker).toContain("applyTextEffectPresetOperation");
    expect(picker).toContain("searchTextEffectPresets");
    expect(picker).toContain("textEffectPreviewStyle");
    expect(panel).toContain("Text Arc");
    expect(panel).toContain("pathCurvature");
    expect(panel).toContain("updateAppearance");
    expect(panel).toContain('data-appearance-add="background"');
    expect(panel).toContain("appearanceItemLabel(item)");
    expect(panel).not.toContain('element.type === "text" ? "Background"');
    expect(panel).not.toContain('element.type === "text" ? "Text"');
    expect(panel).toContain('data-appearance-row="imageAdjust"');
    expect(panel).toContain("ปรับโทนภาพ");
    expect(inspector).not.toContain("Pixel edit");
    expect(inspector).not.toContain("Pixel mask");
    expect(inspector).not.toContain("Retouch patches");
    expect(fillSection).not.toContain("glow: undefined");
    expect(fillSection).not.toContain("shadow: undefined");
    expect(contract).toContain("schema v7");
    expect(contract).toContain("ENGINE_SCHEMA_VERSION` is **9**");
    expect(panel).toContain("add extrude");
    expect(panel).toContain("add emboss");
    expect(plan).toContain("schema v7");
    expect(plan).toContain("Graphic Styles");
  });
});
