"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { unionBBox } from "@/lib/engine/bounds";
import { isConvertibleShape } from "@/lib/engine/frameMask";
import { getCached } from "@/lib/engine/imageCache";
import { getObjectContextCategory } from "@/lib/engine/objectContext";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, ImageElement } from "@/lib/engine/types";
import { getObjectContextIcon } from "./objectContextIcons";
import { IMAGE_TOOL_LABELS, type ImageToolId } from "./PropertiesPanel/imageToolTypes";

const VisionObjectIsolator = dynamic(() => import("./PropertiesPanel/VisionObjectIsolator"), {
  ssr: false,
});

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
  width: 30,
  minWidth: 30,
  height: 30,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid transparent",
  borderRadius: 7,
  background: "transparent",
  color: "var(--ink-muted, #475569)",
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
  transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
};

function action(label: string, onClick: () => void, disabled = false, active = false) {
  return (
    <button
      type="button"
      key={label}
      className="object-context-button"
      data-context-label={label}
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...buttonStyle,
        background: active ? "var(--accent-soft, rgba(79, 70, 229, 0.12))" : buttonStyle.background,
        color: active ? "var(--accent, #4f46e5)" : buttonStyle.color,
        borderColor: active
          ? "color-mix(in srgb, var(--accent, #4f46e5) 28%, transparent)"
          : undefined,
        opacity: disabled ? 0.42 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span aria-hidden="true" className="object-context-icon">
        {getObjectContextIcon(label, { size: 15, className: "object-context-svg" })}
      </span>
    </button>
  );
}

function divider(key: string) {
  return <span key={key} className="object-context-divider" aria-hidden="true" />;
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
  const bbox = useMemo(() => unionBBox(selected), [selected]);
  const topPoint = bbox ? worldToScreen({ x: bbox.x + bbox.width / 2, y: bbox.y }) : { x: 0, y: 0 };
  const bottomPoint = bbox
    ? worldToScreen({ x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height })
    : { x: 0, y: 0 };
  const placeBelow = topPoint.y - barSize.height - 10 * scale < 4;
  const barPosition = {
    left: topPoint.x,
    top: placeBelow ? bottomPoint.y + 10 * scale : topPoint.y - barSize.height - 10 * scale,
  };

  useEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const parent = element.parentElement;
    const updateSize = () => {
      setBarSize({ width: element.offsetWidth, height: element.offsetHeight });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    if (parent) observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const first = selected[0];
  const firstId = first?.id;
  const [activeImageTool, setActiveImageTool] = useState<ImageToolId | null>(null);
  useEffect(() => {
    if (!firstId) {
      setActiveImageTool(null);
      return;
    }
    setActiveImageTool(null);
  }, [firstId]);

  if (isDragging || !first) return null;

  const ids = selected.map((element) => element.id);
  const { category } = getObjectContextCategory(selected);
  const apply = (patch: Partial<EngineElement>, label: string) =>
    updateElements(
      ids.map((id) => ({ id, patch })),
      label,
    );
  const allShapes =
    selected.length >= 2 && selected.every((element) => shapeTypes.has(element.type));
  const controls: ReactNode[] = [];
  const toggleImageTool = (tool: ImageToolId) =>
    setActiveImageTool((current) => (current === tool ? null : tool));

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
    controls.push(action("Flip Horizontal", () => flipHorizontal(ids)));
    controls.push(action("Flip Vertical", () => flipVertical(ids)));
    controls.push(
      action("Rotate 90°", () => apply({ angle: first.angle + Math.PI / 2 }, "rotate image")),
    );
    controls.push(
      action(
        "Crop",
        () => setCroppingImageId(croppingImageId === first.id ? null : first.id),
        false,
        croppingImageId === first.id,
      ),
    );
    controls.push(divider("image-tools"));
    controls.push(
      action(
        IMAGE_TOOL_LABELS["remove-bg"],
        () => toggleImageTool("remove-bg"),
        false,
        activeImageTool === "remove-bg",
      ),
    );
    controls.push(
      action(
        IMAGE_TOOL_LABELS.vectorize1,
        () => toggleImageTool("vectorize1"),
        false,
        activeImageTool === "vectorize1",
      ),
    );
    controls.push(
      action(
        IMAGE_TOOL_LABELS.vectorize2,
        () => toggleImageTool("vectorize2"),
        false,
        activeImageTool === "vectorize2",
      ),
    );
    controls.push(
      action(
        IMAGE_TOOL_LABELS.vectorize3,
        () => toggleImageTool("vectorize3"),
        false,
        activeImageTool === "vectorize3",
      ),
    );
    controls.push(divider("image-export"));
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
    controls.push(action("Flip Horizontal", () => flipHorizontal(ids)));
    controls.push(action("Flip Vertical", () => flipVertical(ids)));
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
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        minHeight: 38,
        height: "auto",
        width: "max-content",
        maxWidth: "calc(100% - 12px)",
        padding: "4px 6px",
        overflow: "visible",
        border: "1px solid color-mix(in srgb, var(--stroke-strong, #cbd5e1) 72%, transparent)",
        borderRadius: 10,
        background: "var(--surface-solid, #fff)",
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.42), 0 2px 6px rgba(15, 23, 42, 0.08)",
        boxSizing: "border-box",
      }}
    >
      <span
        className="object-context-category"
        role="img"
        title={category ?? "Object"}
        aria-label={category ?? "Object"}
        style={{
          width: 22,
          minWidth: 22,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          lineHeight: 1,
          color: "var(--accent, #4f46e5)",
        }}
      >
        {getObjectContextIcon(category ?? "Object", {
          size: 16,
          className: "object-context-svg",
        })}
      </span>
      {divider("category")}
      {controls}
      {activeImageTool && first.type === "image" ? (
        <div
          role="dialog"
          aria-label={`${IMAGE_TOOL_LABELS[activeImageTool]} settings`}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(380px, calc(100vw - 24px))",
            maxHeight: "min(640px, calc(100vh - 24px))",
            overflowY: "auto",
            padding: 6,
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 9,
            background: "var(--surface-solid, #fff)",
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.2)",
          }}
        >
          <VisionObjectIsolator element={first as ImageElement} activeTool={activeImageTool} />
        </div>
      ) : null}
      <style jsx global>{`
        .object-context-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 15px;
          height: 15px;
          line-height: 0;
        }
        .object-context-svg {
          display: block;
          width: 15px;
          height: 15px;
          overflow: visible;
        }
        .object-context-button {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .object-context-button:hover:not(:disabled) {
          background: var(--accent-soft, rgba(79, 70, 229, 0.1)) !important;
          border-color: var(--stroke-strong, rgba(15, 20, 35, 0.18)) !important;
          color: var(--accent, #4f46e5) !important;
        }
        .object-context-button:active:not(:disabled) {
          transform: scale(0.96);
        }
        .object-context-button:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--accent, #4f46e5) 52%, transparent);
          outline-offset: 2px;
        }
        .object-context-divider {
          flex: 0 0 1px;
          width: 1px;
          height: 18px;
          margin: 0 2px;
          background: var(--stroke-strong, rgba(15, 20, 35, 0.16));
          opacity: 0.72;
        }
        @media (prefers-reduced-motion: reduce) {
          .object-context-button { transition: none !important; }
        }
        @media (max-width: 720px) {
          .object-context-bar { gap: 2px !important; }
          .object-context-bar button { min-width: 28px; width: 28px; height: 28px; }
          .object-context-icon,
          .object-context-svg { width: 14px; height: 14px; }
          .object-context-divider { height: 16px; margin-inline: 1px; }
        }
      `}</style>
    </div>
  );
}
