"use client";

/**
 * Excalidraw-style properties panel — shown above selection.
 * Compact dropdowns: one visible item + popover menu.
 */

import { useMemo, useRef, useState } from "react";
import {
  IconBringForward,
  IconBringToFront,
  IconDuplicate,
  IconFillCrossHatch,
  IconFillHachure,
  IconFillNone,
  IconFillSolid,
  IconGroup,
  IconLineDashed,
  IconLineDotted,
  IconLineSolid,
  IconLink,
  IconSendBackward,
  IconSendToBack,
  IconSloppyClean,
  IconSloppyNormal,
  IconSloppyRough,
  IconStrokeMed,
  IconStrokeThick,
  IconStrokeThin,
  IconTrash,
} from "@/components/icons";
import { unionBBox } from "@/lib/engine/bounds";
import { useEngine } from "@/lib/engine/store";
import type {
  ArrowElement,
  EngineElement,
  FillStyle,
  RectElement,
  Roughness,
  StrokeStyle,
  TextElement,
} from "@/lib/engine/types";
import { THAI_FONTS } from "@/lib/fonts";

/* ——— constants ——— */

const STROKE_PALETTE = ["#1b1b1f", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const BG_PALETTE = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];

const STROKE_WIDTHS: { value: number; icon: typeof IconStrokeThin; label: string }[] = [
  { value: 1, icon: IconStrokeThin, label: "Thin" },
  { value: 2, icon: IconStrokeMed, label: "Medium" },
  { value: 4, icon: IconStrokeThick, label: "Thick" },
];

const STROKE_STYLES: { value: StrokeStyle; icon: typeof IconLineSolid; label: string }[] = [
  { value: "solid", icon: IconLineSolid, label: "Solid" },
  { value: "dashed", icon: IconLineDashed, label: "Dashed" },
  { value: "dotted", icon: IconLineDotted, label: "Dotted" },
];

const ROUGHNESS_OPTS: { value: Roughness; icon: typeof IconSloppyClean; label: string }[] = [
  { value: 0, icon: IconSloppyClean, label: "Architect" },
  { value: 1, icon: IconSloppyNormal, label: "Artist" },
  { value: 2, icon: IconSloppyRough, label: "Cartoonist" },
];

const FONT_SIZES = [16, 20, 24, 32, 48, 72];

const FILL_STYLES: { value: FillStyle; icon: typeof IconFillHachure; label: string }[] = [
  { value: "hachure", icon: IconFillHachure, label: "Hachure" },
  { value: "cross-hatch", icon: IconFillCrossHatch, label: "Cross-hatch" },
  { value: "solid", icon: IconFillSolid, label: "Solid" },
  { value: "none", icon: IconFillNone, label: "None" },
];

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
  const bringToFront = useEngine((s) => s.bringToFront);
  const sendToBack = useEngine((s) => s.sendToBack);
  const bringForward = useEngine((s) => s.bringForward);
  const sendBackward = useEngine((s) => s.sendBackward);
  const deleteElements = useEngine((s) => s.deleteElements);
  const groupElements = useEngine((s) => s.groupElements);
  const ungroupElements = useEngine((s) => s.ungroupElements);
  const _flipHorizontal = useEngine((s) => s.flipHorizontal);
  const _flipVertical = useEngine((s) => s.flipVertical);
  const copyElements = useEngine((s) => s.copyElements);
  const pasteElements = useEngine((s) => s.pasteElements);
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
      {/* Stroke color */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 500 }}>Line</span>
          <CompactColorSwatch
            values={STROKE_PALETTE}
            current={first.strokeColor}
            onPick={(v) => apply({ strokeColor: v }, "stroke color")}
          />
        </div>
      </Section>

      {/* Background color */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 500 }}>Fill</span>
          <CompactColorSwatch
            values={BG_PALETTE}
            current={first.backgroundColor}
            onPick={(v) => apply({ backgroundColor: v }, "fill color")}
          />
        </div>
      </Section>

      {/* Stroke width */}
      <Section>
        <CompactDropdown
          options={STROKE_WIDTHS.map((o) => ({ ...o, key: String(o.value) }))}
          activeKey={String(first.strokeWidth)}
          onSelect={(k) => apply({ strokeWidth: Number(k) }, "stroke width")}
        />
      </Section>

      {/* Stroke style */}
      <Section>
        <CompactDropdown
          options={STROKE_STYLES.map((o) => ({ ...o, key: o.value }))}
          activeKey={first.strokeStyle}
          onSelect={(k) => apply({ strokeStyle: k as StrokeStyle }, "stroke style")}
        />
      </Section>

      {/* Fill style */}
      <Section>
        <CompactDropdown
          options={FILL_STYLES.map((o) => ({ ...o, key: o.value }))}
          activeKey={first.fillStyle}
          onSelect={(k) => apply({ fillStyle: k as FillStyle }, "fill style")}
        />
      </Section>

      {/* Roughness */}
      <Section>
        <CompactDropdown
          options={ROUGHNESS_OPTS.map((o) => ({ ...o, key: String(o.value) }))}
          activeKey={String(first.roughness)}
          onSelect={(k) => apply({ roughness: Number(k) as Roughness }, "roughness")}
        />
      </Section>

      {/* Edges (rect only) */}
      {selected.every((el) => el.type === "rect") && (
        <Section>
          <CompactDropdown
            options={[
              {
                key: "sharp",
                icon: () => (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <rect x="4" y="4" width="16" height="16" />
                  </svg>
                ),
                label: "Sharp",
              },
              {
                key: "round",
                icon: () => (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="4" />
                  </svg>
                ),
                label: "Round",
              },
            ]}
            activeKey={(first as RectElement).cornerRadius > 0 ? "round" : "sharp"}
            onSelect={(k) =>
              updateElements(
                ids.map((id) => ({
                  id,
                  patch: {
                    edgeStyle: k as "sharp" | "round",
                    cornerRadius: k === "round" ? 16 : 0,
                  } as Partial<EngineElement>,
                })),
                "edge",
              )
            }
          />
        </Section>
      )}

      {/* Fill type (gradient) */}
      <Section>
        <CompactDropdown
          options={[
            { key: "solid", label: "Solid", icon: () => <span style={{ fontSize: 12 }}>■</span> },
            { key: "linear", label: "Linear", icon: () => <span style={{ fontSize: 12 }}>▤</span> },
            { key: "radial", label: "Radial", icon: () => <span style={{ fontSize: 12 }}>◉</span> },
          ]}
          activeKey={first.fillType ?? "solid"}
          onSelect={(k) => {
            const ft = k as "solid" | "linear" | "radial";
            apply(
              { fillType: ft, gradientColors: ft !== "solid" ? ["#6366f1", "#a855f7"] : undefined },
              "fill type",
            );
          }}
        />
      </Section>

      {(first.fillType === "linear" || first.fillType === "radial") && (
        <Section>
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>From</span>
            <CompactColorSwatch
              values={["#6366f1", "#1971c2", "#2f9e44", "#f08c00", "#e03131", "#000000"]}
              current={first.gradientColors?.[0] ?? "#6366f1"}
              onPick={(v) =>
                apply(
                  {
                    gradientColors: [v, first.gradientColors?.[1] ?? "#a855f7"] as [string, string],
                  },
                  "gradient",
                )
              }
            />
            <span style={{ fontSize: 9, color: "#9ca3af" }}>To</span>
            <CompactColorSwatch
              values={["#a855f7", "#1971c2", "#2f9e44", "#f08c00", "#e03131", "#ffffff"]}
              current={first.gradientColors?.[1] ?? "#a855f7"}
              onPick={(v) =>
                apply(
                  {
                    gradientColors: [first.gradientColors?.[0] ?? "#6366f1", v] as [string, string],
                  },
                  "gradient",
                )
              }
            />
          </div>
        </Section>
      )}

      {/* Pattern fill */}
      <Section>
        <CompactDropdown
          options={[
            { key: "none", label: "None", icon: () => <span style={{ fontSize: 12 }}>□</span> },
            { key: "dots", label: "Dots", icon: () => <span style={{ fontSize: 12 }}>⋯</span> },
            {
              key: "stripes",
              label: "Stripes",
              icon: () => <span style={{ fontSize: 12 }}>▦</span>,
            },
            { key: "grid", label: "Grid", icon: () => <span style={{ fontSize: 12 }}>▧</span> },
          ]}
          activeKey={first.fillPattern ?? "none"}
          onSelect={(k) => {
            const val = k === "none" ? undefined : (k as "dots" | "stripes" | "grid");
            apply({ fillPattern: val }, "pattern");
          }}
        />
      </Section>

      {/* Shadow */}
      <Section>
        <button
          onClick={() => {
            const hasShadow = !!first.shadow;
            apply(
              {
                shadow: hasShadow
                  ? undefined
                  : { color: "rgba(0,0,0,0.15)", blur: 8, offsetX: 2, offsetY: 4 },
              },
              "shadow",
            );
          }}
          style={{
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid var(--stroke, #e5e7eb)",
            background: first.shadow
              ? "var(--accent-light, #eef2ff)"
              : "var(--surface-solid, #fff)",
            cursor: "pointer",
            fontSize: 10,
            color: first.shadow ? "var(--accent, #6366f1)" : "var(--ink, #111)",
          }}
        >
          {first.shadow ? "Shadow On" : "Shadow"}
        </button>
      </Section>

      {/* Arrow type & Arrowheads */}
      {firstArrow && (
        <>
          <Section>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <ArrowheadSelect
                value={firstArrow.startArrowhead}
                onChange={(v) =>
                  updateElements(
                    arrows.map((el) => ({ id: el.id, patch: { startArrowhead: v } })),
                    "arrow start",
                  )
                }
                label="Start"
              />
              <span style={{ color: "#9ca3af", fontSize: 10 }}>→</span>
              <ArrowheadSelect
                value={firstArrow.endArrowhead}
                onChange={(v) =>
                  updateElements(
                    arrows.map((el) => ({ id: el.id, patch: { endArrowhead: v } })),
                    "arrow end",
                  )
                }
                label="End"
              />
            </div>
          </Section>
          <Section>
            <ArrowheadSizeControl arrow={firstArrow} arrows={arrows} />
          </Section>
        </>
      )}

      {/* Font (text elements) */}
      {hasText && firstText && (
        <>
          <Section>
            <select
              value={firstText.fontFamily}
              onChange={(e) =>
                apply({ fontFamily: e.target.value } as Partial<TextElement>, "font family")
              }
              style={{
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid var(--stroke, #e5e7eb)",
                fontSize: 11,
                fontFamily: firstText.fontFamily,
                cursor: "pointer",
                background: "var(--surface-solid, #fff)",
                color: "var(--ink, #111)",
              }}
            >
              {THAI_FONTS.map((f) => (
                <option key={f.family} value={f.cssFamily} style={{ fontFamily: f.cssFamily }}>
                  {f.family}
                </option>
              ))}
            </select>
          </Section>
          <Section>
            <CompactDropdown
              options={FONT_SIZES.map((v) => ({
                key: String(v),
                label: `${v}px`,
                icon: () => <span style={{ fontSize: 12, fontWeight: 500 }}>{v}</span>,
              }))}
              activeKey={String(firstText.fontSize)}
              onSelect={(k) => apply({ fontSize: Number(k) } as Partial<TextElement>, "font size")}
            />
          </Section>
          {/* Line spacing */}
          <Section>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Line</span>
              <input
                type="range"
                min={100}
                max={250}
                value={Math.round(firstText.lineHeight * 100)}
                onChange={(e) =>
                  apply(
                    { lineHeight: Number(e.currentTarget.value) / 100 } as Partial<TextElement>,
                    "line spacing",
                  )
                }
                style={{ width: 50, accentColor: "var(--accent, #6366f1)" }}
              />
              <span style={{ fontSize: 9, color: "#9ca3af", minWidth: 20, textAlign: "right" }}>
                {firstText.lineHeight.toFixed(2)}
              </span>
            </div>
          </Section>
        </>
      )}

      {/* Image crop + AI */}
      {firstImage && selected.length === 1 && (
        <Section>
          <button
            onClick={() =>
              setCroppingImageId(croppingImageId === firstImage.id ? null : firstImage.id)
            }
            style={{
              padding: "4px 8px",
              borderRadius: 5,
              border: "1px solid var(--stroke, #e5e7eb)",
              background:
                croppingImageId === firstImage.id
                  ? "var(--accent, #6366f1)"
                  : "var(--surface-solid, #fff)",
              color: croppingImageId === firstImage.id ? "#fff" : "var(--ink, #111)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {croppingImageId === firstImage.id ? "Done" : "Crop"}
          </button>
        </Section>
      )}

      {/* Opacity */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(first.opacity * 100)}
            onChange={(e) => apply({ opacity: Number(e.currentTarget.value) / 100 }, "opacity")}
            style={{ width: 60, accentColor: "var(--accent, #6366f1)" }}
          />
          <span style={{ color: "#9ca3af", fontSize: 9, minWidth: 16, textAlign: "right" }}>
            {Math.round(first.opacity * 100)}
          </span>
        </div>
      </Section>

      {/* Align & Distribute (2+ elements) */}
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
    </div>
  );
}

/* ——— CompactDropdown ——— */

function CompactDropdown({
  options,
  activeKey,
  onSelect,
}: {
  options: { key: string; icon: (props: { size?: number }) => React.ReactNode; label: string }[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.key === activeKey) ?? options[0];
  const ref = useRef<HTMLDivElement>(null);

  const ActiveIcon = active?.icon;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 6px",
          borderRadius: 5,
          border: "1px solid var(--stroke, #e5e7eb)",
          background: "var(--surface-solid, #fff)",
          cursor: "pointer",
          fontSize: 10,
          color: "var(--ink, #111)",
        }}
      >
        {ActiveIcon && <ActiveIcon size={16} />}
        <span style={{ fontSize: 10, fontWeight: 500 }}>{active?.label}</span>
        <span style={{ fontSize: 8, color: "#9ca3af", marginLeft: 2 }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            background: "var(--surface-solid, #fff)",
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 6,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            padding: "3px 0",
            minWidth: 120,
          }}
        >
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.key}
                onClick={() => {
                  onSelect(o.key);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "5px 8px",
                  border: "none",
                  background: o.key === activeKey ? "#eef2ff" : "transparent",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--ink, #111)",
                }}
              >
                <Icon size={18} />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ——— ArrowheadSelect ——— */

function ArrowheadSelect({
  value,
  onChange,
  label,
}: {
  value: ArrowElement["endArrowhead"];
  onChange: (v: ArrowElement["endArrowhead"]) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const kinds: ArrowElement["endArrowhead"][] = [
    "none",
    "arrow",
    "triangle",
    "triangle_outline",
    "dot",
    "circle",
    "bar",
    "diamond",
  ];
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "3px 6px",
          borderRadius: 5,
          border: "1px solid var(--stroke, #e5e7eb)",
          background: "var(--surface-solid, #fff)",
          cursor: "pointer",
          fontSize: 10,
          color: "var(--ink, #111)",
        }}
      >
        {label}: {value === "none" ? "—" : value}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            background: "var(--surface-solid, #fff)",
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 6,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            padding: "3px 0",
            minWidth: 100,
          }}
        >
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => {
                onChange(k);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "5px 8px",
                border: "none",
                background: k === value ? "#eef2ff" : "transparent",
                cursor: "pointer",
                fontSize: 11,
                textAlign: "left",
              }}
            >
              {k === "none" ? "—" : k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ——— ArrowheadSizeControl ——— */

function ArrowheadSizeControl({ arrow, arrows }: { arrow: ArrowElement; arrows: ArrowElement[] }) {
  const updateElements = useEngine((s) => s.updateElements);
  const cur = arrow.arrowheadScale ?? 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button
        onClick={() => {
          const next = Math.max(0.25, cur - 0.25);
          updateElements(
            arrows.map((el) => ({ id: el.id, patch: { arrowheadScale: next } })),
            "arrowhead size",
          );
        }}
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          border: "1px solid var(--stroke, #e5e7eb)",
          background: "var(--surface-solid, #fff)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
        }}
      >
        −
      </button>
      <span style={{ fontSize: 10, minWidth: 28, textAlign: "center" }}>×{cur.toFixed(2)}</span>
      <button
        onClick={() => {
          const next = Math.min(4, cur + 0.25);
          updateElements(
            arrows.map((el) => ({ id: el.id, patch: { arrowheadScale: next } })),
            "arrowhead size",
          );
        }}
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          border: "1px solid var(--stroke, #e5e7eb)",
          background: "var(--surface-solid, #fff)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          padding: 0,
        }}
      >
        +
      </button>
    </div>
  );
}

/* ——— Sub-components ——— */

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center" }}>{children}</div>;
}

function IconBtn({
  onClick,
  children,
  active,
  danger,
  title,
  style,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 24,
        height: 24,
        minWidth: 24,
        minHeight: 24,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 5,
        border: "1px solid",
        borderColor: active
          ? "var(--accent, #6366f1)"
          : danger
            ? "#fca5a5"
            : "var(--stroke, #e5e7eb)",
        background: active
          ? "var(--accent-light, #eef2ff)"
          : danger
            ? "#fef2f2"
            : "var(--surface-solid, #fff)",
        color: active ? "var(--accent, #6366f1)" : danger ? "#dc2626" : "var(--ink, #111827)",
        cursor: "pointer",
        padding: 0,
        transition: "all 0.15s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function CompactColorSwatch({
  values,
  current,
  onPick,
}: {
  values: string[];
  current: string;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "2px 4px",
          borderRadius: 5,
          border: "1px solid var(--stroke, #e5e7eb)",
          background: "var(--surface-solid, #fff)",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: "1px solid var(--stroke, #d1d5db)",
            background:
              current === "transparent"
                ? "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 4px 4px"
                : current,
          }}
        />
        <span style={{ fontSize: 8, color: "#9ca3af" }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            background: "var(--surface-solid, #fff)",
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 6,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            padding: "4px",
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            width: 90,
          }}
        >
          {values.map((v) => (
            <button
              key={v}
              onClick={() => {
                onPick(v);
                setOpen(false);
              }}
              style={{
                width: 18,
                height: 18,
                minWidth: 18,
                minHeight: 18,
                borderRadius: 3,
                border:
                  current === v
                    ? "2px solid var(--accent, #6366f1)"
                    : "1px solid var(--stroke, #d1d5db)",
                background:
                  v === "transparent"
                    ? "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 4px 4px"
                    : v,
                cursor: "pointer",
                padding: 0,
              }}
              title={v}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ——— Align / Distribute helpers ——— */

function AlignBtn({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        border: "1px solid var(--stroke, #e5e7eb)",
        background: "var(--surface-solid, #fff)",
        cursor: "pointer",
        fontSize: 9,
        fontWeight: 600,
        color: "var(--ink, #111)",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}

function alignElements(elements: EngineElement[], mode: string) {
  const updateElements = useEngine.getState().updateElements;
  const _ids = elements.map((el) => el.id);
  let target = 0;
  const patches: { id: string; patch: Partial<EngineElement> }[] = [];

  switch (mode) {
    case "left":
      target = Math.min(...elements.map((e) => e.x));
      for (const el of elements) patches.push({ id: el.id, patch: { x: target } });
      break;
    case "centerH": {
      const centers = elements.map((e) => e.x + e.width / 2);
      target = centers.reduce((a, b) => a + b, 0) / centers.length;
      for (const el of elements) patches.push({ id: el.id, patch: { x: target - el.width / 2 } });
      break;
    }
    case "right":
      target = Math.max(...elements.map((e) => e.x + e.width));
      for (const el of elements) patches.push({ id: el.id, patch: { x: target - el.width } });
      break;
    case "top":
      target = Math.min(...elements.map((e) => e.y));
      for (const el of elements) patches.push({ id: el.id, patch: { y: target } });
      break;
    case "middleV": {
      const centers = elements.map((e) => e.y + e.height / 2);
      target = centers.reduce((a, b) => a + b, 0) / centers.length;
      for (const el of elements) patches.push({ id: el.id, patch: { y: target - el.height / 2 } });
      break;
    }
    case "bottom":
      target = Math.max(...elements.map((e) => e.y + e.height));
      for (const el of elements) patches.push({ id: el.id, patch: { y: target - el.height } });
      break;
  }
  if (patches.length) updateElements(patches, "align " + mode);
}

function distributeElements(elements: EngineElement[], axis: "h" | "v") {
  const updateElements = useEngine.getState().updateElements;
  const sorted = [...elements].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
  if (sorted.length < 3) return;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSpace = axis === "h" ? last.x + last.width - first.x : last.y + last.height - first.y;
  const totalSize = sorted.reduce((sum, e) => sum + (axis === "h" ? e.width : e.height), 0);
  const gap = (totalSpace - totalSize) / (sorted.length - 1);
  const patches: { id: string; patch: Partial<EngineElement> }[] = [];
  let pos = axis === "h" ? first.x : first.y;
  for (const el of sorted) {
    if (axis === "h") {
      patches.push({ id: el.id, patch: { x: pos } });
      pos += el.width + gap;
    } else {
      patches.push({ id: el.id, patch: { y: pos } });
      pos += el.height + gap;
    }
  }
  updateElements(patches, "distribute " + axis);
}
