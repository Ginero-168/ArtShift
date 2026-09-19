import type { EngineDoc, EngineSlide } from "@/lib/engine/types";
import { createEmptyMoodboardState, resolveSlideKind } from "./types";

/** Missing `kind` becomes artwork. Moodboard slides get an empty board if state is absent. */
export function migrateSlideKind(slide: EngineSlide): EngineSlide {
  const kind = resolveSlideKind(slide.kind);
  if (kind === "moodboard") {
    return {
      ...slide,
      kind,
      moodboard: slide.moodboard ?? createEmptyMoodboardState(),
    };
  }
  return {
    ...slide,
    kind,
  };
}

export function migrateDocumentSlideKinds(doc: EngineDoc): EngineDoc {
  return {
    ...doc,
    slides: doc.slides.map(migrateSlideKind),
  };
}
