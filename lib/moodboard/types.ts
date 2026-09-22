export const MOODBOARD_ROLES = ["subject", "setting", "prop", "mood", "color"] as const;
export type MoodboardRole = (typeof MOODBOARD_ROLES)[number];

export const MOODBOARD_PACK_COUNTS = {
  subject: { min: 5, max: 6 },
  setting: { min: 5, max: 6 },
  prop: { min: 4, max: 5 },
  mood: { min: 6, max: 6 },
  color: { min: 5, max: 5 },
} as const;

/** Stock / keyword→photo paths stay separate from this AI batch path. */
export const MOODBOARD_STOCK_PATHS = ["/api/stock"] as const;
