// Curated list of Thai-capable Google Fonts used across the editor.
//
// Each entry exposes two names: a short human-readable `family` for the picker
// UI, and `cssFamily` — the CSS font-family string we store on TextObject
// (and feed straight into Konva, the canvas renderer, the PPTX exporter, and
// HTML clipboard output). The fallback chain always ends in a pan-Thai
// system font so text stays legible before Google Fonts finish streaming in.

export type ThaiFontDef = {
  /** Human-readable family name (matches Google Fonts). */
  family: string;
  /** CSS font-family value with Thai-aware fallbacks. */
  cssFamily: string;
  /** Weights we ask Google Fonts to deliver. */
  weights: number[];
  /** Rough category for UI grouping. */
  category: "sans" | "serif" | "display" | "handwriting";
};

const THAI_FALLBACK = "'Noto Sans Thai', 'Sarabun', system-ui, sans-serif";

export const THAI_FONTS: ThaiFontDef[] = [
  {
    family: "Sarabun",
    cssFamily: `'Sarabun', ${THAI_FALLBACK}`,
    weights: [400, 500, 700],
    category: "sans",
  },
  {
    family: "Prompt",
    cssFamily: `'Prompt', ${THAI_FALLBACK}`,
    weights: [400, 500, 700],
    category: "sans",
  },
  {
    family: "Kanit",
    cssFamily: `'Kanit', ${THAI_FALLBACK}`,
    weights: [400, 500, 700],
    category: "sans",
  },
  {
    family: "Bai Jamjuree",
    cssFamily: `'Bai Jamjuree', ${THAI_FALLBACK}`,
    weights: [400, 500, 700],
    category: "sans",
  },
  {
    family: "Chakra Petch",
    cssFamily: `'Chakra Petch', ${THAI_FALLBACK}`,
    weights: [400, 500, 700],
    category: "sans",
  },
  {
    family: "Chonburi",
    cssFamily: `'Chonburi', ${THAI_FALLBACK}`,
    weights: [400],
    category: "display",
  },
  {
    family: "Mali",
    cssFamily: `'Mali', ${THAI_FALLBACK}`,
    weights: [400, 500, 700],
    category: "handwriting",
  },
];

export const DEFAULT_THAI_FONT_FAMILY = THAI_FONTS[0].cssFamily;

/** Lookup by cssFamily (tolerates legacy/partial strings). */
export function findThaiFont(cssFamily: string): ThaiFontDef | undefined {
  if (!cssFamily) return undefined;
  const needle = cssFamily.toLowerCase();
  return THAI_FONTS.find(
    (f) => needle === f.cssFamily.toLowerCase() || needle.includes(f.family.toLowerCase()),
  );
}

// ——— Runtime loader ———
//
// We inject exactly one <link rel="stylesheet"> with every Thai family + Thai
// subset in a single request, then broadcast a `loadingdone` signal so Konva
// text nodes can re-measure glyphs with the real font metrics.

let injected = false;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/**
 * Inject the Google Fonts stylesheet once. Safe to call on every editor mount.
 * No-ops on the server and on repeat calls.
 */
export function loadThaiFonts() {
  if (injected || typeof document === "undefined") return;
  injected = true;

  // Preconnect improves first-font latency by overlapping the TLS handshake
  // with HTML parsing.
  for (const href of ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    if (href.includes("gstatic")) link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  const families = THAI_FONTS.map(
    (f) =>
      `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@${f.weights.join(";")}`,
  ).join("&");
  const href = `https://fonts.googleapis.com/css2?${families}&subset=thai&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.mightyFonts = "thai";
  document.head.appendChild(link);

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && typeof fonts.addEventListener === "function") {
    fonts.addEventListener("loadingdone", () => notify());
  }
}

/** Subscribe to "fonts finished loading" events (for Konva remeasure). */
export function subscribeFontsLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Best-effort: ask the browser to have `family` at `size` ready. Returns a
 * promise that resolves whether or not the font actually loaded (we never
 * want to block rendering on a network hiccup).
 */
export function ensureFontReady(cssFamily: string, size: number): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== "function") return Promise.resolve();
  try {
    return fonts.load(`${Math.round(size)}px ${cssFamily}`).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}
