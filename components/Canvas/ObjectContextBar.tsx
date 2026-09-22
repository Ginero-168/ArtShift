"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { convertImageToBrief } from "@/lib/ai/briefGenerator";
import { IMAGE_MIX_PROMPT, requestCoPilotExternalTurn } from "@/lib/ai/coPilotRequestBus";
import { unionBBox } from "@/lib/engine/bounds";
import { isConvertibleShape } from "@/lib/engine/frameMask";
import { getCached } from "@/lib/engine/imageCache";
import { mergeSelectedElements } from "@/lib/engine/mergeElements";
import { getObjectContextBarTop, getObjectContextCategory } from "@/lib/engine/objectContext";
import { analyzeSelectionGroups } from "@/lib/engine/selectionGroups";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, ImageElement, VectorizedElement } from "@/lib/engine/types";
import { nextThaiFontCssFamily } from "@/lib/fonts";
import {
  downloadVectorizedSvg,
  getAtomicVectorizedOptionBarLabels,
} from "@/lib/vectorize/atomicVectorize";
import { preloadLayerSource } from "@/lib/vision/layerPreload";
import { getObjectContextIcon } from "./objectContextIcons";
import {
  EXTRACT_LABEL,
  IMAGE_ACTION_LABELS,
  type ImageActionId,
  isVectorizeTool,
  LAYER_LABEL,
  MULTI_ANGLE_LABEL,
  SKELETON_LABEL,
  VECTORIZE_GROUP_LABEL,
} from "./PropertiesPanel/imageToolTypes";
import { MultiAnglePanel } from "./PropertiesPanel/MultiAnglePanel";
import { PoseSkeletonRunner } from "./PropertiesPanel/PoseSkeletonRunner";

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
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
  transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
};

function action(
  label: string,
  onClick: () => void,
  disabled = false,
  active = false,
  onPointerEnter?: () => void,
) {
  const isDownload = label.toLowerCase() === "download";

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
      onPointerEnter={onPointerEnter}
      style={{
        ...buttonStyle,
        width: isDownload ? 30 : "auto",
        minWidth: isDownload ? 30 : 28,
        height: 30,
        padding: isDownload ? 0 : "0 7px",
        gap: isDownload ? 0 : 5,
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
        {getObjectContextIcon(label, { size: 14, className: "object-context-svg" })}
      </span>
      {!isDownload && (
        <span
          className="object-context-label"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-0.01em",
            userSelect: "none",
          }}
        >
          {label}
        </span>
      )}
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
  const setTool = useEngine((state) => state.setTool);
  const groupElements = useEngine((state) => state.groupElements);
  const ungroupElements = useEngine((state) => state.ungroupElements);
  const alignSelectedElements = useEngine((state) => state.alignSelectedElements);
  const distributeSelectedElements = useEngine((state) => state.distributeSelectedElements);
  const applyBooleanOperation = useEngine((state) => state.applyBooleanOperation);
  const replaceElementsWithMerged = useEngine((state) => state.replaceElementsWithMerged);
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
  const { top: barTop } = getObjectContextBarTop({
    topPointY: topPoint.y,
    bottomPointY: bottomPoint.y,
    barHeight: barSize.height,
    scale,
  });
  const barPosition = {
    left: topPoint.x,
    top: barTop,
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
  const [activeImageTool, setActiveImageTool] = useState<ImageActionId | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mixBusy, setMixBusy] = useState(false);
  useEffect(() => {
    if (!firstId) {
      setActiveImageTool(null);
      setBriefBusy(false);
      setMergeBusy(false);
      setMixBusy(false);
      return;
    }
    setActiveImageTool(null);
    setBriefBusy(false);
    setMergeBusy(false);
    setMixBusy(false);
  }, [firstId]);

  const selectedImageFileId = first?.type === "image" ? first.fileId : null;
  useEffect(() => {
    if (!selectedImageFileId) return;
    void preloadLayerSource(selectedImageFileId);
  }, [selectedImageFileId]);

  if (isDragging || !first) return null;

  const ids = selected.map((element) => element.id);
  const selectedImageIds = selected
    .filter((element): element is ImageElement => element.type === "image")
    .map((element) => element.id);
  const { category } = getObjectContextCategory(selected);
  const apply = (patch: Partial<EngineElement>, label: string) =>
    updateElements(
      ids.map((id) => ({ id, patch })),
      label,
    );
  const allShapes =
    selected.length >= 2 && selected.every((element) => shapeTypes.has(element.type));
  const controls: ReactNode[] = [];
  const toggleImageTool = (tool: ImageActionId) =>
    setActiveImageTool((current) => (current === tool ? null : tool));
  const toggleUpscale = () =>
    setActiveImageTool((current) => (current === "upscale" ? null : "upscale"));
  const toggleExtract = () =>
    setActiveImageTool((current) => (current === "extract" ? null : "extract"));
  const toggleLayer = () => setActiveImageTool((current) => (current === "layer" ? null : "layer"));
  const toggleMultiAngle = () =>
    setActiveImageTool((current) => (current === "multi-angle" ? null : "multi-angle"));
  const toggleSkeleton = () =>
    setActiveImageTool((current) => (current === "skeleton" ? null : "skeleton"));
  const toggleVectorize = () =>
    setActiveImageTool((current) => (isVectorizeTool(current) ? null : "vectorize2"));

  const selectionGroups = analyzeSelectionGroups(selected);

  const handleConvertToBrief = async (imgEl: ImageElement) => {
    if (briefBusy) return;
    setBriefBusy(true);
    try {
      await convertImageToBrief(imgEl, { cloudConsent: true });
    } catch {
      // convertImageToBrief already reports the failure to AI Assistance Chat.
    } finally {
      setBriefBusy(false);
    }
  };
  const handleMergeElements = async () => {
    if (!slide || selected.length < 2 || mergeBusy) return;
    setMergeBusy(true);
    try {
      const merged = await mergeSelectedElements(slide, ids);
      if (merged) {
        replaceElementsWithMerged(ids, merged);
      }
    } finally {
      setMergeBusy(false);
    }
  };

  const handleMixImages = () => {
    if (selectedImageIds.length < 2 || mixBusy) return;
    setMixBusy(true);
    useEngine.getState().selectOnly(selectedImageIds);
    requestCoPilotExternalTurn({
      prompt: IMAGE_MIX_PROMPT,
      imageObjectIds: selectedImageIds,
      openAssistant: true,
    });
    // Chat owns the long-running turn; release the Option Bar spinner shortly.
    window.setTimeout(() => setMixBusy(false), 600);
  };

  const vectorizedActions = getAtomicVectorizedOptionBarLabels(selected);
  if (vectorizedActions) {
    const vectorized = first as VectorizedElement;
    for (const label of vectorizedActions) {
      controls.push(
        action(label, () =>
          downloadVectorizedSvg(vectorized, `${vectorized.name || "vectorized"}.svg`),
        ),
      );
    }
  } else if (selected.length > 1) {
    controls.push(action("Align", () => alignSelectedElements("center")));
    controls.push(action("Distribute", () => distributeSelectedElements("horizontal")));
    if (selectionGroups.canGroup) {
      controls.push(action("Group", () => groupElements(ids)));
    }
    if (selectionGroups.canUngroup) {
      controls.push(action("Ungroup", () => ungroupElements(ids)));
    }
    controls.push(
      action(
        mergeBusy ? "Merging..." : "Merge",
        () => void handleMergeElements(),
        false,
        mergeBusy,
      ),
    );
    if (selectedImageIds.length >= 2) {
      controls.push(action(mixBusy ? "Mixing..." : "Mix", () => handleMixImages(), false, mixBusy));
    }
    if (allShapes && !selectionGroups.isSingleGroup) {
      controls.push(action("Unite", () => applyBooleanOperation("union")));
      controls.push(action("Minus Front", () => applyBooleanOperation("subtract")));
      controls.push(action("Intersect", () => applyBooleanOperation("intersect")));
      controls.push(action("Exclude", () => applyBooleanOperation("exclude")));
      controls.push(action("Minus Back", () => applyBooleanOperation("minusBack")));
      controls.push(action("Divide", () => applyBooleanOperation("divide")));
    }
  } else if (first.type === "image") {
    controls.push(
      action(IMAGE_ACTION_LABELS.upscale, toggleUpscale, false, activeImageTool === "upscale"),
    );
    controls.push(
      action(
        IMAGE_ACTION_LABELS["remove-bg"],
        () => toggleImageTool("remove-bg"),
        false,
        activeImageTool === "remove-bg",
      ),
    );
    controls.push(action(EXTRACT_LABEL, toggleExtract, false, activeImageTool === "extract"));
    controls.push(
      action(LAYER_LABEL, toggleLayer, false, activeImageTool === "layer", () => {
        void preloadLayerSource(first.fileId);
      }),
    );
    controls.push(
      action(MULTI_ANGLE_LABEL, toggleMultiAngle, false, activeImageTool === "multi-angle", () => {
        void preloadLayerSource(first.fileId);
      }),
    );
    const skeletonReady =
      first.status === "loaded" && first.naturalWidth >= 2 && first.naturalHeight >= 2;
    controls.push(
      action(SKELETON_LABEL, toggleSkeleton, !skeletonReady, activeImageTool === "skeleton"),
    );
    controls.push(
      action(VECTORIZE_GROUP_LABEL, toggleVectorize, false, isVectorizeTool(activeImageTool)),
    );
    controls.push(
      action(
        briefBusy ? "Creating Brief..." : "Brief",
        () => void handleConvertToBrief(first),
        false,
        briefBusy,
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
        apply({ fontFamily: nextThaiFontCssFamily(first.fontFamily) }, "font family"),
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

  const displayCategory = selectionGroups.isSingleGroup
    ? "Group"
    : selectionGroups.canGroup && selected.some((el) => (el.groupIds?.length ?? 0) > 0)
      ? "Selection"
      : (category ?? "Object");

  return (
    <div
      ref={barRef}
      className="object-context-bar"
      role="toolbar"
      aria-label={`${displayCategory} options`}
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
        title={displayCategory}
        aria-label={displayCategory}
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
        {getObjectContextIcon(displayCategory, {
          size: 16,
          className: "object-context-svg",
        })}
      </span>
      {divider("category")}
      {controls}
      {activeImageTool && first.type === "image" ? (
        activeImageTool === "skeleton" ? (
          <PoseSkeletonRunner
            element={first}
            onComplete={() =>
              setActiveImageTool((current) => (current === "skeleton" ? null : current))
            }
          />
        ) : activeImageTool === "remove-bg" || activeImageTool === "extract" ? (
          <div
            data-testid={activeImageTool === "remove-bg" ? "remove-bg-runner" : "extract-runner"}
            style={{ display: "none" }}
          >
            <VisionObjectIsolator
              element={first as ImageElement}
              activeTool={activeImageTool}
              autoRun
              onToolComplete={() =>
                setActiveImageTool((current) => (current === activeImageTool ? null : current))
              }
            />
          </div>
        ) : (
          <div
            role="dialog"
            data-testid={activeImageTool === "layer" ? "layer-panel" : undefined}
            aria-label={
              isVectorizeTool(activeImageTool)
                ? "Vectorize settings"
                : `${IMAGE_ACTION_LABELS[activeImageTool]} settings`
            }
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              width:
                activeImageTool === "multi-angle"
                  ? "min(340px, calc(100vw - 24px))"
                  : activeImageTool === "layer"
                    ? "min(300px, calc(100vw - 24px))"
                    : "min(380px, calc(100vw - 24px))",
              maxHeight: "min(640px, calc(100vh - 24px))",
              overflowY: "auto",
              padding: 6,
              border: "1px solid var(--stroke, #e5e7eb)",
              borderRadius: 9,
              background: "var(--surface-solid, #fff)",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.2)",
            }}
          >
            {activeImageTool === "multi-angle" ? (
              <MultiAnglePanel element={first as ImageElement} />
            ) : (
              <VisionObjectIsolator
                element={first as ImageElement}
                activeTool={activeImageTool}
                onToolChange={(tool) => setActiveImageTool(tool)}
              />
            )}
          </div>
        )
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
        .object-context-bar,
        .object-context-button,
        .object-context-label {
          font-family: var(--font-sans);
        }
        .object-context-label {
          white-space: nowrap;
          user-select: none;
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
