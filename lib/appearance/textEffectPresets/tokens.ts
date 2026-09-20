/** Colorion demo ink tokens resolved to still-frame CSS colors. */
export const COLORION_INK = {
  ink: "#F5F2FF",
  ink2: "#FF4FD8",
  ink3: "#4FF8FF",
} as const;

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split("");
    return [Number.parseInt(r + r, 16), Number.parseInt(g + g, 16), Number.parseInt(b + b, 16)];
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!full) return null;
  return [
    Number.parseInt(full[1].slice(0, 2), 16),
    Number.parseInt(full[1].slice(2, 4), 16),
    Number.parseInt(full[1].slice(4, 6), 16),
  ];
}

function rgbCss(r: number, g: number, b: number, a = 1): string {
  const rr = Math.round(Math.min(255, Math.max(0, r)));
  const gg = Math.round(Math.min(255, Math.max(0, g)));
  const bb = Math.round(Math.min(255, Math.max(0, b)));
  if (a >= 1) return `#${[rr, gg, bb].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return `rgba(${rr}, ${gg}, ${bb}, ${Math.round(a * 1000) / 1000})`;
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Resolve Colorion `var(--ink*)` and simple `color-mix()` into concrete CSS colors. */
export function resolveColorionColor(raw: string): string {
  let value = raw.trim().replace(/\s+/g, " ");
  value = value
    .replaceAll("var(--ink-2)", COLORION_INK.ink2)
    .replaceAll("var(--ink-3)", COLORION_INK.ink3)
    .replaceAll("var(--ink)", COLORION_INK.ink)
    .replaceAll("currentColor", COLORION_INK.ink);

  const mixTransparent =
    /^color-mix\(in srgb,\s*(#[0-9a-fA-F]{3,6})\s+([\d.]+)%,\s*transparent\)$/i.exec(value);
  if (mixTransparent) {
    const rgb = parseHex(mixTransparent[1]);
    if (rgb) return rgbCss(rgb[0], rgb[1], rgb[2], Number(mixTransparent[2]) / 100);
  }

  const mixSolid =
    /^color-mix\(in srgb,\s*(#[0-9a-fA-F]{3,6})\s+([\d.]+)%,\s*(#[0-9a-fA-F]{3,6})\)$/i.exec(value);
  if (mixSolid) {
    const a = parseHex(mixSolid[1]);
    const b = parseHex(mixSolid[3]);
    if (a && b) {
      const t = 1 - Number(mixSolid[2]) / 100;
      const mixed = mixRgb(a, b, t);
      return rgbCss(mixed[0], mixed[1], mixed[2]);
    }
  }

  return value;
}

export function mixInk(which: "ink" | "ink2" | "ink3", percent: number, toward: string): string {
  return resolveColorionColor(
    `color-mix(in srgb, ${COLORION_INK[which === "ink" ? "ink" : which === "ink2" ? "ink2" : "ink3"]} ${percent}%, ${toward})`,
  );
}

export function alphaInk(which: "ink" | "ink2" | "ink3", percent: number): string {
  return resolveColorionColor(
    `color-mix(in srgb, ${COLORION_INK[which === "ink" ? "ink" : which === "ink2" ? "ink2" : "ink3"]} ${percent}%, transparent)`,
  );
}
