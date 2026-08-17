"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addColorToHistory,
  getColorHistory,
  openEyedropper,
  resolveMultiGradientStops,
  supportsEyedropper,
} from "@/lib/color/swatches";

type Props = {
  value?: string | null;
  onChange: (color: string) => void;
  allowTransparent?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;

  // Gradient support
  supportsGradient?: boolean;
  fillType?: "solid" | "linear" | "radial";
  gradientColors?: string[];
  gradientAngle?: number;
  gradientStops?: number[];
  onGradientChange?: (
    type: "solid" | "linear" | "radial",
    colors: string[],
    angle?: number,
    stops?: number[],
  ) => void;
};

// 12 columns per row of rich designer shades
const SWATCH_ROWS = [
  // Row 1: Transparent Swatch + Primary Hues
  [
    "transparent", // Transparent Swatch Tile #1
    "#ef4444", // Red
    "#f97316", // Orange
    "#f59e0b", // Amber
    "#eab308", // Yellow
    "#84cc16", // Lime
    "#10b981", // Emerald
    "#06b6d4", // Cyan
    "#0284c7", // Sky
    "#2563eb", // Blue
    "#6366f1", // Indigo
    "#9333ea", // Purple
  ],
  // Row 2: Bright / Light Tints
  [
    "#f87171",
    "#fb923c",
    "#fbbf24",
    "#fde047",
    "#a3e635",
    "#34d399",
    "#22d3ee",
    "#38bdf8",
    "#60a5fa",
    "#818cf8",
    "#c084fc",
    "#f472b6",
  ],
  // Row 3: Deep / Dark Shades
  [
    "#991b1b",
    "#9a3412",
    "#92400e",
    "#854d0e",
    "#3f6212",
    "#065f46",
    "#155e75",
    "#075985",
    "#1e40af",
    "#3730a3",
    "#581c87",
    "#831843",
  ],
  // Row 4: Soft / Pastel Palette
  [
    "#fee2e2",
    "#ffedd5",
    "#fef3c7",
    "#fef9c3",
    "#ecfccb",
    "#d1fae5",
    "#cffafe",
    "#e0f2fe",
    "#dbeafe",
    "#e0e7ff",
    "#f3e8ff",
    "#fce7f3",
  ],
  // Row 5: Grayscale & Neutrals Spectrum (12 stops)
  [
    "#000000",
    "#18181b",
    "#27272a",
    "#3f3f46",
    "#52525b",
    "#71717a",
    "#a1a1aa",
    "#cbd5e1",
    "#e2e8f0",
    "#f1f5f9",
    "#f8fafc",
    "#ffffff",
  ],
];

// Curated preset gradient themes (multi-color & 2-color)
const PRESET_GRADIENTS: Array<{ name: string; colors: string[]; stops?: number[] }> = [
  { name: "Sunset Glow", colors: ["#ef4444", "#f97316", "#fde047"], stops: [0, 0.5, 1] },
  { name: "Cyberpunk", colors: ["#ec4899", "#8b5cf6", "#06b6d4"], stops: [0, 0.5, 1] },
  { name: "Aurora Sky", colors: ["#10b981", "#06b6d4", "#6366f1"], stops: [0, 0.45, 1] },
  {
    name: "Holographic",
    colors: ["#f472b6", "#c084fc", "#60a5fa", "#34d399"],
    stops: [0, 0.33, 0.67, 1],
  },
  {
    name: "Gold Luxury",
    colors: ["#78350f", "#d97706", "#fef08a", "#d97706"],
    stops: [0, 0.3, 0.7, 1],
  },
  { name: "Ocean Breeze", colors: ["#0284c7", "#38bdf8", "#a7f3d0"], stops: [0, 0.5, 1] },
  { name: "Pastel Dream", colors: ["#fce7f3", "#fef3c7", "#e0e7ff"], stops: [0, 0.5, 1] },
  { name: "Citrus Pop", colors: ["#84cc16", "#eab308", "#f97316"], stops: [0, 0.45, 1] },
  { name: "Midnight Purple", colors: ["#0f172a", "#312e81", "#7e22ce"], stops: [0, 0.55, 1] },
  { name: "Rose Velvet", colors: ["#fda4af", "#f43f5e", "#881337"], stops: [0, 0.5, 1] },
  { name: "Emerald Glade", colors: ["#064e3b", "#059669", "#34d399"], stops: [0, 0.5, 1] },
  {
    name: "Rainbow",
    colors: ["#ef4444", "#eab308", "#10b981", "#06b6d4", "#6366f1", "#db2777"],
    stops: [0, 0.2, 0.4, 0.6, 0.8, 1],
  },
];

type LocalStop = {
  id: string;
  color: string;
  offset: number; // 0..1
};

const DEFAULT_GRADIENT_COLORS: string[] = ["#6366f1", "#a855f7"];
const DEFAULT_GRADIENT_STOPS: number[] = [0, 1];

export default function ColorPickerInput({
  value = "#000000",
  onChange,
  allowTransparent = true,
  title,
  className,
  style,
  supportsGradient = false,
  fillType = "solid",
  gradientColors = DEFAULT_GRADIENT_COLORS,
  gradientAngle = 90,
  gradientStops = DEFAULT_GRADIENT_STOPS,
  onGradientChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<"solid" | "linear" | "radial">(fillType);
  const [currentAngle, setCurrentAngle] = useState<number>(gradientAngle);
  const [stops, setStops] = useState<LocalStop[]>(() => {
    const rawC =
      gradientColors && gradientColors.length > 0 ? gradientColors : DEFAULT_GRADIENT_COLORS;
    const n = rawC.length;
    return rawC.map((c, i) => ({
      id: `stop-${i}-${Math.random().toString(36).slice(2, 6)}`,
      color: c,
      offset:
        gradientStops && gradientStops[i] !== undefined
          ? gradientStops[i]
          : n <= 1
            ? 0
            : i / (n - 1),
    }));
  });
  const [activeStopIndex, setActiveStopIndex] = useState<number>(0);
  const [history, setHistory] = useState<string[]>([]);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  const isGradient = currentTab === "linear" || currentTab === "radial";
  const validActiveIndex = Math.max(0, Math.min(stops.length - 1, activeStopIndex));
  const activeColor = isGradient
    ? (stops[validActiveIndex]?.color ?? "#6366f1")
    : value || "#000000";

  const [hexInput, setHexInput] = useState(activeColor);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rampBarRef = useRef<HTMLDivElement>(null);

  const isTransparent = !isGradient && (!value || value === "transparent" || value === "none");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrentTab(fillType ?? "solid");
  }, [fillType]);

  useEffect(() => {
    setCurrentAngle(gradientAngle ?? 90);
  }, [gradientAngle]);

  useEffect(() => {
    if (!gradientColors || gradientColors.length === 0) return;
    setStops((prev) => {
      const isSame =
        prev.length === gradientColors.length &&
        prev.every(
          (s, i) =>
            s.color === gradientColors[i] &&
            Math.abs(
              s.offset -
                (gradientStops && gradientStops[i] !== undefined
                  ? gradientStops[i]
                  : gradientColors.length <= 1
                    ? 0
                    : i / (gradientColors.length - 1)),
            ) < 0.001,
        );
      if (isSame) return prev;
      const n = gradientColors.length;
      return gradientColors.map((c, i) => ({
        id: `stop-${i}`,
        color: c,
        offset:
          gradientStops && gradientStops[i] !== undefined
            ? gradientStops[i]
            : n <= 1
              ? 0
              : i / (n - 1),
      }));
    });
  }, [gradientColors, gradientStops]);

  useEffect(() => {
    setHexInput(activeColor);
  }, [activeColor]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 286;
    const popoverHeight = supportsGradient ? 490 : 310;

    let left = rect.right - popoverWidth;
    if (left < 12) {
      left = Math.max(12, rect.left);
    }
    if (left + popoverWidth > window.innerWidth - 12) {
      left = window.innerWidth - popoverWidth - 12;
    }

    let top = rect.bottom + 6;
    if (top + popoverHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - popoverHeight - 6);
    }

    setPopoverPos({ top, left });
  }, [supportsGradient]);

  useEffect(() => {
    if (open) {
      setHistory(getColorHistory());
      updatePosition();
    }
  }, [open, updatePosition]);

  // Click outside, Escape key, window scroll / resize listener
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

  function notifyGradientChange(
    nextStops: LocalStop[],
    nextAngle?: number,
    nextTab?: "solid" | "linear" | "radial",
  ) {
    const sorted = [...nextStops].sort((a, b) => a.offset - b.offset);
    setStops(sorted);
    const colors = sorted.map((s) => s.color);
    const stopOffsets = sorted.map((s) => s.offset);
    const a = nextAngle ?? currentAngle;
    const t = nextTab ?? currentTab;
    onGradientChange?.(t, colors, a, stopOffsets);
  }

  function handleTabChange(tab: "solid" | "linear" | "radial") {
    setCurrentTab(tab);
    if (tab === "solid") {
      const colors = stops.map((s) => s.color);
      const stopOffsets = stops.map((s) => s.offset);
      onGradientChange?.("solid", colors, currentAngle, stopOffsets);
      onChange(value || colors[0] || "#6366f1");
    } else {
      const colors = stops.map((s) => s.color);
      const stopOffsets = stops.map((s) => s.offset);
      onGradientChange?.(tab, colors, currentAngle, stopOffsets);
    }
  }

  function handleSelectColor(c: string) {
    if (c !== "transparent") {
      addColorToHistory(c);
      setHistory(getColorHistory());
    }

    if (currentTab === "solid") {
      onChange(c);
    } else {
      const nextStops = stops.map((s, idx) => (idx === validActiveIndex ? { ...s, color: c } : s));
      notifyGradientChange(nextStops);
    }
  }

  function handleAddStop(atOffset?: number) {
    const offset =
      atOffset !== undefined
        ? Math.max(0, Math.min(1, atOffset))
        : Math.min(1, (stops[validActiveIndex]?.offset ?? 0.5) + 0.15);
    const baseColor = stops[validActiveIndex]?.color || "#fde047";
    const newStop: LocalStop = {
      id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      color: baseColor,
      offset,
    };
    const nextStops = [...stops, newStop].sort((a, b) => a.offset - b.offset);
    const newIdx = nextStops.findIndex((s) => s.id === newStop.id);
    setActiveStopIndex(newIdx >= 0 ? newIdx : 0);
    notifyGradientChange(nextStops);
  }

  function handleDeleteStop() {
    if (stops.length <= 2) return;
    const nextStops = stops.filter((_, idx) => idx !== validActiveIndex);
    const nextIdx = Math.max(0, validActiveIndex - 1);
    setActiveStopIndex(nextIdx);
    notifyGradientChange(nextStops);
  }

  function handleActiveStopOffsetChange(newOffset: number) {
    const nextStops = stops.map((s, idx) =>
      idx === validActiveIndex ? { ...s, offset: Math.max(0, Math.min(1, newOffset)) } : s,
    );
    notifyGradientChange(nextStops);
  }

  function handleApplyPresetGradient(presetColors: string[], presetStops?: number[]) {
    const n = presetColors.length;
    const nextStops: LocalStop[] = presetColors.map((c, i) => ({
      id: `stop-${i}-${Date.now()}`,
      color: c,
      offset:
        presetStops && presetStops[i] !== undefined ? presetStops[i] : n <= 1 ? 0 : i / (n - 1),
    }));
    setActiveStopIndex(0);
    notifyGradientChange(nextStops);
  }

  function handleAngleChange(nextAngle: number) {
    setCurrentAngle(nextAngle);
    const colors = stops.map((s) => s.color);
    const stopOffsets = stops.map((s) => s.offset);
    onGradientChange?.(currentTab, colors, nextAngle, stopOffsets);
  }

  function handlePinPointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation();
    setActiveStopIndex(idx);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvt: PointerEvent) => {
      if (!rampBarRef.current) return;
      const rect = rampBarRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const off = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
      setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, offset: off } : s)));
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerUp);
      if (!rampBarRef.current) return;
      const rect = rampBarRef.current.getBoundingClientRect();
      const off = Math.max(0, Math.min(1, (upEvt.clientX - rect.left) / rect.width));
      setStops((prev) => {
        const next = prev.map((s, i) => (i === idx ? { ...s, offset: off } : s));
        const sorted = [...next].sort((a, b) => a.offset - b.offset);
        const newIdx = sorted.findIndex((s) => s.id === prev[idx]?.id);
        if (newIdx >= 0) setActiveStopIndex(newIdx);
        const colors = sorted.map((s) => s.color);
        const offsets = sorted.map((s) => s.offset);
        onGradientChange?.(currentTab, colors, currentAngle, offsets);
        return sorted;
      });
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerUp);
  }

  function handleRampBarClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!rampBarRef.current) return;
    const rect = rampBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clickOffset = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    handleAddStop(clickOffset);
  }

  async function handleEyedropper() {
    const picked = await openEyedropper();
    if (picked) {
      handleSelectColor(picked);
      setHexInput(picked);
    }
  }

  function handleHexSubmit(e: React.FormEvent) {
    e.preventDefault();
    let clean = hexInput.trim();
    if (!clean.startsWith("#") && /^[0-9a-fA-F]{3,8}$/.test(clean)) {
      clean = `#${clean}`;
    }
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)) {
      handleSelectColor(clean);
    }
  }

  // Resolved stops for gradient preview
  const rawColors = stops.map((s) => s.color);
  const rawOffsets = stops.map((s) => s.offset);
  const resolvedStops = resolveMultiGradientStops(rawColors, rawOffsets);
  const rampGradientCss = resolvedStops
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(", ");

  // Visual background preview for trigger button
  const triggerBackground = () => {
    if (fillType === "linear") {
      const a = gradientAngle ?? 90;
      return `linear-gradient(${a}deg, ${rampGradientCss})`;
    }
    if (fillType === "radial") {
      return `radial-gradient(circle, ${rampGradientCss})`;
    }
    if (isTransparent) {
      return "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 4px 4px";
    }
    return value || "#ffffff";
  };

  const activeStop = stops[validActiveIndex];

  const popoverContent =
    open && popoverPos ? (
      <div
        ref={popoverRef}
        style={{
          position: "fixed",
          top: popoverPos.top,
          left: popoverPos.left,
          zIndex: 99999,
          width: 286,
          maxHeight: "min(620px, calc(100vh - 24px))",
          overflowY: "auto",
          background: "var(--surface-solid, #ffffff)",
          border: "1px solid var(--stroke, #e5e7eb)",
          borderRadius: 10,
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08)",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 9,
          userSelect: "none",
        }}
      >
        {/* Top Fill Mode Tabs: Solid | Linear | Radial */}
        {supportsGradient && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 2,
              padding: 2,
              background: "rgba(0, 0, 0, 0.05)",
              borderRadius: 7,
            }}
          >
            {(["solid", "linear", "radial"] as const).map((tab) => {
              const active = currentTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabChange(tab)}
                  style={{
                    height: 24,
                    border: "none",
                    borderRadius: 5,
                    fontSize: 10.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--ink, #111827)" : "var(--ink-muted, #64748b)",
                    background: active ? "var(--surface-solid, #ffffff)" : "transparent",
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all 0.12s ease",
                  }}
                >
                  {tab === "solid" ? "Solid" : tab === "linear" ? "Linear" : "Radial"}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab Content: Multi-Stop Gradient Controls (Linear / Radial) */}
        {isGradient && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
              padding: "9px 10px",
              background: "rgba(0, 0, 0, 0.02)",
              border: "1px solid var(--stroke, #f1f5f9)",
              borderRadius: 8,
            }}
          >
            {/* Interactive Multi-Stop Gradient Ramp (Illustrator / Figma style) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--ink-muted, #9ca3af)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <span>Gradient Ramp</span>
                <span style={{ fontSize: 8.5, fontWeight: 500, textTransform: "none" }}>
                  Click bar to add stop
                </span>
              </div>

              {/* Gradient Ramp Bar */}
              <div
                ref={rampBarRef}
                onClick={handleRampBarClick}
                title="Click anywhere to add a new color stop"
                style={{
                  width: "100%",
                  height: 22,
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.18)",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.12)",
                  background:
                    "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 6px 6px",
                  cursor: "crosshair",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(90deg, ${rampGradientCss})`,
                  }}
                />
              </div>

              {/* Stop Pins Track (Draggable pins with arrow pointer) */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: 24,
                  marginTop: 1,
                }}
              >
                {stops.map((s, idx) => {
                  const active = idx === validActiveIndex;
                  const isStopTrans = !s.color || s.color === "transparent" || s.color === "none";
                  return (
                    <div
                      key={s.id}
                      onPointerDown={(e) => handlePinPointerDown(e, idx)}
                      title={`Stop ${idx + 1} (${Math.round(s.offset * 100)}%): Drag to move`}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${s.offset * 100}%`,
                        transform: "translateX(-50%)",
                        cursor: "grab",
                        zIndex: active ? 10 : 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        touchAction: "none",
                      }}
                    >
                      {/* Triangle Pointer pointing up to the ramp bar */}
                      <div
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: "4px solid transparent",
                          borderRight: "4px solid transparent",
                          borderBottom: active ? "5px solid #2563eb" : "5px solid rgba(0,0,0,0.35)",
                          marginBottom: -1,
                          transition: "border-bottom-color 0.1s ease",
                        }}
                      />

                      {/* Circular Pin Head */}
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#ffffff",
                          border: active ? "2px solid #2563eb" : "1.5px solid rgba(0,0,0,0.3)",
                          boxShadow: active
                            ? "0 0 0 2px rgba(37,99,235,0.35), 0 2px 5px rgba(0,0,0,0.2)"
                            : "0 1px 3px rgba(0,0,0,0.15)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.1s ease",
                        }}
                      >
                        {/* Inner Color Swatch Circle */}
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: isStopTrans
                              ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 3px 3px"
                              : s.color,
                            border: "1px solid rgba(0,0,0,0.1)",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          {isStopTrans && (
                            <svg
                              viewBox="0 0 20 20"
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                pointerEvents: "none",
                              }}
                            >
                              <line
                                x1="1"
                                y1="19"
                                x2="19"
                                y2="1"
                                stroke="#ef4444"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Stop Controls Bar: Stop Pill, Location input, Slider, + Add, 🗑 Delete */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px",
                background: "var(--surface-solid, #ffffff)",
                border: "1px solid var(--stroke, #e5e7eb)",
                borderRadius: 6,
              }}
            >
              {/* Active Stop Indicator Pill */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background:
                      activeStop?.color === "transparent"
                        ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 3px 3px"
                        : (activeStop?.color ?? "#6366f1"),
                    border: "1px solid rgba(0,0,0,0.15)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {activeStop?.color === "transparent" && (
                    <svg
                      viewBox="0 0 20 20"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                      }}
                    >
                      <line
                        x1="1"
                        y1="19"
                        x2="19"
                        y2="1"
                        stroke="#ef4444"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--ink, #374151)",
                  }}
                >
                  Stop {validActiveIndex + 1}
                </span>
              </div>

              {/* Location Number Box */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  marginLeft: "auto",
                }}
              >
                <span style={{ fontSize: 9.5, color: "var(--ink-muted, #64748b)" }}>Loc:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round((activeStop?.offset ?? 0) * 100)}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100;
                    handleActiveStopOffsetChange(val);
                  }}
                  style={{
                    width: 42,
                    height: 20,
                    padding: "0 3px",
                    fontSize: 10,
                    fontWeight: 600,
                    textAlign: "right",
                    borderRadius: 4,
                    border: "1px solid var(--stroke, #e5e7eb)",
                    background: "var(--surface-solid, #ffffff)",
                    color: "var(--ink, #111827)",
                  }}
                />
                <span style={{ fontSize: 9.5, color: "var(--ink-muted, #64748b)" }}>%</span>
              </div>

              {/* Add Stop Button (+) */}
              <button
                type="button"
                onClick={() => handleAddStop()}
                title="Add new gradient stop"
                style={{
                  height: 22,
                  padding: "0 6px",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--accent, #6366f1)",
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                <span>+</span>
                <span>Stop</span>
              </button>

              {/* Delete Stop Button (Trash) */}
              <button
                type="button"
                onClick={handleDeleteStop}
                disabled={stops.length <= 2}
                title={
                  stops.length <= 2
                    ? "Minimum 2 stops required"
                    : `Delete Stop ${validActiveIndex + 1}`
                }
                style={{
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  border: "1px solid var(--stroke, #e5e7eb)",
                  background: stops.length <= 2 ? "rgba(0,0,0,0.03)" : "rgba(239, 68, 68, 0.08)",
                  color: stops.length <= 2 ? "var(--ink-muted, #9ca3af)" : "#ef4444",
                  cursor: stops.length <= 2 ? "not-allowed" : "pointer",
                  fontSize: 11,
                  opacity: stops.length <= 2 ? 0.4 : 1,
                  transition: "all 0.1s ease",
                }}
              >
                🗑
              </button>
            </div>

            {/* Active Stop Location Range Slider */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((activeStop?.offset ?? 0) * 100)}
                onChange={(e) => handleActiveStopOffsetChange(Number(e.target.value) / 100)}
                style={{
                  width: "100%",
                  height: 4,
                  cursor: "pointer",
                  accentColor: "var(--accent, #6366f1)",
                }}
              />
            </div>

            {/* Direction & Angle Controls (Linear Gradient) */}
            {currentTab === "linear" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: "var(--ink-muted, #9ca3af)",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}
                  >
                    Direction & Angle (∠)
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={currentAngle}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(360, Number(e.target.value) || 0));
                        handleAngleChange(val);
                      }}
                      style={{
                        width: 44,
                        height: 20,
                        padding: "0 4px",
                        fontSize: 10.5,
                        fontWeight: 600,
                        textAlign: "right",
                        borderRadius: 4,
                        border: "1px solid var(--stroke, #e5e7eb)",
                        background: "var(--surface-solid, #ffffff)",
                        color: "var(--ink, #111827)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--ink-muted, #9ca3af)",
                        fontWeight: 600,
                      }}
                    >
                      °
                    </span>
                  </div>
                </div>

                {/* Quick Angle Presets */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
                  {[
                    { label: "0° →", val: 0 },
                    { label: "45° ↗", val: 45 },
                    { label: "90° ↓", val: 90 },
                    { label: "135° ↘", val: 135 },
                    { label: "180° ←", val: 180 },
                    { label: "270° ↑", val: 270 },
                  ].map((p) => {
                    const active = currentAngle === p.val;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => handleAngleChange(p.val)}
                        style={{
                          height: 20,
                          fontSize: 8.5,
                          fontWeight: active ? 700 : 500,
                          borderRadius: 3.5,
                          border: active
                            ? "1px solid var(--accent, #6366f1)"
                            : "1px solid var(--stroke, #e5e7eb)",
                          background: active
                            ? "rgba(99,102,241,0.1)"
                            : "var(--surface-solid, #ffffff)",
                          color: active ? "var(--accent, #6366f1)" : "var(--ink, #374151)",
                          cursor: "pointer",
                          padding: "0 2px",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {/* Smooth Angle Slider */}
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={currentAngle}
                  onChange={(e) => handleAngleChange(Number(e.target.value))}
                  style={{
                    width: "100%",
                    height: 4,
                    cursor: "pointer",
                    accentColor: "var(--accent, #6366f1)",
                  }}
                />
              </div>
            )}

            {/* Quick Preset Gradients */}
            <div>
              <div
                style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: "var(--ink-muted, #9ca3af)",
                  letterSpacing: "0.04em",
                  marginBottom: 3,
                  textTransform: "uppercase",
                }}
              >
                Preset Gradients
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
                {PRESET_GRADIENTS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPresetGradient(p.colors, p.stops)}
                    title={p.name}
                    style={{
                      width: "100%",
                      height: 16,
                      borderRadius: 3,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: `linear-gradient(135deg, ${resolveMultiGradientStops(
                        p.colors,
                        p.stops,
                      )
                        .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
                        .join(", ")})`,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top Header: Transparent Button & Eyedropper (in Solid Mode) */}
        {!isGradient && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {allowTransparent && (
              <button
                type="button"
                onClick={() => {
                  onChange("transparent");
                  setOpen(false);
                }}
                style={{
                  flex: 1,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: isTransparent ? "#ef4444" : "var(--ink, #374151)",
                  background: isTransparent ? "rgba(239, 68, 68, 0.08)" : "rgba(0, 0, 0, 0.03)",
                  border: isTransparent
                    ? "1px solid rgba(239, 68, 68, 0.35)"
                    : "1px solid var(--stroke, #e5e7eb)",
                  borderRadius: 5,
                  cursor: "pointer",
                  transition: "all 0.1s ease",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 2.5,
                    border: "1px solid rgba(0,0,0,0.15)",
                    position: "relative",
                    overflow: "hidden",
                    background:
                      "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 3.5px 3.5px",
                  }}
                >
                  <svg
                    viewBox="0 0 20 20"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                    }}
                  >
                    <line
                      x1="1"
                      y1="19"
                      x2="19"
                      y2="1"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <span>Transparent</span>
              </button>
            )}

            {supportsEyedropper() && (
              <button
                type="button"
                onClick={handleEyedropper}
                title="Pick color from screen (Eyedropper)"
                style={{
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--ink, #374151)",
                  background: "rgba(0, 0, 0, 0.03)",
                  border: "1px solid var(--stroke, #e5e7eb)",
                  borderRadius: 5,
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                  transition: "all 0.1s ease",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ display: "block" }}
                >
                  <path d="M20.71 5.63l-2.34-2.34a2.8 2.8 0 0 0-3.96 0l-2.54 2.54 1.41 1.41-1.77 1.77-1.41-1.41-5.74 5.74a3 3 0 0 0-.82 1.54L2.05 21.05a.75.75 0 0 0 .9.9l6.17-1.48a3 3 0 0 0 1.54-.82l5.74-5.74-1.41-1.41 1.77-1.77 1.41 1.41 2.54-2.54a2.8 2.8 0 0 0 0-3.97zM8.76 18.18a1.5 1.5 0 0 1-.77.41L4.35 19.45l.86-3.64a1.5 1.5 0 0 1 .41-.77l4.88-4.88 3.14 3.14-4.88 4.88z" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Recent Colors (12 Columns) */}
        {history.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "var(--ink-muted, #9ca3af)",
                letterSpacing: "0.04em",
                marginBottom: 3,
                textTransform: "uppercase",
              }}
            >
              Recent Colors
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3 }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const c = history[i];
                if (!c) {
                  return (
                    <div
                      key={`empty-${i}`}
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: 2.5,
                        background: "rgba(0, 0, 0, 0.03)",
                        border: "1px solid rgba(0, 0, 0, 0.06)",
                      }}
                    />
                  );
                }
                const active = activeColor?.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c + i}
                    type="button"
                    onClick={() => handleSelectColor(c)}
                    title={c}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      borderRadius: 2.5,
                      background: c,
                      border: active
                        ? "1.5px solid var(--accent, #6366f1)"
                        : "1px solid rgba(0,0,0,0.15)",
                      boxShadow: active ? "0 0 0 1.5px rgba(99,102,241,0.3)" : "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "transform 0.08s ease",
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Swatch Tiles Grid (12 Columns per Row) */}
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "var(--ink-muted, #9ca3af)",
              letterSpacing: "0.04em",
              marginBottom: 4,
              textTransform: "uppercase",
            }}
          >
            Swatch Tiles {isGradient ? `(Stop ${validActiveIndex + 1})` : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {SWATCH_ROWS.map((row, rowIdx) => (
              <div
                key={`row-${rowIdx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, 1fr)",
                  gap: 3,
                }}
              >
                {row.map((c) => {
                  const isTrans = c === "transparent";
                  const active =
                    activeColor?.toLowerCase() === c.toLowerCase() ||
                    (isTrans &&
                      (!activeColor || activeColor === "transparent" || activeColor === "none"));
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleSelectColor(c)}
                      title={isTrans ? "Transparent" : c}
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: 2.5,
                        background: isTrans
                          ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 3.5px 3.5px"
                          : c,
                        border: active
                          ? "1.5px solid var(--accent, #6366f1)"
                          : "1px solid rgba(0,0,0,0.14)",
                        boxShadow: active ? "0 0 0 1.5px rgba(99,102,241,0.35)" : "none",
                        cursor: "pointer",
                        padding: 0,
                        position: "relative",
                        overflow: "hidden",
                        transition: "transform 0.08s ease",
                      }}
                    >
                      {isTrans && (
                        <svg
                          viewBox="0 0 20 20"
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none",
                          }}
                        >
                          <line
                            x1="1"
                            y1="19"
                            x2="19"
                            y2="1"
                            stroke="#ef4444"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Custom Hex & Native Color Trigger */}
        <div
          style={{
            paddingTop: 6,
            borderTop: "1px solid var(--stroke, #f1f5f9)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {/* Native Spectrum Color Trigger */}
          <div
            style={{
              position: "relative",
              width: 26,
              height: 26,
              borderRadius: 5,
              overflow: "hidden",
              border: "1px solid var(--stroke, #d1d5db)",
              flexShrink: 0,
              background: isTransparent ? "#ffffff" : activeColor || "#ffffff",
            }}
          >
            <input
              type="color"
              value={isTransparent ? "#ffffff" : activeColor || "#ffffff"}
              onChange={(e) => {
                handleSelectColor(e.target.value);
                setHexInput(e.target.value);
              }}
              style={{
                position: "absolute",
                inset: -6,
                width: 40,
                height: 40,
                opacity: 0,
                cursor: "pointer",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: 10 }}>🎨</span>
            </div>
          </div>

          {/* Direct Hex Input */}
          <form onSubmit={handleHexSubmit} style={{ flex: 1 }}>
            <input
              type="text"
              value={hexInput}
              placeholder="#HEX"
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => {
                let clean = hexInput.trim();
                if (!clean.startsWith("#") && /^[0-9a-fA-F]{3,8}$/.test(clean)) {
                  clean = `#${clean}`;
                }
                if (
                  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
                ) {
                  handleSelectColor(clean);
                }
              }}
              style={{
                width: "100%",
                height: 26,
                padding: "0 7px",
                fontSize: 11,
                fontFamily: "var(--font-mono, monospace)",
                fontWeight: 600,
                borderRadius: 5,
                border: "1px solid var(--stroke, #e5e7eb)",
                background: "var(--surface-solid, #ffffff)",
                color: "var(--ink, #111827)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </form>
        </div>
      </div>
    ) : null;

  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      {/* Trigger Swatch Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={title ?? (isTransparent ? "Transparent" : activeColor || "Pick color")}
        className={className}
        style={{
          width: 38,
          height: 24,
          padding: 2,
          borderRadius: 5,
          border: open ? "1.5px solid var(--accent, #6366f1)" : "1px solid var(--stroke, #d1d5db)",
          background: "var(--surface-solid, #ffffff)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          transition: "all 0.12s ease",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 3,
            border: "1px solid rgba(0,0,0,0.1)",
            position: "relative",
            overflow: "hidden",
            background: triggerBackground(),
          }}
        >
          {isTransparent && (
            <svg
              viewBox="0 0 20 20"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            >
              <line
                x1="1"
                y1="19"
                x2="19"
                y2="1"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </button>

      {/* Render Popover into document.body so it NEVER clips */}
      {mounted && typeof document !== "undefined" && createPortal(popoverContent, document.body)}
    </div>
  );
}
