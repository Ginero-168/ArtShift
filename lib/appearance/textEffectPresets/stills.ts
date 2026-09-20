import type { AppearancePaint, AppearanceShadowLayer } from "../types";
import { conic, linear, radial } from "./paints";
import { alphaInk, COLORION_INK, mixInk } from "./tokens";
import type { TextEffectSourceSpec } from "./types";

const { ink, ink2, ink3 } = COLORION_INK;

type StillOverlay = Partial<
  Pick<
    TextEffectSourceSpec,
    | "fillPaint"
    | "inkColor"
    | "blend"
    | "stroke"
    | "shadows"
    | "offsetFills"
    | "blurRadius"
    | "letterSpacingEm"
    | "extrude"
    | "emboss"
  >
>;

function shadow(
  offsetX: number,
  offsetY: number,
  blur: number,
  color: string,
): AppearanceShadowLayer {
  return { offsetX, offsetY, blur, color };
}

function dots(foreground: string, background: string): AppearancePaint {
  return { type: "pattern", pattern: "dots", foreground, background };
}

function stripes(foreground: string, background: string): AppearancePaint {
  return { type: "pattern", pattern: "stripes", foreground, background };
}

function grid(foreground: string, background: string): AppearancePaint {
  return { type: "pattern", pattern: "grid", foreground, background };
}

/**
 * Phase C still-frame overlays. Source specs already carry Colorion tokens;
 * these only add (or replace) looks that would otherwise freeze as a plain
 * ink fill once motion is stripped.
 */
export const RECIPE_STILLS: Partial<Record<string, StillOverlay>> = {
  aurora: {
    shadows: [shadow(0, 0, 18, alphaInk("ink2", 35)), shadow(0, 8, 22, alphaInk("ink3", 28))],
  },
  glitch: {
    offsetFills: [
      { color: ink2, offsetX: -5, offsetY: -1, opacity: 0.72 },
      { color: ink3, offsetX: 5, offsetY: 1, opacity: 0.72 },
    ],
  },
  typewriter: {
    fillPaint: { type: "solid", color: ink },
    stroke: { width: 0.6, color: alphaInk("ink2", 70) },
  },
  liquid: {
    stroke: { width: 1, color: alphaInk("ink3", 65) },
  },
  focus: {
    blurRadius: 2.4,
    shadows: [shadow(0, 0, 16, alphaInk("ink", 40))],
  },
  wave: {
    fillPaint: linear(180, [
      [0, ink3],
      [0.45, mixInk("ink3", 70, ink)],
      [1, ink],
    ]),
    offsetFills: [{ color: alphaInk("ink3", 45), offsetX: 0, offsetY: 6, opacity: 0.55 }],
  },
  sliced: {
    offsetFills: [
      { color: ink2, offsetX: 8, offsetY: -6, opacity: 0.88 },
      { color: ink3, offsetX: -8, offsetY: 6, opacity: 0.88 },
    ],
  },
  decoder: {
    fillPaint: stripes(ink3, mixInk("ink3", 25, "#08070F")),
    offsetFills: [{ color: ink2, offsetX: 3, offsetY: 0, opacity: 0.35 }],
  },
  echo: {
    offsetFills: [
      { color: ink2, offsetX: -10, offsetY: -6, opacity: 0.28 },
      { color: ink3, offsetX: 12, offsetY: 8, opacity: 0.22 },
    ],
    blurRadius: 1.4,
    stroke: { width: 1, color: alphaInk("ink", 55) },
  },
  extrude: {
    extrude: {
      depth: 6,
      angle: 45,
      steps: 6,
      sideColor: mixInk("ink2", 50, "#000"),
      sideFromFill: false,
    },
    shadows: [shadow(7, 7, 12, "rgba(0,0,0,.5)")],
  },
  contour: {
    fillPaint: { type: "solid", color: alphaInk("ink", 10) },
    stroke: { width: 1.2, color: ink3 },
  },
  jitter: {
    offsetFills: [
      { color: ink2, offsetX: -3, offsetY: 2, opacity: 0.45 },
      { color: ink3, offsetX: 2, offsetY: -2, opacity: 0.4 },
    ],
  },
  elastic: {
    letterSpacingEm: 0.18,
    shadows: [shadow(14, 0, 0, alphaInk("ink2", 55)), shadow(-10, 0, 0, alphaInk("ink3", 40))],
  },
  mirror: {
    fillPaint: linear(180, [
      [0, ink],
      [0.55, ink3],
      [1, alphaInk("ink3", 20)],
    ]),
    offsetFills: [{ color: alphaInk("ink3", 40), offsetX: 0, offsetY: 14, opacity: 0.42 }],
  },
  ransom: {
    offsetFills: [
      { color: ink2, offsetX: -3, offsetY: 4, opacity: 0.55 },
      { color: "#ffe566", offsetX: 4, offsetY: -3, opacity: 0.4 },
    ],
    shadows: [shadow(3, 3, 0, "#08070F")],
  },
  melt: {
    fillPaint: linear(180, [
      [0, ink2],
      [0.7, mixInk("ink2", 70, "#000")],
      [1, alphaInk("ink2", 20)],
    ]),
    shadows: [shadow(0, 10, 6, alphaInk("ink2", 55)), shadow(0, 22, 14, alphaInk("ink2", 30))],
    blurRadius: 1.2,
  },
  negative: {
    fillPaint: { type: "solid", color: ink },
    offsetFills: [
      {
        color: "#08070F",
        offsetX: -18,
        offsetY: 0,
        opacity: 0.85,
        blendMode: "difference",
      },
    ],
  },
  pixel: {
    fillPaint: dots(ink, "#08070F"),
    offsetFills: [
      { color: ink2, offsetX: -6, offsetY: 2, opacity: 0.7 },
      { color: ink3, offsetX: 6, offsetY: -2, opacity: 0.7 },
    ],
  },
  kinetic: {
    offsetFills: [
      { color: alphaInk("ink2", 70), offsetX: -8, offsetY: 0, opacity: 0.55 },
      { color: alphaInk("ink3", 70), offsetX: 8, offsetY: 0, opacity: 0.55 },
    ],
  },
  blackout: {
    fillPaint: { type: "solid", color: "#08070F" },
    stroke: { width: 1.4, color: ink },
    shadows: [shadow(0, 0, 12, alphaInk("ink", 40))],
  },
  magnetic: {
    shadows: [shadow(-10, 0, 8, alphaInk("ink2", 70)), shadow(10, 0, 8, alphaInk("ink3", 70))],
  },
  glass: {
    fillPaint: linear(180, [
      [0, alphaInk("ink", 55)],
      [0.5, alphaInk("ink3", 28)],
      [1, alphaInk("ink", 35)],
    ]),
    stroke: { width: 1, color: alphaInk("ink", 52) },
    shadows: [shadow(0, 1, 0, "rgba(255,255,255,0.4)"), shadow(0, 12, 24, "rgba(0,0,0,0.3)")],
    offsetFills: [{ color: ink3, offsetX: 4, offsetY: 5, opacity: 0.34 }],
    blurRadius: 0.8,
  },
  orbit: {
    fillPaint: conic(40, [
      [0, ink],
      [0.35, ink2],
      [0.7, ink3],
      [1, ink],
    ]),
    offsetFills: [{ color: alphaInk("ink3", 50), offsetX: 6, offsetY: -4, opacity: 0.4 }],
  },
  prismcut: {
    offsetFills: [
      { color: ink2, offsetX: -7, offsetY: -2, opacity: 0.7 },
      { color: ink3, offsetX: 7, offsetY: 2, opacity: 0.7 },
    ],
  },
  softblur: {
    shadows: [
      shadow(0, 0, 0, ink),
      shadow(0, 0, 18, alphaInk("ink2", 45)),
      shadow(0, 0, 34, alphaInk("ink3", 35)),
    ],
    blurRadius: 1.6,
  },
  laser: {
    shadows: [shadow(0, 0, 10, ink2)],
    offsetFills: [{ color: ink2, offsetX: 0, offsetY: 0, opacity: 0.55 }],
    stroke: { width: 0.8, color: "#ffffff" },
  },
  inktrap: {
    fillPaint: { type: "solid", color: ink },
    stroke: { width: 3.2, color: mixInk("ink", 40, "#000") },
  },
  noise: {
    fillPaint: dots(ink, alphaInk("ink2", 25)),
    offsetFills: [
      { color: ink2, offsetX: -2, offsetY: 1, opacity: 0.45 },
      { color: ink3, offsetX: 2, offsetY: -1, opacity: 0.45 },
    ],
  },
  tiltshift: {
    fillPaint: linear(180, [
      [0, alphaInk("ink", 25)],
      [0.4, ink],
      [0.6, ink],
      [1, alphaInk("ink", 25)],
    ]),
    blurRadius: 2.2,
  },
  duotone: {
    offsetFills: [
      { color: ink2, offsetX: -6, offsetY: -2, opacity: 0.7, blendMode: "screen" },
      { color: ink3, offsetX: 6, offsetY: 2, opacity: 0.7, blendMode: "screen" },
    ],
  },
  rain: {
    fillPaint: linear(180, [
      [0, alphaInk("ink3", 80)],
      [1, alphaInk("ink", 40)],
    ]),
    offsetFills: [{ color: ink3, offsetX: 0, offsetY: 8, opacity: 0.28 }],
  },
  zoetrope: {
    offsetFills: [
      { color: ink2, offsetX: -4, offsetY: 0, opacity: 0.55 },
      { color: ink3, offsetX: 4, offsetY: 0, opacity: 0.55 },
    ],
  },
  dotmatrix: {
    fillPaint: dots(ink3, "#08070F"),
  },
  pendulum: {
    shadows: [shadow(16, 6, 4, alphaInk("ink2", 50)), shadow(-8, 4, 4, alphaInk("ink3", 35))],
  },
  smoke: {
    fillPaint: radial([
      [0, ink],
      [0.55, alphaInk("ink", 40)],
      [1, "transparent"],
    ]),
    blurRadius: 3.4,
  },
  eclipse: {
    fillPaint: { type: "solid", color: "#08070F" },
    stroke: { width: 2, color: ink },
    shadows: [shadow(0, 0, 22, alphaInk("ink", 55))],
  },
  barcode: {
    fillPaint: stripes(ink, "#08070F"),
  },
  frost: {
    fillPaint: linear(180, [
      [0, "#e8f6ff"],
      [0.45, "#9ad8ff"],
      [1, "#4f8cb8"],
    ]),
    stroke: { width: 0.8, color: "#ffffff" },
  },
  moire: {
    fillPaint: stripes(ink2, ink3),
  },
  stamp: {
    fillPaint: grid(ink2, "transparent"),
    stroke: { width: 1.5, color: ink2 },
  },
  led: {
    fillPaint: dots("#4dff88", "#0a120c"),
    shadows: [shadow(0, 0, 10, "rgba(77,255,136,0.7)")],
  },
  shatter: {
    offsetFills: [
      { color: ink2, offsetX: -9, offsetY: -5, opacity: 0.7 },
      { color: ink3, offsetX: 8, offsetY: 6, opacity: 0.65 },
      { color: ink, offsetX: 2, offsetY: -8, opacity: 0.4 },
    ],
  },
  grain: {
    fillPaint: dots("#cfc6b8", "#8a8174"),
  },
  origami: {
    fillPaint: linear(135, [
      [0, ink],
      [0.48, ink2],
      [0.5, ink3],
      [1, mixInk("ink2", 40, "#000")],
    ]),
    shadows: [shadow(4, 6, 0, mixInk("ink2", 40, "#000"))],
  },
  domino: {
    offsetFills: [
      { color: mixInk("ink", 40, "#000"), offsetX: 6, offsetY: 6, opacity: 0.9 },
      { color: mixInk("ink", 25, "#000"), offsetX: 12, offsetY: 12, opacity: 0.7 },
    ],
  },
  zip: {
    fillPaint: linear(90, [
      [0, ink2],
      [0.48, ink],
      [0.52, ink3],
      [1, ink],
    ]),
  },
  hyperspace: {
    shadows: [
      shadow(-18, 0, 2, alphaInk("ink3", 70)),
      shadow(-32, 0, 8, alphaInk("ink2", 40)),
      shadow(8, 0, 0, ink),
    ],
  },
  ghost: {
    fillPaint: linear(90, [
      [0, alphaInk("ink", 35)],
      [0.45, ink],
      [1, alphaInk("ink", 35)],
    ]),
    blurRadius: 0.6,
  },
  ticker: {
    fillPaint: stripes(ink, alphaInk("ink2", 30)),
    letterSpacingEm: 0.2,
  },
  kaboom: {
    offsetFills: [
      { color: "#ffab40", offsetX: -8, offsetY: -4, opacity: 0.7 },
      { color: ink2, offsetX: 7, offsetY: 5, opacity: 0.7 },
    ],
    shadows: [shadow(0, 0, 16, "#ff6d00")],
  },
  lenticular: {
    fillPaint: stripes(ink2, ink3),
  },
  helium: {
    shadows: [shadow(0, -10, 12, alphaInk("ink2", 45))],
  },
  lens: {
    fillPaint: { type: "solid", color: alphaInk("ink", 78) },
    shadows: [shadow(-2, 0, 0, alphaInk("ink2", 70)), shadow(2, 0, 0, alphaInk("ink3", 70))],
    blurRadius: 1.1,
    offsetFills: [{ color: ink, offsetX: 10, offsetY: 0, opacity: 0.35 }],
  },
  smear: {
    offsetFills: [
      { color: ink3, offsetX: 14, offsetY: 0, opacity: 0.35 },
      { color: ink2, offsetX: 28, offsetY: 0, opacity: 0.2 },
    ],
    blurRadius: 1.8,
  },
  keycap: {
    fillPaint: linear(180, [
      [0, "#3a3348"],
      [0.45, "#2a2438"],
      [1, "#1a1528"],
    ]),
    extrude: {
      depth: 6,
      angle: 90,
      steps: 1,
      sideColor: mixInk("ink2", 42, "#0b0812"),
      sideFromFill: false,
    },
    emboss: {
      mode: "emboss",
      depth: 1,
      angle: 90,
      softness: 0,
      highlightColor: alphaInk("ink", 40),
      shadowColor: "rgba(0,0,0,0.4)",
    },
    shadows: [shadow(0, 10, 16, "rgba(0,0,0,0.5)")],
  },
  pop: {
    extrude: {
      depth: 12,
      angle: 90,
      steps: 1,
      sideColor: ink2,
      sideFromFill: false,
    },
    shadows: [],
  },
  sundial: {
    extrude: {
      depth: 12,
      angle: 45,
      steps: 3,
      sideColor: ink2,
      sideFromFill: false,
    },
    shadows: [],
  },
  parallax: {
    emboss: {
      mode: "emboss",
      depth: 4,
      angle: 45,
      softness: 0,
      highlightColor: ink3,
      shadowColor: ink2,
    },
    shadows: [],
  },
};

export function applyRecipeStill(spec: TextEffectSourceSpec): TextEffectSourceSpec {
  const overlay = RECIPE_STILLS[spec.slug];
  if (!overlay) return spec;
  return {
    ...spec,
    ...overlay,
    shadows: overlay.shadows ?? spec.shadows,
    offsetFills: overlay.offsetFills ?? spec.offsetFills,
    fillPaint: overlay.fillPaint ?? spec.fillPaint,
    stroke: overlay.stroke ?? spec.stroke,
    blurRadius: overlay.blurRadius ?? spec.blurRadius,
    blend: overlay.blend ?? spec.blend,
    inkColor: overlay.inkColor ?? spec.inkColor,
    letterSpacingEm: overlay.letterSpacingEm ?? spec.letterSpacingEm,
    extrude: overlay.extrude ?? spec.extrude,
    emboss: overlay.emboss ?? spec.emboss,
  };
}
