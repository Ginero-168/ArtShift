"use client";

import { useMemo, useState } from "react";
import { IconChevronDown, IconEye, IconEyeOff, IconPlus, IconTrash } from "@/components/icons";
import {
  type AppearanceOperation,
  addBackgroundOperation,
  addEmbossOperation,
  addExtrudeOperation,
  addFillOperation,
  addGlowOperation,
  addShadowOperation,
  addStrokeOperation,
  appearanceCapabilities,
  appearanceItemLabel,
  appearanceItemSwatch,
  appearanceItemTypeLabel,
  appearanceStackRows,
  backgroundItemPatchOperation,
  backgroundPaintOperation,
  clampPathCurvature,
  embossPatchOperation,
  extrudePatchOperation,
  fillItemPatchOperation,
  fillPaintOperation,
  findBackground,
  findEffect,
  findFill,
  findStroke,
  glowPatchOperation,
  nudgeItemOperation,
  readAppearance,
  removeItemOperation,
  resolveAppearanceExpandedKey,
  setRootBlendOperation,
  setRootOpacityOperation,
  shadowPatchOperation,
  stackKindOf,
  strokePatchOperation,
  toggleAppearanceExpandedKey,
  toggleItemVisibleOperation,
} from "@/lib/appearance";
import {
  APPEARANCE_MAX_ITEMS,
  MAX_EMBOSS_SOFTNESS,
  MAX_EXTRUDE_DEPTH,
  MAX_EXTRUDE_STEPS,
  MAX_EXTRUDE_TAPER,
} from "@/lib/appearance/types";
import type { ColorAdjustments } from "@/lib/color/adjustments";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, ImageElement } from "@/lib/engine/types";
import styles from "./Builder.module.css";
import ColorPickerInput from "./ColorPickerInput";
import TextEffectPresetPicker from "./TextEffectPresetPicker";

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

const DEFAULT_GRADIENT_COLORS: string[] = ["#6366f1", "#a855f7"];
const DEFAULT_GRADIENT_STOPS: number[] = [0, 1];

export default function AppearancePanel({
  element,
  selectedIds,
}: {
  element: EngineElement;
  selectedIds: string[];
}) {
  const updateAppearance = useEngine((state) => state.updateAppearance);
  const previewAppearance = useEngine((state) => state.previewAppearance);
  const updateElements = useEngine((state) => state.updateElements);
  const checkpointInteraction = useEngine((state) => state.checkpointInteraction);
  const commitInteraction = useEngine((state) => state.commitInteraction);
  const previewElements = useEngine((state) => state.previewElements);
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );

  const ids = selectedIds.length ? selectedIds : [element.id];
  const appearance = readAppearance(element);
  const caps = appearanceCapabilities(element);
  const rows = appearanceStackRows(element);
  const hasShadow = !!findEffect(appearance, "shadow");
  const hasGlow = !!findEffect(appearance, "glow");
  const hasExtrude = !!findEffect(appearance, "extrude");
  const hasEmboss = !!findEffect(appearance, "emboss");
  const hasFill = caps.fills && !!findFill(appearance);
  const hasStroke = caps.strokes && !!findStroke(appearance);
  const hasBackground = caps.background && !!findBackground(appearance);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);
  const activeKey = useMemo(
    () => resolveAppearanceExpandedKey(expandedKey, rowKeys),
    [expandedKey, rowKeys],
  );
  const expandRow = (key: string) => {
    setExpandedKey((current) =>
      toggleAppearanceExpandedKey(resolveAppearanceExpandedKey(current, rowKeys), key),
    );
  };

  const applyOp = (
    operation: AppearanceOperation | ((target: EngineElement) => AppearanceOperation | null),
    label: string,
  ) => {
    updateAppearance(ids, operation, label);
  };

  const beginSlider = (label: string) => checkpointInteraction(label);
  const slideOp = (
    operation: AppearanceOperation | ((target: EngineElement) => AppearanceOperation | null),
  ) => {
    previewAppearance(ids, operation);
  };
  const endSlider = () => commitInteraction();

  return (
    <div className={styles.optionSection} data-appearance-panel="true">
      <h3>Appearance</h3>
      <p className={styles.fieldNote}>
        Stack is front-to-back (top item paints last). Add multiple Fills and Strokes; reorder to
        change paint order. Extrude and Emboss are editable 3D/relief effects — presets write into
        the same rows. Shadow and Glow composite after paint.
      </p>

      {element.type === "text" ? <TextEffectPresetPicker onApply={applyOp} /> : null}

      <div className={styles.appearanceStack} role="list" aria-label="Appearance stack">
        {rows.map((row) => {
          const expanded = row.key === activeKey;
          if (row.kind === "textArc") {
            return (
              <div
                key={row.key}
                className={styles.appearanceRow}
                role="listitem"
                data-appearance-row="textArc"
              >
                <button
                  type="button"
                  className={styles.appearanceRowHeader}
                  aria-expanded={expanded}
                  onClick={() => expandRow(row.key)}
                >
                  <span className={styles.appearanceRowType}>Arc</span>
                  <span className={styles.appearanceRowTitle}>Text Arc</span>
                  <span className={styles.appearanceRowMeta}>{row.value}%</span>
                </button>
                {expanded ? (
                  <div className={styles.appearanceRowBody}>
                    <TextArcSlider
                      value={row.value}
                      onBegin={() => beginSlider("text curvature")}
                      onInput={(value) =>
                        previewElements(
                          ids.map((id) => ({
                            id,
                            patch: {
                              pathCurvature: clampPathCurvature(value),
                            } as Partial<EngineElement>,
                          })),
                        )
                      }
                      onCommit={endSlider}
                    />
                  </div>
                ) : null}
              </div>
            );
          }

          const item = row.item;
          const kind = stackKindOf(item);
          const hidden = !item.visible;
          return (
            <div
              key={row.key}
              className={`${styles.appearanceRow} ${hidden ? styles.appearanceRowHidden : ""}`}
              role="listitem"
              data-appearance-row={kind ?? item.kind}
              data-appearance-item={item.id}
            >
              <div className={styles.appearanceRowHeader}>
                <button
                  type="button"
                  className={styles.appearanceRowSelect}
                  aria-expanded={expanded}
                  onClick={() => expandRow(row.key)}
                >
                  <span
                    className={styles.appearanceSwatch}
                    style={{ background: appearanceItemSwatch(item) }}
                    aria-hidden="true"
                  />
                  <span className={styles.appearanceRowType}>{appearanceItemTypeLabel(item)}</span>
                  <span className={styles.appearanceRowTitle}>{appearanceItemLabel(item)}</span>
                </button>
                <div className={styles.appearanceRowActions}>
                  <button
                    type="button"
                    className={styles.layerIconButton}
                    title="Bring forward"
                    aria-label={`Bring ${kind ?? item.kind} forward`}
                    data-appearance-move="forward"
                    disabled={appearance.items[appearance.items.length - 1]?.id === item.id}
                    onClick={() =>
                      applyOp((target) => nudgeItemOperation(target, item.id, 1), "bring forward")
                    }
                  >
                    <IconChevronDown size={13} style={{ transform: "rotate(180deg)" }} />
                  </button>
                  <button
                    type="button"
                    className={styles.layerIconButton}
                    title="Send backward"
                    aria-label={`Send ${kind ?? item.kind} backward`}
                    data-appearance-move="backward"
                    disabled={appearance.items[0]?.id === item.id}
                    onClick={() =>
                      applyOp((target) => nudgeItemOperation(target, item.id, -1), "send backward")
                    }
                  >
                    <IconChevronDown size={13} />
                  </button>
                  {kind ? (
                    <button
                      type="button"
                      className={styles.layerIconButton}
                      title={item.visible ? "Hide" : "Show"}
                      aria-label={item.visible ? `Hide ${kind}` : `Show ${kind}`}
                      onClick={() =>
                        applyOp(
                          (target) => toggleItemVisibleOperation(target, item.id),
                          `toggle ${kind}`,
                        )
                      }
                    >
                      {item.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                    </button>
                  ) : null}
                  {kind ? (
                    <button
                      type="button"
                      className={`${styles.layerIconButton} ${styles.layerIconDelete}`}
                      title="Remove"
                      aria-label={`Remove ${kind}`}
                      onClick={() => applyOp(() => removeItemOperation(item.id), `remove ${kind}`)}
                    >
                      <IconTrash size={13} />
                    </button>
                  ) : null}
                </div>
              </div>
              {expanded ? (
                <div className={styles.appearanceRowBody}>
                  <AppearanceItemEditor
                    element={element}
                    item={item}
                    applyOp={applyOp}
                    beginSlider={beginSlider}
                    slideOp={slideOp}
                    endSlider={endSlider}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className={styles.fieldNote}>No fill, stroke, or effects on this object yet.</p>
        ) : null}
      </div>

      <div className={styles.buttonRow}>
        {caps.fills &&
        (caps.multipleFills || !hasFill) &&
        appearance.items.length < APPEARANCE_MAX_ITEMS ? (
          <button
            type="button"
            className={styles.secondaryButton}
            data-appearance-add="fill"
            aria-label="Add fill"
            onClick={() => {
              applyOp((target) => addFillOperation(target), "add fill");
              setExpandedKey(null);
            }}
          >
            <IconPlus size={12} /> Fill
          </button>
        ) : null}
        {caps.strokes &&
        (caps.multipleStrokes || !hasStroke) &&
        appearance.items.length < APPEARANCE_MAX_ITEMS ? (
          <button
            type="button"
            className={styles.secondaryButton}
            data-appearance-add="stroke"
            aria-label="Add stroke"
            onClick={() => {
              applyOp((target) => addStrokeOperation(target), "add stroke");
              setExpandedKey(null);
            }}
          >
            <IconPlus size={12} /> Stroke
          </button>
        ) : null}
        {caps.background && !hasBackground && appearance.items.length < APPEARANCE_MAX_ITEMS ? (
          <button
            type="button"
            className={styles.secondaryButton}
            data-appearance-add="background"
            aria-label="Add background"
            onClick={() => {
              applyOp((target) => addBackgroundOperation(target), "add background");
              setExpandedKey(null);
            }}
          >
            <IconPlus size={12} /> Background
          </button>
        ) : null}
        {caps.shadow && !hasShadow ? (
          <button
            type="button"
            className={styles.secondaryButton}
            data-appearance-add="shadow"
            aria-label="Add shadow"
            onClick={() => {
              applyOp(addShadowOperation(), "add shadow");
              setExpandedKey(null);
            }}
          >
            <IconPlus size={12} /> Shadow
          </button>
        ) : null}
        {caps.glow && !hasGlow ? (
          <button
            type="button"
            className={styles.secondaryButton}
            data-appearance-add="glow"
            aria-label="Add glow"
            onClick={() => {
              applyOp(addGlowOperation(), "add glow");
              setExpandedKey(null);
            }}
          >
            <IconPlus size={12} /> Glow
          </button>
        ) : null}
        {caps.extrude && !hasExtrude && appearance.items.length < APPEARANCE_MAX_ITEMS ? (
          <button
            type="button"
            className={styles.secondaryButton}
            data-appearance-add="extrude"
            aria-label="Add extrude"
            onClick={() => {
              applyOp(addExtrudeOperation(), "add extrude");
              setExpandedKey(null);
            }}
          >
            <IconPlus size={12} /> Extrude
          </button>
        ) : null}
        {caps.emboss && !hasEmboss && appearance.items.length < APPEARANCE_MAX_ITEMS ? (
          <button
            type="button"
            className={styles.secondaryButton}
            data-appearance-add="emboss"
            aria-label="Add emboss"
            onClick={() => {
              applyOp(addEmbossOperation(), "add emboss");
              setExpandedKey(null);
            }}
          >
            <IconPlus size={12} /> Emboss
          </button>
        ) : null}
      </div>

      {caps.rootOpacity ? (
        <label className={styles.rangeField}>
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(appearance.opacity * 100)}
            onPointerDown={() => beginSlider("opacity")}
            onChange={(event) =>
              slideOp(setRootOpacityOperation(Number(event.currentTarget.value) / 100))
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(appearance.opacity * 100)}%</output>
        </label>
      ) : null}

      {caps.blendMode ? (
        <label className={styles.field}>
          <span>Blend</span>
          <select
            value={appearance.blendMode}
            onChange={(event) =>
              applyOp(
                setRootBlendOperation(
                  event.currentTarget.value as NonNullable<EngineElement["blendMode"]>,
                ),
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
      ) : null}

      {caps.imageAdjust && element.type === "image" ? (
        <ImageAdjustmentsGroup
          element={element}
          selectedIds={ids}
          slideElements={slide?.elements ?? []}
          updateElements={updateElements}
          beginSlider={beginSlider}
          previewElements={previewElements}
          endSlider={endSlider}
        />
      ) : null}
    </div>
  );
}

function imageTargetIds(selectedIds: string[], elements: EngineElement[]): string[] {
  const selected = new Set(selectedIds);
  return elements
    .filter((item) => selected.has(item.id) && item.type === "image")
    .map((item) => item.id);
}

function ImageAdjustmentsGroup({
  element,
  selectedIds,
  slideElements,
  updateElements,
  beginSlider,
  previewElements,
  endSlider,
}: {
  element: ImageElement;
  selectedIds: string[];
  slideElements: EngineElement[];
  updateElements: (
    patches: Array<{ id: string; patch: Partial<EngineElement> }>,
    label: string,
  ) => void;
  beginSlider: (label: string) => void;
  previewElements: (patches: Array<{ id: string; patch: Partial<EngineElement> }>) => void;
  endSlider: () => void;
}) {
  const targetIds = imageTargetIds(selectedIds, slideElements);
  const ids = targetIds.length ? targetIds : [element.id];

  const applyPatch = (patch: Partial<ImageElement>, label: string) => {
    updateElements(
      ids.map((id) => ({ id, patch })),
      label,
    );
  };

  const previewPatch = (patch: Partial<ImageElement>) => {
    previewElements(ids.map((id) => ({ id, patch })));
  };

  return (
    <div className={styles.appearanceRow} role="group" data-appearance-row="imageAdjust">
      <div className={styles.appearanceRowHeader}>
        <span className={styles.appearanceRowType}>Img</span>
        <span className={styles.appearanceRowTitle}>ปรับโทนภาพ</span>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => applyPatch({ adjustments: {}, filterBlur: 0 }, "reset image adjustments")}
        >
          รีเซ็ต
        </button>
      </div>
      <div className={styles.appearanceRowBody}>
        {IMAGE_ADJUSTMENT_CONTROLS.map((control) => (
          <label className={styles.rangeField} key={control.key}>
            <span>{control.label}</span>
            <input
              type="range"
              min={control.min}
              max={control.max}
              value={element.adjustments?.[control.key] ?? 0}
              aria-label={control.label}
              onPointerDown={() => beginSlider(`image ${control.key}`)}
              onChange={(event) =>
                previewPatch({
                  adjustments: {
                    ...element.adjustments,
                    [control.key]: Number(event.currentTarget.value),
                  },
                })
              }
              onPointerUp={endSlider}
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
            aria-label="Blur"
            onPointerDown={() => beginSlider("image blur")}
            onChange={(event) => previewPatch({ filterBlur: Number(event.currentTarget.value) })}
            onPointerUp={endSlider}
          />
          <output>{element.filterBlur ?? 0}</output>
        </label>
      </div>
    </div>
  );
}

function AppearanceItemEditor({
  element,
  item,
  applyOp,
  beginSlider,
  slideOp,
  endSlider,
}: {
  element: EngineElement;
  item: ReturnType<typeof readAppearance>["items"][number];
  applyOp: (
    operation: AppearanceOperation | ((target: EngineElement) => AppearanceOperation | null),
    label: string,
  ) => void;
  beginSlider: (label: string) => void;
  slideOp: (
    operation: AppearanceOperation | ((target: EngineElement) => AppearanceOperation | null),
  ) => void;
  endSlider: () => void;
}) {
  if (item.kind === "fill" || item.kind === "background") {
    const paint = item.paint;
    const isBackground = item.kind === "background";
    const label = isBackground ? "Background" : "Fill";
    const fillType =
      paint.type === "linearGradient"
        ? "linear"
        : paint.type === "radialGradient"
          ? "radial"
          : "solid";
    const gradientColors =
      paint.type === "linearGradient" || paint.type === "radialGradient"
        ? paint.stops.map((stop) => stop.color)
        : DEFAULT_GRADIENT_COLORS;
    const gradientStops =
      paint.type === "linearGradient" || paint.type === "radialGradient"
        ? paint.stops.map((stop) => stop.offset)
        : DEFAULT_GRADIENT_STOPS;
    const solidColor = paint.type === "solid" ? paint.color : (gradientColors[0] ?? "#ffffff");

    return (
      <>
        <div className={styles.field}>
          <span>{label}</span>
          <ColorPickerInput
            value={solidColor}
            onChange={(color) =>
              applyOp(
                (target) =>
                  isBackground
                    ? backgroundPaintOperation(
                        target,
                        { type: "solid", color },
                        { itemId: item.id },
                      )
                    : fillPaintOperation(target, { type: "solid", color }, { itemId: item.id }),
                isBackground ? "background" : "fill",
              )
            }
            supportsGradient={true}
            fillType={fillType}
            gradientColors={gradientColors}
            gradientAngle={paint.type === "linearGradient" ? paint.angle : 90}
            gradientStops={gradientStops}
            onGradientChange={(type, colors, angle, stops) => {
              const nextStops = (stops ?? DEFAULT_GRADIENT_STOPS).map((offset, index) => ({
                offset,
                color: colors[index] ?? colors[0] ?? "#ffffff",
              }));
              const nextPaint =
                type === "radial"
                  ? ({ type: "radialGradient", stops: nextStops } as const)
                  : {
                      type: "linearGradient" as const,
                      angle: angle ?? 90,
                      stops: nextStops,
                    };
              applyOp(
                (target) =>
                  isBackground
                    ? backgroundPaintOperation(target, nextPaint, { itemId: item.id })
                    : fillPaintOperation(target, nextPaint, { itemId: item.id }),
                isBackground ? "background gradient" : "fill gradient",
              );
            }}
            allowTransparent={true}
            title={`${label} color`}
          />
        </div>
        <label className={styles.rangeField}>
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(item.opacity * 100)}
            aria-label={`${label} opacity`}
            onPointerDown={() => beginSlider(`${isBackground ? "background" : "fill"} opacity`)}
            onChange={(event) =>
              slideOp((target) =>
                isBackground
                  ? backgroundItemPatchOperation(target, item.id, {
                      opacity: Number(event.currentTarget.value) / 100,
                    })
                  : fillItemPatchOperation(target, item.id, {
                      opacity: Number(event.currentTarget.value) / 100,
                    }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(item.opacity * 100)}%</output>
        </label>
      </>
    );
  }

  if (item.kind === "stroke") {
    return (
      <>
        <div className={styles.field}>
          <span>Stroke</span>
          <ColorPickerInput
            value={item.color}
            onChange={(color) =>
              applyOp((target) => strokePatchOperation(target, { color }, item.id), "stroke color")
            }
            allowTransparent={true}
            title="Stroke color"
          />
        </div>
        <label className={styles.rangeField}>
          <span>Width</span>
          <input
            type="range"
            min={0}
            max={80}
            step={0.5}
            value={item.width}
            onPointerDown={() => beginSlider("stroke width")}
            onChange={(event) =>
              slideOp((target) =>
                strokePatchOperation(target, { width: Number(event.currentTarget.value) }, item.id),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Number(item.width.toFixed(1))}</output>
        </label>
        {element.type !== "text" ? (
          <label className={styles.field}>
            <span>Style</span>
            <select
              value={item.style}
              aria-label="Stroke style"
              onChange={(event) =>
                applyOp(
                  (target) =>
                    strokePatchOperation(
                      target,
                      { style: event.currentTarget.value as typeof item.style },
                      item.id,
                    ),
                  "stroke style",
                )
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
        ) : null}
        <label className={styles.rangeField}>
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(item.opacity * 100)}
            aria-label="Stroke opacity"
            onPointerDown={() => beginSlider("stroke opacity")}
            onChange={(event) =>
              slideOp((target) =>
                strokePatchOperation(
                  target,
                  { opacity: Number(event.currentTarget.value) / 100 },
                  item.id,
                ),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(item.opacity * 100)}%</output>
        </label>
      </>
    );
  }

  if (item.kind === "effect" && item.effect.type === "shadow") {
    const effect = item.effect;
    return (
      <>
        <div className={styles.field}>
          <span>Color</span>
          <ColorPickerInput
            value={effect.color}
            onChange={(color) =>
              applyOp((target) => shadowPatchOperation(target, { color }), "shadow color")
            }
            allowTransparent={false}
            title="Shadow color"
          />
        </div>
        <label className={styles.rangeField}>
          <span>Blur</span>
          <input
            type="range"
            min={0}
            max={80}
            value={effect.blur}
            onPointerDown={() => beginSlider("shadow blur")}
            onChange={(event) =>
              slideOp((target) =>
                shadowPatchOperation(target, { blur: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.blur)}</output>
        </label>
        <label className={styles.rangeField}>
          <span>Offset X</span>
          <input
            type="range"
            min={-80}
            max={80}
            value={effect.offsetX}
            onPointerDown={() => beginSlider("shadow offset")}
            onChange={(event) =>
              slideOp((target) =>
                shadowPatchOperation(target, { offsetX: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.offsetX)}</output>
        </label>
        <label className={styles.rangeField}>
          <span>Offset Y</span>
          <input
            type="range"
            min={-80}
            max={80}
            value={effect.offsetY}
            onPointerDown={() => beginSlider("shadow offset")}
            onChange={(event) =>
              slideOp((target) =>
                shadowPatchOperation(target, { offsetY: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.offsetY)}</output>
        </label>
      </>
    );
  }

  if (item.kind === "effect" && item.effect.type === "glow") {
    const effect = item.effect;
    return (
      <>
        <div className={styles.field}>
          <span>Color</span>
          <ColorPickerInput
            value={effect.color}
            onChange={(color) =>
              applyOp((target) => glowPatchOperation(target, { color }), "glow color")
            }
            allowTransparent={false}
            title="Glow color"
          />
        </div>
        <label className={styles.rangeField}>
          <span>Blur</span>
          <input
            type="range"
            min={0}
            max={80}
            value={effect.blur}
            onPointerDown={() => beginSlider("glow blur")}
            onChange={(event) =>
              slideOp((target) =>
                glowPatchOperation(target, { blur: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.blur)}</output>
        </label>
      </>
    );
  }

  if (item.kind === "effect" && item.effect.type === "extrude") {
    const effect = item.effect;
    const smooth = effect.steps === 0;
    return (
      <>
        <p className={styles.fieldNote} id="extrude-taper-hint">
          Face uses the Fill layer. Sides follow depth and angle. Taper leans the extrusion toward
          the center.
        </p>
        <label className={styles.rangeField}>
          <span>Depth</span>
          <input
            type="range"
            min={0}
            max={MAX_EXTRUDE_DEPTH}
            value={effect.depth}
            aria-label="Extrude depth"
            onPointerDown={() => beginSlider("extrude depth")}
            onChange={(event) =>
              slideOp((target) =>
                extrudePatchOperation(target, { depth: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.depth)}</output>
        </label>
        <label className={styles.rangeField}>
          <span>Angle</span>
          <input
            type="range"
            min={0}
            max={360}
            value={effect.angle}
            aria-label="Extrude angle"
            onPointerDown={() => beginSlider("extrude angle")}
            onChange={(event) =>
              slideOp((target) =>
                extrudePatchOperation(target, { angle: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.angle)}°</output>
        </label>
        <label className={styles.rangeField} data-appearance-control="extrude-taper">
          <span>Taper</span>
          <input
            type="range"
            min={0}
            max={MAX_EXTRUDE_TAPER * 100}
            step={1}
            value={Math.round((effect.taper ?? 0) * 100)}
            aria-label="Extrude taper toward center"
            aria-describedby="extrude-taper-hint"
            onPointerDown={() => beginSlider("extrude taper")}
            onChange={(event) =>
              slideOp((target) =>
                extrudePatchOperation(target, {
                  taper: Number(event.currentTarget.value) / 100,
                }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round((effect.taper ?? 0) * 100)}%</output>
        </label>
        <label className={styles.checkField}>
          <input
            type="checkbox"
            checked={smooth}
            aria-label="Smooth extrude"
            onChange={(event) =>
              applyOp(
                (target) =>
                  extrudePatchOperation(target, {
                    steps: event.currentTarget.checked
                      ? 0
                      : Math.max(1, Math.min(MAX_EXTRUDE_STEPS, Math.round(effect.depth) || 8)),
                  }),
                "extrude steps",
              )
            }
          />
          Smooth (continuous)
        </label>
        {smooth ? null : (
          <label className={styles.rangeField}>
            <span>Steps</span>
            <input
              type="range"
              min={1}
              max={MAX_EXTRUDE_STEPS}
              value={effect.steps}
              aria-label="Extrude steps"
              onPointerDown={() => beginSlider("extrude steps")}
              onChange={(event) =>
                slideOp((target) =>
                  extrudePatchOperation(target, { steps: Number(event.currentTarget.value) }),
                )
              }
              onPointerUp={endSlider}
            />
            <output>{effect.steps}</output>
          </label>
        )}
        <label className={styles.checkField}>
          <input
            type="checkbox"
            checked={effect.sideFromFill === true}
            aria-label="Side color from fill"
            onChange={(event) =>
              applyOp(
                (target) =>
                  extrudePatchOperation(target, { sideFromFill: event.currentTarget.checked }),
                "extrude side from fill",
              )
            }
          />
          Side from Fill
        </label>
        {effect.sideFromFill ? null : (
          <div className={styles.field}>
            <span>Side</span>
            <ColorPickerInput
              value={effect.sideColor}
              onChange={(color) =>
                applyOp(
                  (target) =>
                    extrudePatchOperation(target, { sideColor: color, sideFromFill: false }),
                  "extrude side color",
                )
              }
              allowTransparent={false}
              title="Extrude side color"
            />
          </div>
        )}
      </>
    );
  }

  if (item.kind === "effect" && item.effect.type === "emboss") {
    const effect = item.effect;
    return (
      <>
        <label className={styles.field}>
          <span>Style</span>
          <select
            value={effect.mode}
            aria-label="Emboss style"
            onChange={(event) =>
              applyOp(
                (target) =>
                  embossPatchOperation(target, {
                    mode: event.currentTarget.value as typeof effect.mode,
                  }),
                "emboss style",
              )
            }
          >
            <option value="emboss">Emboss</option>
            <option value="deboss">Deboss</option>
            <option value="bevel">Bevel</option>
          </select>
        </label>
        <label className={styles.rangeField}>
          <span>Depth</span>
          <input
            type="range"
            min={0}
            max={24}
            step={0.5}
            value={effect.depth}
            aria-label="Emboss depth"
            onPointerDown={() => beginSlider("emboss depth")}
            onChange={(event) =>
              slideOp((target) =>
                embossPatchOperation(target, { depth: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Number(effect.depth.toFixed(1))}</output>
        </label>
        <label className={styles.rangeField}>
          <span>Light</span>
          <input
            type="range"
            min={0}
            max={360}
            value={effect.angle}
            aria-label="Emboss light angle"
            onPointerDown={() => beginSlider("emboss angle")}
            onChange={(event) =>
              slideOp((target) =>
                embossPatchOperation(target, { angle: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.angle)}°</output>
        </label>
        <label className={styles.rangeField}>
          <span>Softness</span>
          <input
            type="range"
            min={0}
            max={MAX_EMBOSS_SOFTNESS}
            value={effect.softness}
            aria-label="Emboss softness"
            onPointerDown={() => beginSlider("emboss softness")}
            onChange={(event) =>
              slideOp((target) =>
                embossPatchOperation(target, { softness: Number(event.currentTarget.value) }),
              )
            }
            onPointerUp={endSlider}
          />
          <output>{Math.round(effect.softness)}</output>
        </label>
        <div className={styles.field}>
          <span>Highlight</span>
          <ColorPickerInput
            value={effect.highlightColor}
            onChange={(color) =>
              applyOp(
                (target) => embossPatchOperation(target, { highlightColor: color }),
                "emboss highlight",
              )
            }
            allowTransparent={true}
            title="Emboss highlight"
          />
        </div>
        <div className={styles.field}>
          <span>Shadow</span>
          <ColorPickerInput
            value={effect.shadowColor}
            onChange={(color) =>
              applyOp(
                (target) => embossPatchOperation(target, { shadowColor: color }),
                "emboss shadow",
              )
            }
            allowTransparent={true}
            title="Emboss shadow"
          />
        </div>
      </>
    );
  }

  return null;
}

function TextArcSlider({
  value,
  onBegin,
  onInput,
  onCommit,
}: {
  value: number;
  onBegin: () => void;
  onInput: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className={styles.rangeField} data-appearance-control="textArc">
      <span>Curve</span>
      <input
        type="range"
        min={-100}
        max={100}
        value={value}
        aria-label="Text arc curvature"
        onPointerDown={onBegin}
        onChange={(event) => onInput(Number(event.currentTarget.value))}
        onPointerUp={onCommit}
      />
      <output>{value}%</output>
    </label>
  );
}
