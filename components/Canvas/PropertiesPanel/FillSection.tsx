"use client";

import type {
  EngineElement,
  FillStyle,
  RectElement,
  Roughness,
  StrokeStyle,
} from "@/lib/engine/types";
import {
  BG_PALETTE,
  CompactColorSwatch,
  CompactDropdown,
  FILL_STYLES,
  ROUGHNESS_OPTS,
  Section,
  STROKE_PALETTE,
  STROKE_STYLES,
  STROKE_WIDTHS,
} from "./PanelParts";

export function FillSection({
  first,
  selected,
  ids,
  apply,
  updateElements,
}: {
  first: EngineElement;
  selected: EngineElement[];
  ids: string[];
  apply: (patch: Partial<EngineElement>, label: string) => void;
  updateElements: (
    patches: Array<{ id: string; patch: Partial<EngineElement> }>,
    label: string,
  ) => void;
}) {
  return (
    <>
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
                  : { color: "rgba(0,0,0,0.18)", blur: 12, offsetX: 2, offsetY: 6 },
                glow: undefined,
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

      {/* Glow */}
      <Section>
        <button
          onClick={() => {
            const hasGlow = !!first.glow;
            apply(
              {
                glow: hasGlow ? undefined : { color: "#38bdf8", blur: 18 },
                shadow: undefined,
              },
              "glow",
            );
          }}
          style={{
            padding: "3px 8px",
            borderRadius: 5,
            border: "1px solid var(--stroke, #e5e7eb)",
            background: first.glow ? "var(--accent-light, #eef2ff)" : "var(--surface-solid, #fff)",
            cursor: "pointer",
            fontSize: 10,
            color: first.glow ? "var(--accent, #6366f1)" : "var(--ink, #111)",
          }}
        >
          {first.glow ? "Glow On" : "Glow"}
        </button>
      </Section>
    </>
  );
}
