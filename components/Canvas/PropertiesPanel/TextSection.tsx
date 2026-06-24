"use client";

import type { TextElement } from "@/lib/engine/types";
import { THAI_FONTS } from "@/lib/fonts";
import { CompactDropdown, FONT_SIZES, Section } from "./PanelParts";

export function TextSection({
  firstText,
  apply,
}: {
  firstText: TextElement;
  apply: (patch: Partial<TextElement>, label: string) => void;
}) {
  return (
    <>
      <Section>
        <select
          value={firstText.fontFamily}
          onChange={(e) => apply({ fontFamily: e.target.value }, "font family")}
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
          onSelect={(k) => apply({ fontSize: Number(k) }, "font size")}
        />
      </Section>
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: "#9ca3af" }}>Line</span>
          <input
            type="range"
            min={100}
            max={250}
            value={Math.round(firstText.lineHeight * 100)}
            onChange={(e) =>
              apply({ lineHeight: Number(e.currentTarget.value) / 100 }, "line spacing")
            }
            style={{ width: 50, accentColor: "var(--accent, #6366f1)" }}
          />
          <span style={{ fontSize: 9, color: "#9ca3af", minWidth: 20, textAlign: "right" }}>
            {firstText.lineHeight.toFixed(2)}
          </span>
        </div>
      </Section>
    </>
  );
}
