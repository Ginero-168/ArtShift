import type { EngineSlide } from "../engine/types";
import { type RenderCtx, renderSlide } from "./canvas";

export function renderSlideThumbnail(slide: EngineSlide, render: RenderCtx) {
  renderSlide(slide, render, slide.width, slide.height, { showFrames: true });
}
