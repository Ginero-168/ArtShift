"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createEditorController } from "@/lib/engine/editorController";
import { getCached, getImageCache, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { bakeImageElementRevision } from "@/lib/raster/studio/bakeRevision";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { placementUnchanged } from "@/lib/raster/studio/types";

/**
 * Fullscreen Raster Studio shell (Phase 1).
 * Open → preview content → Save (bake revision) / Cancel.
 * Brush tools move in later phases; Save already establishes the Smart Object loop.
 */
export default function RasterStudioShell() {
  const open = useRasterStudioSession((s) => s.open);
  const payload = useRasterStudioSession((s) => s.payload);
  const dirty = useRasterStudioSession((s) => s.dirty);
  const saving = useRasterStudioSession((s) => s.saving);
  const error = useRasterStudioSession((s) => s.error);
  const close = useRasterStudioSession((s) => s.close);
  const setSaving = useRasterStudioSession((s) => s.setSaving);
  const setError = useRasterStudioSession((s) => s.setError);

  const updateElements = useEngine((s) => s.updateElements);
  const applyRasterSelection = useEngine((s) => s.applyRasterSelection);
  const currentSlide = useEngine((s) => s.currentSlide);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const controller = useMemo(
    () =>
      createEditorController({
        currentSlide,
        updateElements,
        applyRasterSelection,
      }),
    [applyRasterSelection, currentSlide, updateElements],
  );

  useEffect(() => {
    if (!open || !payload) {
      setPreviewUrl(null);
      return;
    }
    const cached = getCached(payload.fileId);
    setPreviewUrl(cached?.dataURL ?? null);
  }, [open, payload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open, saving]);

  const handleSave = useCallback(async () => {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const slide = currentSlide();
      const image = slide?.elements.find(
        (el): el is ImageElement => el.id === payload.elementId && el.type === "image",
      );
      if (!image) throw new Error("Image is no longer on the canvas");

      const before = payload.placement;
      const baked = await bakeImageElementRevision(image, getImageCache(), 2);
      const cached = await loadDataURL(baked.dataURL);
      const ok = controller.commitRasterRevision(
        image.id,
        {
          fileId: cached.fileId,
          naturalWidth: baked.width,
          naturalHeight: baked.height,
          bakePolicy: "flatten-overlays",
        },
        "update raster revision",
      );
      if (!ok) throw new Error("Failed to commit raster revision");

      const after = currentSlide()?.elements.find(
        (el): el is ImageElement => el.id === payload.elementId && el.type === "image",
      );
      if (!after || !placementUnchanged(before, after)) {
        throw new Error("Raster Studio Save changed placement — Smart Object invariant failed");
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [close, controller, currentSlide, payload, setError, setSaving]);

  if (!open || !payload) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Raster Studio"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg, #0f172a)",
        color: "var(--ink, #f8fafc)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid color-mix(in srgb, #fff 12%, transparent)",
          background: "color-mix(in srgb, #020617 70%, transparent)",
        }}
      >
        <strong style={{ fontSize: 14, letterSpacing: "0.02em" }}>Raster Studio</strong>
        <span style={{ fontSize: 12, opacity: 0.7, flex: 1 }}>
          {payload.sourceName || "Smart Object"} · Save writes a baked revision and keeps
          placement
        </span>
        {dirty ? (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(250, 204, 21, 0.15)",
              color: "#facc15",
            }}
          >
            Overlays will flatten
          </span>
        ) : null}
        <button type="button" onClick={close} disabled={saving} style={ghostButtonStyle}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          style={primaryButtonStyle}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: 24,
          overflow: "auto",
          background:
            "repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 24px 24px",
        }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Raster Studio preview"
            style={{
              maxWidth: "min(92vw, 1200px)",
              maxHeight: "calc(100vh - 120px)",
              objectFit: "contain",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
              background: "#020617",
            }}
          />
        ) : (
          <p style={{ opacity: 0.7, fontSize: 13 }}>Loading image…</p>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            padding: "10px 16px",
            background: "rgba(239, 68, 68, 0.15)",
            color: "#fecaca",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

const ghostButtonStyle: CSSProperties = {
  border: "1px solid color-mix(in srgb, #fff 18%, transparent)",
  background: "transparent",
  color: "inherit",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#38bdf8",
  color: "#0f172a",
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
