"use client";

import { useState } from "react";
import { getCached } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement, TextElement } from "@/lib/engine/types";
import { THAI_FONTS } from "@/lib/fonts";
import { analyzeTextContrastUnderImage } from "@/lib/vision/textContrast";
import { CompactDropdown, FONT_SIZES, Section } from "./PanelParts";

export function TextSection({
  firstText,
  apply,
}: {
  firstText: TextElement;
  apply: (patch: Partial<TextElement>, label: string) => void;
}) {
  const currentSlide = useEngine((state) =>
    state.doc.slides.find((s) => s.id === state.currentSlideId),
  );
  const [contrastBusy, setContrastBusy] = useState(false);

  const handleAutoContrast = async () => {
    if (!currentSlide) return;
    setContrastBusy(true);

    try {
      // Find underlying image if text is positioned over an image
      const images = currentSlide.elements.filter(
        (e) => !e.isDeleted && e.visible !== false && e.type === "image",
      ) as ImageElement[];

      let optimalColor = "#ffffff";

      // Check if text overlaps any image
      const overlappingImage = images.find((img) => {
        return (
          firstText.x < img.x + img.width &&
          firstText.x + firstText.width > img.x &&
          firstText.y < img.y + img.height &&
          firstText.y + firstText.height > img.y
        );
      });

      if (overlappingImage) {
        const cached = getCached(overlappingImage.fileId);
        if (cached?.dataURL) {
          const normRect = {
            x: Math.max(0, (firstText.x - overlappingImage.x) / overlappingImage.width),
            y: Math.max(0, (firstText.y - overlappingImage.y) / overlappingImage.height),
            width: Math.min(1, firstText.width / overlappingImage.width),
            height: Math.min(1, firstText.height / overlappingImage.height),
          };
          const analysis = await analyzeTextContrastUnderImage(cached.dataURL, normRect);
          optimalColor = analysis.recommendedColor;
        }
      } else {
        // Evaluate slide background color
        const bg = currentSlide.background || "#ffffff";
        if (bg.startsWith("#")) {
          const hex = bg.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16) || 255;
          const g = parseInt(hex.substring(2, 4), 16) || 255;
          const b = parseInt(hex.substring(4, 6), 16) || 255;
          const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
          optimalColor = lum < 0.5 ? "#ffffff" : "#0f172a";
        }
      }

      apply({ strokeColor: optimalColor }, "auto contrast text color");
    } finally {
      setContrastBusy(false);
    }
  };

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
      <Section>
        <div
          style={{ display: "flex", alignItems: "center", gap: 6 }}
          title="Text on Path (Curved Text Arc)"
        >
          <span style={{ fontSize: 9, color: "#9ca3af" }}>Curve</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={firstText.pathCurvature ?? 0}
            onChange={(e) =>
              apply({ pathCurvature: Number(e.currentTarget.value) }, "text curvature")
            }
            style={{ width: 50, accentColor: "var(--accent, #6366f1)" }}
          />
          <button
            type="button"
            onClick={() => apply({ pathCurvature: 0 }, "reset text curvature")}
            title="Reset to straight text"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 9,
              color: (firstText.pathCurvature ?? 0) !== 0 ? "var(--accent, #6366f1)" : "#9ca3af",
              padding: "0 2px",
            }}
          >
            {firstText.pathCurvature ? `${firstText.pathCurvature}%` : "0%"}
          </button>
        </div>
      </Section>
      <Section>
        <button
          type="button"
          disabled={contrastBusy}
          onClick={handleAutoContrast}
          title="Auto-Contrast: Automatically picks the most readable text color over background images (WCAG Contrast)"
          style={{
            padding: "4px 8px",
            borderRadius: 5,
            border: "1px solid rgba(99, 102, 241, 0.3)",
            background: "var(--surface-solid, #fff)",
            color: "var(--accent, #6366f1)",
            fontSize: 10.5,
            fontWeight: 600,
            cursor: contrastBusy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          <span>👁️</span>
          <span>{contrastBusy ? "Checking..." : "Auto Contrast"}</span>
        </button>
      </Section>
    </>
  );
}
