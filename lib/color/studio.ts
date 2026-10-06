/** Pure color operations shared by Color Studio, import/export and recoloring. */
export type PaletteColor = { hex: string; locked: boolean };
export type Harmony = "balanced" | "analogous" | "complementary" | "triadic" | "monochrome";
export type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia" | "grayscale";
export type RGB = [number, number, number];
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[a-f\d]{3}$/i.test(hex))
    return `#${[...hex]
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  return /^[a-f\d]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}
export function rgb(hex: string): RGB {
  const value = normalizeHex(hex);
  if (!value) throw new Error("สีต้องเป็น HEX เช่น #D64418");
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as RGB;
}
export function fromRgb(values: readonly number[]): string {
  return `#${values
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((n) => n / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
}
export function fromHsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s);
  l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  const parts =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return fromRgb(parts.map((v) => (v + m) * 255));
}
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => linear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 2 contrast, opaque sRGB. Compare unrounded ratios against thresholds. */
export function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const readableInk = (hex: string) =>
  contrast(hex, "#ffffff") >= contrast(hex, "#111111") ? "#ffffff" : "#111111";
export function generatePalette(
  colors: PaletteColor[],
  mode: Harmony,
  random = Math.random,
): PaletteColor[] {
  const anchor = colors.find((c) => c.locked);
  const [base, saturation] = anchor ? toHsl(anchor.hex) : [random() * 360, 0.45 + random() * 0.35];
  const offsets =
    mode === "analogous"
      ? [-30, -15, 0, 15, 30]
      : mode === "complementary"
        ? [0, 180]
        : mode === "triadic"
          ? [0, 120, 240]
          : mode === "monochrome"
            ? [0]
            : [0, 25, 180, 210, 0];
  return colors.map((c, i) =>
    c.locked
      ? c
      : {
          locked: false,
          hex: fromHsl(
            base + offsets[i % offsets.length],
            clamp(saturation + (random() - 0.5) * 0.18, 0.15, 0.9),
            0.15 + (i / Math.max(1, colors.length - 1)) * 0.75,
          ),
        },
  );
}
export function adjustPalette(
  colors: PaletteColor[],
  hue: number,
  saturation: number,
  lightness: number,
  temperature: number,
): PaletteColor[] {
  return colors.map((c) => {
    if (c.locked) return c;
    const [h, s, l] = toHsl(c.hex);
    const values = rgb(fromHsl(h + hue, s + saturation, l + lightness));
    return { ...c, hex: fromRgb([values[0] + temperature, values[1], values[2] - temperature]) };
  });
}
export function gradientPalette(start: string, end: string, count: number): string[] {
  const a = rgb(start).map((n) => linear(n / 255)),
    b = rgb(end).map((n) => linear(n / 255));
  const size = Math.round(clamp(count, 2, 10));
  return Array.from({ length: size }, (_, i) =>
    fromRgb(a.map((v, j) => gamma(v + ((b[j] - v) * i) / (size - 1)) * 255)),
  );
}
/** Machado et al. (2009), severity 1.0, applied to linear sRGB; a simulation, not a diagnosis. */
const MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
export function simulateVision(hex: string, mode: Vision): string {
  if (mode === "normal") return hex;
  if (mode === "grayscale") return fromRgb(Array(3).fill(gamma(luminance(hex)) * 255));
  const input = rgb(hex).map((v) => linear(v / 255));
  return fromRgb(
    MATRICES[mode].map(
      (row) => gamma(clamp(row.reduce((sum, v, i) => sum + v * input[i], 0))) * 255,
    ),
  );
}
export function colorInfo(hex: string) {
  const values = rgb(hex),
    [h, s, l] = toHsl(hex);
  const [r, g, b] = values.map((v) => v / 255),
    k = 1 - Math.max(r, g, b);
  const cmyk =
    k === 1
      ? [0, 0, 0, 100]
      : [
          ((1 - r - k) / (1 - k)) * 100,
          ((1 - g - k) / (1 - k)) * 100,
          ((1 - b - k) / (1 - k)) * 100,
          k * 100,
        ];
  const name =
    s < 0.1
      ? l < 0.2
        ? "Charcoal"
        : l > 0.9
          ? "Cloud"
          : "Slate"
      : [
          "Coral",
          "Amber",
          "Lime",
          "Leaf",
          "Mint",
          "Teal",
          "Sky",
          "Blue",
          "Indigo",
          "Violet",
          "Orchid",
          "Rose",
        ][Math.floor(((h + 15) % 360) / 30)];
  return {
    name,
    rgb: values,
    hsl: [Math.round(h), Math.round(s * 100), Math.round(l * 100)],
    cmyk: cmyk.map(Math.round),
  };
}
/** Alpha-weighted histogram + farthest-point seeding and bounded k-means. No hidden RGB leaks. */
export function extractPalette(pixels: Uint8ClampedArray, count = 5): string[] {
  const bins = new Map<number, { sum: number[]; weight: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const weight = pixels[i + 3] / 255;
    if (weight < 0.1) continue;
    const key = (pixels[i] >> 4) * 256 + (pixels[i + 1] >> 4) * 16 + (pixels[i + 2] >> 4);
    const bin = bins.get(key) ?? { sum: [0, 0, 0], weight: 0 };
    bin.weight += weight;
    for (let j = 0; j < 3; j++) bin.sum[j] += pixels[i + j] * weight;
    bins.set(key, bin);
  }
  const points = [...bins.values()]
    .map((b) => ({ rgb: b.sum.map((v) => v / b.weight), weight: b.weight }))
    .sort((a, b) => b.weight - a.weight);
  if (!points.length) return [];
  const distance = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  const centers = [points[0].rgb];
  while (centers.length < Math.min(Math.round(clamp(count, 2, 10)), points.length)) {
    let best = points[0],
      score = -1;
    for (const p of points) {
      const d = Math.min(...centers.map((c) => distance(p.rgb, c))) * Math.sqrt(p.weight);
      if (d > score) {
        score = d;
        best = p;
      }
    }
    if (score <= 0) break;
    centers.push(best.rgb);
  }
  let weights: number[] = [];
  for (let pass = 0; pass < 8; pass++) {
    const sums = centers.map(() => [0, 0, 0]);
    weights = centers.map(() => 0);
    for (const p of points) {
      let index = 0,
        best = Infinity;
      centers.forEach((c, i) => {
        const d = distance(p.rgb, c);
        if (d < best) {
          best = d;
          index = i;
        }
      });
      weights[index] += p.weight;
      for (let j = 0; j < 3; j++) sums[index][j] += p.rgb[j] * p.weight;
    }
    centers.forEach((_, i) => {
      if (weights[i]) centers[i] = sums[i].map((v) => v / weights[i]);
    });
  }
  return [
    ...new Set(
      centers
        .map((c, i) => ({ hex: fromRgb(c), weight: weights[i] }))
        .sort((a, b) => b.weight - a.weight)
        .map((c) => c.hex),
    ),
  ];
}
export const CURATED_PALETTES = [
  {
    name: "Terracotta",
    tags: "warm earth editorial อบอุ่น",
    colors: ["#3d2824", "#a44932", "#de9770", "#e8c7a2", "#f5ede2"],
  },
  {
    name: "Forest",
    tags: "nature green calm ธรรมชาติ",
    colors: ["#173b32", "#37664c", "#799765", "#b7c6a4", "#f0f1df"],
  },
  {
    name: "After Hours",
    tags: "dark luxury gold หรู",
    colors: ["#191b27", "#4b475d", "#a49483", "#d7b76b", "#f4ecdc"],
  },
  {
    name: "Electric",
    tags: "vibrant tech bold สดใส",
    colors: ["#171d36", "#434cc9", "#985aea", "#ec798e", "#fcdb79"],
  },
  {
    name: "Ocean",
    tags: "blue water clean ฟ้า",
    colors: ["#123952", "#176e8c", "#4ba3ac", "#b4dad1", "#f2f7ee"],
  },
  {
    name: "Rose Paper",
    tags: "pink pastel soft ชมพู",
    colors: ["#502d3f", "#955f76", "#ca98aa", "#ead0d5", "#fcf1ea"],
  },
  {
    name: "Citrus",
    tags: "orange yellow summer ส้ม",
    colors: ["#34402f", "#779341", "#d4bf48", "#e89436", "#fff4d6"],
  },
  {
    name: "Ink & Cream",
    tags: "neutral minimal black ขาวดำ",
    colors: ["#232529", "#62615d", "#a9a497", "#d9d2c4", "#f8f4e9"],
  },
  {
    name: "Blueberry",
    tags: "purple indigo cool ม่วง",
    colors: ["#272140", "#4a3e76", "#8079a8", "#b9b3d4", "#f0eefa"],
  },
  {
    name: "Market Day",
    tags: "red playful promo แดง",
    colors: ["#38282b", "#b73140", "#e97a52", "#f4c779", "#faf0d9"],
  },
  {
    name: "Coastal",
    tags: "teal beige beach ทะเล",
    colors: ["#284749", "#577d7b", "#91b2a9", "#d9c9ac", "#fbf6e8"],
  },
  {
    name: "Mono Blue",
    tags: "monochrome blue น้ำเงิน",
    colors: ["#142b4f", "#285289", "#5084bb", "#a0bfdf", "#edf3fb"],
  },
] as const;
