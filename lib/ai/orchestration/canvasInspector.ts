import type { EngineElement, EngineSlide } from "@/lib/engine/types";

type CanvasInspectionInput = {
  slide: Pick<
    EngineSlide,
    "id" | "name" | "width" | "height" | "background" | "layers" | "elements"
  >;
  selectedIds: ReadonlySet<string>;
};

export type CanvasInspection = {
  objectCount: number;
  selectedCount: number;
  typeCounts: Record<string, number>;
  hiddenCount: number;
  lockedCount: number;
  providerCallRequired: false;
  reply: string;
};

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  rect: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  triangle: "Triangle",
  star: "Star",
  hexagon: "Hexagon",
  heart: "Heart",
  plus: "Plus",
  line: "Line",
  arrow: "Arrow",
  freedraw: "Freehand",
  path: "Vector path",
  image: "Image",
  bookMockup: "Book mockup",
  frame: "Frame",
};

export function inspectCanvas(input: CanvasInspectionInput): CanvasInspection {
  const elements = input.slide.elements.filter((element) => !element.isDeleted);
  const typeCounts = countByType(elements);
  const selected = elements.filter((element) => input.selectedIds.has(element.id));
  const hiddenCount = elements.filter(
    (element) => element.hidden === true || element.visible === false,
  ).length;
  const lockedCount = elements.filter((element) => element.locked).length;

  if (elements.length === 0) {
    return {
      objectCount: 0,
      selectedCount: 0,
      typeCounts,
      hiddenCount,
      lockedCount,
      providerCallRequired: false,
      reply: `บน Canvas ยังไม่มี Object ครับ (ขนาด ${input.slide.width} × ${input.slide.height} px)`,
    };
  }

  const typeSummary = Object.entries(typeCounts)
    .map(([type, count]) => `${TYPE_LABELS[type] ?? type} ${count}`)
    .join(", ");
  const selectedSummary = selected.length
    ? `เลือกอยู่: ${selected.map((element) => readableElementName(element)).join(", ")}`
    : "ยังไม่ได้เลือก Object";
  const stateSummary = [
    hiddenCount ? `ซ่อนอยู่ ${hiddenCount}` : "ไม่มี Object ที่ซ่อน",
    lockedCount ? `ล็อกอยู่ ${lockedCount}` : "ไม่มี Object ที่ล็อก",
  ].join(" และ ");

  return {
    objectCount: elements.length,
    selectedCount: selected.length,
    typeCounts,
    hiddenCount,
    lockedCount,
    providerCallRequired: false,
    reply: [
      `บน Canvas มี ${elements.length} Object ครับ (ขนาด ${input.slide.width} × ${input.slide.height} px)`,
      `ประเภท: ${typeSummary}`,
      selected.length ? `${selectedSummary}` : selectedSummary,
      `${stateSummary}`,
      `Layer: ${input.slide.layers.map((layer) => layer.name).join(", ") || "ยังไม่มีชื่อ Layer"}`,
      ...selected
        .slice(0, 8)
        .map(
          (element) =>
            `- ${readableElementName(element)} · ${element.width} × ${element.height} px`,
        ),
    ].join("\n"),
  };
}

function countByType(elements: readonly EngineElement[]): Record<string, number> {
  return elements.reduce<Record<string, number>>((counts, element) => {
    counts[element.type] = (counts[element.type] ?? 0) + 1;
    return counts;
  }, {});
}

function readableElementName(element: EngineElement): string {
  if (element.type === "text") return element.text.trim() || element.name || "Text";
  return element.name || TYPE_LABELS[element.type] || element.type;
}
