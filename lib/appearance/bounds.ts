import type { Appearance, AppearanceItem } from "./types";

export type AppearancePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function itemPadding(item: AppearanceItem): AppearancePadding {
  if (!item.visible) return { top: 0, right: 0, bottom: 0, left: 0 };
  const offsetPad = {
    top: Math.max(0, -(item.kind === "effect" ? 0 : (item.offsetY ?? 0))),
    right: Math.max(0, item.kind === "effect" ? 0 : (item.offsetX ?? 0)),
    bottom: Math.max(0, item.kind === "effect" ? 0 : (item.offsetY ?? 0)),
    left: Math.max(0, -(item.kind === "effect" ? 0 : (item.offsetX ?? 0))),
  };
  if (item.kind === "stroke") {
    const expand =
      item.alignment === "inside" ? 0 : item.alignment === "outside" ? item.width : item.width / 2;
    return {
      top: expand + offsetPad.top,
      right: expand + offsetPad.right,
      bottom: expand + offsetPad.bottom,
      left: expand + offsetPad.left,
    };
  }
  if (item.kind === "fill" || item.kind === "background") {
    return offsetPad;
  }
  if (item.kind === "effect" && item.effect.type === "shadow") {
    const layers = [
      {
        blur: item.effect.blur,
        offsetX: item.effect.offsetX,
        offsetY: item.effect.offsetY,
      },
      ...(item.effect.layers ?? []),
    ];
    return layers.reduce<AppearancePadding>(
      (acc, layer) => ({
        top: Math.max(acc.top, Math.max(0, layer.blur - layer.offsetY)),
        right: Math.max(acc.right, Math.max(0, layer.blur + layer.offsetX)),
        bottom: Math.max(acc.bottom, Math.max(0, layer.blur + layer.offsetY)),
        left: Math.max(acc.left, Math.max(0, layer.blur - layer.offsetX)),
      }),
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
  }
  if (item.kind === "effect" && item.effect.type === "glow") {
    const blur = Math.max(
      item.effect.blur,
      ...(item.effect.layers ?? []).map((layer) => layer.blur),
    );
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
