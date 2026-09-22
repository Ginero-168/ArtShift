"use client";

import { type CSSProperties, useRef, useState } from "react";
import {
  type MoodboardProgress,
  runMoodboardAiBatch,
  runMoodboardStockFill,
} from "@/lib/moodboard/aiBatchClient";
import { MOODBOARD_BATCH_USD, MOODBOARD_REPLICATE_MODEL } from "@/lib/moodboard/constants";

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

const btnStyle = (tone: "neutral" | "accent" | "ai"): CSSProperties => ({
  height: 30,
  padding: "0 10px",
  borderRadius: 6,
  border: tone === "neutral" ? "1px solid var(--stroke, #e5e7eb)" : "none",
  background:
    tone === "ai" ? "#0f766e" : tone === "accent" ? "var(--accent, #4f46e5)" : "transparent",
  color: tone === "neutral" ? "var(--ink, #111827)" : "#fff",
  fontSize: 11,
  fontWeight: 650,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

/**
 * Moodboard control for Infinity Canvas:
 * - Stock: existing keyword → Unsplash/Pexels path
 * - AI ×9: expand ideas → 9 cheap Replicate Schnell images in a 3×3 grid
 */
export default function MoodboardControl() {
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState<"stock" | "ai" | null>(null);
  const [progress, setProgress] = useState<MoodboardProgress | null>(null);
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function runStock() {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("stock");
    setStatus("");
    setProgress(null);
    try {
      const result = await runMoodboardStockFill(keyword, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (result.ok) setStatus(`Stock: placed ${result.placed} images.`);
      else setStatus(result.message);
    } finally {
      setBusy(null);
    }
  }

  async function runAi() {
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("ai");
    setStatus("");
    setProgress(null);
    try {
      const result = await runMoodboardAiBatch(keyword, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (result.ok) {
        const failNote = result.failed > 0 ? ` · ${result.failed} failed` : "";
        setStatus(
          `AI: placed ${result.placed}/9 via ${result.model} (~$${result.estimatedUsd})${failNote}`,
        );
      } else {
        setStatus(result.message);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-moodboard-control="true" role="region" aria-label="Moodboard" style={barStyle}>
      <div
        style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}
      >
        <strong style={{ fontSize: 12 }}>Moodboard</strong>
        <span style={{ fontSize: 10, color: "#6b7280" }}>
          AI ≈ ${MOODBOARD_BATCH_USD}/9 · {MOODBOARD_REPLICATE_MODEL.split("/")[1]}
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
          disabled={busy !== null}
          aria-label="Moodboard prompt"
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void runStock()}
          disabled={busy !== null || !keyword.trim()}
          style={{
            ...btnStyle("neutral"),
            opacity: busy !== null || !keyword.trim() ? 0.55 : 1,
          }}
          title="Keyword → Unsplash / Pexels stock fill (existing path)"
        >
          {busy === "stock" ? "Stock…" : "Stock"}
        </button>
        <button
          type="button"
          onClick={() => void runAi()}
          disabled={busy !== null || !keyword.trim()}
          style={{
            ...btnStyle("ai"),
            opacity: busy !== null || !keyword.trim() ? 0.55 : 1,
          }}
          title={`Expand ideas → 9 ${MOODBOARD_REPLICATE_MODEL} images (~$${MOODBOARD_BATCH_USD})`}
        >
          {busy === "ai" ? "AI ×9…" : "AI ×9"}
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
          {progress.total > 0 && (progress.stage === "generate" || progress.stage === "stock") ? (
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
