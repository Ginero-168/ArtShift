"use client";

import { useState } from "react";
import {
  IconFillCrossHatch,
  IconFillHachure,
  IconFillNone,
  IconFillSolid,
  IconLineDashed,
  IconLineDotted,
  IconLineSolid,
  IconSloppyClean,
  IconSloppyNormal,
  IconSloppyRough,
  IconStrokeMed,
  IconStrokeThick,
  IconStrokeThin,
} from "@/components/icons";
import { useEngine } from "@/lib/engine/store";
import type {
  ArrowElement,
  EngineElement,
  FillStyle,
  Roughness,
  StrokeStyle,
} from "@/lib/engine/types";

export const STROKE_PALETTE = ["#1b1b1f", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
export const BG_PALETTE = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];

export const STROKE_WIDTHS: { value: number; icon: typeof IconStrokeThin; label: string }[] = [
  { value: 1, icon: IconStrokeThin, label: "Thin" },
  { value: 2, icon: IconStrokeMed, label: "Medium" },
  { value: 4, icon: IconStrokeThick, label: "Thick" },
];

export const STROKE_STYLES: { value: StrokeStyle; icon: typeof IconLineSolid; label: string }[] = [
  { value: "solid", icon: IconLineSolid, label: "Solid" },
  { value: "dashed", icon: IconLineDashed, label: "Dashed" },
  { value: "dotted", icon: IconLineDotted, label: "Dotted" },
];

export const ROUGHNESS_OPTS: { value: Roughness; icon: typeof IconSloppyClean; label: string }[] = [
  { value: 0, icon: IconSloppyClean, label: "Architect" },
  { value: 1, icon: IconSloppyNormal, label: "Artist" },
  { value: 2, icon: IconSloppyRough, label: "Cartoonist" },
];

export const FONT_SIZES = [16, 20, 24, 32, 48, 72];

export const FILL_STYLES: { value: FillStyle; icon: typeof IconFillHachure; label: string }[] = [
  { value: "hachure", icon: IconFillHachure, label: "Hachure" },
  { value: "cross-hatch", icon: IconFillCrossHatch, label: "Cross-hatch" },
  { value: "solid", icon: IconFillSolid, label: "Solid" },
  { value: "none", icon: IconFillNone, label: "None" },
];

export function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center" }}>{children}</div>;
}

export function IconBtn({
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

export function CompactDropdown<T extends string>({
  options,
  activeKey,
  onSelect,
}: {
  options: { key: T; icon: (props: { size?: number }) => React.ReactNode; label: string }[];
  activeKey: T;
  onSelect: (k: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.key === activeKey) ?? options[0];
  const Icon = active?.icon;
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 6px",
          borderRadius: 5,
          border: "1px solid var(--stroke, #e5e7eb)",
          background: "var(--surface-solid, #fff)",
          cursor: "pointer",
          fontSize: 10,
          color: "var(--ink, #111)",
        }}
      >
        {Icon && <Icon />}
        <span style={{ fontSize: 9 }}>{active?.label}</span>
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
            padding: "3px 0",
            minWidth: 100,
          }}
        >
          {options.map((o) => {
            const OptIcon = o.icon;
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
                  background: activeKey === o.key ? "#eef2ff" : "transparent",
                  cursor: "pointer",
                  fontSize: 11,
                  textAlign: "left",
                }}
              >
                <OptIcon />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CompactColorSwatch({
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

export function ArrowheadSelect({
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

export function ArrowheadSizeControl({
  arrow,
  arrows,
}: {
  arrow: ArrowElement;
  arrows: ArrowElement[];
}) {
  const updateElements = useEngine((s) => s.updateElements);
  const cur = arrow.arrowheadScale ?? 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 9, color: "#9ca3af" }}>Scale</span>
      <input
        type="range"
        min={0.5}
        max={3}
        step={0.1}
        value={cur}
        onChange={(e) => {
          const scale = Number.parseFloat(e.target.value);
          updateElements(
            arrows.map((a) => ({
              id: a.id,
              patch: { arrowheadScale: scale } as Partial<EngineElement>,
            })),
            "arrowhead scale",
          );
        }}
        style={{ width: 60 }}
      />
    </div>
  );
}

export function AlignBtn({
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

export function alignElements(elements: EngineElement[], mode: string) {
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

export function distributeElements(elements: EngineElement[], axis: "h" | "v") {
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
