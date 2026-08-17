"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import {
  addColorToHistory,
  getColorHistory,
  openEyedropper,
  supportsEyedropper,
} from "@/lib/color/swatches";
import {
  alignElements as alignEngine,
  distributeElements as distributeEngine,
} from "@/lib/engine/align";
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
  const [history, setHistory] = useState<string[]>([]);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const w = 150;
    const h = 200;
    let left = rect.left;
    if (left + w > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - w - 12);
    }
    let top = rect.bottom + 4;
    if (top + h > window.innerHeight - 12) {
      top = Math.max(12, rect.top - h - 4);
    }
    setPos({ top, left });
  }, []);

  function handleOpen() {
    setHistory(getColorHistory());
    updatePosition();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleReposition() {
      updatePosition();
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePosition]);

  function handleColorSelect(val: string) {
    addColorToHistory(val);
    onPick(val);
    setOpen(false);
  }

  async function handleEyedropper() {
    const picked = await openEyedropper();
    if (picked) {
      handleColorSelect(picked);
    }
  }

  const popover =
    open && pos ? (
      <div
        ref={popoverRef}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          zIndex: 99999,
          background: "var(--surface-solid, #fff)",
          border: "1px solid var(--stroke, #e5e7eb)",
          borderRadius: 8,
          boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
          padding: "8px",
          width: 146,
        }}
      >
        {/* Main Swatches */}
        <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>
          PALETTE
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {values.map((v) => (
            <button
              key={v}
              onClick={() => handleColorSelect(v)}
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

        {/* History */}
        {history.length > 0 && (
          <>
            <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>
              RECENT
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {history.slice(0, 8).map((v) => (
                <button
                  key={v}
                  onClick={() => handleColorSelect(v)}
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
                    background: v,
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title={v}
                />
              ))}
            </div>
          </>
        )}

        {/* Tools: Eyedropper & Native Input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            borderTop: "1px solid var(--stroke, #f3f4f6)",
            paddingTop: 6,
          }}
        >
          {supportsEyedropper() && (
            <button
              type="button"
              onClick={handleEyedropper}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "3px 4px",
                fontSize: 10,
                fontWeight: 600,
                border: "1px solid var(--stroke, #e5e7eb)",
                borderRadius: 4,
                background: "#f9fafb",
                cursor: "pointer",
                color: "var(--ink, #1f2937)",
              }}
              title="Pick color from screen (Eyedropper)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.71 5.63l-2.34-2.34a2.8 2.8 0 0 0-3.96 0l-2.54 2.54 1.41 1.41-1.77 1.77-1.41-1.41-5.74 5.74a3 3 0 0 0-.82 1.54L2.05 21.05a.75.75 0 0 0 .9.9l6.17-1.48a3 3 0 0 0 1.54-.82l5.74-5.74-1.41-1.41 1.77-1.77 1.41 1.41 2.54-2.54a2.8 2.8 0 0 0 0-3.97zM8.76 18.18a1.5 1.5 0 0 1-.77.41L4.35 19.45l.86-3.64a1.5 1.5 0 0 1 .41-.77l4.88-4.88 3.14 3.14-4.88 4.88z" />
              </svg>
              <span>Pick</span>
            </button>
          )}
          <input
            type="color"
            value={current.startsWith("#") ? current : "#000000"}
            onChange={(e) => handleColorSelect(e.target.value)}
            style={{
              width: 24,
              height: 22,
              padding: 0,
              border: "none",
              cursor: "pointer",
              background: "transparent",
            }}
            title="Custom Color"
          />
        </div>
      </div>
    ) : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        onClick={handleOpen}
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
      {mounted && typeof document !== "undefined" && createPortal(popover, document.body)}
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
  const alignMode =
    mode === "centerH"
      ? "center"
      : mode === "middleV"
        ? "middle"
        : (mode as import("@/lib/engine/align").AlignMode);
  const patches = alignEngine(elements, alignMode);
  if (patches.length) updateElements(patches, "align " + mode);
}

export function distributeElements(elements: EngineElement[], axis: "h" | "v") {
  const updateElements = useEngine.getState().updateElements;
  const patches = distributeEngine(elements, axis === "h" ? "horizontal" : "vertical");
  if (patches.length) updateElements(patches, "distribute " + axis);
}
