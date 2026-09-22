"use client";

import { type CSSProperties, useRef, useState } from "react";
import { type MoodboardProgress, runMoodboardAiBatch } from "@/lib/moodboard/aiBatchClient";
import {
  MOODBOARD_BATCH_COUNTS,
  MOODBOARD_DEFAULT_BATCH_COUNT,
  MOODBOARD_PER_IMAGE_USD,
  MOODBOARD_REPLICATE_MODEL,
  type MoodboardBatchCount,
  moodboardBatchUsd,
  moodboardGridSide,
} from "@/lib/moodboard/constants";

const barStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 280,
  maxWidth: 420,
  padding: 10,
  border: "1px solid var(--stroke, #e5e7eb)",
  borderRadius: 10,
  background: "var(--surface-solid, #fff)",
  boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
  fontSize: 12,
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 30,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid var(--stroke, #e5e7eb)",
  background: "#fff",
  fontSize: 12,
  outline: "none",
};

const btnStyle = (tone: "neutral" | "ai"): CSSProperties => ({
  height: 30,
  padding: "0 10px",
  borderRadius: 6,
  border: tone === "neutral" ? "1px solid var(--stroke, #e5e7eb)" : "none",
  background: tone === "ai" ? "#0f766e" : "transparent",
  color: tone === "neutral" ? "var(--ink, #111827)" : "#fff",
  fontSize: 11,
  fontWeight: 650,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

/**
 * Moodboard control for Infinity Canvas.
 * Gemini Flash expands a vibe into 9, 16, or 25 ideas, then Flare medium
 * fills a square grid anchored on the shared Preload card.
 */
export default function MoodboardControl() {
  const [keyword, setKeyword] = useState("");
  const [count, setCount] = useState<MoodboardBatchCount>(MOODBOARD_DEFAULT_BATCH_COUNT);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<MoodboardProgress | null>(null);
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const side = moodboardGridSide(count);
  const batchUsd = moodboardBatchUsd(count);
  const modelLabel = MOODBOARD_REPLICATE_MODEL.split("/")[1] ?? MOODBOARD_REPLICATE_MODEL;

  async function runAi() {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("");
    setProgress(null);
    try {
      const result = await runMoodboardAiBatch(keyword, {
        count,
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (result.ok) {
        const failNote = result.failed > 0 ? ` · ${result.failed} failed` : "";
        setStatus(
          `AI: placed ${result.placed}/${result.count} via ${result.model} (~$${result.estimatedUsd.toFixed(2)})${failNote}`,
        );
      } else {
        setStatus(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-moodboard-control="true" role="region" aria-label="Moodboard" style={barStyle}>
      <div
        style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}
      >
        <strong style={{ fontSize: 12 }}>Moodboard</strong>
        <span style={{ fontSize: 10, color: "#6b7280" }}>
          ≈ ${batchUsd.toFixed(2)} · {side}×{side} · {modelLabel} medium
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          id="moodboard-keyword"
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void runAi();
            }
          }}
          placeholder="Prompt, keyword, or vibe…"
          disabled={busy}
          aria-label="Moodboard prompt"
          style={inputStyle}
        />
      </div>
      <fieldset
        style={{
          border: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <legend style={{ fontSize: 10, color: "#6b7280", padding: 0 }}>Image count</legend>
        {MOODBOARD_BATCH_COUNTS.map((option) => {
          const optionSide = moodboardGridSide(option);
          const selected = count === option;
          return (
            <label
              key={option}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                height: 28,
                padding: "0 8px",
                borderRadius: 6,
                border: selected ? "1px solid #0f766e" : "1px solid var(--stroke, #e5e7eb)",
                background: selected ? "#ccfbf1" : "#fff",
                color: "#111827",
                fontSize: 11,
                fontWeight: 650,
                cursor: busy ? "default" : "pointer",
              }}
            >
              <input
                type="radio"
                name="moodboard-batch-count"
                value={option}
                checked={selected}
                disabled={busy}
                onChange={() => setCount(option)}
              />
              {option}
              <span style={{ fontWeight: 500, color: "#6b7280" }}>
                {optionSide}×{optionSide}
              </span>
            </label>
          );
        })}
      </fieldset>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void runAi()}
          disabled={busy || !keyword.trim()}
          style={{
            ...btnStyle("ai"),
            opacity: busy || !keyword.trim() ? 0.55 : 1,
          }}
          title={`Expand ideas → ${count} ${MOODBOARD_REPLICATE_MODEL} images at quality medium (~$${MOODBOARD_PER_IMAGE_USD} each, ~$${batchUsd.toFixed(2)} total)`}
        >
          {busy ? `AI ×${count}…` : `AI ×${count}`}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            style={btnStyle("neutral")}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {progress && progress.stage !== "idle" ? (
        <div aria-live="polite" style={{ color: "#374151", lineHeight: 1.4 }}>
          <div>{progress.message}</div>
          {progress.total > 0 && progress.stage === "generate" ? (
            <div
              style={{
                marginTop: 6,
                height: 4,
                borderRadius: 999,
                background: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, ((progress.completed + progress.failed) / progress.total) * 100)}%`,
                  height: "100%",
                  background: progress.failed > 0 ? "#d97706" : "#0f766e",
                  transition: "width 160ms ease",
                }}
              />
            </div>
          ) : null}
          {progress.errors.length > 0 ? (
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "#b45309", fontSize: 11 }}>
              {progress.errors.slice(0, 4).map((error) => (
                <li key={error}>{error}</li>
              ))}
              {progress.errors.length > 4 ? <li>+{progress.errors.length - 4} more</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {status ? (
        <div aria-live="polite" style={{ color: "#4b5563", lineHeight: 1.4 }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
