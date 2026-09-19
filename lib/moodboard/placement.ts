import type { MoodboardItem } from "@/lib/engine/types";

/** Cascade new user-placed media so drops do not stack on top of each other. */
export function nextMoodboardDropPoint(
  items: MoodboardItem[],
  origin = { x: 120, y: 120 },
): { x: number; y: number } {
  const index = items.length;
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: origin.x + col * 300,
    y: origin.y + row * 240,
  };
}
