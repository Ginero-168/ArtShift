import type {
  EngineElement,
  EngineSlide,
  SemanticImportance,
  SemanticMetadata,
  SemanticRole,
} from "./types";

export type SmartArrangeOptions = {
  scope?: "selected" | "slide";
  selectedIds?: string[];
  goal?: "hierarchy" | "fill" | "fix-overlap";
  density?: "compact" | "comfortable" | "airy";
  margin?: number;
  gap?: number;
  includeDecorations?: boolean;
};

export type SmartArrangePatch = { id: string; patch: Partial<EngineElement> };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function inferSemanticMetadata(element: EngineElement): SemanticMetadata {
  const text = element.type === "text" ? element.text.trim().toLowerCase() : "";
  const name = `${element.name ?? ""} ${element.builderKind ?? ""}`.toLowerCase();
  const isSubtitle =
    element.type === "text" &&
    (element.textPreset === "subtitle" || /subtitle|subheadline|kicker/.test(name));
  let role: SemanticRole = "unknown";

  if (/logo|brand/.test(name)) role = "logo";
  else if (/background|backdrop/.test(name)) role = "background";
  else if (
    element.type === "image" ||
    element.type === "frame" ||
    /image|photo|media|hero/.test(name)
  )
    role = "media";
  else if (/button|cta|call.?to.?action/.test(name)) role = "cta";
  else if (/headline|title|heading/.test(name) || isSubtitle)
    role = isSubtitle ? "subheadline" : "headline";
  else if (text || element.type === "text") role = "body";
  else if (element.type !== "rect" && element.type !== "ellipse") role = "decoration";

  const importance: SemanticImportance =
    role === "headline" || role === "media" || role === "logo" || role === "cta"
      ? "primary"
      : role === "decoration" || role === "background"
        ? "supporting"
        : "secondary";

  return {
    role,
    importance,
    constraints: {
      preserveAspectRatio: element.type === "image" || element.type === "frame",
    },
  };
}

export function semanticFor(element: EngineElement): SemanticMetadata {
  return element.semantic ?? inferSemanticMetadata(element);
}

export function solveSmartArrange(
  slide: EngineSlide,
  options: SmartArrangeOptions = {},
): SmartArrangePatch[] {
  const margin = options.margin ?? Math.round(Math.min(slide.width, slide.height) * 0.06);
  const densityGap = { compact: 0.3, comfortable: 0.6, airy: 1 }[options.density ?? "comfortable"];
  const gap = options.gap ?? Math.round(margin * densityGap);
  const candidates = slide.elements.filter(
    (element) => !element.isDeleted && !element.hidden && !element.locked,
  );
  const scoped =
    options.scope === "selected" && options.selectedIds?.length
      ? candidates.filter((element) => options.selectedIds?.includes(element.id))
      : candidates;
  const movable = scoped.filter(
    (element) => options.includeDecorations || semanticFor(element).role !== "decoration",
  );

  if (!movable.length) return [];
  if (options.goal === "fix-overlap") return fixOverlaps(slide, movable, gap);
  if (options.goal === "fill") return fillGrid(slide, movable, margin, gap);

  const primary = movable.filter((element) => semanticFor(element).importance === "primary");
  const others = movable.filter((element) => !primary.includes(element));
  const patches: SmartArrangePatch[] = [];
  const usableW = Math.max(1, slide.width - margin * 2);
  const usableH = Math.max(1, slide.height - margin * 2);
  const primaryElement = primary[0];

  if (primaryElement) {
    const meta = semanticFor(primaryElement);
    const maxW = Math.min(usableW * 0.62, meta.constraints?.maxWidth ?? usableW);
    const size = fitWithin(
      primaryElement.width,
      primaryElement.height,
      maxW,
      usableH * 0.72,
      Boolean(meta.constraints?.preserveAspectRatio),
    );
    patches.push({
      id: primaryElement.id,
      patch: {
        x: margin,
        y: Math.round((slide.height - size.height) / 2),
        width: Math.round(size.width),
        height: Math.round(size.height),
      },
    });
  }

  const primaryWidth = primaryElement
    ? Math.min(usableW * 0.62, Math.max(primaryElement.width, usableW * 0.62))
    : 0;
  const columnX = primaryElement ? margin + primaryWidth + gap : margin;
  const columnW = Math.max(1, slide.width - columnX - margin);
  const totalH =
    others.reduce((sum, element) => sum + Math.max(24, element.height), 0) +
    Math.max(0, others.length - 1) * gap;
  let y = Math.max(margin, Math.round((slide.height - Math.min(totalH, usableH)) / 2));

  for (const element of others) {
    const meta = semanticFor(element);
    const size = fitWithin(
      element.width,
      element.height,
      Math.min(columnW, meta.constraints?.maxWidth ?? columnW),
      Math.min(usableH, meta.constraints?.maxHeight ?? usableH),
      Boolean(meta.constraints?.preserveAspectRatio),
    );
    if (y + size.height > slide.height - margin) y = margin;
    patches.push({
      id: element.id,
      patch: {
        x: Math.round(columnX),
        y: Math.round(y),
        width: Math.round(size.width),
        height: Math.round(size.height),
      },
    });
    y += Math.round(size.height) + gap;
  }
  return patches;
}

function fitWithin(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number,
  preserveAspectRatio: boolean,
): { width: number; height: number } {
  const safeWidth = Math.max(1, originalWidth);
  const safeHeight = Math.max(1, originalHeight);
  if (!preserveAspectRatio) {
    return {
      width: clamp(safeWidth, 1, Math.max(1, maxWidth)),
      height: clamp(safeHeight, 1, Math.max(1, maxHeight)),
    };
  }
  const ratio = safeWidth / safeHeight;
  const width = Math.min(Math.max(1, maxWidth), Math.max(1, maxHeight) * ratio);
  return { width, height: Math.min(Math.max(1, maxHeight), width / ratio) };
}

function fixOverlaps(
  slide: EngineSlide,
  elements: EngineElement[],
  gap: number,
): SmartArrangePatch[] {
  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  return [...elements]
    .sort((a, b) => a.z - b.z)
    .flatMap((element) => {
      let x = clamp(element.x, 0, Math.max(0, slide.width - element.width));
      let y = clamp(element.y, 0, Math.max(0, slide.height - element.height));
      let attempts = 0;
      while (
        attempts < elements.length * 4 &&
        placed.some(
          (place) =>
            x < place.x + place.width + gap &&
            x + element.width + gap > place.x &&
            y < place.y + place.height + gap &&
            y + element.height + gap > place.y,
        )
      ) {
        x += gap + 1;
        if (x + element.width > slide.width) {
          x = 0;
          y += gap + element.height;
        }
        if (y + element.height > slide.height) {
          x = 0;
          y = 0;
        }
        attempts += 1;
      }
      const patch = x === element.x && y === element.y ? null : { id: element.id, patch: { x, y } };
      placed.push({ x, y, width: element.width, height: element.height });
      return patch ? [patch] : [];
    });
}

function fillGrid(
  slide: EngineSlide,
  elements: EngineElement[],
  margin: number,
  gap: number,
): SmartArrangePatch[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(elements.length)));
  const cellWidth = Math.max(
    1,
    Math.floor((slide.width - margin * 2 - gap * (columns - 1)) / columns),
  );
  const rows = Math.ceil(elements.length / columns);
  const cellHeight = Math.max(1, Math.floor((slide.height - margin * 2 - gap * (rows - 1)) / rows));
  return elements.map((element, index) => {
    const meta = semanticFor(element);
    const size = fitWithin(
      element.width,
      element.height,
      cellWidth,
      cellHeight,
      Boolean(meta.constraints?.preserveAspectRatio),
    );
    return {
      id: element.id,
      patch: {
        x: Math.round(
          margin + (index % columns) * (cellWidth + gap) + (cellWidth - size.width) / 2,
        ),
        y: Math.round(
          margin +
            Math.floor(index / columns) * (cellHeight + gap) +
            (cellHeight - size.height) / 2,
        ),
        width: Math.round(size.width),
        height: Math.round(size.height),
      },
    };
  });
}

export function validateSmartIntent(input: unknown): SmartArrangeOptions | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (value.action !== "smart_arrange") return null;
  const allowed = new Set([
    "action",
    "margin",
    "gap",
    "includeDecorations",
    "scope",
    "goal",
    "density",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;

  const options: SmartArrangeOptions = {};
  if (value.margin !== undefined) {
    if (typeof value.margin !== "number" || !Number.isFinite(value.margin)) return null;
    options.margin = clamp(value.margin, 0, 500);
  }
  if (value.gap !== undefined) {
    if (typeof value.gap !== "number" || !Number.isFinite(value.gap)) return null;
    options.gap = clamp(value.gap, 0, 300);
  }
  if (value.includeDecorations !== undefined && typeof value.includeDecorations !== "boolean")
    return null;
  if (value.scope !== undefined && value.scope !== "selected" && value.scope !== "slide")
    return null;
  if (
    value.goal !== undefined &&
    !["hierarchy", "fill", "fix-overlap"].includes(value.goal as string)
  )
    return null;
  if (
    value.density !== undefined &&
    !["compact", "comfortable", "airy"].includes(value.density as string)
  )
    return null;

  options.includeDecorations = value.includeDecorations as boolean | undefined;
  options.scope = value.scope as SmartArrangeOptions["scope"];
  options.goal = value.goal as SmartArrangeOptions["goal"];
  options.density = value.density as SmartArrangeOptions["density"];
  return options;
}

export function planSmartArrangeIntent(
  input: unknown,
  slide: EngineSlide,
): SmartArrangePatch[] | null {
  const options = validateSmartIntent(input);
  return options ? solveSmartArrange(slide, options) : null;
}
