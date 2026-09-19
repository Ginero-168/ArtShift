"use client";

import { useRef, useState } from "react";
import { copyMoodboardItemsToArtworkSlide } from "@/lib/moodboard/copyToSlide";

const toolButtonStyle = (active: boolean) => ({
  height: 28,
  padding: "0 10px",
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  border: "none",
  borderRadius: 6,
  background: active ? "var(--accent, #6366f1)" : "transparent",
  color: active ? "#fff" : "var(--ink, #111827)",
  cursor: "pointer",
  fontSize: 11,
  lineHeight: "16px",
  fontWeight: active ? 700 : 600,
  whiteSpace: "nowrap" as const,
});

export default function MoodboardOptionBar({
  onAddNote,
  onAddImageFile,
  onToggleReferences,
  referencesOpen,
}: {
  onAddNote: () => void;
  onAddImageFile: (file: File) => void;
  onToggleReferences: () => void;
  referencesOpen: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  return (
    <div
      className="editor-option-bar"
      role="toolbar"
      aria-label="Moodboard tools"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        minWidth: 0,
        maxWidth: "100%",
        padding: 3,
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 8,
        background: "var(--surface-solid, #fff)",
        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)",
      }}
    >
      <button type="button" aria-pressed style={toolButtonStyle(true)} title="Select and move">
        <span>Select</span>
      </button>
      <button type="button" onClick={onAddNote} style={toolButtonStyle(false)} title="Add a note">
        <span>Note</span>
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        style={toolButtonStyle(false)}
        title="Upload an image onto the board"
      >
        <span>Image</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onAddImageFile(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={onToggleReferences}
        aria-pressed={referencesOpen}
        style={toolButtonStyle(referencesOpen)}
        title="Open the reference / Pinterest panel"
      >
        <span>Refs</span>
      </button>
      <span
        aria-hidden="true"
        style={{ width: 1, height: 20, margin: "0 3px", background: "var(--stroke, #e5e7eb)" }}
      />
      <button
        type="button"
        disabled={copying}
        onClick={async () => {
          setCopying(true);
          const result = await copyMoodboardItemsToArtworkSlide();
          setCopyMessage(result.ok ? `Copied ${result.elementCount} objects` : result.message);
          setCopying(false);
        }}
        style={{
          ...toolButtonStyle(false),
          color: "var(--accent, #4f46e5)",
          background: "rgba(79, 70, 229, 0.08)",
        }}
        title="Copy selected (or all) items onto a new artwork slide"
      >
        <span>{copying ? "Copying…" : "Copy to slide"}</span>
      </button>
      {copyMessage ? (
        <span style={{ fontSize: 10, color: "#6b7280", padding: "0 6px", maxWidth: 160 }}>
          {copyMessage}
        </span>
      ) : null}
    </div>
  );
}
