/**
 * Monochrome layout-guide styling for Convert to Brief.
 *
 * Dark outlines + pastel/yellow fills get copied by image models as real
 * design chrome. Soft gray tonal blocks with no strokes keep hierarchy readable
 * while looking like guides, not finished artwork.
 */
export const BRIEF_GUIDE_FILL = {
  frame: "#f4f4f5",
  zone: "#e4e4e7",
  hero: "#d4d4d8",
  card: "#ececef",
  badge: "#c8c8ce",
  tag: "#d4d4d8",
  logo: "#f0f0f2",
  footer: "#a1a1aa",
  partitionA: "#e4e4e7",
  partitionB: "#d4d4d8",
  focal: "#c8c8ce",
} as const;

export const BRIEF_GUIDE_TEXT = {
  default: "#52525b",
  onFooter: "#fafafa",
} as const;

type ShapeStyleTarget = {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  fillStyle: string;
  backgroundColor: string;
  roughness: number;
};

export function styleBriefGuideShape(el: ShapeStyleTarget, fill: string): void {
  el.strokeColor = "transparent";
  el.strokeWidth = 0;
  el.strokeStyle = "solid";
  el.fillStyle = "solid";
  el.backgroundColor = fill;
  el.roughness = 0;
}

export function styleBriefGuideText(
  el: { strokeColor: string },
  onDark = false,
): void {
  el.strokeColor = onDark ? BRIEF_GUIDE_TEXT.onFooter : BRIEF_GUIDE_TEXT.default;
}
