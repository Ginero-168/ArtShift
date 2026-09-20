import type { AppearancePaint } from "../types";
import type { TextEffectPreset } from "./types";

function paintCss(paint: AppearancePaint): { color: string; background?: string; clip?: boolean } {
  if (paint.type === "solid") return { color: paint.color };
  if (paint.type === "pattern") {
    return { color: paint.foreground, background: paint.background };
  }
  const stops = paint.stops
    .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
    .join(", ");
  if (paint.type === "linearGradient") {
    return {
      color: "transparent",
      background: `linear-gradient(${paint.angle}deg, ${stops})`,
      clip: true,
    };
  }
  if (paint.type === "radialGradient") {
    return {
      color: "transparent",
      background: `radial-gradient(circle, ${stops})`,
      clip: true,
    };
  }
  return {
    color: "transparent",
    background: `conic-gradient(from ${paint.angle}deg, ${stops})`,
    clip: true,
  };
}

function shadowCss(preset: TextEffectPreset): string | undefined {
  const parts: string[] = [];
  for (const item of preset.recipe.appearance.items) {
    if (!item.visible || item.kind !== "effect") continue;
    if (item.effect.type === "shadow") {
      parts.push(
        `${item.effect.offsetX}px ${item.effect.offsetY}px ${item.effect.blur}px ${item.effect.color}`,
      );
      for (const layer of item.effect.layers ?? []) {
        parts.push(`${layer.offsetX}px ${layer.offsetY}px ${layer.blur}px ${layer.color}`);
      }
    } else if (item.effect.type === "glow") {
      parts.push(`0 0 ${item.effect.blur}px ${item.effect.color}`);
      for (const layer of item.effect.layers ?? []) {
        parts.push(`0 0 ${layer.blur}px ${layer.color}`);
      }
    }
  }
  return parts.length ? parts.join(", ") : undefined;
}

export type TextEffectPreviewLayer = {
  color: string;
  offsetX: number;
  offsetY: number;
  opacity: number;
};

export type TextEffectPreviewStyle = {
  sample: {
    color?: string;
    letterSpacing?: string;
    backgroundImage?: string;
    backgroundClip?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
    WebkitTextStroke?: string;
    textShadow?: string;
    filter?: string;
  };
  layers: TextEffectPreviewLayer[];
};

/** Static CSS still of a preset for picker thumbnails — no animation. */
export function textEffectPreviewStyle(preset: TextEffectPreset): TextEffectPreviewStyle {
  const fill = preset.recipe.appearance.items.find((item) => item.kind === "fill");
  const stroke = preset.recipe.appearance.items.find((item) => item.kind === "stroke");
  const blur = preset.recipe.appearance.items.find(
    (item) => item.kind === "effect" && item.effect.type === "gaussianBlur",
  );
  const paint = fill?.kind === "fill" ? paintCss(fill.paint) : { color: "#F5F2FF" };
  const sample: TextEffectPreviewStyle["sample"] = {
    color: paint.color,
    letterSpacing: `${preset.recipe.letterSpacingEm}em`,
  };
  if (paint.background && paint.clip) {
    sample.backgroundImage = paint.background;
    sample.backgroundClip = "text";
    sample.WebkitBackgroundClip = "text";
    sample.WebkitTextFillColor = "transparent";
  }
  if (stroke?.kind === "stroke" && stroke.width > 0) {
    sample.WebkitTextStroke = `${Math.min(stroke.width, 2)}px ${stroke.color}`;
  }
  const shadow = shadowCss(preset);
  if (shadow) sample.textShadow = shadow;
  const blurPx =
    blur?.kind === "effect" && blur.effect.type === "gaussianBlur"
      ? Math.min(2.2, blur.effect.radius)
      : 0;
  if (blurPx) sample.filter = `blur(${blurPx}px)`;

  const layers = preset.recipe.appearance.items.flatMap((item) => {
    if (item.kind !== "fill") return [];
    const offsetX = item.offsetX ?? 0;
    const offsetY = item.offsetY ?? 0;
    if (!offsetX && !offsetY) return [];
    return [
      {
        color: item.paint.type === "solid" ? item.paint.color : paint.color,
        offsetX,
        offsetY,
        opacity: item.opacity,
      },
    ];
  });

  return { sample, layers };
}
