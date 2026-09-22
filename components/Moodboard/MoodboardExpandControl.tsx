"use client";

import { useId, useState, useTransition } from "react";
import { expandIdeasOntoMoodboard } from "@/lib/moodboard/expandClient";

/**
 * Moodboard control on Infinity Canvas: one short prompt → expand ideas → 9 Replicate images.
 */
export default function MoodboardExpandControl() {
  const inputId = useId();
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const running = busy || isPending;

  const runExpand = () => {
    const trimmed = keyword.trim();
    if (!trimmed || running) return;
    setBusy(true);
    setMessage("กำลังขยายไอเดีย…");
    startTransition(() => {
      void (async () => {
        try {
          const result = await expandIdeasOntoMoodboard(trimmed);
          if (result.ok) {
            setMessage(
              result.failedCount > 0
                ? `วาง ${result.placedCount}/9 ภาพ (บางใบล้มเหลว)`
                : `วางภาพ Moodboard ${result.placedCount} ใบแล้ว`,
            );
          } else {
            setMessage(result.message);
          }
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  return (
    <div
      role="group"
      aria-label="Moodboard expand ideas"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
        maxWidth: "100%",
        padding: "3px 6px 3px 8px",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 8,
        background: "var(--surface-solid, #fff)",
        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.06)",
      }}
    >
      <label
        htmlFor={inputId}
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--ink-muted, #6b7280)",
          whiteSpace: "nowrap",
          letterSpacing: "0.02em",
        }}
      >
        ขยายไอเดีย
      </label>
      <input
        id={inputId}
        type="text"
        value={keyword}
        disabled={running}
        placeholder="keyword / vibe"
        maxLength={160}
        onChange={(event) => setKeyword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            runExpand();
          }
        }}
        style={{
          width: 140,
          maxWidth: "28vw",
          height: 28,
          border: "1px solid var(--stroke, #e5e7eb)",
          borderRadius: 6,
          padding: "0 8px",
          fontSize: 12,
          background: "var(--bg, #fafafa)",
          color: "var(--ink, #111827)",
        }}
      />
      <button
        type="button"
        disabled={running || !keyword.trim()}
        onClick={runExpand}
        title="Expand ideas for designers → 9 Replicate images (flux-schnell)"
        style={{
          height: 28,
          padding: "0 10px",
          border: "none",
          borderRadius: 6,
          background: running ? "rgba(79, 70, 229, 0.45)" : "var(--accent, #4f46e5)",
          color: "#fff",
          cursor: running || !keyword.trim() ? "not-allowed" : "pointer",
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {running ? "กำลังสร้าง…" : "9 ภาพ AI"}
      </button>
      {message ? (
        <span
          style={{
            fontSize: 10,
            color: "var(--ink-muted, #6b7280)",
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={message}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
