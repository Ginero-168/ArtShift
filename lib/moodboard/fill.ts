import type { MoodboardItem, MoodboardRole } from "@/lib/engine/types";
import type { MoodboardExpandPack, MoodboardExpandVisual } from "./expandSchema";
import { createMoodboardItem } from "./factory";
import { layoutMoodboardByRoles } from "./layout";

export type FillMoodboardOptions = {
  rng?: () => number;
};

/**
 * Convert an expand pack into upright structure cards (labels / chips only).
 * Does not fetch stock photos, SerpAPI, CSE, or generative images.
 */
export async function fillMoodboardFromPack(
  pack: MoodboardExpandPack,
  options: FillMoodboardOptions = {},
): Promise<MoodboardItem[]> {
  const items: MoodboardItem[] = [];

  for (const visual of pack.roles.subject) {
    items.push(structureCard(visual, "subject"));
  }
  for (const visual of pack.roles.setting) {
    items.push(structureCard(visual, "setting"));
  }
  for (const visual of pack.roles.prop) {
    items.push(structureCard(visual, "prop"));
  }
  for (const chip of pack.roles.mood) {
    items.push(
      createMoodboardItem({
        kind: "chip",
        role: "mood",
        text: chip.label,
        query: chip.query,
        color: "#e0e7ff",
      }),
    );
  }
  for (const chip of pack.roles.color) {
    items.push(
      createMoodboardItem({
        kind: "chip",
        role: "color",
        text: chip.label,
        query: chip.query,
        color: chip.hex ?? "#e5e7eb",
      }),
    );
  }

  return layoutMoodboardByRoles(items, options.rng);
}

function structureCard(visual: MoodboardExpandVisual, role: MoodboardRole): MoodboardItem {
  return createMoodboardItem({
    kind: "note",
    role,
    text: visual.label,
    query: visual.query,
    color: role === "subject" ? "#f8fafc" : role === "setting" ? "#ecfeff" : "#fff7ed",
    width: 220,
    height: 88,
  });
}
