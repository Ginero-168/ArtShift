import { parseCssColor, resolveMultiGradientStops } from "../color/swatches";
import { getFramePolaroidCutout, getFrameShapeSVGPath } from "./frameMask";
import { strokeOutlineFor } from "./freehand";
import { getCached } from "./imageCache";
import { getRenderableElements } from "./layers";
import { layoutText, parseRichText } from "./textLayout";
import type {
  ArrowElement,
  ArrowHead,
  EngineDoc,
  EngineElement,
  EngineSlide,
  VectorPathElement,
  VectorPathNode,
} from "./types";

export function serializeSlideToSVG(slide: EngineSlide): string {
  const ordered = getRenderableElements(slide);
  const frames = ordered.filter(
    (element): element is Extract<EngineElement, { type: "frame" }> => element.type === "frame",
  );
  const definitions = [
    ...ordered.flatMap((element) => elementDefinition(element)),
    ...frames.map((frame) => {
      const d = getFrameShapeSVGPath(frame.shape, frame.width, frame.height, frame.cornerRadius);
      return `<clipPath id="frame-${escapeId(frame.id)}" clipPathUnits="userSpaceOnUse"><path d="${d}" transform="translate(${n(frame.x)}, ${n(frame.y)})"/></clipPath>`;
    }),
  ].join("");
  const content = ordered
    .map((element) => {
      const markup = serializeElement(element);
      const parentFrame = frames.find(
        (candidate) => candidate.id !== element.id && candidate.childIds.includes(element.id),
      );
      return parentFrame
        ? `<g clip-path="url(#frame-${escapeId(parentFrame.id)})">${markup}</g>`
        : markup;
    })
    .join("");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(slide.width)}" height="${n(slide.height)}" viewBox="0 0 ${n(slide.width)} ${n(slide.height)}">`,
    `<title>${escapeXml(slide.name)}</title>`,
    `<defs>${definitions}</defs>`,
    `<rect width="100%" height="100%" fill="${escapeXml(slide.background)}"/>`,
    content,
    `</svg>`,
  ].join("");
}

export function exportCurrentSlideSVG(slide: EngineSlide) {
  downloadSVG(slide, `${slugify(slide.name || "artwork")}.svg`);
}

export function exportAllSVG(doc: EngineDoc) {
  doc.slides.forEach((slide, index) => {
    downloadSVG(slide, `${String(index + 1).padStart(2, "0")}-${slugify(slide.name)}.svg`);
  });
}

function downloadSVG(slide: EngineSlide, filename: string) {
  const blob = new Blob([serializeSlideToSVG(slide)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function serializeElement(element: EngineElement): string {
  const transform = `translate(${n(element.x)} ${n(element.y)}) rotate(${n((element.angle * 180) / Math.PI)} ${n(element.width / 2)} ${n(element.height / 2)})`;
  const style = `opacity:${n(element.opacity)};mix-blend-mode:${element.blendMode ?? "normal"}`;
  return `<g id="object-${escapeId(element.id)}" transform="${transform}" style="${style}">${serializeLocalElement(element)}</g>`;
}

function serializeLocalElement(element: EngineElement): string {
  const fill = fillValue(element);
  const paint = `fill="${fill}" stroke="${escapeXml(element.strokeColor)}" stroke-width="${n(element.strokeWidth)}" stroke-dasharray="${strokeDash(element)}"`;
  switch (element.type) {
    case "rect":
      return `<rect width="${n(element.width)}" height="${n(element.height)}" rx="${n(element.cornerRadius)}" ${paint}/>`;
    case "ellipse":
      return `<ellipse cx="${n(element.width / 2)}" cy="${n(element.height / 2)}" rx="${n(element.width / 2)}" ry="${n(element.height / 2)}" ${paint}/>`;
    case "diamond":
      return `<polygon points="${n(element.width / 2)},0 ${n(element.width)},${n(element.height / 2)} ${n(element.width / 2)},${n(element.height)} 0,${n(element.height / 2)}" ${paint}/>`;
    case "triangle":
      return `<polygon points="${n(element.width / 2)},0 ${n(element.width)},${n(element.height)} 0,${n(element.height)}" ${paint}/>`;
    case "hexagon":
      return `<polygon points="${polygonPoints(6, element.width, element.height)}" ${paint}/>`;
    case "star":
      return `<polygon points="${starPoints(element.numPoints, element.width, element.height)}" ${paint}/>`;
    case "heart":
      return `<path d="M ${n(element.width / 2)} ${n(element.height * 0.25)} C ${n(element.width / 2)} ${n(element.height * 0.05)},${n(element.width * 0.75)} 0,${n(element.width * 0.75)} ${n(element.height * 0.2)} C ${n(element.width * 0.75)} ${n(element.height * 0.45)},${n(element.width / 2)} ${n(element.height * 0.6)},${n(element.width / 2)} ${n(element.height * 0.75)} C ${n(element.width / 2)} ${n(element.height * 0.6)},${n(element.width * 0.25)} ${n(element.height * 0.45)},${n(element.width * 0.25)} ${n(element.height * 0.2)} C ${n(element.width * 0.25)} 0,${n(element.width / 2)} ${n(element.height * 0.05)},${n(element.width / 2)} ${n(element.height * 0.25)} Z" ${paint}/>`;
    case "plus":
      return `<path d="${plusPath(element.width, element.height, element.crossThickness)}" ${paint}/>`;
    case "line":
      return `<polyline points="${element.points.map((point) => `${n(point[0])},${n(point[1])}`).join(" ")}" fill="none" stroke="${escapeXml(element.strokeColor)}" stroke-width="${n(element.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "arrow":
      return serializeArrow(element);
    case "freedraw":
      return `<polygon points="${strokeOutlineFor(element)
        .map((point) => `${n(point[0])},${n(point[1])}`)
        .join(" ")}" fill="${escapeXml(element.strokeColor)}"/>`;
    case "path":
      return `<path d="${vectorPathData(element)}" fill-rule="${element.fillRule}" ${paint}/>`;
    case "text":
      return serializeText(element);
    case "image":
      return serializeImage(element);
    case "bookMockup": {
      const href = getCached(element.fileId)?.dataURL ?? "";
      return href
        ? `<image href="${escapeXml(href)}" width="${n(element.width)}" height="${n(element.height)}" preserveAspectRatio="xMidYMid meet"/>`
        : `<rect width="${n(element.width)}" height="${n(element.height)}" fill="#e5e7eb"/>`;
    }
    case "frame": {
      const d = getFrameShapeSVGPath(
        element.shape,
        element.width,
        element.height,
        element.cornerRadius,
      );
      const strokeMarkup =
        element.strokeWidth > 0 && element.shape !== "polaroid"
          ? `<path d="${d}" fill="none" stroke="${escapeXml(element.strokeColor)}" stroke-width="${n(element.strokeWidth)}"/>`
          : "";
      if (element.shape === "polaroid") {
        const cutout = getFramePolaroidCutout(element.width, element.height);
        const cardMarkup = `<rect width="${n(element.width)}" height="${n(element.height)}" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>`;
        if (element.imageFileId) {
          const href = getCached(element.imageFileId)?.dataURL ?? "";
          return `<g>${cardMarkup}<clipPath id="local-frame-${escapeId(element.id)}"><path d="${d}"/></clipPath><image href="${escapeXml(href)}" x="${n(cutout.x)}" y="${n(cutout.y)}" width="${n(cutout.width)}" height="${n(cutout.height)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#local-frame-${escapeId(element.id)})"/></g>`;
        }
        return cardMarkup;
      }
      if (element.imageFileId) {
        const href = getCached(element.imageFileId)?.dataURL ?? "";
        const rot = element.cropRotation ?? 0;
        const imgTransform =
          rot !== 0
            ? ` transform="rotate(${n(rot)} ${n(element.width / 2)} ${n(element.height / 2)})"`
            : "";
        if (element.feather && element.feather > 0) {
          const margin = Math.min(
            element.feather * 1.5,
            element.width * 0.45,
            element.height * 0.45,
          );
          const scaleX = (element.width - margin * 2) / element.width;
          const scaleY = (element.height - margin * 2) / element.height;
          const transform = `translate(${n(margin)} ${n(margin)}) scale(${n(scaleX)} ${n(scaleY)})`;
          return `<g><defs><filter id="local-feather-${escapeId(element.id)}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${n(margin * 0.25)}"/></filter><mask id="local-mask-${escapeId(element.id)}"><path d="${d}" transform="${transform}" fill="#ffffff" filter="url(#local-feather-${escapeId(element.id)})"/></mask></defs><image href="${escapeXml(href)}" width="${n(element.width)}" height="${n(element.height)}" preserveAspectRatio="xMidYMid slice"${imgTransform} mask="url(#local-mask-${escapeId(element.id)})"/>${strokeMarkup}</g>`;
        }
        return `<g><clipPath id="local-frame-${escapeId(element.id)}"><path d="${d}"/></clipPath><image href="${escapeXml(href)}" width="${n(element.width)}" height="${n(element.height)}" preserveAspectRatio="xMidYMid slice"${imgTransform} clip-path="url(#local-frame-${escapeId(element.id)})"/>${strokeMarkup}</g>`;
      }
      return strokeMarkup;
    }
  }
}

function serializeText(element: Extract<EngineElement, { type: "text" }>): string {
  const layout = layoutText(element);
  const anchor =
    element.textAlign === "center" ? "middle" : element.textAlign === "right" ? "end" : "start";
  const x =
    element.textAlign === "center"
      ? element.width / 2
      : element.textAlign === "right"
        ? element.width - layout.padding
        : layout.padding;
  let y = layout.padding;
  if (element.verticalAlign === "middle") y = (element.height - layout.contentHeight) / 2;
  if (element.verticalAlign === "bottom")
    y = element.height - layout.padding - layout.contentHeight;
  const lines = layout.lines
    .map((line, index) => {
      const text = `${line.bullet ? "• " : ""}${parseRichText(line.text)
        .map((segment) => segment.text)
        .join("")}`;
      return `<tspan x="${n(x)}" y="${n(y + index * layout.lineHeight)}">${escapeXml(text)}</tspan>`;
    })
    .join("");
  const weight = element.fontStyle.includes("bold") ? "700" : "400";
  const italic = element.fontStyle.includes("italic") ? "italic" : "normal";
  return `<text fill="${escapeXml(element.strokeColor)}" font-family="${escapeXml(element.fontFamily)}" font-size="${n(element.fontSize)}" font-weight="${weight}" font-style="${italic}" text-anchor="${anchor}" dominant-baseline="hanging">${lines}</text>`;
}

function serializeImage(element: Extract<EngineElement, { type: "image" }>): string {
  const href = getCached(element.fileId)?.dataURL ?? "";
  const retouch = (offsetX = 0, offsetY = 0) =>
    (element.rasterEdits ?? [])
      .map(
        (edit) =>
          `<image href="${escapeXml(edit.dataUrl)}" x="${n(edit.x + offsetX)}" y="${n(edit.y + offsetY)}" width="${n(edit.width)}" height="${n(edit.height)}" opacity="${n(edit.opacity)}" preserveAspectRatio="none"/>`,
      )
      .join("");
  const clip =
    element.mask && element.mask.shape !== "rect"
      ? ` clip-path="url(#mask-${escapeId(element.id)})"`
      : "";
  const filter = hasImageFilter(element) ? ` filter="url(#filter-${escapeId(element.id)})"` : "";
  const adjustmentData = element.adjustments
    ? ` data-artshift-adjustments="${escapeXml(JSON.stringify(element.adjustments))}"`
    : "";
  if (!href) {
    return `<g><rect width="${n(element.width)}" height="${n(element.height)}" fill="#e5e7eb"${clip}${filter}${adjustmentData}/>${retouch()}</g>`;
  }
  if (element.crop) {
    return `<svg width="${n(element.width)}" height="${n(element.height)}" viewBox="${n(element.crop.x)} ${n(element.crop.y)} ${n(element.crop.width)} ${n(element.crop.height)}" preserveAspectRatio="none"${clip}${filter}${adjustmentData}><image href="${escapeXml(href)}" width="${n(element.naturalWidth)}" height="${n(element.naturalHeight)}"/>${retouch(element.crop.x, element.crop.y)}</svg>`;
  }
  return `<g><image href="${escapeXml(href)}" width="${n(element.width)}" height="${n(element.height)}" preserveAspectRatio="none"${clip}${filter}${adjustmentData}/>${retouch()}</g>`;
}

function elementDefinition(element: EngineElement): string[] {
  const definitions: string[] = [];
  if (element.fillType === "linear" || element.fillType === "radial") {
    const rawColors = element.gradientColors ?? ["#6366f1", "#a855f7"];
    const stops = resolveMultiGradientStops(rawColors, element.gradientStops);
    const stopTags = stops
      .map((s) => {
        const p = parseCssColor(s.color);
        const hex = `#${Math.round(p.r).toString(16).padStart(2, "0")}${Math.round(p.g).toString(16).padStart(2, "0")}${Math.round(p.b).toString(16).padStart(2, "0")}`;
        const offsetPct = `${Math.round(s.offset * 100)}%`;
        const opacityAttr = p.a < 1 ? ` stop-opacity="${p.a.toFixed(2)}"` : "";
        return `<stop offset="${offsetPct}" stop-color="${escapeXml(hex)}"${opacityAttr}/>`;
      })
      .join("");

    if (element.fillType === "linear") {
      const angle = element.gradientAngle ?? 90;
      const rad = (angle * Math.PI) / 180;
      const x1 = Math.round(50 - Math.cos(rad) * 50);
      const y1 = Math.round(50 - Math.sin(rad) * 50);
      const x2 = Math.round(50 + Math.cos(rad) * 50);
      const y2 = Math.round(50 + Math.sin(rad) * 50);
      definitions.push(
        `<linearGradient id="gradient-${escapeId(element.id)}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopTags}</linearGradient>`,
      );
    } else {
      definitions.push(
        `<radialGradient id="gradient-${escapeId(element.id)}">${stopTags}</radialGradient>`,
      );
    }
  }
  if (element.type === "image" && element.mask && element.mask.shape !== "rect") {
    definitions.push(
      `<clipPath id="mask-${escapeId(element.id)}">${maskShape(element)}</clipPath>`,
    );
  }
  if (element.type === "image" && hasImageFilter(element)) {
    definitions.push(imageFilterDefinition(element));
  }
  return definitions;
}

function hasImageFilter(element: Extract<EngineElement, { type: "image" }>): boolean {
  return (
    (element.filterBlur ?? 0) > 0 ||
    Object.values(element.adjustments ?? {}).some((value) => value !== 0)
  );
}

function imageFilterDefinition(element: Extract<EngineElement, { type: "image" }>): string {
  const adjustments = element.adjustments ?? {};
  const exposure = 2 ** ((adjustments.exposure ?? 0) / 100);
  const contrast = 1 + (adjustments.contrast ?? 0) / 100;
  const intercept = 0.5 - contrast * 0.5;
  const saturation = Math.max(
    0,
    1 + ((adjustments.saturation ?? 0) + (adjustments.vibrance ?? 0) * 0.45) / 100,
  );
  const warmth = (adjustments.warmth ?? 0) / 100;
  const tint = (adjustments.tint ?? 0) / 100;
  const steps = [
    `<feComponentTransfer><feFuncR type="linear" slope="${n(exposure * contrast)}" intercept="${n(intercept)}"/><feFuncG type="linear" slope="${n(exposure * contrast)}" intercept="${n(intercept)}"/><feFuncB type="linear" slope="${n(exposure * contrast)}" intercept="${n(intercept)}"/></feComponentTransfer>`,
    `<feColorMatrix type="saturate" values="${n(saturation)}"/>`,
    `<feColorMatrix type="matrix" values="${n(1 + warmth * 0.16 - tint * 0.04)} 0 0 0 0 0 ${n(1 + tint * 0.12)} 0 0 0 0 0 ${n(1 - warmth * 0.16 - tint * 0.04)} 0 0 0 0 0 1 0"/>`,
  ];
  if ((element.filterBlur ?? 0) > 0) {
    steps.push(`<feGaussianBlur stdDeviation="${n(element.filterBlur ?? 0)}"/>`);
  }
  return `<filter id="filter-${escapeId(element.id)}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${steps.join("")}</filter>`;
}

function serializeArrow(element: ArrowElement): string {
  const line = `<polyline points="${element.points.map((point) => `${n(point[0])},${n(point[1])}`).join(" ")}" fill="none" stroke="${escapeXml(element.strokeColor)}" stroke-width="${n(element.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (element.points.length < 2) return line;
  const scale = element.arrowheadScale ?? 1;
  const start =
    element.startArrowhead === "none"
      ? ""
      : arrowheadMarkup(
          element.points[0],
          element.points[1],
          element.startArrowhead,
          element.strokeColor,
          element.strokeWidth,
          scale,
        );
  const last = element.points.length - 1;
  const end =
    element.endArrowhead === "none"
      ? ""
      : arrowheadMarkup(
          element.points[last],
          element.points[last - 1],
          element.endArrowhead,
          element.strokeColor,
          element.strokeWidth,
          scale,
        );
  return `${line}${start}${end}`;
}

function arrowheadMarkup(
  tip: [number, number],
  toward: [number, number],
  kind: ArrowHead,
  color: string,
  width: number,
  scale: number,
): string {
  const dx = tip[0] - toward[0];
  const dy = tip[1] - toward[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const size = Math.max(14, width * 6) * scale;
  const stroke = escapeXml(color);
  const point = (x: number, y: number) => `${n(x)},${n(y)}`;

  if (kind === "dot" || kind === "circle") {
    return `<circle cx="${n(tip[0])}" cy="${n(tip[1])}" r="${n(size / 3)}" fill="${kind === "dot" ? stroke : "none"}" stroke="${stroke}" stroke-width="${n(width)}"/>`;
  }
  if (kind === "bar") {
    return `<line x1="${n(tip[0] + px * size * 0.4)}" y1="${n(tip[1] + py * size * 0.4)}" x2="${n(tip[0] - px * size * 0.4)}" y2="${n(tip[1] - py * size * 0.4)}" stroke="${stroke}" stroke-width="${n(width)}" stroke-linecap="round"/>`;
  }
  if (kind === "diamond") {
    const middle = size * 0.5;
    const points = [
      point(tip[0], tip[1]),
      point(tip[0] - ux * middle + px * middle * 0.6, tip[1] - uy * middle + py * middle * 0.6),
      point(tip[0] - ux * middle * 2, tip[1] - uy * middle * 2),
      point(tip[0] - ux * middle - px * middle * 0.6, tip[1] - uy * middle - py * middle * 0.6),
    ].join(" ");
    return `<polygon points="${points}" fill="${stroke}"/>`;
  }

  const angle = Math.PI / 7;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const left = point(
    tip[0] - size * (ux * cosine + uy * sine),
    tip[1] - size * (uy * cosine - ux * sine),
  );
  const right = point(
    tip[0] - size * (ux * cosine - uy * sine),
    tip[1] - size * (uy * cosine + ux * sine),
  );
  const tipPoint = point(tip[0], tip[1]);
  if (kind === "arrow") {
    return `<path d="M ${left} L ${tipPoint} L ${right}" fill="none" stroke="${stroke}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<polygon points="${tipPoint} ${left} ${right}" fill="${kind === "triangle" ? stroke : "none"}" stroke="${stroke}" stroke-width="${n(width)}" stroke-linejoin="round"/>`;
}

function maskShape(element: Extract<EngineElement, { type: "image" }>): string {
  if (element.mask?.shape === "ellipse") {
    return `<ellipse cx="${n(element.width / 2)}" cy="${n(element.height / 2)}" rx="${n(element.width / 2)}" ry="${n(element.height / 2)}"/>`;
  }
  if (element.mask?.shape === "hexagon") {
    return `<polygon points="${polygonPoints(6, element.width, element.height)}"/>`;
  }
  return `<rect width="${n(element.width)}" height="${n(element.height)}" rx="${n(element.mask?.radius ?? 32)}"/>`;
}

function fillValue(element: EngineElement): string {
  return element.fillType === "linear" || element.fillType === "radial"
    ? `url(#gradient-${escapeId(element.id)})`
    : escapeXml(element.backgroundColor);
}

function vectorPathData(element: VectorPathElement): string {
  if (!element.nodes.length) return "";
  const point = (node: VectorPathNode) => ({
    x: node.x * element.width,
    y: node.y * element.height,
  });
  const first = point(element.nodes[0]);
  let data = `M ${n(first.x)} ${n(first.y)}`;
  const append = (from: VectorPathNode, to: VectorPathNode) => {
    const start = point(from);
    const end = point(to);
    if (from.out || to.in) {
      const out = from.out ?? [0, 0];
      const incoming = to.in ?? [0, 0];
      data += ` C ${n(start.x + out[0] * element.width)} ${n(start.y + out[1] * element.height)} ${n(end.x + incoming[0] * element.width)} ${n(end.y + incoming[1] * element.height)} ${n(end.x)} ${n(end.y)}`;
    } else data += ` L ${n(end.x)} ${n(end.y)}`;
  };
  for (let index = 1; index < element.nodes.length; index++)
    append(element.nodes[index - 1], element.nodes[index]);
  if (element.closed) {
    append(element.nodes.at(-1)!, element.nodes[0]);
    data += " Z";
  }
  return data;
}

function polygonPoints(count: number, width: number, height: number): string {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return `${n(width / 2 + Math.cos(angle) * (width / 2))},${n(height / 2 + Math.sin(angle) * (height / 2))}`;
  }).join(" ");
}

function starPoints(count: number, width: number, height: number): string {
  return Array.from({ length: count * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? 0.5 : 0.2;
    const angle = (Math.PI * index) / count - Math.PI / 2;
    return `${n(width / 2 + Math.cos(angle) * width * radius)},${n(height / 2 + Math.sin(angle) * height * radius)}`;
  }).join(" ");
}

function plusPath(width: number, height: number, thickness: number): string {
  const half = (Math.min(width, height) * thickness) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return `M ${n(cx - half)} 0 H ${n(cx + half)} V ${n(cy - half)} H ${n(width)} V ${n(cy + half)} H ${n(cx + half)} V ${n(height)} H ${n(cx - half)} V ${n(cy + half)} H 0 V ${n(cy - half)} H ${n(cx - half)} Z`;
}

function strokeDash(element: EngineElement): string {
  if (element.strokeStyle === "dashed") return "12 8";
  if (element.strokeStyle === "dotted") return "2 7";
  return "none";
}

function n(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "0";
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function escapeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙]+/gi, "-")
      .replace(/^-|-$/g, "") || "artwork"
  );
}
