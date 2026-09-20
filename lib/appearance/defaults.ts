import type {
  BackgroundAppearance,
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";

export const DEFAULT_SHADOW = {
  color: "rgba(0, 0, 0, 0.18)",
  blur: 12,
  offsetX: 2,
  offsetY: 6,
} as const;

export const DEFAULT_GLOW = {
  color: "#38bdf8",
  blur: 18,
} as const;

export function defaultShadowItem(): EffectAppearance {
  return {
    id: "",
    kind: "effect",
    visible: true,
    opacity: 1,
    scope: "object",
    effect: { type: "shadow", ...DEFAULT_SHADOW },
  };
}

export function defaultGlowItem(): EffectAppearance {
  return {
    id: "",
    kind: "effect",
    visible: true,
    opacity: 1,
    scope: "object",
    effect: { type: "glow", ...DEFAULT_GLOW },
  };
}

export function defaultFillItem(): FillAppearance {
  return {
    id: "",
    kind: "fill",
    visible: true,
    opacity: 1,
    paint: { type: "solid", color: "#ffffff" },
    fillStyle: "solid",
  };
}

export function defaultBackgroundItem(): BackgroundAppearance {
  return {
    id: "",
    kind: "background",
    visible: true,
    opacity: 1,
    paint: { type: "solid", color: "#ffffff" },
  };
}

export function defaultStrokeItem(): StrokeAppearance {
  return {
    id: "",
    kind: "stroke",
    visible: true,
    opacity: 1,
    color: "#1b1b1f",
    width: 2,
    style: "solid",
    alignment: "center",
  };
}

/** Default text outline: present in the stack, but not painted until width > 0. */
export function defaultTextStrokeItem(color = "#1b1b1f"): StrokeAppearance {
  return {
    ...defaultStrokeItem(),
    color,
    width: 0,
  };
}

export function clampPathCurvature(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100, Math.min(100, Math.round(value)));
}
