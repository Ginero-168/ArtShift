import type { MoodboardItem, MoodboardRole } from "@/lib/engine/types";

export const ROLE_CLUSTER_ORIGINS: Record<MoodboardRole, { x: number; y: number }> = {
  subject: { x: 80, y: 80 },
  setting: { x: 980, y: 80 },
  prop: { x: 80, y: 720 },
  mood: { x: 980, y: 720 },
  color: { x: 980, y: 980 },
};

const CLUSTER_COLUMNS: Record<MoodboardRole, number> = {
  subject: 3,
  setting: 3,
  prop: 3,
  mood: 3,
  color: 5,
};

const CLUSTER_GAP: Record<MoodboardRole, { x: number; y: number }> = {
  subject: { x: 28, y: 36 },
  setting: { x: 28, y: 36 },
  prop: { x: 24, y: 32 },
  mood: { x: 16, y: 16 },
  color: { x: 14, y: 14 },
};

export function layoutMoodboardByRoles(
  items: MoodboardItem[],
  rng: () => number = Math.random,
): MoodboardItem[] {
  const counters: Record<MoodboardRole, number> = {
    subject: 0,
    setting: 0,
    prop: 0,
    mood: 0,
    color: 0,
  };
  let uncategorized = 0;

  return items.map((item) => {
    const role = item.role;
    const origin = role ? ROLE_CLUSTER_ORIGINS[role] : { x: 80, y: 1280 };
    const columns = role ? CLUSTER_COLUMNS[role] : 4;
    const gap = role ? CLUSTER_GAP[role] : { x: 24, y: 24 };
    const index = role ? counters[role]++ : uncategorized++;
    const col = index % columns;
    const row = Math.floor(index / columns);
    void rng;
    return {
      ...item,
      x: origin.x + col * (item.width + gap.x),
      y: origin.y + row * (item.height + gap.y),
      rotation: 0,
    };
  });
}

export function moodboardContentBounds(items: MoodboardItem[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!items.length) {
    return { x: 0, y: 0, width: 1600, height: 1200 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  const pad = 48;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(320, maxX - minX + pad * 2),
    height: Math.max(240, maxY - minY + pad * 2),
  };
}
