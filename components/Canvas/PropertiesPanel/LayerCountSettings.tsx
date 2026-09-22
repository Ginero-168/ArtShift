"use client";

import { useState } from "react";
import {
  DECOMPOSE_LAYERS_MAX,
  DECOMPOSE_LAYERS_MIN,
  DEFAULT_DECOMPOSE_LAYERS,
  describeDecomposeLayerCountIssue,
  resolveDecomposeLayerCount,
} from "@/lib/ai-runtime/contracts";

const stepButtonStyle = {
  width: 32,
  height: 32,
  border: "1px solid #cbd5e1",
  borderRadius: 5,
  background: "#fff",
  color: "#0f172a",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1,
  touchAction: "manipulation",
} as const;

/**
 * Compact Layer-count control for Qwen Image Layered `num_layers` (2–8, default 4).
 * Out-of-range integers are clamped on blur. Other invalid text is rejected in place.
 */
export function LayerCountSettings({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (numLayers: number) => void;
}) {
  const [layerCountText, setLayerCountText] = useState(String(DEFAULT_DECOMPOSE_LAYERS));
  const [layerCountNotice, setLayerCountNotice] = useState<string | null>(null);
  const resolution = resolveDecomposeLayerCount(layerCountText);
  const base = resolution.status === "invalid" ? DEFAULT_DECOMPOSE_LAYERS : resolution.value;
  const canRun = !busy && resolution.status === "valid";

  const commitDraft = () => {
    if (resolution.status === "valid") {
      setLayerCountText(String(resolution.value));
      setLayerCountNotice(null);
      return resolution.value;
    }
    if (resolution.status === "clamped") setLayerCountText(String(resolution.value));
    setLayerCountNotice(describeDecomposeLayerCountIssue(resolution, true));
    return null;
  };

  const step = (delta: number) => {
    const next = Math.min(DECOMPOSE_LAYERS_MAX, Math.max(DECOMPOSE_LAYERS_MIN, base + delta));
    setLayerCountText(String(next));
    setLayerCountNotice(null);
  };

  return (
    <div
      data-testid="layer-count-settings"
      data-tool="layer"
      style={{
        marginTop: 6,
        padding: 8,
        background: "#fff",
        border: "1px solid rgba(192, 38, 211, 0.28)",
        borderRadius: 6,
      }}
    >
      <strong style={{ display: "block", color: "#86198f", fontSize: 10 }}>Layer count</strong>
      <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 8.5 }}>
        Qwen Image Layered · RGBA layers at Preload
      </span>
      <div
        role="group"
        aria-label="How many layers"
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}
      >
        <button
          type="button"
          aria-label="Decrease layer count"
          disabled={busy || base <= DECOMPOSE_LAYERS_MIN}
          onClick={() => step(-1)}
          style={{
            ...stepButtonStyle,
            cursor: busy || base <= DECOMPOSE_LAYERS_MIN ? "not-allowed" : "pointer",
          }}
        >
          −
        </button>
        <input
          id="layer-count-input"
          aria-label="Number of layers"
          aria-invalid={resolution.status !== "valid"}
          aria-describedby="layer-count-hint layer-count-notice"
          inputMode="numeric"
          autoComplete="off"
          value={layerCountText}
          onChange={(event) => {
            const value = event.target.value;
            setLayerCountText(value);
            const next = resolveDecomposeLayerCount(value);
            setLayerCountNotice(
              next.status === "valid" ? null : describeDecomposeLayerCountIssue(next),
            );
          }}
          onBlur={() => {
            commitDraft();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const count = commitDraft();
            if (count !== null && !busy) onRun(count);
          }}
          style={{
            width: 52,
            height: 32,
            padding: "0 4px",
            border: resolution.status === "valid" ? "1px solid #cbd5e1" : "1px solid #f59e0b",
            borderRadius: 5,
            background: "#fff",
            color: "#0f172a",
            fontSize: 13,
            fontWeight: 700,
            textAlign: "center",
          }}
        />
        <button
          type="button"
          aria-label="Increase layer count"
          disabled={busy || base >= DECOMPOSE_LAYERS_MAX}
          onClick={() => step(1)}
          style={{
            ...stepButtonStyle,
            cursor: busy || base >= DECOMPOSE_LAYERS_MAX ? "not-allowed" : "pointer",
          }}
        >
          +
        </button>
      </div>
      <span
        id="layer-count-hint"
        style={{ display: "block", marginTop: 4, color: "#64748b", fontSize: 8.5 }}
      >
        {DECOMPOSE_LAYERS_MIN}–{DECOMPOSE_LAYERS_MAX} layers. Default {DEFAULT_DECOMPOSE_LAYERS} if
        unchanged.
      </span>
      <span
        id="layer-count-notice"
        role={layerCountNotice ? "alert" : undefined}
        style={{
          display: "block",
          marginTop: layerCountNotice ? 2 : 0,
          color: "#9a3412",
          fontSize: 8.5,
        }}
      >
        {layerCountNotice}
      </span>
      <button
        type="button"
        disabled={!canRun}
        aria-label="Run Layer"
        onClick={() => {
          if (resolution.status === "valid") onRun(resolution.value);
        }}
        style={{
          width: "100%",
          marginTop: 7,
          padding: "6px 8px",
          border: canRun ? "none" : "1px solid #e9d5ff",
          borderRadius: 5,
          background: canRun ? "#a21caf" : "#faf5ff",
          color: canRun ? "#fff" : "#6b21a8",
          fontSize: 10,
          fontWeight: 700,
          cursor: canRun ? "pointer" : "not-allowed",
        }}
      >
        {busy ? "Processing..." : "Run Layer"}
      </button>
    </div>
  );
}
