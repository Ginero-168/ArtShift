import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFrame } from "@/lib/engine/factory";
import type { EngineSlide } from "@/lib/engine/types";
import { renderSlide } from "@/lib/renderer/canvas";
import { renderSlideThumbnail } from "@/lib/renderer/thumbnail";

vi.mock("@/lib/renderer/canvas", () => ({
  renderSlide: vi.fn(),
}));

describe("slide thumbnail renderer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps Frames in the thumbnail render pass", () => {
    const frame = createFrame({ x: 80, y: 80, width: 240, height: 180, shape: "circle" });
    const slide: EngineSlide = {
      id: "slide-1",
      name: "Slide 1",
      width: 800,
      height: 600,
      background: "#fff",
      elements: [frame],
      layers: [],
    };

    renderSlideThumbnail(slide, { ctx: {} as CanvasRenderingContext2D });

    const lastCall = vi.mocked(renderSlide).mock.calls.at(-1);
    expect(lastCall?.[4]).toEqual({ showFrames: true });
  });
});
