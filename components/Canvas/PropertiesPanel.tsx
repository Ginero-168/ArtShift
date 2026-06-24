"use client";

/**
 * Excalidraw-style properties panel — shown above selection.
 * Compact dropdowns: one visible item + popover menu.
 */

import { useMemo } from "react";
import { unionBBox } from "@/lib/engine/bounds";
import { useEngine } from "@/lib/engine/store";
import type { ArrowElement, EngineElement, TextElement } from "@/lib/engine/types";
import { ActionsSection } from "./PropertiesPanel/ActionsSection";
import { ArrowSection } from "./PropertiesPanel/ArrowSection";
import { FillSection } from "./PropertiesPanel/FillSection";
import { ImageSection } from "./PropertiesPanel/ImageSection";
import { OpacitySection } from "./PropertiesPanel/OpacitySection";
import { TextSection } from "./PropertiesPanel/TextSection";

/* ——— component ——— */

export default function PropertiesPanel({
  worldToScreen,
  scale,
}: {
  worldToScreen: (p: { x: number; y: number }) => { x: number; y: number };
  scale: number;
}) {
  const slide = useEngine((s) => s.doc.slides.find((sl) => sl.id === s.currentSlideId));
  const selectedIds = useEngine((s) => s.selectedIds);
  const updateElements = useEngine((s) => s.updateElements);
  const croppingImageId = useEngine((s) => s.croppingImageId);
  const setCroppingImageId = useEngine((s) => s.setCroppingImageId);
  const selected = useMemo<EngineElement[]>(() => {
    if (!slide) return [];
    return slide.elements.filter((el) => selectedIds.has(el.id) && !el.isDeleted);
  }, [slide, selectedIds]);

  const bbox = useMemo(() => unionBBox(selected), [selected]);
  const screenPos = useMemo(() => {
    if (!bbox) return { x: 0, y: 0 };
    return worldToScreen({ x: bbox.x + bbox.width / 2, y: bbox.y });
  }, [bbox, worldToScreen]);

  if (selected.length === 0) return null;

  const first = selected[0];
  const ids = selected.map((el) => el.id);
  const apply = (patch: Partial<EngineElement>, label: string) =>
    updateElements(
      ids.map((id) => ({ id, patch })),
      label,
    );

  const hasText = selected.some((el) => el.type === "text");
  const firstText = selected.find((el): el is TextElement => el.type === "text");
  const arrows = selected.filter((el): el is ArrowElement => el.type === "arrow");
  const firstArrow = arrows[0];
  const images = selected.filter(
    (el): el is import("@/lib/engine/types").ImageElement => el.type === "image",
  );
  const firstImage = images[0];

  return (
    <div
      style={{
        position: "absolute",
        top: screenPos.y - 12 * scale,
        left: screenPos.x,
        transform: "translate(-50%, -100%)",
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 9,
        padding: "6px 10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        fontSize: 10,
        zIndex: 4,
        maxWidth: "90vw",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <FillSection
        first={first}
        selected={selected}
        ids={ids}
        apply={apply}
        updateElements={updateElements}
      />
      {firstArrow && (
        <ArrowSection firstArrow={firstArrow} arrows={arrows} updateElements={updateElements} />
      )}
      {hasText && firstText && (
        <TextSection
          firstText={firstText}
          apply={apply as (patch: Partial<TextElement>, label: string) => void}
        />
      )}
      {firstImage && selected.length === 1 && (
        <ImageSection
          firstImage={firstImage}
          croppingImageId={croppingImageId}
          setCroppingImageId={setCroppingImageId}
        />
      )}
      <OpacitySection first={first} apply={apply} />
      <ActionsSection selected={selected} />
      <ActionsSection selected={selected} />
    </div>
  );
}
