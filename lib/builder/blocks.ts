import {
  createBookmarkRibbon,
  createPriceTagBadge,
  createRibbonBanner,
  createScallopedSeal,
  createStarburstBadge,
} from "../engine/badgeGenerators";
import {
  createBookMockup,
  createDiamond,
  createEllipse,
  createFrame,
  createHeart,
  createHexagon,
  createImage,
  createPlus,
  createRect,
  createStar,
  createText,
  createTriangle,
  createVectorPath,
  createVectorPathFromWorldNodes,
} from "../engine/factory";
import {
  blockRectForPlacement,
  getHexGridDimensions,
  REFERENCE_HEX_GRID,
  remapBlockPlacement,
} from "../engine/hexLayout";
import { fitMediaElementToRect, isMediaElement } from "../engine/mediaLayout";
import type { BlockPlacement, EngineElement, TextElement } from "../engine/types";
import { convertElementToVectorPath } from "../engine/vectorPath";
import { createTextFromPreset, DEFAULT_TEXT_PRESET_ID, type TextPresetId } from "./textPresets";

export const BUILDER_BLOCK_MIME = "application/x-artshift-block";

export type BuilderBlockKind =
  | "text"
  | "frameCircle"
  | "framePolaroid"
  | "frameArch"
  | "frameHeart"
  | "frameStar"
  | "frameRounded"
  | "frameHexagon"
  | "shapeRect"
  | "shapeEllipse"
  | "shapeDiamond"
  | "shapeTriangle"
  | "shapeStar"
  | "shapeHexagon"
  | "shapeHeart"
  | "shapePlus"
  | "shapeLine"
  | "shapeArrow"
  | "shapeDoubleArrow"
  | "shapeDashedLine"
  | "shapeCurvedArrow"
  | "shapeFreedraw"
  | "shapePen"
  // Legacy kinds remain readable so existing documents do not break.
  | "heading"
  | "subtitle"
  | "synopsis"
  | "quote"
  | "author"
  | "metadata"
  | "price"
  | "salePrice"
  | "cta"
  | "badge"
  | "badgeStarburst"
  | "badgeFlash"
  | "badgeRibbon"
  | "badgeSeal"
  | "badgePriceTag"
  | "badgeBookmark"
  | "coverImage"
  | "bookMockup"
  | "supportingImage"
  | "panel"
  | "divider"
  | "spacer"
  | "accentShape"
  | "indexNumber";

export type BuilderBlockDefinition = {
  kind: BuilderBlockKind;
  label: string;
  description: string;
  category: "Content" | "Commerce" | "Media" | "Frames" | "Shapes" | "Lines" | "Structure";
  glyph: string;
  colSpan: number;
  rowSpan: number;
  minColSpan?: number;
  minRowSpan?: number;
};

export const BUILDER_BLOCKS: BuilderBlockDefinition[] = [
  {
    kind: "text",
    label: "Text",
    description: "Title, body, quote…",
    category: "Content",
    glyph: "T",
    colSpan: 7,
    rowSpan: 3,
    minColSpan: 4,
    minRowSpan: 2,
  },
  {
    kind: "cta",
    label: "CTA button",
    description: "Shop or learn more",
    category: "Commerce",
    glyph: "→",
    colSpan: 4,
    rowSpan: 1,
    minColSpan: 2,
  },
  {
    kind: "badge",
    label: "Promo badge",
    description: "Pill sticker · bestseller",
    category: "Commerce",
    glyph: "★",
    colSpan: 3,
    rowSpan: 1,
    minColSpan: 2,
  },
  {
    kind: "badgeStarburst",
    label: "Sale Starburst",
    description: "16-pt starburst sale badge",
    category: "Commerce",
    glyph: "💥",
    colSpan: 4,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "badgeFlash",
    label: "Flash Burst",
    description: "24-pt flash sale burst",
    category: "Commerce",
    glyph: "⚡",
    colSpan: 4,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "badgeRibbon",
    label: "Ribbon Banner",
    description: "Folded bestseller banner",
    category: "Commerce",
    glyph: "🎗️",
    colSpan: 6,
    rowSpan: 2,
    minColSpan: 3,
    minRowSpan: 1,
  },
  {
    kind: "badgeSeal",
    label: "Award Seal",
    description: "Scalloped quality seal",
    category: "Commerce",
    glyph: "💮",
    colSpan: 4,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "badgePriceTag",
    label: "Price Tag",
    description: "Chamfered price tag badge",
    category: "Commerce",
    glyph: "🏷️",
    colSpan: 4,
    rowSpan: 3,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "badgeBookmark",
    label: "Bookmark Ribbon",
    description: "Hanging ribbon tag",
    category: "Commerce",
    glyph: "🔖",
    colSpan: 3,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "bookMockup",
    label: "3D book",
    description: "Editable camera and light",
    category: "Content",
    glyph: "📘",
    colSpan: 6,
    rowSpan: 7,
    minColSpan: 3,
    minRowSpan: 4,
  },
  {
    kind: "supportingImage",
    label: "Photo",
    description: "Supporting visual",
    category: "Content",
    glyph: "🖼️",
    colSpan: 6,
    rowSpan: 4,
    minColSpan: 3,
    minRowSpan: 2,
  },
  {
    kind: "frameCircle",
    label: "Circle Frame",
    description: "Mask photo into circle",
    category: "Frames",
    glyph: "◎",
    colSpan: 4,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "framePolaroid",
    label: "Polaroid Frame",
    description: "Classic photo card frame",
    category: "Frames",
    glyph: "🖼",
    colSpan: 4,
    rowSpan: 5,
    minColSpan: 2,
    minRowSpan: 3,
  },
  {
    kind: "frameArch",
    label: "Arch Frame",
    description: "Curved architectural arch",
    category: "Frames",
    glyph: "∩",
    colSpan: 4,
    rowSpan: 5,
    minColSpan: 2,
    minRowSpan: 3,
  },
  {
    kind: "frameHeart",
    label: "Heart Frame",
    description: "Romantic heart mask",
    category: "Frames",
    glyph: "♥",
    colSpan: 4,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "frameStar",
    label: "Star Frame",
    description: "5-point star mask",
    category: "Frames",
    glyph: "★",
    colSpan: 4,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "frameRounded",
    label: "Rounded Frame",
    description: "Soft corner photo mask",
    category: "Frames",
    glyph: "▢",
    colSpan: 5,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "frameHexagon",
    label: "Hexagon Frame",
    description: "Geometric hexagon mask",
    category: "Frames",
    glyph: "⬡",
    colSpan: 4,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "shapeRect",
    label: "Rectangle",
    description: "Panel or card",
    category: "Shapes",
    glyph: "□",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapeEllipse",
    label: "Ellipse",
    description: "Circle or oval",
    category: "Shapes",
    glyph: "○",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapeDiamond",
    label: "Diamond",
    description: "Angular accent",
    category: "Shapes",
    glyph: "◇",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapeTriangle",
    label: "Triangle",
    description: "Directional form",
    category: "Shapes",
    glyph: "△",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapeStar",
    label: "Star",
    description: "Highlight shape",
    category: "Shapes",
    glyph: "☆",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapeHexagon",
    label: "Hexagon",
    description: "Modular accent",
    category: "Shapes",
    glyph: "⬡",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapeHeart",
    label: "Heart",
    description: "Emotive accent",
    category: "Shapes",
    glyph: "♡",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapePlus",
    label: "Plus",
    description: "Graphic symbol",
    category: "Shapes",
    glyph: "+",
    colSpan: 3,
    rowSpan: 3,
    minColSpan: 1,
    minRowSpan: 1,
  },
  {
    kind: "shapePen",
    label: "Pen (Vector)",
    description: "Draw smooth Bezier curves & precision vector paths",
    category: "Lines",
    glyph: "✒",
    colSpan: 4,
    rowSpan: 2,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "shapeFreedraw",
    label: "Pen (Freehand)",
    description: "Draw organic freehand strokes with natural pen pressure",
    category: "Lines",
    glyph: "✎",
    colSpan: 4,
    rowSpan: 2,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "shapeLine",
    label: "Line",
    description: "Straight separator or connector",
    category: "Lines",
    glyph: "―",
    colSpan: 4,
    rowSpan: 1,
    minColSpan: 2,
    minRowSpan: 1,
  },
  {
    kind: "shapeArrow",
    label: "Arrow",
    description: "Directional pointer arrow",
    category: "Lines",
    glyph: "→",
    colSpan: 4,
    rowSpan: 1,
    minColSpan: 2,
    minRowSpan: 1,
  },
  {
    kind: "shapeDoubleArrow",
    label: "Double Arrow",
    description: "Two-way indicator arrow",
    category: "Lines",
    glyph: "↔",
    colSpan: 4,
    rowSpan: 1,
    minColSpan: 2,
    minRowSpan: 1,
  },
  {
    kind: "shapeDashedLine",
    label: "Dashed Line",
    description: "Dotted / dashed guide line",
    category: "Lines",
    glyph: "╌",
    colSpan: 4,
    rowSpan: 1,
    minColSpan: 2,
    minRowSpan: 1,
  },
  {
    kind: "shapeCurvedArrow",
    label: "Curved Arrow",
    description: "Curved pointer arrow",
    category: "Lines",
    glyph: "⤹",
    colSpan: 4,
    rowSpan: 2,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "panel",
    label: "Color panel",
    description: "Layout surface",
    category: "Structure",
    glyph: "■",
    colSpan: 6,
    rowSpan: 4,
    minColSpan: 2,
    minRowSpan: 2,
  },
  {
    kind: "divider",
    label: "Divider",
    description: "Section rule",
    category: "Structure",
    glyph: "—",
    colSpan: 6,
    rowSpan: 1,
    minColSpan: 2,
  },
  {
    kind: "spacer",
    label: "Spacer",
    description: "Reserve breathing room",
    category: "Structure",
    glyph: "↕",
    colSpan: 4,
    rowSpan: 2,
    minColSpan: 1,
    minRowSpan: 1,
  },
];

const LEGACY_BLOCKS: BuilderBlockDefinition[] = [
  legacyTextBlock("heading", "Book title", "T1", 7, 3, 4, 2),
  legacyTextBlock("subtitle", "Subtitle", "T2", 6, 2, 3),
  legacyTextBlock("synopsis", "Synopsis", "¶", 5, 3, 3, 2),
  legacyTextBlock("quote", "Pull quote", "“", 5, 3, 3, 2),
  legacyTextBlock("author", "Author", "Aa", 4, 1, 2),
  legacyTextBlock("metadata", "Book details", "≡", 5, 2, 3),
  legacyTextBlock("price", "Price", "฿", 3, 2, 2, undefined, "Commerce"),
  legacyTextBlock("salePrice", "Sale price", "%", 4, 2, 3, undefined, "Commerce"),
  legacyTextBlock("indexNumber", "Index number", "01", 3, 3, 2, 2, "Structure"),
  {
    kind: "coverImage",
    label: "Cover image",
    description: "Flat book cover",
    category: "Content",
    glyph: "📖",
    colSpan: 4,
    rowSpan: 6,
    minColSpan: 2,
    minRowSpan: 3,
  },
  {
    kind: "accentShape",
    label: "Accent shape",
    description: "Legacy graphic emphasis",
    category: "Structure",
    glyph: "●",
    colSpan: 2,
    rowSpan: 2,
    minColSpan: 1,
    minRowSpan: 1,
  },
];

const ALL_BUILDER_BLOCKS = [...BUILDER_BLOCKS, ...LEGACY_BLOCKS];
const UNIFIED_TEXT_DEFINITION = BUILDER_BLOCKS.find((block) => block.kind === "text")!;
const LEGACY_TEXT_PRESET: Partial<Record<string, TextPresetId>> = {
  heading: "title",
  subtitle: "subtitle",
  synopsis: "body",
  quote: "quote",
  author: "author",
  metadata: "details",
  price: "price",
  salePrice: "sale",
  indexNumber: "index",
};

export function getBuilderBlockDefinition(kind: string): BuilderBlockDefinition | undefined {
  if (LEGACY_TEXT_PRESET[kind]) return UNIFIED_TEXT_DEFINITION;
  return ALL_BUILDER_BLOCKS.find((block) => block.kind === kind);
}

export function isBuilderBlockKind(value: string): value is BuilderBlockKind {
  return ALL_BUILDER_BLOCKS.some((block) => block.kind === value);
}

export function createBuilderBlock(
  kind: BuilderBlockKind,
  artwork: {
    width: number;
    height: number;
    point?: { x: number; y: number };
  },
): EngineElement {
  const definition = ALL_BUILDER_BLOCKS.find((block) => block.kind === kind)!;
  const referencePlacement: BlockPlacement = {
    col: 0,
    row: 0,
    // Recipes use the original 16:9 grid, then scale proportionally to the Artwork ratio.
    colSpan: definition.colSpan * 2,
    rowSpan: definition.rowSpan,
    minColSpan: definition.minColSpan ? definition.minColSpan * 2 : undefined,
    minRowSpan: definition.minRowSpan,
    kind,
  };
  const placement = remapBlockPlacement(
    referencePlacement,
    REFERENCE_HEX_GRID,
    getHexGridDimensions(artwork.width, artwork.height),
  );
  const nominal = blockRectForPlacement(placement, artwork.width, artwork.height);
  let rect: BentoRect = nominal;
  if (artwork.point) {
    rect = {
      ...nominal,
      x: Math.min(
        Math.max(0, artwork.point.x - nominal.width / 2),
        Math.max(0, artwork.width - nominal.width),
      ),
      y: Math.min(
        Math.max(0, artwork.point.y - nominal.height / 2),
        Math.max(0, artwork.height - nominal.height),
      ),
    };
  }
  const element = makeElement(kind, rect);
  if (isMediaElement(element)) Object.assign(element, fitMediaElementToRect(element, rect));
  element.builderKind = kind;
  return element;
}

function makeElement(kind: BuilderBlockKind, rect: BentoRect): EngineElement {
  switch (kind) {
    case "text":
      return createTextFromPreset(rect, DEFAULT_TEXT_PRESET_ID);
    case "heading":
    case "subtitle":
    case "synopsis":
    case "quote":
    case "author":
    case "metadata":
    case "price":
    case "salePrice":
    case "indexNumber":
      return createTextFromPreset(rect, LEGACY_TEXT_PRESET[kind]!);
    case "cta":
      return styleText(rect, "สั่งซื้อเลย  →", 25, {
        fontStyle: "bold",
        textAlign: "center",
        verticalAlign: "middle",
        strokeColor: "#ffffff",
        backgroundColor: "#1859ff",
        padding: 18,
        cornerRadius: 999,
      });
    case "badge":
      return styleText(rect, "BESTSELLER", 18, {
        fontStyle: "bold",
        textAlign: "center",
        verticalAlign: "middle",
        strokeColor: "#172554",
        backgroundColor: "#facc15",
        padding: 12,
        cornerRadius: 999,
      });
    case "badgeStarburst": {
      const size = Math.min(rect.width, rect.height);
      return createStarburstBadge({
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
        points: 16,
        strokeColor: "#991b1b",
        backgroundColor: "#dc2626",
      });
    }
    case "badgeFlash": {
      const size = Math.min(rect.width, rect.height);
      return createStarburstBadge({
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
        points: 24,
        innerRadiusRatio: 0.85,
        strokeColor: "#b45309",
        backgroundColor: "#f59e0b",
      });
    }
    case "badgeRibbon":
      return createRibbonBanner({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        strokeColor: "#92400e",
        backgroundColor: "#fbbf24",
      });
    case "badgeSeal": {
      const size = Math.min(rect.width, rect.height);
      return createScallopedSeal({
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
        lobes: 16,
        strokeColor: "#065f46",
        backgroundColor: "#059669",
      });
    }
    case "badgePriceTag":
      return createPriceTagBadge({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        strokeColor: "#1e293b",
        backgroundColor: "#2563eb",
      });
    case "badgeBookmark":
      return createBookmarkRibbon({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        strokeColor: "#4c1d95",
        backgroundColor: "#7c3aed",
      });
    case "coverImage":
    case "supportingImage": {
      const image = createImage({
        ...rect,
        fileId: "",
        naturalWidth: kind === "coverImage" ? 1200 : 1600,
        naturalHeight: kind === "coverImage" ? 1800 : 1000,
      });
      image.status = "pending";
      image.backgroundColor = "#e2e8f0";
      return image;
    }
    case "bookMockup":
      return createBookMockup({
        ...rect,
        fileId: "",
        naturalWidth: 1200,
        naturalHeight: 1800,
        yaw: 24,
        pitch: -8,
      });
    case "frameCircle": {
      const size = Math.min(rect.width, rect.height);
      const r = {
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
      };
      return createFrame({ ...r, shape: "circle", name: "Circle Frame" });
    }
    case "framePolaroid":
      return createFrame({ ...rect, shape: "polaroid", name: "Polaroid Frame" });
    case "shapeLine": {
      const path = createVectorPath(
        [
          { x: rect.x, y: rect.y + rect.height / 2 },
          { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        ],
        false,
      );
      return { ...path, name: "Line", strokeWidth: 2, strokeColor: "#1e293b" };
    }
    case "shapeArrow": {
      const path = createVectorPath(
        [
          { x: rect.x, y: rect.y + rect.height / 2 },
          { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        ],
        false,
      );
      return {
        ...path,
        name: "Arrow",
        endArrowhead: "arrow",
        strokeWidth: 2,
        strokeColor: "#1e293b",
      };
    }
    case "shapeDoubleArrow": {
      const path = createVectorPath(
        [
          { x: rect.x, y: rect.y + rect.height / 2 },
          { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        ],
        false,
      );
      return {
        ...path,
        name: "Double Arrow",
        startArrowhead: "arrow",
        endArrowhead: "arrow",
        strokeWidth: 2,
        strokeColor: "#1e293b",
      };
    }
    case "shapeDashedLine": {
      const path = createVectorPath(
        [
          { x: rect.x, y: rect.y + rect.height / 2 },
          { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        ],
        false,
      );
      return {
        ...path,
        name: "Dashed Line",
        strokeStyle: "dashed",
        strokeWidth: 2,
        strokeColor: "#64748b",
      };
    }
    case "shapeCurvedArrow": {
      const path = createVectorPathFromWorldNodes(
        [
          { x: rect.x, y: rect.y + rect.height, out: [rect.width * 0.4, -rect.height * 0.6] },
          { x: rect.x + rect.width, y: rect.y, in: [-rect.width * 0.4, rect.height * 0.1] },
        ],
        false,
      );
      return {
        ...path,
        name: "Curved Arrow",
        endArrowhead: "arrow",
        strokeWidth: 2,
        strokeColor: "#1e293b",
      };
    }
    case "shapeFreedraw": {
      const pts: Array<{ x: number; y: number }> = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = rect.x + t * rect.width;
        const py = rect.y + rect.height / 2 + Math.sin(t * Math.PI * 2) * (rect.height * 0.3);
        pts.push({ x: px, y: py });
      }
      const el = createVectorPath(pts, false);
      return { ...el, name: "Freehand", strokeWidth: 2.5, strokeColor: "#4f46e5" };
    }
    case "shapePen": {
      const p1 = { x: rect.x, y: rect.y + rect.height * 0.8 };
      const p2 = { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.2 };
      const p3 = { x: rect.x + rect.width, y: rect.y + rect.height * 0.8 };
      const el = createVectorPath([p1, p2, p3], false);
      return { ...el, name: "Pen Path", strokeWidth: 2.5, strokeColor: "#7c3aed" };
    }
    case "frameArch":
      return createFrame({ ...rect, shape: "arch", name: "Arch Frame" });
    case "frameHeart": {
      const size = Math.min(rect.width, rect.height);
      const r = {
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
      };
      return createFrame({ ...r, shape: "heart", name: "Heart Frame" });
    }
    case "frameStar": {
      const size = Math.min(rect.width, rect.height);
      const r = {
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
      };
      return createFrame({ ...r, shape: "star", name: "Star Frame" });
    }
    case "frameRounded":
      return createFrame({
        ...rect,
        shape: "roundedRect",
        cornerRadius: 24,
        name: "Rounded Frame",
      });
    case "frameHexagon": {
      const size = Math.min(rect.width, rect.height);
      const r = {
        x: rect.x + (rect.width - size) / 2,
        y: rect.y + (rect.height - size) / 2,
        width: size,
        height: size,
      };
      return createFrame({ ...r, shape: "hexagon", name: "Hexagon Frame" });
    }
    case "shapeRect": {
      const shape = styleShape(createRect(rect));
      shape.cornerRadius = 18;
      return shape;
    }
    case "shapeEllipse":
      return styleShape(createEllipse(rect));
    case "shapeDiamond":
      return styleShape(createDiamond(rect));
    case "shapeTriangle":
      return styleShape(createTriangle(rect));
    case "shapeStar":
      return styleShape(createStar(rect));
    case "shapeHexagon":
      return styleShape(createHexagon(rect));
    case "shapeHeart":
      return styleShape(createHeart(rect));
    case "shapePlus":
      return styleShape(createPlus(rect));
    case "panel": {
      const panel = createRect(rect);
      panel.backgroundColor = "#dbeafe";
      panel.strokeColor = "transparent";
      panel.fillStyle = "solid";
      panel.roughness = 0;
      panel.cornerRadius = 24;
      return panel;
    }
    case "divider": {
      const divider = createRect(rect);
      divider.backgroundColor = "#172033";
      divider.strokeColor = "transparent";
      divider.fillStyle = "solid";
      divider.roughness = 0;
      divider.cornerRadius = 999;
      return divider;
    }
    case "spacer": {
      const spacer = createRect(rect);
      spacer.backgroundColor = "rgba(99,102,241,0.035)";
      spacer.strokeColor = "rgba(99,102,241,0.24)";
      spacer.strokeStyle = "dashed";
      spacer.fillStyle = "solid";
      spacer.roughness = 0;
      spacer.cornerRadius = 16;
      return spacer;
    }
    case "accentShape": {
      const shape = createEllipse(rect);
      shape.backgroundColor = "#ff5c35";
      shape.strokeColor = "transparent";
      shape.fillStyle = "solid";
      shape.roughness = 0;
      return convertElementToVectorPath(shape) ?? shape;
    }
  }
}

type BentoRect = { x: number; y: number; width: number; height: number };

function styleText(
  rect: BentoRect,
  text: string,
  fontSize: number,
  patch: Partial<TextElement>,
): TextElement {
  const element = createText({ ...rect, text, fontSize, fontFamily: "'Sarabun', sans-serif" });
  Object.assign(element, patch);
  element.roughness = 0;
  element.fillStyle = "solid";
  return element;
}

function styleShape<T extends EngineElement>(element: T): T {
  element.backgroundColor = "#dbeafe";
  element.strokeColor = "#1859ff";
  element.strokeWidth = 2;
  element.fillStyle = "solid";
  element.roughness = 0;
  const vector = convertElementToVectorPath(element);
  return (vector as unknown as T) ?? element;
}

function legacyTextBlock(
  kind: BuilderBlockKind,
  label: string,
  glyph: string,
  colSpan: number,
  rowSpan: number,
  minColSpan?: number,
  minRowSpan?: number,
  category: BuilderBlockDefinition["category"] = "Content",
): BuilderBlockDefinition {
  return {
    kind,
    label,
    description: "Legacy Text preset",
    category,
    glyph,
    colSpan,
    rowSpan,
    minColSpan,
    minRowSpan,
  };
}
