/**
 * Uniform layout-guide styling for Convert to Brief.
 *
 * One shared gray fill + a light border between regions (no tonal ladder).
 * Hierarchy comes from borders and intentional copy only — not shade differences
 * that image models may bake into finished artwork.
 */
export const BRIEF_GUIDE_GRAY = "#e5e5e5";
export const BRIEF_GUIDE_BORDER = "#737373";
export const BRIEF_GUIDE_BORDER_WIDTH = 1.25;

/** @deprecated Prefer BRIEF_GUIDE_GRAY — kept so call sites stay readable by role. */
export const BRIEF_GUIDE_FILL = {
  frame: BRIEF_GUIDE_GRAY,
  zone: BRIEF_GUIDE_GRAY,
  hero: BRIEF_GUIDE_GRAY,
  card: BRIEF_GUIDE_GRAY,
  badge: BRIEF_GUIDE_GRAY,
  tag: BRIEF_GUIDE_GRAY,
  logo: BRIEF_GUIDE_GRAY,
  footer: BRIEF_GUIDE_GRAY,
  partitionA: BRIEF_GUIDE_GRAY,
  partitionB: BRIEF_GUIDE_GRAY,
  focal: BRIEF_GUIDE_GRAY,
} as const;

export const BRIEF_GUIDE_TEXT = {
  default: "#404040",
  onFooter: "#404040",
} as const;

type ShapeStyleTarget = {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  fillStyle: string;
  backgroundColor: string;
  roughness: number;
};

export function styleBriefGuideShape(el: ShapeStyleTarget, _fill?: string): void {
  el.strokeColor = BRIEF_GUIDE_BORDER;
  el.strokeWidth = BRIEF_GUIDE_BORDER_WIDTH;
  el.strokeStyle = "solid";
  el.fillStyle = "solid";
  el.backgroundColor = BRIEF_GUIDE_GRAY;
  el.roughness = 0;
}

export function styleBriefGuideText(
  el: { strokeColor: string },
  _onDark = false,
): void {
  el.strokeColor = BRIEF_GUIDE_TEXT.default;
}
