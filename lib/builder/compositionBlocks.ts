import { createImage, createRect, createText } from "../engine/factory";
import type { EngineElement, GroupId } from "../engine/types";

export type CompositionSlot = {
  id: string;
  role: "media" | "headline" | "body" | "cta" | "background";
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "image" | "text" | "rect";
};

export type CompositionBlockDefinition = {
  id: "hero" | "text-image" | "offer-cta";
  label: string;
  description: string;
  slots: CompositionSlot[];
};

const SLOTS: Record<CompositionBlockDefinition["id"], CompositionSlot[]> = {
  hero: [
    { id: "background", role: "background", x: 0, y: 0, width: 1, height: 1, kind: "rect" },
    { id: "headline", role: "headline", x: 0.08, y: 0.22, width: 0.84, height: 0.18, kind: "text" },
    { id: "body", role: "body", x: 0.12, y: 0.45, width: 0.76, height: 0.14, kind: "text" },
    { id: "cta", role: "cta", x: 0.35, y: 0.68, width: 0.3, height: 0.1, kind: "text" },
  ],
  "text-image": [
    { id: "background", role: "background", x: 0, y: 0, width: 1, height: 1, kind: "rect" },
    { id: "headline", role: "headline", x: 0.08, y: 0.16, width: 0.38, height: 0.16, kind: "text" },
    { id: "body", role: "body", x: 0.08, y: 0.38, width: 0.38, height: 0.28, kind: "text" },
    { id: "media", role: "media", x: 0.54, y: 0.12, width: 0.38, height: 0.76, kind: "image" },
  ],
  "offer-cta": [
    { id: "background", role: "background", x: 0, y: 0, width: 1, height: 1, kind: "rect" },
    { id: "headline", role: "headline", x: 0.1, y: 0.14, width: 0.8, height: 0.16, kind: "text" },
    { id: "body", role: "body", x: 0.16, y: 0.36, width: 0.68, height: 0.14, kind: "text" },
    { id: "cta", role: "cta", x: 0.3, y: 0.65, width: 0.4, height: 0.12, kind: "text" },
  ],
};

export const COMPOSITION_BLOCKS: CompositionBlockDefinition[] = [
  {
    id: "hero",
    label: "Hero",
    description: "Headline, supporting copy, and CTA",
    slots: SLOTS.hero,
  },
  {
    id: "text-image",
    label: "Text + Image",
    description: "Narrative copy beside a visual slot",
    slots: SLOTS["text-image"],
  },
  {
    id: "offer-cta",
    label: "Offer / CTA",
    description: "Offer message with a focused action",
    slots: SLOTS["offer-cta"],
  },
];

export function getCompositionBlockDefinition(id: string): CompositionBlockDefinition | undefined {
  return COMPOSITION_BLOCKS.find((block) => block.id === id);
}

export function createCompositionBlock(
  id: CompositionBlockDefinition["id"],
  artwork: { width: number; height: number },
): { elements: EngineElement[]; groupId: GroupId; slots: Record<string, string> } {
  const definition = getCompositionBlockDefinition(id);
  if (!definition) throw new Error(`Unknown composition block: ${id}`);
  const groupId = crypto.randomUUID();
  const slots: Record<string, string> = {};
  const elements = definition.slots.map((slot) => {
    const rect = {
      x: Math.round(slot.x * artwork.width),
      y: Math.round(slot.y * artwork.height),
      width: Math.max(1, Math.round(slot.width * artwork.width)),
      height: Math.max(1, Math.round(slot.height * artwork.height)),
    };
    const element =
      slot.kind === "image"
        ? createImage({
            ...rect,
            fileId: "composition-placeholder",
            naturalWidth: rect.width,
            naturalHeight: rect.height,
          })
        : slot.kind === "rect"
          ? createRect(rect)
          : createText({
              ...rect,
              text:
                slot.role === "headline"
                  ? "Your headline"
                  : slot.role === "cta"
                    ? "Learn more →"
                    : "Supporting copy",
              fontSize: slot.role === "headline" ? 56 : slot.role === "cta" ? 24 : 24,
            });
    element.groupIds = [...element.groupIds, groupId];
    element.builderKind = `composition:${id}:${slot.id}`;
    element.name = `${definition.label} · ${slot.id}`;
    element.semantic = {
      role: slot.role,
      importance:
        slot.role === "background"
          ? "supporting"
          : slot.role === "headline" || slot.role === "media"
            ? "primary"
            : "secondary",
      constraints: { preserveAspectRatio: slot.kind === "image" },
    };
    if (slot.kind === "image") element.layoutMode = "free";
    slots[slot.id] = element.id;
    return element;
  });
  return { elements, groupId, slots };
}
