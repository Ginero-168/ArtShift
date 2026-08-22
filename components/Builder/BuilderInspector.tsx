"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BookMockupSection } from "@/components/Canvas/PropertiesPanel/BookMockupSection";
import {
  IconAlignBottom,
  IconAlignCenterH,
  IconAlignLeft,
  IconAlignMiddleV,
  IconAlignRight,
  IconAlignTop,
  IconDistributeH,
  IconDistributeV,
  IconPathfinderDivide,
  IconPathfinderExclude,
  IconPathfinderIntersect,
  IconPathfinderMinusBack,
  IconPathfinderMinusFront,
  IconPathfinderUnite,
} from "@/components/icons";
import { getBuilderBlockDefinition } from "@/lib/builder/blocks";
import {
  getTextPreset,
  inferTextPresetId,
  TEXT_PRESETS,
  type TextPresetId,
  textPresetPatch,
} from "@/lib/builder/textPresets";
import type { ColorAdjustments } from "@/lib/color/adjustments";
import { isConvertibleShape } from "@/lib/engine/frameMask";
import { getHexGridDimensions } from "@/lib/engine/hexLayout";
import { fileToDataURL, loadDataURL } from "@/lib/engine/imageCache";
import { getLayerForObject } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";
import { getTextSafePadding, measureTextElementHeight } from "@/lib/engine/textLayout";
import type {
  BlockPlacement,
  BookMockupElement,
  EngineElement,
  FrameElement,
  FrameMaskShape,
  ImageElement,
  TextElement,
  VectorPathElement,
} from "@/lib/engine/types";
import { isShapeElement } from "@/lib/engine/vectorBoolean";
import { convertElementToVectorPath, smoothVectorPathNodes } from "@/lib/engine/vectorPath";
import { THAI_FONTS } from "@/lib/fonts";
import { BlockIcon } from "./BlockIcon";
import styles from "./Builder.module.css";
import ColorPickerInput from "./ColorPickerInput";

// Vectorizer + Florence/RMBG dependencies are large and only needed for an
// image selection. Keep them out of the editor's initial client bundle.
const VisionObjectIsolator = dynamic(
  () => import("@/components/Canvas/PropertiesPanel/VisionObjectIsolator"),
  { ssr: false },
);

const DEFAULT_GRADIENT_COLORS: string[] = ["#6366f1", "#a855f7"];
const DEFAULT_GRADIENT_STOPS: number[] = [0, 1];

const FRAME_SHAPES: { shape: FrameMaskShape; label: string; glyph: string }[] = [
  { shape: "circle", label: "Circle", glyph: "◎" },
  { shape: "roundedRect", label: "Rounded", glyph: "▢" },
  { shape: "diamond", label: "Diamond", glyph: "◇" },
  { shape: "triangle", label: "Triangle", glyph: "△" },
  { shape: "star", label: "Star", glyph: "★" },
  { shape: "heart", label: "Heart", glyph: "♥" },
  { shape: "hexagon", label: "Hexagon", glyph: "⬡" },
  { shape: "plus", label: "Plus", glyph: "✚" },
  { shape: "arch", label: "Arch", glyph: "∩" },
  { shape: "blob", label: "Blob", glyph: "🫧" },
  { shape: "polaroid", label: "Polaroid", glyph: "🖼" },
  { shape: "rect", label: "Rect", glyph: "□" },
];

export default function BuilderInspector() {
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const selectedIds = useEngine((state) => state.selectedIds);
  const activeLayerId = useEngine((state) => state.activeLayerId);
  const updateElements = useEngine((state) => state.updateElements);
  const updateBlockPlacement = useEngine((state) => state.updateBlockPlacement);
  const setFrameImage = useEngine((state) => state.setFrameImage);
  const detachFrameImage = useEngine((state) => state.detachFrameImage);
  const alignSelectedElements = useEngine((state) => state.alignSelectedElements);
  const distributeSelectedElements = useEngine((state) => state.distributeSelectedElements);
  const setSlideBackground = useEngine((state) => state.setSlideBackground);
  const doc = useEngine((state) => state.doc);
  const strictness = doc.workspaceStrictness;
  const strictnessLevel = doc.strictnessLevel ?? (strictness === 1 ? 1 : strictness === 2 ? 2 : 3);
  const strictnessValues = doc.strictnessValues ?? { 2: 1, 3: 2 };
  const setWorkspaceStrictness = useEngine((state) => state.setWorkspaceStrictness);
  const setStrictnessValue = useEngine((state) => state.setStrictnessValue);

  const statusText =
    strictnessLevel === 1
      ? "No shared cells"
      : `Overlap by ${strictnessValues[strictnessLevel as 2 | 3] ?? 1} cell${(strictnessValues[strictnessLevel as 2 | 3] ?? 1) > 1 ? "s" : ""}`;
  const croppingImageId = useEngine((state) => state.croppingImageId);
  const setCroppingImageId = useEngine((state) => state.setCroppingImageId);
  const applyBooleanOperation = useEngine((state) => state.applyBooleanOperation);

  const selected = useMemo(
    () =>
      slide?.elements.filter((element) => selectedIds.has(element.id) && !element.isDeleted) ?? [],
    [selectedIds, slide],
  );

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
  const first = selected[0];
  const homogeneousType = first ? selected.every((element) => element.type === first.type) : false;
  const singleSelection = selected.length === 1;
  const activeLayer = slide
    ? first
      ? getLayerForObject(slide, first.id)
      : slide.layers.find((layer) => layer.id === activeLayerId)
    : undefined;
  const firstPlacement = first ? activeLayer?.placements[first.id] : undefined;
  const hexGrid = getHexGridDimensions(slide?.width ?? 1920, slide?.height ?? 1080);

  const apply = (patch: Partial<EngineElement>, label: string) => {
    if (!selected.length) return;
    updateElements(
      selected.map((element) => ({ id: element.id, patch })),
      label,
    );
  };

  function updateBlock(patch: Partial<BlockPlacement>) {
    if (!firstPlacement || !first) return;
    updateBlockPlacement(first.id, patch);
  }

  const builderKind = first?.builderKind;
  const blockDefinition = builderKind ? getBuilderBlockDefinition(builderKind) : undefined;

  return (
    <aside className={styles.inspector} aria-label="Element options">
      <div className={styles.inspectorHeader}>
        <div>
          <span className={styles.kicker}>{selected.length ? "EDIT" : "ARTWORK"}</span>
          <h2>
            {selected.length > 1
              ? `${selected.length} elements`
              : (blockDefinition?.label ?? typeName(first))}
          </h2>
        </div>
        {first && activeLayer ? (
          <span className={styles.typeChip}>{activeLayer.mode.toUpperCase()}</span>
        ) : null}
      </div>

      <div className={styles.inspectorScroll}>
        {!first && slide ? (
          <>
            <div className={styles.emptyInspector}>
              Select an element on the artwork to reveal its detailed controls. Drag blocks from the
              library to compose the layout.
            </div>
            <div className={styles.optionSection}>
              <div className={styles.strictnessHeading}>
                <span>Workspace strictness</span>
                <strong>{statusText}</strong>
              </div>
              <div className={styles.strictnessTabs} role="group" aria-label="Workspace strictness">
                <button
                  type="button"
                  key={1}
                  aria-pressed={strictnessLevel === 1}
                  className={strictnessLevel === 1 ? styles.strictnessActive : undefined}
                  onClick={() => setWorkspaceStrictness(1)}
                >
                  <b>1</b>
                  <span className={styles.strictnessLabel}>Exact</span>
                </button>

                <button
                  type="button"
                  key={2}
                  aria-pressed={strictnessLevel === 2}
                  className={strictnessLevel === 2 ? styles.strictnessActive : undefined}
                  onClick={() => setWorkspaceStrictness(2)}
                >
                  <b>2</b>
                  <span className={styles.strictnessLabel}>
                    +
                    <input
                      type="number"
                      min={1}
                      max={99}
                      className={styles.strictnessInput}
                      value={strictnessValues[2] ?? 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (strictnessLevel !== 2) setWorkspaceStrictness(2);
                      }}
                      onChange={(e) => {
                        const val = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(val)) {
                          setStrictnessValue(2, val);
                        }
                      }}
                      title="Edit overlap cells for Level 2"
                    />
                    cell
                  </span>
                </button>

                <button
                  type="button"
                  key={3}
                  aria-pressed={strictnessLevel === 3}
                  className={strictnessLevel === 3 ? styles.strictnessActive : undefined}
                  onClick={() => setWorkspaceStrictness(3)}
                >
                  <b>3</b>
                  <span className={styles.strictnessLabel}>
                    +
                    <input
                      type="number"
                      min={1}
                      max={99}
                      className={styles.strictnessInput}
                      value={strictnessValues[3] ?? 2}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (strictnessLevel !== 3) setWorkspaceStrictness(3);
                      }}
                      onChange={(e) => {
                        const val = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(val)) {
                          setStrictnessValue(3, val);
                        }
                      }}
                      title="Edit overlap cells for Level 3"
                    />
                    cell
                  </span>
                </button>
              </div>
            </div>

            <div className={styles.optionSection}>
              <h3>Canvas</h3>
              <div className={styles.field}>
                <span>Background</span>
                <ColorPickerInput
                  value={slide.background}
                  onChange={(color) => setSlideBackground(slide.id, color)}
                  allowTransparent={false}
                />
              </div>
              <div className={styles.metaRow}>
                <span>Dimensions</span>
                <strong>
                  {slide.width} × {slide.height}
                </strong>
              </div>
            </div>
          </>
        ) : null}

        {first ? (
          <>
            {/* Topmost Alignment Toolbar with Icons */}
            <div className={styles.topAlignSection}>
              <div className={styles.alignToolbarRow}>
                <button
                  type="button"
                  className={styles.alignIconButton}
                  onClick={() => alignSelectedElements("left")}
                  title="Align left"
                >
                  <IconAlignLeft size={14} />
                </button>
                <button
                  type="button"
                  className={styles.alignIconButton}
                  onClick={() => alignSelectedElements("center")}
                  title="Align horizontal center"
                >
                  <IconAlignCenterH size={14} />
                </button>
                <button
                  type="button"
                  className={styles.alignIconButton}
                  onClick={() => alignSelectedElements("right")}
                  title="Align right"
                >
                  <IconAlignRight size={14} />
                </button>
                <div className={styles.alignDivider} />
                <button
                  type="button"
                  className={styles.alignIconButton}
                  onClick={() => alignSelectedElements("top")}
                  title="Align top"
                >
                  <IconAlignTop size={14} />
                </button>
                <button
                  type="button"
                  className={styles.alignIconButton}
                  onClick={() => alignSelectedElements("middle")}
                  title="Align vertical middle"
                >
                  <IconAlignMiddleV size={14} />
                </button>
                <button
                  type="button"
                  className={styles.alignIconButton}
                  onClick={() => alignSelectedElements("bottom")}
                  title="Align bottom"
                >
                  <IconAlignBottom size={14} />
                </button>
                {selected.length >= 3 && (
                  <>
                    <div className={styles.alignDivider} />
                    <button
                      type="button"
                      className={styles.alignIconButton}
                      onClick={() => distributeSelectedElements("horizontal")}
                      title="Distribute horizontally"
                    >
                      <IconDistributeH size={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.alignIconButton}
                      onClick={() => distributeSelectedElements("vertical")}
                      title="Distribute vertically"
                    >
                      <IconDistributeV size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {shapesInSelectionOrGroup.length >= 2 && (
              <div className={styles.optionSection}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>
                    Pathfinder
                  </h3>
                  <span
                    style={{
                      fontSize: 9.5,
                      color: "var(--accent, #6366f1)",
                      fontWeight: 600,
                    }}
                  >
                    {shapesInSelectionOrGroup.length} shapes
                  </span>
                </div>

                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  <button
                    type="button"
                    className={styles.alignIconButton}
                    style={{
                      flex: 1,
                      height: 36,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      padding: 2,
                    }}
                    onClick={() => applyBooleanOperation("union")}
                    title="Unite: Merge shapes into one (⌘⌥U)"
                  >
                    <IconPathfinderUnite size={14} />
                    <span style={{ fontSize: 8.5, fontWeight: 600 }}>Unite</span>
                  </button>

                  <button
                    type="button"
                    className={styles.alignIconButton}
                    style={{
                      flex: 1,
                      height: 36,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      padding: 2,
                    }}
                    onClick={() => applyBooleanOperation("subtract")}
                    title="Minus Front: Cut bottom with top shapes (⌘⌥-)"
                  >
                    <IconPathfinderMinusFront size={14} />
                    <span style={{ fontSize: 8.5, fontWeight: 600 }}>Minus Front</span>
                  </button>

                  <button
                    type="button"
                    className={styles.alignIconButton}
                    style={{
                      flex: 1,
                      height: 36,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      padding: 2,
                    }}
                    onClick={() => applyBooleanOperation("intersect")}
                    title="Intersect: Keep overlapping area (⌘⌥I)"
                  >
                    <IconPathfinderIntersect size={14} />
                    <span style={{ fontSize: 8.5, fontWeight: 600 }}>Intersect</span>
                  </button>

                  <button
                    type="button"
                    className={styles.alignIconButton}
                    style={{
                      flex: 1,
                      height: 36,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      padding: 2,
                    }}
                    onClick={() => applyBooleanOperation("exclude")}
                    title="Exclude: Remove overlapping area (⌘⌥X)"
                  >
                    <IconPathfinderExclude size={14} />
                    <span style={{ fontSize: 8.5, fontWeight: 600 }}>Exclude</span>
                  </button>
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className={styles.alignIconButton}
                    style={{
                      flex: 1,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: "2px 6px",
                    }}
                    onClick={() => applyBooleanOperation("minusBack")}
                    title="Minus Back: Cut top with bottom shapes"
                  >
                    <IconPathfinderMinusBack size={13} />
                    <span style={{ fontSize: 9.5, fontWeight: 600 }}>Minus Back</span>
                  </button>

                  <button
                    type="button"
                    className={styles.alignIconButton}
                    style={{
                      flex: 1,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: "2px 6px",
                    }}
                    onClick={() => applyBooleanOperation("divide")}
                    title="Divide: Split shapes into disjoint pieces"
                  >
                    <IconPathfinderDivide size={13} />
                    <span style={{ fontSize: 9.5, fontWeight: 600 }}>Divide</span>
                  </button>
                </div>
              </div>
            )}

            {firstPlacement && slide && singleSelection ? (
              <div className={styles.optionSection}>
                <h3>
                  Hex placement · {hexGrid.columns} × {hexGrid.rows}
                </h3>
                <div className={styles.compactNumberGrid}>
                  <CompactNumberField
                    label="Col"
                    title="Column"
                    value={firstPlacement.col + 1}
                    min={1}
                    max={hexGrid.columns + 1 - firstPlacement.colSpan}
                    onChange={(value) => updateBlock({ col: value - 1 })}
                  />
                  <CompactNumberField
                    label="Row"
                    title="Row"
                    value={firstPlacement.row + 1}
                    min={1}
                    max={hexGrid.rows + 1 - firstPlacement.rowSpan}
                    onChange={(value) => updateBlock({ row: value - 1 })}
                  />
                  <CompactNumberField
                    label="W"
                    title="Width (Columns)"
                    value={firstPlacement.colSpan}
                    min={firstPlacement.minColSpan ?? 1}
                    max={hexGrid.columns - firstPlacement.col}
                    onChange={(value) => updateBlock({ colSpan: value })}
                  />
                  <CompactNumberField
                    label="H"
                    title="Height (Rows)"
                    value={firstPlacement.rowSpan}
                    min={firstPlacement.minRowSpan ?? 1}
                    max={hexGrid.rows - firstPlacement.row}
                    onChange={(value) => updateBlock({ rowSpan: value })}
                  />
                </div>
              </div>
            ) : singleSelection ? (
              <TransformSection element={first} apply={apply} />
            ) : null}

            {homogeneousType && first.type === "text" ? (
              <TextOptions
                text={first}
                apply={apply as TextApply}
                blockManaged={activeLayer?.mode === "block"}
              />
            ) : null}

            {homogeneousType && (first.type === "image" || first.type === "bookMockup") ? (
              <MediaOptions
                element={first}
                apply={apply}
                cropActive={croppingImageId === first.id}
                onToggleCrop={() =>
                  first.type === "image"
                    ? setCroppingImageId(croppingImageId === first.id ? null : first.id)
                    : undefined
                }
              />
            ) : null}

            {homogeneousType && first.type === "bookMockup" ? (
              <BookMockupSection
                mockup={first}
                apply={(patch, label) => apply(patch as Partial<EngineElement>, label)}
              />
            ) : null}

            {homogeneousType && first.type === "path" ? (
              <VectorPathOptions path={first} apply={apply as VectorPathApply} />
            ) : null}

            {homogeneousType &&
            (first.type === "rect" ||
              first.type === "ellipse" ||
              first.type === "diamond" ||
              first.type === "triangle" ||
              first.type === "star" ||
              first.type === "hexagon" ||
              first.type === "heart" ||
              first.type === "plus" ||
              first.type === "line" ||
              first.type === "arrow" ||
              first.type === "freedraw") ? (
              <div className={styles.optionSection}>
                <h3>Vector Nodes</h3>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  style={{ width: "100%", justifyContent: "center", gap: 6 }}
                  onClick={() => {
                    const converted = convertElementToVectorPath(first);
                    if (converted) {
                      useEngine
                        .getState()
                        .updateElements(
                          [{ id: first.id, patch: converted }],
                          "convert to editable vector path",
                        );
                    }
                  }}
                >
                  <span>✒ Convert to Editable Path</span>
                </button>
                <p className={styles.fieldNote}>
                  Double-click artwork on canvas to edit anchor points directly.
                </p>
              </div>
            ) : null}

            {selected.length === 1 && isConvertibleShape(first) ? (
              <div className={styles.optionSection}>
                <h3>Photo Frame</h3>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    gap: 6,
                    color: "var(--accent, #6366f1)",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    useEngine.getState().convertShapeToFrame(first.id);
                  }}
                >
                  <span>🖼️ Convert to Photo Frame</span>
                </button>
                <p className={styles.fieldNote}>
                  Transform this shape into a photo frame container with direct image clipping.
                </p>
              </div>
            ) : null}

            {selected.some((element) => element.type === "frame") ? (
              <FrameMaskOptions
                frame={
                  selected.find(
                    (el): el is Extract<EngineElement, { type: "frame" }> => el.type === "frame",
                  )!
                }
                selected={selected}
                apply={apply}
                onSetImage={(fileId) =>
                  setFrameImage(selected.find((el) => el.type === "frame")!.id, fileId)
                }
                onDetachImage={() =>
                  detachFrameImage(selected.find((el) => el.type === "frame")!.id)
                }
                onUpdateChildren={(childIds) =>
                  updateElements(
                    [{ id: selected.find((el) => el.type === "frame")!.id, patch: { childIds } }],
                    "frame clipping",
                  )
                }
              />
            ) : null}

            <StyleOptions element={first} apply={apply} />
          </>
        ) : null}
      </div>
    </aside>
  );
}

type TextApply = (patch: Partial<TextElement>, label: string) => void;
type VectorPathApply = (patch: Partial<VectorPathElement>, label: string) => void;

function VectorPathOptions({ path, apply }: { path: VectorPathElement; apply: VectorPathApply }) {
  const [smoothing, setSmoothing] = useState(0);
  return (
    <div className={styles.optionSection}>
      <h3>Vector Path (Illustrator)</h3>
      <div className={styles.metaRow}>
        <span>Anchor Points</span>
        <strong>{path.nodes.length} nodes</strong>
      </div>
      <div className={styles.buttonRow}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => apply({ closed: !path.closed }, path.closed ? "open path" : "close path")}
        >
          {path.closed ? "⬡ Closed Path" : "⤹ Open Path"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => apply({ nodes: [...path.nodes].reverse() }, "reverse path")}
        >
          Reverse ⇄
        </button>
      </div>

      <div className={styles.buttonRow}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => {
            const sharpNodes = path.nodes.map(({ in: _in, out: _out, ...rest }) => rest);
            apply({ nodes: sharpNodes }, "convert all to corner points");
          }}
          title="Convert all anchor points to sharp corner vertices"
        >
          ◿ Sharp Corners
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => {
            const smoothNodes = smoothVectorPathNodes(path.nodes, 0.6, path.closed);
            apply({ nodes: smoothNodes }, "convert all to smooth curves");
          }}
          title="Convert all anchor points to smooth curve tangents"
        >
          ◠ Smooth Curves
        </button>
      </div>

      <label className={styles.rangeField}>
        <span>Smoothness</span>
        <input
          type="range"
          min={0}
          max={100}
          value={smoothing}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            setSmoothing(value);
            apply(
              { nodes: smoothVectorPathNodes(path.nodes, value / 100, path.closed) },
              "smooth path",
            );
          }}
        />
        <output>{smoothing}%</output>
      </label>

      <label className={styles.field}>
        <span>Fill rule</span>
        <select
          value={path.fillRule}
          onChange={(event) =>
            apply(
              { fillRule: event.currentTarget.value as VectorPathElement["fillRule"] },
              "path fill rule",
            )
          }
        >
          <option value="nonzero">Non-zero</option>
          <option value="evenodd">Even-odd</option>
        </select>
      </label>

      <div style={{ fontSize: 10.5, color: "#64748b", lineHeight: 1.4, marginTop: 4 }}>
        <div>
          • <strong>Drag square nodes</strong> to move anchor points
        </div>
        <div>
          • <strong>Drag circle knobs</strong> to bend Bezier curves
        </div>
        <div>
          • <strong>Hold Alt/Option</strong> while dragging handle to break angle
        </div>
        <div>
          • <strong>Double-click node</strong> to toggle Corner / Smooth
        </div>
        <div>
          • <strong>Click segment</strong> to add a new point (+)
        </div>
      </div>
    </div>
  );
}

function FrameMaskOptions({
  frame,
  selected,
  apply,
  onSetImage,
  onDetachImage,
  onUpdateChildren,
}: {
  frame: FrameElement;
  selected: EngineElement[];
  apply: (patch: Partial<EngineElement>, label: string) => void;
  onSetImage: (fileId: string | undefined) => void;
  onDetachImage: () => void;
  onUpdateChildren: (childIds: string[]) => void;
}) {
  const currentShape = frame.shape ?? "rect";
  const activeShapeInfo = FRAME_SHAPES.find((item) => item.shape === currentShape);
  const candidateIds = selected
    .filter((element) => element.id !== frame.id && element.type !== "frame")
    .map((element) => element.id);

  return (
    <div className={styles.optionSection}>
      <h3>Frame Mask</h3>

      {/* Shape Badge (Fixed type) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface-sunken, #f1f5f9)",
          padding: "6px 10px",
          borderRadius: 6,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 600,
            fontSize: "0.82rem",
            color: "var(--ink, #0f172a)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", color: "#2563eb" }}>
            <BlockIcon
              kind={
                (currentShape === "roundedRect"
                  ? "frameRounded"
                  : currentShape === "circle"
                    ? "frameCircle"
                    : currentShape === "polaroid"
                      ? "framePolaroid"
                      : currentShape === "arch"
                        ? "frameArch"
                        : currentShape === "heart"
                          ? "frameHeart"
                          : currentShape === "star"
                            ? "frameStar"
                            : currentShape === "hexagon"
                              ? "frameHexagon"
                              : "shapeRect") as import("@/lib/builder/blocks").BuilderBlockKind
              }
              size={15}
            />
          </span>
          <span>{activeShapeInfo?.label ?? "Frame"}</span>
        </div>
        <span style={{ fontSize: "0.72rem", color: "var(--ink-muted, #64748b)" }}>Fixed Shape</span>
      </div>

      {/* Edge Feather (Soft Glow/Blur) */}
      <label className={styles.rangeField} style={{ marginBottom: 10 }}>
        <span>Edge Feather</span>
        <input
          type="range"
          min={0}
          max={100}
          value={frame.feather ?? 0}
          onChange={(event) =>
            apply({ feather: Number(event.currentTarget.value) }, "frame feather")
          }
        />
        <output>{frame.feather ?? 0}px</output>
      </label>

      {/* Photo Controls */}
      <div className={styles.framePhotoSection}>
        {frame.imageFileId ? (
          <>
            <div className={styles.buttonRow}>
              <label
                className={`${styles.secondaryButton} ${styles.uploadButton}`}
                style={{
                  flex: 1,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span>Replace photo</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const url = await fileToDataURL(file);
                    await loadDataURL(url);
                    onSetImage(url);
                  }}
                />
              </label>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onDetachImage}
                title="Detach image from frame onto canvas"
                style={{ flex: 1 }}
              >
                Detach photo
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => onSetImage(undefined)}
                title="Remove photo"
                style={{ padding: "0 8px" }}
              >
                ✕
              </button>
            </div>

            {/* Zoom Slider */}
            <label className={styles.rangeField} style={{ marginTop: 8 }}>
              <span>Photo Zoom</span>
              <input
                type="range"
                min={100}
                max={300}
                value={Math.round((frame.cropZoom ?? 1) * 100)}
                onChange={(event) =>
                  apply({ cropZoom: Number(event.currentTarget.value) / 100 }, "frame zoom")
                }
              />
              <output>{Math.round((frame.cropZoom ?? 1) * 100)}%</output>
            </label>

            {/* Rotation Slider */}
            <label className={styles.rangeField} style={{ marginTop: 6 }}>
              <span>Photo Rotate</span>
              <input
                type="range"
                min={-180}
                max={180}
                value={frame.cropRotation ?? 0}
                onChange={(event) =>
                  apply({ cropRotation: Number(event.currentTarget.value) }, "frame rotation")
                }
              />
              <output>{frame.cropRotation ?? 0}°</output>
            </label>

            {/* Pan Offset X & Y */}
            <div className={styles.compactNumberGrid} style={{ marginTop: 6 }}>
              <CompactNumberField
                label="Pan X"
                title="Offset X"
                value={Math.round(frame.cropOffsetX ?? 0)}
                step={5}
                onChange={(value) => apply({ cropOffsetX: value }, "frame pan X")}
              />
              <CompactNumberField
                label="Pan Y"
                title="Offset Y"
                value={Math.round(frame.cropOffsetY ?? 0)}
                step={5}
                onChange={(value) => apply({ cropOffsetY: value }, "frame pan Y")}
              />
              <button
                type="button"
                className={styles.secondaryButton}
                style={{ gridColumn: "span 2", fontSize: "0.7rem", height: "100%", padding: 0 }}
                onClick={() =>
                  apply(
                    { cropOffsetX: 0, cropOffsetY: 0, cropZoom: 1, cropRotation: 0 },
                    "center frame photo",
                  )
                }
              >
                Center & Reset
              </button>
            </div>
          </>
        ) : (
          <label
            className={`${styles.primaryButton} ${styles.uploadButton}`}
            style={{
              width: "100%",
              height: 36,
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <span>+ Add / Choose photo</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const url = await fileToDataURL(file);
                await loadDataURL(url);
                onSetImage(url);
              }}
            />
          </label>
        )}
      </div>

      {/* Rounded Rect Corner Radius */}
      {currentShape === "roundedRect" && (
        <label className={styles.rangeField} style={{ marginTop: 8 }}>
          <span>Corner Radius</span>
          <input
            type="range"
            min={0}
            max={300}
            value={frame.cornerRadius ?? 24}
            onChange={(event) =>
              apply({ cornerRadius: Number(event.currentTarget.value) }, "frame corner radius")
            }
          />
          <output>{frame.cornerRadius ?? 24}px</output>
        </label>
      )}

      {/* Frame Stroke */}
      {currentShape !== "polaroid" && (
        <div style={{ marginTop: 8 }}>
          <label className={styles.rangeField}>
            <span>Border Width</span>
            <input
              type="range"
              min={0}
              max={20}
              value={frame.strokeWidth ?? 0}
              onChange={(event) =>
                apply({ strokeWidth: Number(event.currentTarget.value) }, "frame stroke width")
              }
            />
            <output>{frame.strokeWidth ?? 0}px</output>
          </label>
          {(frame.strokeWidth ?? 0) > 0 && (
            <div className={styles.field} style={{ marginTop: 6 }}>
              <span>Border Color</span>
              <ColorPickerInput
                value={frame.strokeColor ?? "#94a3b8"}
                onChange={(color) => apply({ strokeColor: color }, "frame border color")}
                allowTransparent={true}
              />
            </div>
          )}
        </div>
      )}

      {/* Object Clipping */}
      {candidateIds.length > 0 || frame.childIds.length > 0 ? (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #edf0f5" }}>
          <div className={styles.metaRow}>
            <span>Clipped objects</span>
            <strong>{frame.childIds.length}</strong>
          </div>
          <div className={styles.buttonRow}>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={!candidateIds.length}
              onClick={() =>
                onUpdateChildren(Array.from(new Set([...frame.childIds, ...candidateIds])))
              }
            >
              Clip selection
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={!frame.childIds.length}
              onClick={() => onUpdateChildren([])}
            >
              Release all
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TextOptions({
  text,
  apply,
  blockManaged,
}: {
  text: TextElement;
  apply: TextApply;
  blockManaged: boolean;
}) {
  const minimumPadding = getTextSafePadding(text.fontSize, 0);
  const effectivePadding = getTextSafePadding(text.fontSize, text.padding ?? 0);
  const selectedPresetId = inferTextPresetId(text);
  const selectedPreset = getTextPreset(selectedPresetId);
  const withSafeHeight = (patch: Partial<TextElement>) => {
    if (blockManaged) return patch;
    const next = { ...text, ...patch };
    const minimumHeight = measureTextElementHeight(next);
    return { ...patch, height: Math.max(next.height, minimumHeight) };
  };

  return (
    <div className={styles.optionSection}>
      <h3>Content & typography</h3>
      <label className={`${styles.field} ${styles.presetField}`}>
        <span>Preset</span>
        <select
          aria-label="Text preset"
          value={selectedPresetId}
          onChange={(event) => {
            const presetId = event.currentTarget.value as TextPresetId;
            apply(textPresetPatch(text, presetId, blockManaged), "text preset");
          }}
        >
          {TEXT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.presetHint}>{selectedPreset.description}</p>
      <label className={styles.field}>
        <span>Text</span>
        <textarea
          value={text.text}
          onChange={(event) => apply(withSafeHeight({ text: event.currentTarget.value }), "text")}
        />
      </label>
      <label className={styles.field}>
        <span>Typeface</span>
        <select
          value={text.fontFamily}
          onChange={(event) => apply({ fontFamily: event.currentTarget.value }, "font family")}
        >
          {THAI_FONTS.map((font) => (
            <option key={font.family} value={font.cssFamily}>
              {font.family}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.numberGrid}>
        <NumberField
          label="Size"
          value={Math.round(text.fontSize)}
          min={8}
          max={300}
          onChange={(fontSize) => apply(withSafeHeight({ fontSize }), "font size")}
        />
        <NumberField
          label="Line"
          value={Number(text.lineHeight.toFixed(2))}
          min={0.8}
          max={3}
          step={0.05}
          onChange={(lineHeight) => apply(withSafeHeight({ lineHeight }), "line height")}
        />
      </div>
      <label className={styles.field}>
        <span>Weight</span>
        <select
          value={text.fontStyle}
          onChange={(event) =>
            apply(
              { fontStyle: event.currentTarget.value as TextElement["fontStyle"] },
              "font style",
            )
          }
        >
          <option value="normal">Regular</option>
          <option value="bold">Bold</option>
          <option value="italic">Italic</option>
          <option value="bold italic">Bold italic</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Align</span>
        <select
          value={text.textAlign}
          onChange={(event) =>
            apply(
              { textAlign: event.currentTarget.value as TextElement["textAlign"] },
              "text align",
            )
          }
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <div className={styles.numberGrid}>
        <NumberField
          label="Padding"
          value={effectivePadding}
          min={minimumPadding}
          max={160}
          onChange={(padding) =>
            apply(withSafeHeight({ padding: Math.max(minimumPadding, padding) }), "text padding")
          }
        />
        <NumberField
          label="Radius"
          value={text.cornerRadius ?? 0}
          min={0}
          max={999}
          onChange={(cornerRadius) => apply({ cornerRadius }, "text radius")}
        />
      </div>
      <p className={styles.fieldNote}>
        Minimum padding {minimumPadding}px prevents clipped glyphs and Thai marks.
      </p>
    </div>
  );
}

function MediaOptions({
  element,
  apply,
  cropActive,
  onToggleCrop,
}: {
  element: ImageElement | BookMockupElement;
  apply: (patch: Partial<EngineElement>, label: string) => void;
  cropActive: boolean;
  onToggleCrop: () => void;
}) {
  async function upload(file: File | undefined) {
    if (!file) return;
    const entry = await loadDataURL(await fileToDataURL(file));
    apply(
      {
        fileId: entry.fileId,
        naturalWidth: entry.width,
        naturalHeight: entry.height,
        linkedAssetId: undefined,
        sourceName: file.name,
        sourceLastModified: file.lastModified,
        sourceSize: file.size,
        ...(element.type === "image" ? { status: "loaded", crop: null } : {}),
      } as Partial<EngineElement>,
      element.type === "bookMockup" ? "replace cover" : "replace image",
    );
  }

  return (
    <div className={styles.optionSection}>
      <h3>{element.type === "bookMockup" ? "Cover source" : "Image source"}</h3>
      <div className={styles.buttonRow}>
        <label className={styles.uploadButton}>
          {element.fileId ? "Replace image" : "Choose image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => upload(event.currentTarget.files?.[0])}
          />
        </label>
        {element.type === "image" ? (
          <button className={styles.secondaryButton} type="button" onClick={onToggleCrop}>
            {cropActive ? "Finish crop" : "Crop"}
          </button>
        ) : null}
      </div>
      <div className={styles.metaRow}>
        <span>Original</span>
        <strong>
          {element.naturalWidth} × {element.naturalHeight}
        </strong>
      </div>
      {element.sourceName ? (
        <div className={styles.metaRow}>
          <span>Source file</span>
          <strong title={element.sourceName}>{element.sourceName}</strong>
        </div>
      ) : null}

      {element.type === "image" ? (
        <>
          <VisionObjectIsolator element={element} />
          <ImageAdjustments element={element} apply={apply} />
        </>
      ) : null}
    </div>
  );
}

const IMAGE_ADJUSTMENT_CONTROLS: Array<{
  key: keyof ColorAdjustments;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "exposure", label: "Exposure", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "whites", label: "Whites", min: -100, max: 100 },
  { key: "blacks", label: "Blacks", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "warmth", label: "Warmth", min: -100, max: 100 },
  { key: "tint", label: "Tint", min: -100, max: 100 },
  { key: "clarity", label: "Clarity", min: -100, max: 100 },
];

function ImageAdjustments({
  element,
  apply,
}: {
  element: ImageElement;
  apply: (patch: Partial<EngineElement>, label: string) => void;
}) {
  const tool = useEngine((state) => state.tool);
  const setTool = useEngine((state) => state.setTool);
  const rasterBrushSize = useEngine((state) => state.rasterBrushSize);
  const setRasterBrushSize = useEngine((state) => state.setRasterBrushSize);
  return (
    <div className={styles.subsection}>
      <div className={styles.metaRow}>
        <span>Raster Studio</span>
        <button
          type="button"
          className={styles.textButton}
          onClick={() =>
            apply({ adjustments: {}, filterBlur: 0, rasterMask: [] }, "reset image adjustments")
          }
        >
          Reset
        </button>
      </div>
      <div className={styles.metaRow}>
        <span>Pixel mask</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setTool(tool === "rasterEraser" ? "select" : "rasterEraser")}
          >
            {tool === "rasterEraser" ? "Exit eraser" : "Erase pixels"}
          </button>
          <button
            type="button"
            className={styles.textButton}
            disabled={!element.rasterMask?.length}
            onClick={() => apply({ rasterMask: [] }, "clear pixel mask")}
          >
            Clear
          </button>
        </div>
      </div>
      <label className={styles.field}>
        <span>Image mask</span>
        <select
          value={element.mask?.shape ?? "rect"}
          onChange={(event) => {
            const shape = event.currentTarget.value as "rect" | "rounded" | "ellipse" | "hexagon";
            apply(
              {
                mask:
                  shape === "rect"
                    ? undefined
                    : { shape, radius: shape === "rounded" ? 32 : undefined },
              },
              "image mask",
            );
          }}
        >
          <option value="rect">Rectangle</option>
          <option value="rounded">Rounded</option>
          <option value="ellipse">Ellipse</option>
          <option value="hexagon">Hexagon</option>
        </select>
      </label>
      {element.mask?.shape === "rounded" ? (
        <label className={styles.rangeField}>
          <span>Corner radius</span>
          <input
            type="range"
            min={0}
            max={Math.round(Math.min(element.width, element.height) / 2)}
            value={element.mask.radius ?? 32}
            onChange={(event) =>
              apply(
                { mask: { shape: "rounded", radius: Number(event.currentTarget.value) } },
                "image mask radius",
              )
            }
          />
          <output>{element.mask.radius ?? 32}</output>
        </label>
      ) : null}
      <label className={styles.rangeField}>
        <span>Brush size</span>
        <input
          type="range"
          min={4}
          max={512}
          step={4}
          value={rasterBrushSize}
          onChange={(event) => setRasterBrushSize(Number(event.currentTarget.value))}
        />
        <output>{rasterBrushSize}</output>
      </label>
      {IMAGE_ADJUSTMENT_CONTROLS.map((control) => (
        <label className={styles.rangeField} key={control.key}>
          <span>{control.label}</span>
          <input
            type="range"
            min={control.min}
            max={control.max}
            value={element.adjustments?.[control.key] ?? 0}
            onChange={(event) =>
              apply(
                {
                  adjustments: {
                    ...element.adjustments,
                    [control.key]: Number(event.currentTarget.value),
                  },
                },
                `image ${control.key}`,
              )
            }
          />
          <output>{element.adjustments?.[control.key] ?? 0}</output>
        </label>
      ))}
      <label className={styles.rangeField}>
        <span>Blur</span>
        <input
          type="range"
          min={0}
          max={40}
          value={element.filterBlur ?? 0}
          onChange={(event) =>
            apply({ filterBlur: Number(event.currentTarget.value) }, "image blur")
          }
        />
        <output>{element.filterBlur ?? 0}</output>
      </label>
    </div>
  );
}

function TransformSection({
  element,
  apply,
}: {
  element: EngineElement;
  apply: (patch: Partial<EngineElement>, label: string) => void;
}) {
  const minimumHeight = element.type === "text" ? Math.ceil(measureTextElementHeight(element)) : 2;
  return (
    <div className={styles.optionSection}>
      <h3>Transform</h3>
      <div className={styles.compactNumberGrid}>
        <CompactNumberField
          label="X"
          title="Position X"
          value={Math.round(element.x)}
          onChange={(x) => apply({ x }, "position")}
        />
        <CompactNumberField
          label="Y"
          title="Position Y"
          value={Math.round(element.y)}
          onChange={(y) => apply({ y }, "position")}
        />
        <CompactNumberField
          label="W"
          title="Width"
          value={Math.round(element.width)}
          min={2}
          onChange={(width) => apply({ width }, "size")}
        />
        <CompactNumberField
          label="H"
          title="Height"
          value={Math.round(element.height)}
          min={minimumHeight}
          onChange={(height) => apply({ height }, "size")}
        />
      </div>
    </div>
  );
}

function StyleOptions({
  element,
  apply,
}: {
  element: EngineElement;
  apply: (patch: Partial<EngineElement>, label: string) => void;
}) {
  const isMedia = element.type === "bookMockup" || element.type === "image";
  const supportsFill =
    !isMedia &&
    element.type !== "text" &&
    element.type !== "line" &&
    element.type !== "arrow" &&
    element.type !== "freedraw" &&
    element.type !== "frame";

  return (
    <div className={styles.optionSection}>
      <h3>Appearance</h3>
      {!isMedia && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 8px",
              background: "rgba(0, 0, 0, 0.02)",
              border: "1px solid var(--stroke, #eef0f4)",
              borderRadius: 8,
            }}
          >
            {/* Fill / Background Color (Left) */}
            {supportsFill ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--ink-muted, #64748b)", fontWeight: 500 }}>
                  Fill
                </span>
                <ColorPickerInput
                  value={element.backgroundColor}
                  onChange={(color) => {
                    apply({ backgroundColor: color, fillType: "solid" }, "background");
                  }}
                  supportsGradient={true}
                  fillType={element.fillType ?? "solid"}
                  gradientColors={element.gradientColors ?? DEFAULT_GRADIENT_COLORS}
                  gradientAngle={element.gradientAngle ?? 90}
                  gradientStops={element.gradientStops ?? DEFAULT_GRADIENT_STOPS}
                  onGradientChange={(type, colors, angle, stops) => {
                    apply(
                      {
                        fillType: type,
                        gradientColors: colors,
                        gradientAngle: angle ?? element.gradientAngle ?? 90,
                        gradientStops: stops ?? element.gradientStops ?? DEFAULT_GRADIENT_STOPS,
                      },
                      "fill gradient",
                    );
                  }}
                  allowTransparent={true}
                  title="Fill / Background color"
                />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--ink-muted, #64748b)", fontWeight: 500 }}>
                  {element.type === "text" ? "Text" : "Stroke"}
                </span>
                <ColorPickerInput
                  value={element.strokeColor}
                  onChange={(color) => {
                    apply({ strokeColor: color }, "foreground");
                  }}
                  allowTransparent={element.type !== "text"}
                  title={element.type === "text" ? "Text color" : "Stroke color"}
                />
              </div>
            )}

            {/* Swap Button (Center) */}
            {supportsFill && (
              <button
                type="button"
                onClick={() => {
                  const currentStroke = element.strokeColor || "#000000";
                  const currentBg = element.backgroundColor || "transparent";
                  apply(
                    {
                      strokeColor: currentBg,
                      backgroundColor: currentStroke,
                    },
                    "swap colors",
                  );
                }}
                title="Swap Fill and Stroke colors"
                style={{
                  width: 26,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  border: "1px solid var(--stroke, #d1d5db)",
                  background: "var(--surface-solid, #ffffff)",
                  cursor: "pointer",
                  color: "var(--ink, #374151)",
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  transition: "all 0.1s ease",
                  padding: 0,
                }}
              >
                ⇄
              </button>
            )}

            {/* Stroke Color (Right when supportsFill is true) */}
            {supportsFill && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--ink-muted, #64748b)", fontWeight: 500 }}>
                  Stroke
                </span>
                <ColorPickerInput
                  value={element.strokeColor}
                  onChange={(color) => {
                    apply({ strokeColor: color }, "foreground");
                  }}
                  allowTransparent={true}
                  title="Stroke color"
                />
              </div>
            )}
          </div>
        </div>
      )}
      {!isMedia ? (
        <NumberField
          label="Stroke"
          value={Number(element.strokeWidth.toFixed(1))}
          min={0}
          max={80}
          step={0.5}
          onChange={(strokeWidth) => apply({ strokeWidth }, "stroke width")}
        />
      ) : null}
      <label className={styles.rangeField}>
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(element.opacity * 100)}
          onChange={(event) =>
            apply({ opacity: Number(event.currentTarget.value) / 100 }, "opacity")
          }
        />
        <output>{Math.round(element.opacity * 100)}%</output>
      </label>
      <label className={styles.field}>
        <span>Blend</span>
        <select
          value={element.blendMode ?? "source-over"}
          onChange={(event) =>
            apply(
              { blendMode: event.currentTarget.value as NonNullable<EngineElement["blendMode"]> },
              "blend mode",
            )
          }
        >
          <option value="source-over">Normal</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
          <option value="darken">Darken</option>
          <option value="lighten">Lighten</option>
        </select>
      </label>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`${styles.numberField} ${label.length > 3 ? styles.longNumberField : ""}`}>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          if (!Number.isFinite(parsed)) return;
          const aboveMinimum = min === undefined ? parsed : Math.max(min, parsed);
          onChange(max === undefined ? aboveMinimum : Math.min(max, aboveMinimum));
        }}
      />
    </label>
  );
}

function CompactNumberField({
  label,
  title,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  title?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.compactNumberField} title={title ?? label}>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          if (!Number.isFinite(parsed)) return;
          const aboveMinimum = min === undefined ? parsed : Math.max(min, parsed);
          onChange(max === undefined ? aboveMinimum : Math.min(max, aboveMinimum));
        }}
      />
    </label>
  );
}

function typeName(element: EngineElement | undefined) {
  if (!element) return "Canvas";
  if (element.type === "bookMockup") return "Book mockup";
  return element.type.charAt(0).toUpperCase() + element.type.slice(1);
}
