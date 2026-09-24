import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Editor chrome: logo, selection, Appearance image group", () => {
  it("uses the off-register square mark for IconBrand and the favicon", () => {
    const icons = readFileSync("components/icons.tsx", "utf8");
    const favicon = readFileSync("public/icon.svg", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(icons).toMatch(/<rect\s+x="3\.5"\s+y="3\.5"\s+width="11"\s+height="11"/);
    expect(icons).toMatch(/<rect\s+x="9\.5"\s+y="9\.5"\s+width="11"\s+height="11"/);
    expect(icons).not.toContain("M7 17.5V6.5L12 14L17 6.5V17.5");
    expect(favicon).toContain('fill="#d64418"');
    expect(favicon).toContain('fill="#1a1714"');
    expect(favicon).not.toContain("#087fe5");
    expect(css).toContain("place-items: center");
  });

  it("uses the shared ArtShift wordmark in editor chrome", () => {
    const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
    expect(editor).toContain('<ArtShiftLogo size="compact" />');
    expect(editor).not.toContain('<div className="brand-mark">');
    expect(editor).not.toContain("<IconBrand size={14} />");
  });

  it("draws object selection bounds as solid strokes", () => {
    const canvasRoot = readFileSync("components/Canvas/CanvasRoot.tsx", "utf8");
    const transformer = readFileSync("components/Canvas/Transformer.tsx", "utf8");

    expect(canvasRoot).toContain("ctx.setLineDash([])");
    expect(canvasRoot).not.toContain("ctx.setLineDash([6 / view.scale, 4 / view.scale])");
    expect(transformer).not.toContain("strokeDasharray");
  });

  it("keeps Crop off the IMAGE SOURCE row while leaving the transform Crop control", () => {
    const inspector = readFileSync("components/Builder/BuilderInspector.tsx", "utf8");
    const mediaStart = inspector.indexOf("function MediaOptions");
    const nextFn = inspector.indexOf("\nfunction ", mediaStart + 1);
    const mediaOptions = inspector.slice(mediaStart, nextFn > 0 ? nextFn : undefined);

    expect(mediaStart).toBeGreaterThan(0);
    expect(mediaOptions).toContain("Image source");
    expect(mediaOptions).toContain("Replace image");
    expect(mediaOptions).not.toContain("Crop");
    expect(mediaOptions).not.toContain("onToggleCrop");
    expect(inspector).toContain('aria-label="Crop"');
    expect(inspector).toContain('title="Crop image (ตัดรูปภาพ)"');
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
