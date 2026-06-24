"use client";

/**
 * AI Image Tools Panel — compact inline version for PropertiesPanel embedding.
 * Lumen features: vision AI (caption/OCR/detect), color adjustments, background removal.
 */

import { useCallback, useState } from "react";
import { removeBackground } from "@/lib/ai/removeBg";
import type { ColorAdjustments } from "@/lib/color/adjustments";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";

export default function AIImageTools({ style }: { style?: React.CSSProperties }) {
  const selectedIds = useEngine((s) => s.selectedIds);
  const currentSlide = useEngine((s) => s.currentSlide?.());
  const updateElements = useEngine((s) => s.updateElements);

  const selectedImage = currentSlide?.elements.find(
    (el): el is ImageElement => selectedIds.has(el.id) && el.type === "image",
  );

  const [visionBusy, setVisionBusy] = useState(false);
  const [visionResult, setVisionResult] = useState<string>("");
  const [adjustments, setAdjustments] = useState<Partial<ColorAdjustments>>({});
  const [bgBusy, setBgBusy] = useState(false);

  const getImageDataUrl = useCallback(async (): Promise<string | null> => {
    if (!selectedImage) return null;
    const { getCached } = await import("@/lib/engine/imageCache");
    const cached = getCached(selectedImage.fileId);
    return cached?.dataURL ?? null;
  }, [selectedImage]);

  async function runVision(kind: "caption" | "ocr" | "detect") {
    const url = await getImageDataUrl();
    if (!url) return;
    setVisionBusy(true);
    setVisionResult("");
    try {
      const { visionCaption, visionDetect, visionOcr } = await import("@/lib/vision/visionEngine");
      if (kind === "caption") {
        const text = await visionCaption(url, "normal");
        setVisionResult(`Caption: ${text}`);
      } else if (kind === "ocr") {
        const text = await visionOcr(url);
        setVisionResult(`OCR: ${text}`);
      } else if (kind === "detect") {
        const res = await visionDetect(url);
        const items = res.objects.map(
          (o) => `${o.label} (${Math.round(o.x_min * 100)}%,${Math.round(o.y_min * 100)}%)`,
        );
        setVisionResult(`Detected: ${items.join("; ") || "none"}`);
      }
    } catch (e) {
      setVisionResult(`Error: ${(e as Error).message}`);
    } finally {
      setVisionBusy(false);
    }
  }

  async function handleRemoveBg() {
    const url = await getImageDataUrl();
    if (!url) return;
    setBgBusy(true);
    try {
      const resultUrl = await removeBackground(url);
      if (selectedImage) {
        const { loadDataURL } = await import("@/lib/engine/imageCache");
        const cached = await loadDataURL(resultUrl);
        updateElements([
          { id: selectedImage.id, patch: { fileId: cached.fileId, status: "loaded" as const } },
        ]);
      }
    } catch (e) {
      setVisionResult(`BG Remove Error: ${(e as Error).message}`);
    } finally {
      setBgBusy(false);
    }
  }

  function handleAdjustmentChange<K extends keyof ColorAdjustments>(key: K, value: number) {
    const next = { ...adjustments, [key]: value };
    setAdjustments(next);
    if (selectedImage) {
      updateElements([{ id: selectedImage.id, patch: { adjustments: next } }]);
    }
  }

  if (!selectedImage) return null;

  return (
    <div
      style={{
        padding: 10,
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        fontSize: 11,
        ...style,
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <button onClick={() => runVision("caption")} disabled={visionBusy} style={btnStyle}>
          {visionBusy ? "..." : "Caption"}
        </button>
        <button onClick={() => runVision("ocr")} disabled={visionBusy} style={btnStyle}>
          OCR
        </button>
        <button onClick={() => runVision("detect")} disabled={visionBusy} style={btnStyle}>
          Detect
        </button>
        <button
          onClick={handleRemoveBg}
          disabled={bgBusy}
          style={{ ...btnStyle, background: "#7c3aed", color: "#fff" }}
        >
          {bgBusy ? "..." : "Remove BG"}
        </button>
      </div>

      {visionResult && (
        <div
          style={{
            fontSize: 11,
            color: "#374151",
            background: "#f3f4f6",
            padding: 6,
            borderRadius: 4,
            marginBottom: 8,
            maxHeight: 80,
            overflow: "auto",
          }}
        >
          {visionResult}
        </div>
      )}

      <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Color Adjustments</div>
      {(
        [
          ["exposure", -100, 100],
          ["contrast", -100, 100],
          ["highlights", -100, 100],
          ["shadows", -100, 100],
          ["saturation", -100, 100],
          ["warmth", -100, 100],
        ] as [keyof ColorAdjustments, number, number][]
      ).map(([key, min, max]) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ width: 60, textTransform: "capitalize" }}>{key}</span>
          <input
            type="range"
            min={min}
            max={max}
            value={adjustments[key] ?? 0}
            onChange={(e) => handleAdjustmentChange(key, Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 28, textAlign: "right" }}>{adjustments[key] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};
