/**
 * Color Swatches, History, and Eyedropper API integration.
 */

const COLOR_HISTORY_KEY = "artshift:color-history";
const MAX_HISTORY = 12;

export const DEFAULT_COLOR_HISTORY = [
  "#1e293b",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ffffff",
  "#f1f5f9",
];

export const BRAND_PALETTES = [
  {
    name: "Warm Editorial",
    colors: ["#292524", "#78716c", "#b45309", "#fef3c7", "#fbf8f3"],
  },
  {
    name: "Vibrant Promo",
    colors: ["#1e293b", "#dc2626", "#ea580c", "#ffedd5", "#fff7ed"],
  },
  {
    name: "Luxury Dark",
    colors: ["#fafafa", "#a1a1aa", "#f59e0b", "#451a03", "#18181b"],
  },
  {
    name: "Modern Pastel",
    colors: ["#0f172a", "#38bdf8", "#818cf8", "#f0fdf4", "#f8fafc"],
  },
];

let memoryHistory: string[] = [...DEFAULT_COLOR_HISTORY];

export function getColorHistory(): string[] {
  if (typeof window === "undefined") return memoryHistory;
  try {
    const raw = localStorage.getItem(COLOR_HISTORY_KEY);
    if (!raw) return memoryHistory;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryHistory = parsed;
      return parsed;
    }
  } catch (_e) {
    // fallback to memory
  }
  return memoryHistory;
}

export function addColorToHistory(color: string): string[] {
  if (!color || color === "transparent") return memoryHistory;
  const normalized = color.toLowerCase().trim();

  // Deduplicate and insert at start
  const next = [normalized, ...memoryHistory.filter((c) => c.toLowerCase() !== normalized)].slice(
    0,
    MAX_HISTORY,
  );
  memoryHistory = next;

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(next));
    } catch (_e) {
      // ignore quota errors
    }
  }

  return next;
}

export function clearColorHistory(): void {
  memoryHistory = [...DEFAULT_COLOR_HISTORY];
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(COLOR_HISTORY_KEY);
    } catch (_e) {
      // ignore
    }
  }
}

export function supportsEyedropper(): boolean {
  return typeof window !== "undefined" && "EyeDropper" in window;
}

export async function openEyedropper(): Promise<string | null> {
  if (!supportsEyedropper()) return null;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: native EyeDropper API
    const eyeDropper = new (window as any).EyeDropper();
    const result = await eyeDropper.open();
    if (result?.sRGBHex) {
      addColorToHistory(result.sRGBHex);
      return result.sRGBHex;
    }
  } catch (_e) {
    // User cancelled eyedropper
  }
  return null;
}

/**
 * Convert any CSS color (hex, rgb, rgba, etc.) into { r, g, b, a }.
 */
export function parseCssColor(color: string): { r: number; g: number; b: number; a: number } {
  if (!color || color === "transparent" || color === "none") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const clean = color.trim().toLowerCase();
  if (clean.startsWith("#")) {
    const hex = clean.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16) / 255,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  const rgbMatch = clean.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (rgbMatch) {
    return {
      r: Math.round(parseFloat(rgbMatch[1])),
      g: Math.round(parseFloat(rgbMatch[2])),
      b: Math.round(parseFloat(rgbMatch[3])),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

/**
 * Given two gradient stop colors (where one or both might be "transparent"),
 * resolve both stops to non-muddy RGBA strings so that fading to transparent preserves the hue.
 */
export function resolveGradientStops(colors: [string, string] | string[]): [string, string] {
  const c0 = colors[0] ?? "#6366f1";
  const c1 = colors[1] ?? "#a855f7";
  const isC0Trans = !c0 || c0 === "transparent" || c0 === "none";
  const isC1Trans = !c1 || c1 === "transparent" || c1 === "none";

  if (isC0Trans && isC1Trans) {
    return ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"];
  }

  if (isC0Trans) {
    const p1 = parseCssColor(c1);
    return [`rgba(${p1.r}, ${p1.g}, ${p1.b}, 0)`, `rgba(${p1.r}, ${p1.g}, ${p1.b}, ${p1.a})`];
  }

  if (isC1Trans) {
    const p0 = parseCssColor(c0);
    return [`rgba(${p0.r}, ${p0.g}, ${p0.b}, ${p0.a})`, `rgba(${p0.r}, ${p0.g}, ${p0.b}, 0)`];
  }

  return [c0, c1];
}

/**
 * Given any array of gradient stops (2 or more), resolve all stops (including any transparent stops)
 * to non-muddy RGBA strings so that transitions preserve vibrant hues and smooth alpha fading.
 */
export function resolveMultiGradientStops(
  rawColors: string[],
  rawOffsets?: number[],
): Array<{ color: string; offset: number; rawColor: string }> {
  if (!rawColors || rawColors.length === 0) {
    return [
      { color: "rgba(99, 102, 241, 1)", offset: 0, rawColor: "#6366f1" },
      { color: "rgba(168, 85, 247, 1)", offset: 1, rawColor: "#a855f7" },
    ];
  }

  const n = rawColors.length;
  // Build initial stop list
  const stops = rawColors.map((c, i) => {
    let off = rawOffsets && rawOffsets[i] !== undefined ? rawOffsets[i] : n <= 1 ? 0 : i / (n - 1);
    off = Math.max(0, Math.min(1, off));
    return { rawColor: c, offset: off };
  });

  // Sort by offset
  stops.sort((a, b) => a.offset - b.offset);

  // Helper to test transparency
  const isTrans = (c: string) => !c || c === "transparent" || c === "none";

  return stops.map((s, i) => {
    if (isTrans(s.rawColor)) {
      // Find nearest non-transparent neighbor
      let neighborColor: string | null = null;
      // Search left first
      for (let j = i - 1; j >= 0; j--) {
        if (!isTrans(stops[j].rawColor)) {
          neighborColor = stops[j].rawColor;
          break;
        }
      }
      // If none on left, search right
      if (!neighborColor) {
        for (let j = i + 1; j < stops.length; j++) {
          if (!isTrans(stops[j].rawColor)) {
            neighborColor = stops[j].rawColor;
            break;
          }
        }
      }

      if (neighborColor) {
        const p = parseCssColor(neighborColor);
        return {
          color: `rgba(${p.r}, ${p.g}, ${p.b}, 0)`,
          offset: s.offset,
          rawColor: s.rawColor,
        };
      }
      return { color: "rgba(0, 0, 0, 0)", offset: s.offset, rawColor: s.rawColor };
    }

    const p = parseCssColor(s.rawColor);
    return {
      color: `rgba(${p.r}, ${p.g}, ${p.b}, ${p.a})`,
      offset: s.offset,
      rawColor: s.rawColor,
    };
  });
}
