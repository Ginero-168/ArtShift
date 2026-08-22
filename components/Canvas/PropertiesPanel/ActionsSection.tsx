"use client";

import { useMemo } from "react";
import {
  IconBringForward,
  IconBringToFront,
  IconDuplicate,
  IconGroup,
  IconLink,
  IconPathfinderDivide,
  IconPathfinderExclude,
  IconPathfinderIntersect,
  IconPathfinderMinusBack,
  IconPathfinderMinusFront,
  IconPathfinderUnite,
  IconSendBackward,
  IconSendToBack,
  IconTrash,
} from "@/components/icons";
import { isConvertibleShape } from "@/lib/engine/frameMask";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement } from "@/lib/engine/types";
import { isShapeElement } from "@/lib/engine/vectorBoolean";
import { AlignBtn, alignElements, distributeElements, IconBtn, Section } from "./PanelParts";

export function ActionsSection({ selected }: { selected: EngineElement[] }) {
  const ids = selected.map((el) => el.id);
  const slide = useEngine((s) => s.doc.slides.find((sl) => sl.id === s.currentSlideId));
  const bringToFront = useEngine((s) => s.bringToFront);
  const sendToBack = useEngine((s) => s.sendToBack);
  const bringForward = useEngine((s) => s.bringForward);
  const sendBackward = useEngine((s) => s.sendBackward);
  const deleteElements = useEngine((s) => s.deleteElements);
  const copyElements = useEngine((s) => s.copyElements);
  const pasteElements = useEngine((s) => s.pasteElements);
  const groupElements = useEngine((s) => s.groupElements);
  const ungroupElements = useEngine((s) => s.ungroupElements);
  const applyBooleanOperation = useEngine((s) => s.applyBooleanOperation);
  const convertShapeToFrame = useEngine((s) => s.convertShapeToFrame);

  const shapesInSelectionOrGroup = useMemo(() => {
    if (!slide) return [];
    const directShapes = selected.filter(isShapeElement);
    if (directShapes.length >= 2) return directShapes;

    const groupIds = new Set(selected.flatMap((el) => el.groupIds ?? []));
    if (groupIds.size > 0) {
      const groupShapes = slide.elements.filter(
        (el) => !el.isDeleted && isShapeElement(el) && el.groupIds?.some((g) => groupIds.has(g)),
      );
      if (groupShapes.length >= 2) return groupShapes;
    }

    return directShapes;
  }, [selected, slide]);

  const canPathfind = shapesInSelectionOrGroup.length >= 2;

  return (
    <>
      {/* Align & Distribute */}
      {selected.length >= 2 && (
        <Section>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 2 }}>
              <AlignBtn
                label="L"
                title="Align left"
                onClick={() => alignElements(selected, "left")}
              />
              <AlignBtn
                label="C"
                title="Align center"
                onClick={() => alignElements(selected, "centerH")}
              />
              <AlignBtn
                label="R"
                title="Align right"
                onClick={() => alignElements(selected, "right")}
              />
              <AlignBtn
                label="T"
                title="Align top"
                onClick={() => alignElements(selected, "top")}
              />
              <AlignBtn
                label="M"
                title="Align middle"
                onClick={() => alignElements(selected, "middleV")}
              />
              <AlignBtn
                label="B"
                title="Align bottom"
                onClick={() => alignElements(selected, "bottom")}
              />
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              <AlignBtn
                label="DH"
                title="Distribute horizontal"
                onClick={() => distributeElements(selected, "h")}
              />
              <AlignBtn
                label="DV"
                title="Distribute vertical"
                onClick={() => distributeElements(selected, "v")}
              />
            </div>
          </div>
        </Section>
      )}

      {/* Pathfinder (Adobe Illustrator Style) */}
      {canPathfind && (
        <Section>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{ fontSize: 9.5, color: "#9ca3af", fontWeight: 700, letterSpacing: 0.4 }}
              >
                PATHFINDER
              </span>
              <span style={{ fontSize: 9, color: "var(--accent, #6366f1)", fontWeight: 600 }}>
                {selected.length} shapes
              </span>
            </div>

            {/* Shape Modes */}
            <div style={{ display: "flex", gap: 3 }}>
              <button
                type="button"
                onClick={() => applyBooleanOperation("union")}
                title="Unite: Merge shapes into a single unified outline"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: "4px 2px",
                  fontSize: 8.5,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "1px solid var(--stroke, #e5e7eb)",
                  background: "var(--surface-solid, #fff)",
                  color: "var(--ink, #111)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <IconPathfinderUnite size={14} />
                Unite
              </button>

              <button
                type="button"
                onClick={() => applyBooleanOperation("subtract")}
                title="Minus Front: Subtract top shapes from bottom shape"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: "4px 2px",
                  fontSize: 8.5,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "1px solid var(--stroke, #e5e7eb)",
                  background: "var(--surface-solid, #fff)",
                  color: "var(--ink, #111)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <IconPathfinderMinusFront size={14} />
                Minus Front
              </button>

              <button
                type="button"
                onClick={() => applyBooleanOperation("intersect")}
                title="Intersect: Retain only overlapping intersection area"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: "4px 2px",
                  fontSize: 8.5,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "1px solid var(--stroke, #e5e7eb)",
                  background: "var(--surface-solid, #fff)",
                  color: "var(--ink, #111)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <IconPathfinderIntersect size={14} />
                Intersect
              </button>

              <button
                type="button"
                onClick={() => applyBooleanOperation("exclude")}
                title="Exclude: Remove overlapping area (XOR)"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: "4px 2px",
                  fontSize: 8.5,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "1px solid var(--stroke, #e5e7eb)",
                  background: "var(--surface-solid, #fff)",
                  color: "var(--ink, #111)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <IconPathfinderExclude size={14} />
                Exclude
              </button>
            </div>

            {/* Pathfinders Row 2 */}
            <div style={{ display: "flex", gap: 3 }}>
              <button
                type="button"
                onClick={() => applyBooleanOperation("minusBack")}
                title="Minus Back: Subtract bottom shapes from top shape"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "4px 6px",
                  fontSize: 9,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "1px solid var(--stroke, #e5e7eb)",
                  background: "var(--surface-solid, #fff)",
                  color: "var(--ink, #111)",
                  cursor: "pointer",
                }}
              >
                <IconPathfinderMinusBack size={13} />
                Minus Back
              </button>

              <button
                type="button"
                onClick={() => applyBooleanOperation("divide")}
                title="Divide: Cut and divide shapes into separate disjoint parts along all intersection lines"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  padding: "4px 6px",
                  fontSize: 9,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "1px solid var(--stroke, #e5e7eb)",
                  background: "var(--surface-solid, #fff)",
                  color: "var(--ink, #111)",
                  cursor: "pointer",
                }}
              >
                <IconPathfinderDivide size={13} />
                Divide
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* Convert Shape to Frame */}
      {selected.length === 1 && isConvertibleShape(selected[0]) && (
        <Section>
          <button
            type="button"
            onClick={() => convertShapeToFrame(selected[0].id)}
            title="Convert this shape into a photo Frame mask container"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: "1px solid rgba(99, 102, 241, 0.3)",
              background: "rgba(99, 102, 241, 0.08)",
              color: "var(--accent, #6366f1)",
              cursor: "pointer",
            }}
          >
            <span>🖼️</span>
            <span>Convert to Frame</span>
          </button>
        </Section>
      )}

      {/* Layers */}
      <Section>
        <div style={{ display: "flex", gap: 3 }}>
          <IconBtn onClick={() => sendToBack(ids)} title="Send to back">
            <IconSendToBack size={14} />
          </IconBtn>
          <IconBtn onClick={() => sendBackward(ids)} title="Send backward">
            <IconSendBackward size={14} />
          </IconBtn>
          <IconBtn onClick={() => bringForward(ids)} title="Bring forward">
            <IconBringForward size={14} />
          </IconBtn>
          <IconBtn onClick={() => bringToFront(ids)} title="Bring to front">
            <IconBringToFront size={14} />
          </IconBtn>
        </div>
      </Section>

      {/* Actions */}
      <Section>
        <div style={{ display: "flex", gap: 3 }}>
          <IconBtn
            onClick={() => {
              copyElements(ids);
              pasteElements();
            }}
            title="Duplicate"
          >
            <IconDuplicate size={14} />
          </IconBtn>
          <IconBtn onClick={() => deleteElements(ids)} title="Delete" danger>
            <IconTrash size={14} />
          </IconBtn>
          {selected.length > 1 && (
            <IconBtn onClick={() => groupElements(ids)} title="Group">
              <IconGroup size={14} />
            </IconBtn>
          )}
          {selected.some((el) => el.groupIds.length > 0) && (
            <IconBtn onClick={() => ungroupElements(ids)} title="Ungroup">
              <IconLink size={14} />
            </IconBtn>
          )}
        </div>
      </Section>
    </>
  );
}
