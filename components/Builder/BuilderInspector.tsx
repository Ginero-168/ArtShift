"use client";

import { useMemo } from "react";
import { BookMockupSection } from "@/components/Canvas/PropertiesPanel/BookMockupSection";
import { getBuilderBlockDefinition } from "@/lib/builder/blocks";
import {
  getTextPreset,
  inferTextPresetId,
  TEXT_PRESETS,
  type TextPresetId,
  textPresetPatch,
} from "@/lib/builder/textPresets";
import { getHexGridDimensions } from "@/lib/engine/hexLayout";
import { fileToDataURL, loadDataURL } from "@/lib/engine/imageCache";
import { getLayerForObject } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";
import { getTextMinimumHeight, getTextSafePadding } from "@/lib/engine/textLayout";
import type {
  BlockPlacement,
  BookMockupElement,
  EngineElement,
  EngineLayer,
  ImageElement,
  TextElement,
} from "@/lib/engine/types";
import { THAI_FONTS } from "@/lib/fonts";
import styles from "./Builder.module.css";

export default function BuilderInspector() {
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const selectedIds = useEngine((state) => state.selectedIds);
  const activeLayerId = useEngine((state) => state.activeLayerId);
  const updateElements = useEngine((state) => state.updateElements);
  const updateBlockPlacement = useEngine((state) => state.updateBlockPlacement);
  const setLayerMode = useEngine((state) => state.setLayerMode);
  const deleteElements = useEngine((state) => state.deleteElements);
  const bringToFront = useEngine((state) => state.bringToFront);
  const sendToBack = useEngine((state) => state.sendToBack);
  const setSlideBackground = useEngine((state) => state.setSlideBackground);
  const croppingImageId = useEngine((state) => state.croppingImageId);
  const setCroppingImageId = useEngine((state) => state.setCroppingImageId);

  const selected = useMemo(
    () =>
      slide?.elements.filter((element) => selectedIds.has(element.id) && !element.isDeleted) ?? [],
    [selectedIds, slide],
  );
  const first = selected[0];
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
              <h3>Canvas</h3>
              <label className={styles.field}>
                <span>Background</span>
                <input
                  className={styles.colorField}
                  type="color"
                  value={normalizeColor(slide.background)}
                  onChange={(event) => setSlideBackground(slide.id, event.currentTarget.value)}
                />
              </label>
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
            {activeLayer ? (
              <LayoutModeSection
                layer={activeLayer}
                onChange={(mode) => setLayerMode(activeLayer.id, mode)}
              />
            ) : null}
            {firstPlacement && slide ? (
              <div className={styles.optionSection}>
                <h3>
                  Hex placement · {hexGrid.columns} × {hexGrid.rows}
                </h3>
                <div className={styles.numberGrid}>
                  <NumberField
                    label="Column"
                    value={firstPlacement.col + 1}
                    min={1}
                    max={hexGrid.columns + 1 - firstPlacement.colSpan}
                    onChange={(value) => updateBlock({ col: value - 1 })}
                  />
                  <NumberField
                    label="Row"
                    value={firstPlacement.row + 1}
                    min={1}
                    max={hexGrid.rows + 1 - firstPlacement.rowSpan}
                    onChange={(value) => updateBlock({ row: value - 1 })}
                  />
                  <NumberField
                    label="Width"
                    value={firstPlacement.colSpan}
                    min={firstPlacement.minColSpan ?? 1}
                    max={hexGrid.columns - firstPlacement.col}
                    onChange={(value) => updateBlock({ colSpan: value })}
                  />
                  <NumberField
                    label="Height"
                    value={firstPlacement.rowSpan}
                    min={firstPlacement.minRowSpan ?? 1}
                    max={hexGrid.rows - firstPlacement.row}
                    onChange={(value) => updateBlock({ rowSpan: value })}
                  />
                </div>
              </div>
            ) : (
              <TransformSection element={first} apply={apply} />
            )}

            {first.type === "text" ? (
              <TextOptions
                text={first}
                apply={apply as TextApply}
                blockManaged={activeLayer?.mode === "block"}
              />
            ) : null}

            {first.type === "image" || first.type === "bookMockup" ? (
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

            {first.type === "bookMockup" ? (
              <BookMockupSection
                mockup={first}
                apply={(patch, label) => apply(patch as Partial<EngineElement>, label)}
              />
            ) : null}

            <StyleOptions element={first} apply={apply} />

            <div className={styles.optionSection}>
              <h3>Arrange</h3>
              <div className={`${styles.buttonRow} ${styles.arrangeRow}`}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => bringToFront(selected.map((element) => element.id))}
                >
                  Bring front
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => sendToBack(selected.map((element) => element.id))}
                >
                  Send back
                </button>
                <button
                  className={styles.dangerButton}
                  type="button"
                  onClick={() => deleteElements(selected.map((element) => element.id))}
                >
                  Delete element
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}

type TextApply = (patch: Partial<TextElement>, label: string) => void;

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
    const lineCount = Math.max(1, next.text.split("\n").length);
    const minimumHeight = getTextMinimumHeight(next, lineCount);
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

function LayoutModeSection({
  layer,
  onChange,
}: {
  layer: EngineLayer;
  onChange: (mode: EngineLayer["mode"]) => void;
}) {
  return (
    <div className={styles.optionSection}>
      <h3>Layer · {layer.name}</h3>
      <div className={styles.placementTabs} role="group" aria-label="Layer placement mode">
        <button
          type="button"
          aria-pressed={layer.mode === "block"}
          className={layer.mode === "block" ? styles.gridModeActive : undefined}
          onClick={() => onChange("block")}
        >
          Block
        </button>
        <button
          type="button"
          aria-pressed={layer.mode === "free"}
          className={layer.mode === "free" ? styles.freeModeActive : undefined}
          onClick={() => onChange("free")}
        >
          Free
        </button>
      </div>
      <p className={styles.modeDescription}>
        {layer.mode === "block"
          ? `${layer.objectIds.length} objects · shared Hex layout`
          : `${layer.objectIds.length} objects · free position and overlap`}
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
            accept="image/png,image/jpeg,image/webp,image/avif"
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
  const minimumHeight =
    element.type === "text"
      ? Math.ceil(getTextMinimumHeight(element, Math.max(1, element.text.split("\n").length)))
      : 2;
  return (
    <div className={styles.optionSection}>
      <h3>Transform</h3>
      <div className={styles.numberGrid}>
        <NumberField
          label="X"
          value={Math.round(element.x)}
          onChange={(x) => apply({ x }, "position")}
        />
        <NumberField
          label="Y"
          value={Math.round(element.y)}
          onChange={(y) => apply({ y }, "position")}
        />
        <NumberField
          label="Width"
          value={Math.round(element.width)}
          min={2}
          onChange={(width) => apply({ width }, "size")}
        />
        <NumberField
          label="Height"
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
  return (
    <div className={styles.optionSection}>
      <h3>Appearance</h3>
      {!isMedia ? (
        <label className={styles.field}>
          <span>{element.type === "text" ? "Text color" : "Stroke"}</span>
          <input
            className={styles.colorField}
            type="color"
            value={normalizeColor(element.strokeColor)}
            onChange={(event) => apply({ strokeColor: event.currentTarget.value }, "foreground")}
          />
        </label>
      ) : null}
      {!isMedia ? (
        <label className={styles.field}>
          <span>Background</span>
          <input
            className={styles.colorField}
            type="color"
            value={normalizeColor(element.backgroundColor)}
            onChange={(event) =>
              apply({ backgroundColor: event.currentTarget.value }, "background")
            }
          />
        </label>
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

function normalizeColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff";
}

function typeName(element: EngineElement | undefined) {
  if (!element) return "Canvas";
  if (element.type === "bookMockup") return "Book mockup";
  return element.type.charAt(0).toUpperCase() + element.type.slice(1);
}
