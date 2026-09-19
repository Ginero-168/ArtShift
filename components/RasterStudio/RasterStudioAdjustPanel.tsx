"use client";

import { useRef } from "react";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { studioChrome } from "./studioChrome";

/**
 * Studio-only brightness/contrast. Writes ImageElement.adjustments (exposure +
 * contrast) so Save bake flattens them. Does not add Editor Appearance items.
 */
export default function RasterStudioAdjustPanel({ elementId }: { elementId: string }) {
  const updateElements = useEngine((s) => s.updateElements);
  const previewElements = useEngine((s) => s.previewElements);
  const checkpointInteraction = useEngine((s) => s.checkpointInteraction);
  const commitInteraction = useEngine((s) => s.commitInteraction);
  const markSessionEdited = useRasterStudioSession((s) => s.markSessionEdited);
  const setAdjustOpen = useRasterStudioSession((s) => s.setAdjustOpen);
  const draggingRef = useRef(false);

  const image = useEngine((s) => {
    const slide = s.currentSlide();
    return slide?.elements.find(
      (el): el is ImageElement => el.id === elementId && el.type === "image" && !el.isDeleted,
    );
  });

  const brightness = image?.adjustments?.exposure ?? 0;
  const contrast = image?.adjustments?.contrast ?? 0;

  const liveImage = (): ImageElement | undefined => {
    const slide = useEngine.getState().currentSlide();
    return slide?.elements.find(
      (el): el is ImageElement => el.id === elementId && el.type === "image" && !el.isDeleted,
    );
  };

  const previewKey = (key: "exposure" | "contrast", value: number) => {
    const current = liveImage();
    if (!current) return;
    previewElements([
      { id: current.id, patch: { adjustments: { ...current.adjustments, [key]: value } } },
    ]);
  };

  const commitKey = (key: "exposure" | "contrast", value: number) => {
    const current = liveImage();
    if (!current) return;
    if (draggingRef.current) {
      previewKey(key, value);
      commitInteraction();
      markSessionEdited();
      draggingRef.current = false;
      return;
    }
    updateElements(
      [{ id: current.id, patch: { adjustments: { ...current.adjustments, [key]: value } } }],
      `adjust raster ${key}`,
    );
    markSessionEdited();
  };

  const reset = () => {
    const current = liveImage();
    if (!current) return;
    updateElements(
      [
        {
          id: current.id,
          patch: {
            adjustments: {
              ...current.adjustments,
              exposure: 0,
              contrast: 0,
            },
          },
        },
      ],
      "reset raster adjustments",
    );
    markSessionEdited();
  };

  return (
    <aside
      aria-label="Studio adjustments"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        zIndex: 3,
        width: 200,
        padding: "10px 12px",
        borderRadius: 6,
        background: "rgba(36, 36, 36, 0.94)",
        border: `1px solid ${studioChrome.hairline}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        color: studioChrome.ink,
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: studioChrome.muted,
          }}
        >
          Adjust
        </strong>
        <button
          type="button"
          aria-label="Close adjustments"
          onClick={() => setAdjustOpen(false)}
          style={{
            width: 18,
            height: 18,
            padding: 0,
            border: "none",
            background: "transparent",
            color: studioChrome.muted,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ×
        </button>
      </div>
      <p style={{ margin: "8px 0 12px", fontSize: 11, lineHeight: 1.35, color: studioChrome.muted }}>
        Brightness and contrast stay in Studio until Save bakes pixels. Appearance is unchanged.
      </p>
      <label style={sliderLabelStyle}>
        <span>Brightness</span>
        <input
          aria-label="Brightness"
          type="range"
          min={-100}
          max={100}
          step={1}
          value={brightness}
          onPointerDown={() => {
            draggingRef.current = true;
            checkpointInteraction("adjust raster brightness");
          }}
          onInput={(event) => previewKey("exposure", Number(event.currentTarget.value))}
          onChange={(event) => commitKey("exposure", Number(event.currentTarget.value))}
          style={sliderStyle}
        />
        <output style={outputStyle}>{brightness}</output>
      </label>
      <label style={{ ...sliderLabelStyle, marginTop: 8 }}>
        <span>Contrast</span>
        <input
          aria-label="Contrast"
          type="range"
          min={-100}
          max={100}
          step={1}
          value={contrast}
          onPointerDown={() => {
            draggingRef.current = true;
            checkpointInteraction("adjust raster contrast");
          }}
          onInput={(event) => previewKey("contrast", Number(event.currentTarget.value))}
          onChange={(event) => commitKey("contrast", Number(event.currentTarget.value))}
          style={sliderStyle}
        />
        <output style={outputStyle}>{contrast}</output>
      </label>
      <button
        type="button"
        onClick={reset}
        disabled={brightness === 0 && contrast === 0}
        style={{
          marginTop: 12,
          height: 26,
          width: "100%",
          border: `1px solid ${studioChrome.buttonBorder}`,
          borderRadius: 4,
          background: studioChrome.chromeRaised,
          color: studioChrome.ink,
          fontSize: 12,
          fontWeight: 600,
          cursor: brightness === 0 && contrast === 0 ? "default" : "pointer",
          opacity: brightness === 0 && contrast === 0 ? 0.5 : 1,
        }}
      >
        Reset
      </button>
    </aside>
  );
}

const sliderLabelStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gridTemplateRows: "auto auto",
  columnGap: 8,
  alignItems: "center",
  fontSize: 12,
  color: studioChrome.muted,
} as const;

const sliderStyle = {
  gridColumn: "1 / -1",
  width: "100%",
  height: 16,
  accentColor: studioChrome.selectedAccent,
} as const;

const outputStyle = {
  fontVariantNumeric: "tabular-nums" as const,
  color: studioChrome.ink,
  fontSize: 12,
};
