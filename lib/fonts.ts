// Full Google Fonts catalog with Thai subset support.
//
// Source of truth: Google Fonts metadata (`subsets` includes `thai`), excluding
// Google Sans (corporate family, not a reliable third-party CSS2 target).
// Sarabun is always first — it is the product default typeface.

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

function def(
  family: string,
  category: ThaiFontDef["category"],
  weights: number[],
): ThaiFontDef {
  return {
    family,
    cssFamily: `'${family}', ${THAI_FALLBACK}`,
    weights,
    category,
  };
}

/** Complete Thai Google Fonts list — Sarabun first as the default. */
export const THAI_FONTS: ThaiFontDef[] = [
  def("Sarabun", "sans", [300, 400, 500, 600, 700]),
  def("Anuphan", "sans", [300, 400, 500, 600, 700]),
  def("Athiti", "sans", [300, 400, 500, 600, 700]),
  def("Bai Jamjuree", "sans", [300, 400, 500, 600, 700]),
  def("Chakra Petch", "sans", [300, 400, 500, 600, 700]),
  def("Charm", "handwriting", [400, 700]),
  def("Charmonman", "handwriting", [400, 700]),
  def("Chonburi", "display", [400]),
  def("Fahkwang", "sans", [300, 400, 500, 600, 700]),
  def("IBM Plex Sans Thai", "sans", [300, 400, 500, 600, 700]),
  def("IBM Plex Sans Thai Looped", "sans", [300, 400, 500, 600, 700]),
  def("Itim", "handwriting", [400]),
  def("K2D", "sans", [300, 400, 500, 600, 700]),
  def("Kanit", "sans", [300, 400, 500, 600, 700]),
  def("Kodchasan", "sans", [300, 400, 500, 600, 700]),
  def("KoHo", "sans", [300, 400, 500, 600, 700]),
  def("Krub", "sans", [300, 400, 500, 600, 700]),
  def("Maitree", "serif", [300, 400, 500, 600, 700]),
  def("Mali", "handwriting", [300, 400, 500, 600, 700]),
  def("Mitr", "sans", [300, 400, 500, 600, 700]),
  def("Niramit", "sans", [300, 400, 500, 600, 700]),
  def("Noto Sans Thai", "sans", [300, 400, 500, 600, 700]),
  def("Noto Sans Thai Looped", "sans", [300, 400, 500, 600, 700]),
  def("Noto Serif Thai", "serif", [300, 400, 500, 600, 700]),
  def("Pattaya", "sans", [400]),
  def("Playpen Sans Thai", "handwriting", [300, 400, 500, 600, 700]),
  def("Pridi", "serif", [300, 400, 500, 600, 700]),
  def("Prompt", "sans", [300, 400, 500, 600, 700]),
  def("Sriracha", "handwriting", [400]),
  def("Srisakdi", "display", [400, 700]),
  def("Taviraj", "serif", [300, 400, 500, 600, 700]),
  def("Thasadith", "sans", [400, 700]),
  def("Trirong", "serif", [300, 400, 500, 600, 700]),
];

export const DEFAULT_THAI_FONT_FAMILY = THAI_FONTS[0].cssFamily;

export const THAI_FONT_CATEGORY_LABELS: Record<ThaiFontDef["category"], string> = {
  sans: "Sans",
  serif: "Serif",
  display: "Display",
  handwriting: "Handwriting",
};

/** Lookup by cssFamily (tolerates legacy/partial strings). */
export function findThaiFont(cssFamily: string): ThaiFontDef | undefined {
  if (!cssFamily) return undefined;
  const needle = cssFamily.toLowerCase().trim();
  const exact = THAI_FONTS.find((f) => f.cssFamily.toLowerCase() === needle);
  if (exact) return exact;

  // Prefer the primary family token at the start: 'Sarabun', ... / Sarabun, ...
  const primaryMatch = needle.match(/^['"]?([^'",]+)['"]?/);
  const primary = primaryMatch?.[1]?.trim();
  if (primary) {
    const byPrimary = THAI_FONTS.find((f) => f.family.toLowerCase() === primary);
    if (byPrimary) return byPrimary;
  }

  // Legacy docs sometimes store a bare family name.
  return THAI_FONTS.find((f) => f.family.toLowerCase() === needle);
}

/** Normalize a stored fontFamily to a known catalog cssFamily (Sarabun fallback). */
export function resolveThaiFontCssFamily(cssFamily: string | undefined | null): string {
  if (!cssFamily) return DEFAULT_THAI_FONT_FAMILY;
  return findThaiFont(cssFamily)?.cssFamily ?? DEFAULT_THAI_FONT_FAMILY;
}

/** Cycle to the next Thai font in the catalog (used by quick Font action). */
export function nextThaiFontCssFamily(cssFamily: string | undefined | null): string {
  const current = findThaiFont(cssFamily ?? "");
  if (!current) return DEFAULT_THAI_FONT_FAMILY;
  const index = THAI_FONTS.findIndex((f) => f.family === current.family);
  const next = THAI_FONTS[(index + 1) % THAI_FONTS.length];
  return next.cssFamily;
}

// ——— Runtime loader ———
//
// Inject stylesheet link(s) covering every Thai family. URLs are chunked so we
// stay under typical browser URL limits. On `fonts.ready` / `loadingdone` we
// notify subscribers so Canvas2D can remeasure glyphs with real metrics.

let injected = false;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function buildFamilyQuery(fonts: readonly ThaiFontDef[]): string {
  return fonts
    .map(
      (f) =>
        `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@${f.weights.join(";")}`,
    )
    .join("&");
}

const FONT_CHUNK_SIZE = 8;

/**
 * Inject Google Fonts stylesheet(s) once. Safe to call on every mount.
 * No-ops on the server and on repeat calls.
 */
export function loadThaiFonts() {
  if (injected || typeof document === "undefined") return;
  injected = true;

  for (const href of ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]) {
    if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    if (href.includes("gstatic")) link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  for (let i = 0; i < THAI_FONTS.length; i += FONT_CHUNK_SIZE) {
    const chunk = THAI_FONTS.slice(i, i + FONT_CHUNK_SIZE);
    const href = `https://fonts.googleapis.com/css2?${buildFamilyQuery(chunk)}&display=swap`;
    const existing = document.head.querySelector(`link[data-artshift-fonts="${i}"]`);
    if (existing) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.artshiftFonts = String(i);
    document.head.appendChild(link);
  }

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts) {
    if (typeof fonts.addEventListener === "function") {
      fonts.addEventListener("loadingdone", () => notify());
    }
    if (typeof fonts.ready?.then === "function") {
      void fonts.ready.then(() => notify()).catch(() => undefined);
    }
  }
}

/** Subscribe to "fonts finished loading" events (for canvas remeasure). */
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
  const resolved = resolveThaiFontCssFamily(cssFamily);
  const family = findThaiFont(resolved)?.family ?? "Sarabun";
  try {
    return fonts.load(`${Math.round(size)}px "${family}"`).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}
