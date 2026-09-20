import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Editor chrome: logo, selection, Appearance image group", () => {
  it("uses a centered two-peak M for IconBrand and the favicon", () => {
    const icons = readFileSync("components/icons.tsx", "utf8");
    const favicon = readFileSync("public/icon.svg", "utf8");
    const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(icons).toContain('d="M7 17.5V6.5L12 14L17 6.5V17.5"');
    expect(icons).not.toContain("M4 20V6l4 8 4-8 4 8 4-8v14");
    expect(favicon).toContain('d="M7 17.5V6.5L12 14L17 6.5V17.5"');
    expect(editor).toContain('<div className="brand-mark">');
    expect(editor).toContain("<IconBrand size={14} />");
    expect(editor).not.toContain('className="brand-mark" style=');
    expect(css).toContain("place-items: center");
  });

  it("draws object selection bounds as solid strokes", () => {
    const canvasRoot = readFileSync("components/Canvas/CanvasRoot.tsx", "utf8");
    const transformer = readFileSync("components/Canvas/Transformer.tsx", "utf8");

    expect(canvasRoot).toContain("ctx.setLineDash([])");
    expect(canvasRoot).not.toContain("ctx.setLineDash([6 / view.scale, 4 / view.scale])");
    expect(transformer).not.toContain("strokeDasharray");
  });

  it("does not show Edit Raster on the object context bar after leaving Property", () => {
    const contextBar = readFileSync("components/Canvas/ObjectContextBar.tsx", "utf8");
    const contextMenu = readFileSync("components/Canvas/ContextMenu.tsx", "utf8");
    const inspector = readFileSync("components/Builder/BuilderInspector.tsx", "utf8");

    expect(contextBar).not.toContain("Edit Raster");
    expect(contextBar).not.toContain("openRasterEditForElement");
    expect(contextMenu).toContain("Edit Raster");
    expect(contextMenu).toContain("openRasterEditForElement");
    expect(inspector).not.toContain("Pixel edit");
    expect(inspector).not.toContain("Image mask");
  });
});
