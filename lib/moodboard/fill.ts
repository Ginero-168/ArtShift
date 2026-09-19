import type { MoodboardItem, MoodboardRole } from "@/lib/engine/types";
import type { MoodboardExpandPack, MoodboardExpandVisual } from "./expandSchema";
import { createMoodboardItem } from "./factory";
import { layoutMoodboardByRoles } from "./layout";
import { type StockFetcher, searchStockPhoto } from "./stock";

export type FillMoodboardOptions = {
  fetchImpl?: StockFetcher;
  rng?: () => number;
};

/**
 * Convert an expand pack into board items. Visual roles fetch `/api/stock` only.
 * Missing photos become placeholders — never a generative-image fallback.
 */
export async function fillMoodboardFromPack(
  pack: MoodboardExpandPack,
  options: FillMoodboardOptions = {},
): Promise<MoodboardItem[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const items: MoodboardItem[] = [];

  for (const visual of pack.roles.subject) {
    items.push(...(await fillVisuals(visual, "subject", fetchImpl)));
  }
  for (const visual of pack.roles.setting) {
    items.push(...(await fillVisuals(visual, "setting", fetchImpl)));
  }
  for (const visual of pack.roles.prop) {
    items.push(...(await fillVisuals(visual, "prop", fetchImpl)));
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

async function fillVisuals(
  visual: MoodboardExpandVisual,
  role: MoodboardRole,
  fetchImpl: StockFetcher,
): Promise<MoodboardItem[]> {
  const items: MoodboardItem[] = [];
  for (let i = 0; i < visual.photoCount; i += 1) {
    const query = i === 0 ? visual.query : `${visual.query} ${visual.label}`;
    const hit = await searchStockPhoto(query, fetchImpl);
    if (hit) {
      items.push(
        createMoodboardItem({
          kind: "image",
          role,
          src: hit.src,
          text: visual.label,
          query,
          credit: hit.credit,
        }),
      );
    } else {
      items.push(
        createMoodboardItem({
          kind: "placeholder",
          role,
          text: visual.label,
          query,
          placeholder: true,
        }),
      );
    }
  }
  return items;
}
