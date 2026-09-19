"use client";

import { useEffect, useState } from "react";
import { fileToDataURL, isSupportedImageFile, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { createMoodboardItem } from "@/lib/moodboard/factory";
import { isPinterestUrl, PINTEREST_API_STATUS } from "@/lib/moodboard/pinterest";
import {
  classifyReferenceUrl,
  listMoodboardReferences,
  type MoodboardReference,
  removeMoodboardReference,
  saveMoodboardReference,
} from "@/lib/moodboard/referenceStore";

export function ReferencePanel({
  open,
  onClose,
  dropOrigin = { x: 120, y: 120 },
}: {
  open: boolean;
  onClose: () => void;
  dropOrigin?: { x: number; y: number };
}) {
  const addMoodboardItem = useEngine((s) => s.addMoodboardItem);
  const [tab, setTab] = useState<"library" | "pinterest">("library");
  const [url, setUrl] = useState("");
  const [items, setItems] = useState<MoodboardReference[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setItems(listMoodboardReferences());
  }, [open]);

  if (!open) return null;

  async function addUrl(raw: string, origin?: MoodboardReference["origin"]) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("https://")) {
      setError("Paste an https image or Pin URL.");
      return;
    }
    const next = saveMoodboardReference({
      src: trimmed,
      title: trimmed.split("/").filter(Boolean).at(-1) || "Reference",
      sourceUrl: trimmed,
      origin: origin ?? classifyReferenceUrl(trimmed),
    });
    setItems(listMoodboardReferences());
    setUrl("");
    setError("");
    return next;
  }

  async function addFile(file: File) {
    if (!isSupportedImageFile(file)) {
      setError("Use PNG, JPEG, or WebP.");
      return;
    }
    const dataURL = await fileToDataURL(file);
    await loadDataURL(dataURL);
    saveMoodboardReference({ src: dataURL, title: file.name, origin: "upload" });
    setItems(listMoodboardReferences());
    setError("");
  }

  function placeOnBoard(ref: MoodboardReference) {
    addMoodboardItem(
      createMoodboardItem({
        kind: "image",
        src: ref.src,
        text: ref.title,
        x: dropOrigin.x,
        y: dropOrigin.y,
        credit: {
          photographer: ref.title,
          sourceUrl: ref.sourceUrl,
          provider: ref.origin === "pinterest" ? "pinterest" : "user",
        },
      }),
      "add reference to board",
    );
  }

  return (
    <aside
      data-moodboard-reference-panel="true"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 320,
        maxHeight: "calc(100% - 24px)",
        overflow: "auto",
        zIndex: 20,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
        padding: 12,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>References</strong>
        <button type="button" onClick={onClose} style={{ border: "none", background: "none" }}>
          Close
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
        <button type="button" onClick={() => setTab("library")}>
          Library
        </button>
        <button type="button" onClick={() => setTab("pinterest")}>
          Pinterest
        </button>
      </div>

      {tab === "pinterest" ? (
        <p style={{ color: "#6b7280", lineHeight: 1.45 }}>
          Official saved-Pins access needs a reviewed Pinterest app (
          {PINTEREST_API_STATUS.officialSavedPins}). Paste a Pin or <code>pinimg.com</code> URL you
          already saved. ArtShift does not scrape Pinterest or Google Images.
        </p>
      ) : (
        <p style={{ color: "#6b7280", lineHeight: 1.45 }}>
          Drop a file, upload, or paste an image URL. Add to the infinite board when you want it.
        </p>
      )}

      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={
          tab === "pinterest" ? "https://…pinimg.com/… or pinterest.com/pin/…" : "https://…"
        }
        aria-label="Reference image URL"
        style={{ width: "100%", marginBottom: 8, padding: "6px 8px" }}
      />
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() =>
            void addUrl(url, tab === "pinterest" || isPinterestUrl(url) ? "pinterest" : undefined)
          }
        >
          Save URL
        </button>
        <label style={{ cursor: "pointer" }}>
          Upload
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void addFile(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {error ? <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div> : null}

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          for (const file of Array.from(event.dataTransfer.files)) void addFile(file);
        }}
        style={{
          border: "1px dashed #d1d5db",
          borderRadius: 8,
          padding: 10,
          minHeight: 80,
        }}
      >
        {items.length === 0 ? (
          <div style={{ color: "#9ca3af" }}>No saved references yet.</div>
        ) : (
          items
            .filter((item) => (tab === "pinterest" ? item.origin === "pinterest" : true))
            .map((item) => (
              <div
                key={item.id}
                style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
              >
                {/* biome-ignore lint/performance/noImgElement: user reference URLs */}
                <img
                  src={item.src}
                  alt=""
                  style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {item.title}
                  </div>
                  <button type="button" onClick={() => placeOnBoard(item)}>
                    Add to board
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    removeMoodboardReference(item.id);
                    setItems(listMoodboardReferences());
                  }}
                >
                  ×
                </button>
              </div>
            ))
        )}
      </div>
    </aside>
  );
}
