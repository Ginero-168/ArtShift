import type { Appearance, AppearanceItem } from "./types";

export type AppearancePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function itemPadding(item: AppearanceItem): AppearancePadding {
  if (!item.visible) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (item.kind === "stroke") {
    const expand =
      item.alignment === "inside" ? 0 : item.alignment === "outside" ? item.width : item.width / 2;
    return { top: expand, right: expand, bottom: expand, left: expand };
  }
  if (item.kind === "effect" && item.effect.type === "shadow") {
    const blur = item.effect.blur;
    return {
      top: Math.max(0, blur - item.effect.offsetY),
      right: Math.max(0, blur + item.effect.offsetX),
      bottom: Math.max(0, blur + item.effect.offsetY),
      left: Math.max(0, blur - item.effect.offsetX),
    };
  }
  if (item.kind === "effect" && item.effect.type === "glow") {
    const blur = item.effect.blur;
    return { top: blur, right: blur, bottom: blur, left: blur };
  }
  if (item.kind === "effect" && item.effect.type === "gaussianBlur") {
    const radius = item.effect.radius;
    return { top: radius, right: radius, bottom: radius, left: radius };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

export function appearancePadding(appearance: Appearance): AppearancePadding {
  return appearance.items.reduce<AppearancePadding>(
    (acc, item) => {
      const pad = itemPadding(item);
      return {
        top: Math.max(acc.top, pad.top),
        right: Math.max(acc.right, pad.right),
        bottom: Math.max(acc.bottom, pad.bottom),
        left: Math.max(acc.left, pad.left),
      };
    },
    { top: 0, right: 0, bottom: 0, left: 0 },
  );
}
