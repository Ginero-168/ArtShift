import { describe, expect, it } from "vitest";
import {
  isStudioRasterTool,
  useRasterStudioSession,
} from "@/lib/raster/studio/sessionStore";
import { createImage } from "@/lib/engine/factory";

describe("Raster Studio session tools", () => {
  it("opens with brush as the default studio tool", () => {
    useRasterStudioSession.getState().close();
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
    expect(state.studioTool).toBe("rasterBrush");
    expect(isStudioRasterTool("rasterEraser")).toBe(true);
    expect(isStudioRasterTool("select")).toBe(false);
    state.setStudioTool("rasterHealing");
    expect(useRasterStudioSession.getState().studioTool).toBe("rasterHealing");
    state.close();
    expect(useRasterStudioSession.getState().open).toBe(false);
  });
});
