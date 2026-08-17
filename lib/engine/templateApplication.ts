import type { TemplateResult } from "../templates";
import { recomputeArrowBindings } from "./binding";
import { createEngineLayer } from "./layers";
import type { EngineElement, EngineSlide } from "./types";

export type TemplateApplyMode = "replace" | "append";

export type TemplateApplicationOutcome = {
  slide: EngineSlide;
  layerId: string;
  objectIds: string[];
};

/** Apply a deterministic template as one atomic, absolute-positioned Layer. */
export function applyTemplateToSlide(
  slide: EngineSlide,
  result: TemplateResult,
  mode: TemplateApplyMode,
): TemplateApplicationOutcome {
  const existingIds = new Set(slide.elements.map((element) => element.id));
  const nextBaseZ = mode === "replace" ? 1 : nextElementZ(slide.elements);
  const objects = result.objects.map((source, index) => {
    const element = structuredClone(source);
    if (!element.id || existingIds.has(element.id)) element.id = crypto.randomUUID();
    existingIds.add(element.id);
    element.z = nextBaseZ + index;
    element.isDeleted = false;
    return element;
  });
  const layer = createEngineLayer("free", {
    name: mode === "replace" ? "Template" : `Template ${slide.layers.length + 1}`,
    z: mode === "replace" ? 1 : nextLayerZ(slide),
  });
  layer.objectIds = objects.map((element) => element.id);

  const nextSlide = recomputeArrowBindings({
    ...slide,
    background: mode === "replace" ? result.background : slide.background,
    elements: mode === "replace" ? objects : [...slide.elements, ...objects],
    layers: mode === "replace" ? [layer] : [...slide.layers, layer],
  });
  return { slide: nextSlide, layerId: layer.id, objectIds: layer.objectIds };
}

function nextElementZ(elements: EngineElement[]): number {
  return elements.reduce((max, element) => Math.max(max, element.z), 0) + 1;
}

function nextLayerZ(slide: EngineSlide): number {
  return slide.layers.reduce((max, layer) => Math.max(max, layer.z), 0) + 1;
}
