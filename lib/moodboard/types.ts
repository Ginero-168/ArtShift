import type {
  MoodboardItem,
  MoodboardState,
  MoodboardViewport,
  SlideKind,
} from "@/lib/engine/types";

export const MOODBOARD_ROLES = ["subject", "setting", "prop", "mood", "color"] as const;

export const MOODBOARD_TARGET_ITEM_COUNT = { min: 18, max: 24 } as const;

export const MOODBOARD_PACK_COUNTS = {
  subject: { min: 5, max: 6 },
  setting: { min: 5, max: 6 },
  prop: { min: 4, max: 5 },
  mood: { min: 6, max: 6 },
  color: { min: 5, max: 5 },
} as const;

export const GENERATIVE_IMAGE_PATHS = ["/api/ai/image", "/api/generate", "image.generate"] as const;

export function createEmptyMoodboardState(): MoodboardState {
  return {
    viewport: { x: 0, y: 0, zoom: 1 },
    items: [],
  };
}

export function createEmptyMoodboardViewport(): MoodboardViewport {
  return { x: 0, y: 0, zoom: 1 };
}

export function resolveSlideKind(kind: unknown): SlideKind {
  return kind === "moodboard" ? "moodboard" : "artwork";
}

export function isMoodboardSlide(slide: { kind?: unknown } | null | undefined): boolean {
  return slide?.kind === "moodboard";
}

export function moodboardItemCount(items: MoodboardItem[]): number {
  return items.length;
}
