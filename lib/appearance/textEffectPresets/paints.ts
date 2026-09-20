import type { AppearanceColorStop, AppearancePaint } from "../types";
import { alphaInk, COLORION_INK, mixInk } from "./tokens";

function stops(...pairs: Array<[number, string]>): AppearanceColorStop[] {
  return pairs.map(([offset, color]) => ({ offset, color }));
}

export function linear(angle: number, pairs: Array<[number, string]>): AppearancePaint {
  return { type: "linearGradient", angle, stops: stops(...pairs) };
}

export function radial(pairs: Array<[number, string]>): AppearancePaint {
  return { type: "radialGradient", stops: stops(...pairs) };
}

export function conic(angle: number, pairs: Array<[number, string]>): AppearancePaint {
  return { type: "conicGradient", angle, stops: stops(...pairs) };
}

const { ink, ink2, ink3 } = COLORION_INK;

/** Distinctive still-frame fills keyed by Colorion `.fx-*` slug. */
export const PRESET_FILL_PAINT: Record<string, AppearancePaint> = {
  aurora: linear(115, [
    [0, ink2],
    [0.33, ink3],
    [0.66, ink2],
    [1, ink3],
  ]),
  liquid: linear(180, [
    [0, ink3],
    [0.46, ink3],
    [0.48, alphaInk("ink3", 55)],
    [0.52, "transparent"],
    [1, "transparent"],
  ]),
  chrome: linear(105, [
    [0, alphaInk("ink", 40)],
    [0.38, alphaInk("ink", 40)],
    [0.47, ink],
    [0.5, "#ffffff"],
    [0.53, ink],
    [0.62, alphaInk("ink", 40)],
    [1, alphaInk("ink", 40)],
  ]),
  scanner: linear(90, [
    [0, alphaInk("ink", 25)],
    [0.4, alphaInk("ink", 25)],
    [0.5, ink],
    [0.6, alphaInk("ink", 25)],
    [1, alphaInk("ink", 25)],
  ]),
  flap: linear(180, [
    [0, "#1a1528"],
    [0.48, "#2a2438"],
    [0.5, "#0e0c14"],
    [1, "#1a1528"],
  ]),
  crt: linear(180, [
    [0, "#4dff88"],
    [0.5, "#1dff6e"],
    [1, "#0a8f44"],
  ]),
  spotlight: radial([
    [0, "#fff7d6"],
    [0.35, ink],
    [1, alphaInk("ink", 20)],
  ]),
  marker: linear(90, [
    [0, "#ffe566"],
    [0.55, "#ffe566"],
    [1, "transparent"],
  ]),
  hologram: linear(180, [
    [0, alphaInk("ink3", 70)],
    [0.5, alphaInk("ink2", 55)],
    [1, alphaInk("ink3", 70)],
  ]),
  foil: linear(108, [
    [0, "#7a4a08"],
    [0.18, "#f2c15d"],
    [0.24, "#fff4b8"],
    [0.36, "#b87014"],
    [0.51, "#f6d66d"],
    [0.68, "#8e560b"],
    [0.76, "#fff0a2"],
    [1, "#c98218"],
  ]),
  starlight: linear(125, [
    [0, "#dbe7ff"],
    [0.4, "#ffffff"],
    [0.7, "#c9b6ff"],
    [1, "#7ec8ff"],
  ]),
  blueprint: linear(0, [
    [0, "#0b3a66"],
    [1, "#12508a"],
  ]),
  mesh: linear(110, [
    [0, ink2],
    [0.5, ink3],
    [1, "#ffffff"],
  ]),
  iridescent: conic(20, [
    [0, "#f7fbff"],
    [0.2, ink3],
    [0.4, "#bba7ff"],
    [0.6, ink2],
    [0.8, "#fff7d6"],
    [1, "#f7fbff"],
  ]),
  glass: linear(180, [
    [0, alphaInk("ink", 55)],
    [0.5, alphaInk("ink3", 28)],
    [1, alphaInk("ink", 35)],
  ]),
  datastream: linear(180, [
    [0, "#06140c"],
    [0.5, "#1dff6e"],
    [1, "#06140c"],
  ]),
  heatmap: linear(90, [
    [0, "#1a0a2e"],
    [0.35, "#ff2d78"],
    [0.65, "#ffab40"],
    [1, "#fff4b8"],
  ]),
  topographic: radial([
    [0, mixInk("ink3", 40, "#000")],
    [0.45, ink3],
    [0.7, ink2],
    [1, ink],
  ]),
  portal: radial([
    [0, "#ffffff"],
    [0.25, ink3],
    [0.65, ink2],
    [1, "#120818"],
  ]),
  frostbite: linear(180, [
    [0, "#e8f6ff"],
    [0.45, "#9ad8ff"],
    [1, "#4f8cb8"],
  ]),
  lightleak: linear(115, [
    [0, "#ff8a5b"],
    [0.4, ink2],
    [0.75, "#fff0a2"],
    [1, ink3],
  ]),
  carrara: linear(118, [
    [0, "#f4f1ea"],
    [0.35, "#d9d2c5"],
    [0.5, "#ffffff"],
    [0.7, "#c8c0b4"],
    [1, "#efeae0"],
  ]),
  ripple: radial([
    [0, alphaInk("ink3", 80)],
    [0.4, alphaInk("ink3", 20)],
    [1, "transparent"],
  ]),
  grain: linear(90, [
    [0, "#cfc6b8"],
    [1, "#8a8174"],
  ]),
  caustics: linear(100, [
    [0, "#063a4a"],
    [0.4, "#1ec8c8"],
    [0.7, "#b8fff4"],
    [1, "#0a5a6a"],
  ]),
  mercury: linear(105, [
    [0, "#8c93a3"],
    [0.35, "#e8edf5"],
    [0.5, "#ffffff"],
    [0.65, "#9aa3b5"],
    [1, "#5c6473"],
  ]),
  sonar: radial([
    [0, alphaInk("ink3", 90)],
    [0.35, alphaInk("ink3", 35)],
    [1, alphaInk("ink", 15)],
  ]),
  shimmer: linear(90, [
    [0, alphaInk("ink", 35)],
    [0.45, ink],
    [1, alphaInk("ink", 35)],
  ]),
  lyric: linear(90, [
    [0, ink2],
    [0.5, ink2],
    [0.5, ink],
    [1, ink],
  ]),
  lenticular: linear(90, [
    [0, ink2],
    [0.33, ink3],
    [0.66, "#bba7ff"],
    [1, ink2],
  ]),
  helium: radial([
    [0, "#ffffff"],
    [0.45, ink2],
    [1, mixInk("ink2", 55, "#000")],
  ]),
  keycap: linear(180, [
    [0, "#3a3348"],
    [0.45, "#2a2438"],
    [1, "#1a1528"],
  ]),
  spectrum: linear(90, [
    [0, "#ff2d78"],
    [0.25, "#ffab40"],
    [0.5, "#ffe566"],
    [0.75, ink3],
    [1, ink2],
  ]),
  microchip: linear(90, [
    [0, "#0d1f18"],
    [0.5, "#1dff6e"],
    [1, "#0d1f18"],
  ]),
  barcode: linear(90, [
    [0, ink],
    [0.08, "#08070F"],
    [0.16, ink],
    [0.24, "#08070F"],
    [1, ink],
  ]),
  led: linear(180, [
    [0, "#0a120c"],
    [0.5, "#4dff88"],
    [1, "#0a120c"],
  ]),
  moire: linear(45, [
    [0, ink],
    [0.5, ink2],
    [1, ink3],
  ]),
  zip: linear(90, [
    [0, ink2],
    [0.5, ink],
    [1, ink3],
  ]),
  equalizer: linear(180, [
    [0, ink3],
    [1, ink2],
  ]),
};
