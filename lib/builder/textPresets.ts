import { createText } from "../engine/factory";
import { getTextSafePadding, measureTextElementHeight } from "../engine/textLayout";
import type { TextElement } from "../engine/types";

export type TextPresetId = NonNullable<TextElement["textPreset"]>;

export type TextPresetDefinition = {
  id: TextPresetId;
  label: string;
  description: string;
  defaultText: string;
  fontSize: number;
  lineHeight: number;
  fontStyle?: TextElement["fontStyle"];
  textAlign?: TextElement["textAlign"];
  verticalAlign?: TextElement["verticalAlign"];
  strokeColor?: string;
  backgroundColor?: string;
  padding?: number;
  cornerRadius?: number;
};

export const DEFAULT_TEXT_PRESET_ID: TextPresetId = "title";

export const TEXT_PRESETS: readonly TextPresetDefinition[] = [
  {
    id: "title",
    label: "Title",
    description: "Primary book headline",
    defaultText: "ชื่อหนังสือที่อยากให้คนหยุดอ่าน",
    fontSize: 70,
    lineHeight: 1.08,
    fontStyle: "bold",
  },
  {
    id: "subtitle",
    label: "Subtitle",
    description: "Supporting message",
    defaultText: "ข้อความรองที่ขยายคุณค่าของหนังสือ",
    fontSize: 34,
    lineHeight: 1.25,
  },
  {
    id: "body",
    label: "Body",
    description: "Synopsis or long-form copy",
    defaultText: "หนังสือเล่มนี้เหมาะกับใคร และผู้อ่านจะได้อะไรหลังจากอ่านจบ",
    fontSize: 25,
    lineHeight: 1.5,
  },
  {
    id: "quote",
    label: "Quote",
    description: "Review or memorable line",
    defaultText: "“ประโยครีวิวหรือข้อความสำคัญที่น่าจดจำ”",
    fontSize: 34,
    lineHeight: 1.35,
    fontStyle: "italic",
    strokeColor: "#334155",
    backgroundColor: "#f1f5f9",
    padding: 28,
    cornerRadius: 20,
  },
  {
    id: "author",
    label: "Author",
    description: "Author credit",
    defaultText: "เขียนโดย ชื่อผู้เขียน",
    fontSize: 24,
    lineHeight: 1.35,
    fontStyle: "bold",
    verticalAlign: "middle",
  },
  {
    id: "details",
    label: "Details",
    description: "ISBN, format and pages",
    defaultText: "ISBN 978-0-00-000000-0  ·  ปกอ่อน  ·  320 หน้า",
    fontSize: 20,
    lineHeight: 1.45,
    strokeColor: "#64748b",
  },
  {
    id: "price",
    label: "Price",
    description: "Standard price",
    defaultText: "฿395",
    fontSize: 54,
    lineHeight: 1.15,
    fontStyle: "bold",
    verticalAlign: "middle",
  },
  {
    id: "sale",
    label: "Sale price",
    description: "Promotional and original price",
    defaultText: "พิเศษ ฿295\nปกติ ฿395",
    fontSize: 36,
    lineHeight: 1.2,
    fontStyle: "bold",
    verticalAlign: "middle",
    strokeColor: "#b42318",
  },
  {
    id: "index",
    label: "Index",
    description: "Oversized editorial number",
    defaultText: "01",
    fontSize: 110,
    lineHeight: 1,
    fontStyle: "bold",
    verticalAlign: "middle",
    strokeColor: "#cbd5e1",
  },
] as const;

const TEXT_PRESET_BY_ID = new Map(TEXT_PRESETS.map((preset) => [preset.id, preset]));

const LEGACY_PRESET_BY_KIND: Record<string, TextPresetId> = {
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

export function getTextPreset(id: TextPresetId): TextPresetDefinition {
  return TEXT_PRESET_BY_ID.get(id) ?? TEXT_PRESETS[0];
}

export function inferTextPresetId(
  text: Pick<TextElement, "textPreset" | "builderKind">,
): TextPresetId {
  return text.textPreset ?? LEGACY_PRESET_BY_KIND[text.builderKind ?? ""] ?? DEFAULT_TEXT_PRESET_ID;
}

export function createTextFromPreset(
  rect: { x: number; y: number; width: number; height: number },
  id: TextPresetId,
): TextElement {
  const preset = getTextPreset(id);
  const element = createText({
    ...rect,
    text: preset.defaultText,
    fontSize: preset.fontSize,
    fontFamily: "'Sarabun', sans-serif",
  });
  Object.assign(element, textPresetStyle(preset), { textPreset: preset.id });
  element.roughness = 0;
  element.fillStyle = "solid";
  return element;
}

/** Change semantic typography without replacing the user's written content. */
export function textPresetPatch(
  text: TextElement,
  id: TextPresetId,
  blockManaged: boolean,
): Partial<TextElement> {
  const preset = getTextPreset(id);
  const patch: Partial<TextElement> = {
    ...textPresetStyle(preset),
    textPreset: preset.id,
    builderKind: "text",
  };
  if (!blockManaged) {
    const next = { ...text, ...patch };
    patch.height = Math.max(text.height, measureTextElementHeight(next));
  }
  return patch;
}

function textPresetStyle(preset: TextPresetDefinition): Partial<TextElement> {
  return {
    fontSize: preset.fontSize,
    lineHeight: preset.lineHeight,
    fontStyle: preset.fontStyle ?? "normal",
    textAlign: preset.textAlign ?? "left",
    verticalAlign: preset.verticalAlign ?? "top",
    strokeColor: preset.strokeColor ?? "#172033",
    backgroundColor: preset.backgroundColor ?? "transparent",
    padding: getTextSafePadding(preset.fontSize, preset.padding ?? 0),
    cornerRadius: preset.cornerRadius ?? 0,
  };
}
