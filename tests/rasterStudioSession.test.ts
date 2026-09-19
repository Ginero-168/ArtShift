import { afterEach, describe, expect, it } from "vitest";
import { createImage } from "@/lib/engine/factory";
import {
  isStudioRasterTool,
  resolveRasterEditSurface,
  useRasterStudioSession,
} from "@/lib/raster/studio/sessionStore";

describe("Raster Studio session tools", () => {
  afterEach(() => {
    useRasterStudioSession.getState().close();
    useRasterStudioSession.getState().setNavigatorCollapsed(false);
    useRasterStudioSession.getState().setAdjustOpen(false);
  });
  it("opens with brush as the default studio tool", () => {
    useRasterStudioSession.getState().close();
    useRasterStudioSession.getState().setNavigatorCollapsed(false);
    useRasterStudioSession.getState().setAdjustOpen(false);
    const image = createImage({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      fileId: "f1",
      naturalWidth: 100,
      naturalHeight: 80,
    });
    useRasterStudioSession.getState().openFromImage(image);
    const state = useRasterStudioSession.getState();
    expect(state.open).toBe(true);
    expect(state.surface).toBe("photopea");
    expect(state.studioTool).toBe("rasterBrush");
    expect(isStudioRasterTool("rasterEraser")).toBe(true);
    expect(isStudioRasterTool("rasterPolygonLasso")).toBe(true);
    expect(isStudioRasterTool("rasterQuickSelection")).toBe(true);
    expect(isStudioRasterTool("select")).toBe(false);
    state.setStudioTool("rasterQuickSelection");
    expect(useRasterStudioSession.getState().studioTool).toBe("rasterQuickSelection");
    state.setStudioTool("rasterPolygonLasso");
    expect(useRasterStudioSession.getState().studioTool).toBe("rasterPolygonLasso");
    state.setStageSize({ width: 0, height: 0 });
    state.setImageSize({ width: 1600, height: 800 });
    state.fitView();
    expect(useRasterStudioSession.getState().didInitialFit).toBe(false);
    state.setStageSize({ width: 800, height: 600 });
    state.fitView();
    expect(useRasterStudioSession.getState().zoom).toBeCloseTo(0.46, 5);
    state.actualSize();
    expect(useRasterStudioSession.getState().zoom).toBe(1);
    expect(useRasterStudioSession.getState().sessionEdited).toBe(false);
    state.markSessionEdited();
    expect(useRasterStudioSession.getState().dirty).toBe(true);
    expect(useRasterStudioSession.getState().sessionEdited).toBe(true);
    expect(useRasterStudioSession.getState().navigatorCollapsed).toBe(false);
    state.setNavigatorCollapsed(true);
    state.setAdjustOpen(true);
    expect(useRasterStudioSession.getState().navigatorCollapsed).toBe(true);
    expect(useRasterStudioSession.getState().adjustOpen).toBe(true);
    state.close();
    expect(useRasterStudioSession.getState().open).toBe(false);
    expect(useRasterStudioSession.getState().navigatorCollapsed).toBe(true);
    expect(useRasterStudioSession.getState().adjustOpen).toBe(true);
    state.setNavigatorCollapsed(false);
    state.setAdjustOpen(false);
  });

  it("defaults Edit Raster to Photopea and keeps Studio behind ?rasterStudio=1", () => {
    expect(resolveRasterEditSurface("")).toBe("photopea");
    expect(resolveRasterEditSurface("?perf=1")).toBe("photopea");
    expect(resolveRasterEditSurface("?rasterStudio=1")).toBe("studio");
    expect(resolveRasterEditSurface("rasterStudio=1&perf=1")).toBe("studio");

    const image = createImage({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      fileId: "f2",
      naturalWidth: 40,
      naturalHeight: 40,
    });
    useRasterStudioSession.getState().openFromImage(image, { surface: "studio" });
    expect(useRasterStudioSession.getState().surface).toBe("studio");
    useRasterStudioSession.getState().close();
    expect(useRasterStudioSession.getState().surface).toBe("photopea");
    expect(useRasterStudioSession.getState().open).toBe(false);
  });
});
