"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { unionBBox } from "@/lib/engine/bounds";
import { isConvertibleShape } from "@/lib/engine/frameMask";
import { getCached } from "@/lib/engine/imageCache";
import { getObjectContextBarLeft, getObjectContextCategory } from "@/lib/engine/objectContext";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement } from "@/lib/engine/types";

const shapeTypes = new Set<EngineElement["type"]>([
  "rect",
  "ellipse",
  "diamond",
  "triangle",
  "star",
  "hexagon",
  "heart",
  "plus",
]);

const buttonStyle = {
  height: 25,
  padding: "0 7px",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  border: "1px solid var(--stroke, #e5e7eb)",
  borderRadius: 5,
  background: "var(--surface-solid, #fff)",
  color: "var(--ink, #111827)",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 650,
  whiteSpace: "nowrap" as const,
};

const iconFor = (label: string) =>
  ({
    "Flip H": "↔",
    "Flip V": "↕",
    "Rotate 90°": "↻",
    Crop: "⌗",
    Vector: "✒",
    Download: "↓",
    Align: "≡",
    Distribute: "⋮",
    Group: "□",
    Color: "●",
    Fill: "●",
    Stroke: "╱",
    "Fit canvas": "□",
    "Corner radius": "◰",
    "Edit nodes": "⌘",
    Edit: "✎",
    Detach: "↗",
    Font: "A",
    Size: "T",
    Weight: "B",
    Paragraph: "¶",
    Spacing: "↕",
    Unite: "∪",
    "Minus Front": "−",
    Intersect: "∩",
    Exclude: "⊗",
    "Minus Back": "−",
    Divide: "÷",
    "Convert to frame": "▧",
  })[label] ?? "•";

function action(label: string, onClick: () => void, disabled = false) {
  return (
    <button
      type="button"
      key={label}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...buttonStyle,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span aria-hidden="true" className="object-context-icon">
        {iconFor(label)}
      </span>
      <span className="object-context-label">{label}</span>
    </button>
  );
}

function focusElementInspector() {
  document.querySelector<HTMLElement>('[aria-label="Element options"]')?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
}

function requestCanvasEdit(kind: "path" | "frame", id: string) {
  window.dispatchEvent(new CustomEvent(`artshift:edit-${kind}`, { detail: { id } }));
}

function downloadCached(fileId: string, name: string) {
  const cached = getCached(fileId);
  if (!cached?.dataURL) return;
  const anchor = document.createElement("a");
  anchor.href = cached.dataURL;
  anchor.download = name;
  anchor.click();
}

export default function ObjectContextBar({
  worldToScreen,
  scale,
  isDragging = false,
}: {
  worldToScreen: (point: { x: number; y: number }) => { x: number; y: number };
  scale: number;
  isDragging?: boolean;
}) {
  const slide = useEngine((state) =>
    state.doc.slides.find((item) => item.id === state.currentSlideId),
  );
  const selectedIds = useEngine((state) => state.selectedIds);
  const updateElements = useEngine((state) => state.updateElements);
  const flipHorizontal = useEngine((state) => state.flipHorizontal);
  const flipVertical = useEngine((state) => state.flipVertical);
  const setCroppingImageId = useEngine((state) => state.setCroppingImageId);
  const croppingImageId = useEngine((state) => state.croppingImageId);
  const setTool = useEngine((state) => state.setTool);
  const groupElements = useEngine((state) => state.groupElements);
  const alignSelectedElements = useEngine((state) => state.alignSelectedElements);
  const distributeSelectedElements = useEngine((state) => state.distributeSelectedElements);
  const applyBooleanOperation = useEngine((state) => state.applyBooleanOperation);
  const convertShapeToFrame = useEngine((state) => state.convertShapeToFrame);
  const detachFrameImage = useEngine((state) => state.detachFrameImage);

  const selected =
    slide?.elements.filter((element) => selectedIds.has(element.id) && !element.isDeleted) ?? [];
  const barRef = useRef<HTMLDivElement>(null);
  const [barSize, setBarSize] = useState({ width: 0, height: 32 });
  const [viewportWidth, setViewportWidth] = useState(0);
  const bbox = useMemo(() => unionBBox(selected), [selected]);
  const topPoint = bbox ? worldToScreen({ x: bbox.x + bbox.width / 2, y: bbox.y }) : { x: 0, y: 0 };
  const bottomPoint = bbox
    ? worldToScreen({ x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height })
    : { x: 0, y: 0 };
  const placeBelow = topPoint.y - barSize.height - 10 * scale < 4;
  const barPosition = {
    left: getObjectContextBarLeft(topPoint.x, barSize.width, viewportWidth),
    top: placeBelow ? bottomPoint.y + 10 * scale : topPoint.y - barSize.height - 10 * scale,
  };

  useEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const parent = element.parentElement;
    const updateSize = () => {
      setBarSize({ width: element.offsetWidth, height: element.offsetHeight });
      if (parent) setViewportWidth(parent.clientWidth);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    if (parent) observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  if (isDragging || selected.length === 0) return null;

  const ids = selected.map((element) => element.id);
  const first = selected[0];
  const { category } = getObjectContextCategory(selected);
  const apply = (patch: Partial<EngineElement>, label: string) =>
    updateElements(
      ids.map((id) => ({ id, patch })),
      label,
    );
  const allShapes =
    selected.length >= 2 && selected.every((element) => shapeTypes.has(element.type));
  const controls: ReactNode[] = [];

  if (selected.length > 1) {
    controls.push(action("Align", () => alignSelectedElements("center")));
    controls.push(action("Distribute", () => distributeSelectedElements("horizontal")));
    controls.push(action("Group", () => groupElements(ids)));
    if (allShapes) {
      controls.push(action("Unite", () => applyBooleanOperation("union")));
      controls.push(action("Minus Front", () => applyBooleanOperation("subtract")));
      controls.push(action("Intersect", () => applyBooleanOperation("intersect")));
      controls.push(action("Exclude", () => applyBooleanOperation("exclude")));
      controls.push(action("Minus Back", () => applyBooleanOperation("minusBack")));
      controls.push(action("Divide", () => applyBooleanOperation("divide")));
    }
  } else if (first.type === "image") {
    controls.push(action("Flip H", () => flipHorizontal(ids)));
    controls.push(action("Flip V", () => flipVertical(ids)));
    controls.push(
      action("Rotate 90°", () => apply({ angle: first.angle + Math.PI / 2 }, "rotate image")),
    );
    controls.push(
      action("Crop", () => setCroppingImageId(croppingImageId === first.id ? null : first.id)),
    );
    controls.push(action("Vector", focusElementInspector));
    controls.push(
      action("Download", () => downloadCached(first.fileId, first.sourceName || "image")),
    );
  } else if (first.type === "path") {
    controls.push(
      action("Color", () =>
        apply(
          { strokeColor: first.strokeColor === "#111827" ? "#4f46e5" : "#111827" },
          "vector color",
        ),
      ),
    );
    controls.push(
      action("Edit nodes", () => {
        setTool("directSelect");
        requestCanvasEdit("path", first.id);
      }),
    );
    controls.push(action("Flip H", () => flipHorizontal(ids)));
    controls.push(action("Flip V", () => flipVertical(ids)));
    if (isConvertibleShape(first))
      controls.push(action("Convert to frame", () => convertShapeToFrame(first.id)));
  } else if (first.type === "bookMockup") {
    controls.push(action("Edit", focusElementInspector));
    controls.push(
      action("Download", () => downloadCached(first.fileId, first.sourceName || "book-cover")),
    );
  } else if (first.type === "frame") {
    controls.push(action("Edit", () => requestCanvasEdit("frame", first.id)));
    const frameImageId = first.imageFileId;
    if (frameImageId) controls.push(action("Detach", () => detachFrameImage(first.id)));
    if (frameImageId)
      controls.push(
        action("Download", () => downloadCached(frameImageId, first.name || "frame-image")),
      );
  } else if (first.type === "text") {
    controls.push(
      action("Color", () =>
        apply(
          { strokeColor: first.strokeColor === "#ffffff" ? "#111827" : "#ffffff" },
          "text color",
        ),
      ),
    );
    controls.push(
      action("Font", () =>
        apply({ fontFamily: first.fontFamily === "Inter" ? "Arial" : "Inter" }, "font family"),
      ),
    );
    controls.push(
      action("Size", () =>
        apply({ fontSize: first.fontSize >= 48 ? 24 : first.fontSize + 4 }, "font size"),
      ),
    );
    controls.push(
      action("Weight", () =>
        apply({ fontStyle: first.fontStyle.includes("bold") ? "normal" : "bold" }, "text weight"),
      ),
    );
    controls.push(
      action("Paragraph", () =>
        apply({ textAlign: first.textAlign === "left" ? "center" : "left" }, "paragraph alignment"),
      ),
    );
    controls.push(
      action("Spacing", () =>
        apply({ lineHeight: first.lineHeight >= 1.5 ? 1.2 : 1.5 }, "line spacing"),
      ),
    );
  } else if (shapeTypes.has(first.type)) {
    controls.push(
      action("Fill", () =>
        apply(
          { backgroundColor: first.backgroundColor === "transparent" ? "#6366f1" : "transparent" },
          "shape fill",
        ),
      ),
    );
    controls.push(
      action("Stroke", () =>
        apply(
          { strokeColor: first.strokeColor === "transparent" ? "#111827" : "transparent" },
          "shape stroke",
        ),
      ),
    );
    controls.push(
      action("Fit canvas", () =>
        apply(
          { x: 0, y: 0, width: slide?.width ?? first.width, height: slide?.height ?? first.height },
          "fit shape to canvas",
        ),
      ),
    );
    if (first.type === "rect")
      controls.push(
        action("Corner radius", () =>
          apply({ cornerRadius: first.cornerRadius ? 0 : 24 }, "corner radius"),
        ),
      );
    if (isConvertibleShape(first))
      controls.push(action("Convert to frame", () => convertShapeToFrame(first.id)));
  }

  if (controls.length === 0) return null;

  return (
    <div
      ref={barRef}
      className="object-context-bar"
      role="toolbar"
      aria-label={`${category ?? "Object"} options`}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: barPosition.left,
        top: barPosition.top,
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 32,
        minHeight: 32,
        width: "max-content",
        maxWidth: "none",
        padding: "3px 5px",
        overflow: "visible",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 7,
        background: "var(--surface-solid, #fff)",
        boxShadow: "0 3px 10px rgba(15, 23, 42, 0.16)",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 750,
          color: "var(--accent, #4f46e5)",
          padding: "0 4px",
        }}
      >
        {category}
      </span>
      {controls}
      <style jsx global>{`
        .object-context-icon { display: none; line-height: 1; font-size: 14px; }
        @media (max-width: 720px) {
          .object-context-bar { gap: 2px !important; }
          .object-context-bar button { min-width: 25px; width: 25px; padding: 0 !important; justify-content: center; }
          .object-context-label { display: none; }
          .object-context-icon { display: inline; }
        }
      `}</style>
    </div>
  );
}
