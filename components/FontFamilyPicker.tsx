"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureFontReady,
  findThaiFont,
  loadThaiFonts,
  resolveThaiFontCssFamily,
  THAI_FONT_CATEGORY_LABELS,
  THAI_FONTS,
  type ThaiFontDef,
} from "@/lib/fonts";

type Props = {
  value: string;
  onChange: (cssFamily: string) => void;
  /** Compact trigger for canvas property strip; default fits Builder inspector. */
  compact?: boolean;
};

const CATEGORY_ORDER: ThaiFontDef["category"][] = ["sans", "serif", "display", "handwriting"];

/**
 * Custom typeface picker — native <option> ignores font-family in most browsers,
 * so we render each font name in its own face for a true preview.
 */
export default function FontFamilyPicker({ value, onChange, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedCss = resolveThaiFontCssFamily(value);
  const selected = findThaiFont(selectedCss) ?? THAI_FONTS[0];

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: THAI_FONT_CATEGORY_LABELS[category],
        fonts: THAI_FONTS.filter((font) => font.category === category),
      })).filter((group) => group.fonts.length > 0),
    [],
  );

  useEffect(() => {
    loadThaiFonts();
  }, []);

  useEffect(() => {
    if (!open) return;
    loadThaiFonts();
    for (const font of THAI_FONTS) {
      void ensureFontReady(font.cssFamily, compact ? 13 : 15);
    }

    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, compact]);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <button
        type="button"
        data-testid="font-family-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          width: "100%",
          minWidth: 0,
          height: compact ? 28 : 34,
          padding: compact ? "0 8px" : "0 9px",
          border: "1px solid #d8dde7",
          borderRadius: 6,
          background: "#fbfcfd",
          color: "#172033",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: selected.cssFamily,
            fontSize: compact ? 12 : 13,
            fontWeight: 500,
            lineHeight: 1.2,
          }}
        >
          {selected.family}
        </span>
        <span style={{ color: "#94a3b8", fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          data-testid="font-family-picker-menu"
          aria-label="Thai typefaces"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 40,
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid #d8dde7",
            borderRadius: 8,
            background: "#ffffff",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.14)",
            padding: "4px 0 6px",
          }}
        >
          {groups.map((group) => (
            <div key={group.category}>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                {group.label}
              </div>
              {group.fonts.map((font) => {
                const active = font.cssFamily === selected.cssFamily;
                return (
                  <button
                    key={font.family}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-testid={`font-option-${font.family}`}
                    onClick={() => {
                      onChange(font.cssFamily);
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      background: active ? "#eef2ff" : "transparent",
                      color: "#0f172a",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(event) => {
                      if (!active) event.currentTarget.style.background = "#f8fafc";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = active ? "#eef2ff" : "transparent";
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.cssFamily,
                        fontSize: 15,
                        fontWeight: 500,
                        lineHeight: 1.35,
                      }}
                    >
                      {font.family}
                      <span style={{ marginLeft: 8, color: "#64748b", fontWeight: 400 }}>
                        กขคงจ
                      </span>
                    </span>
                    {active ? (
                      <span style={{ color: "#4f46e5", fontSize: 12, fontWeight: 700 }}>✓</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
