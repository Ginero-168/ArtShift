"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo } from "react";
import RasterToolOptions from "@/components/Canvas/RasterToolOptions";
import { createEditorController } from "@/lib/engine/editorController";
import { getImageCache, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { isRasterPaintTool, isRasterRetouchTool } from "@/lib/engine/toolBehavior";
import { createRasterStroke } from "@/lib/raster/mask";
import { bakeImageElementRevision } from "@/lib/raster/studio/bakeRevision";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { placementUnchanged } from "@/lib/raster/studio/types";
import RasterStudioToolbar from "./RasterStudioToolbar";
import RasterStudioViewport from "./RasterStudioViewport";

/**
 * Fullscreen Raster Studio shell (Phase 1–2).
 * Open → edit pixels in image space → Save (bake revision) / Cancel.
 */
export default function RasterStudioShell() {
  const open = useRasterStudioSession((s) => s.open);
  const payload = useRasterStudioSession((s) => s.payload);
  const dirty = useRasterStudioSession((s) => s.dirty);
  const saving = useRasterStudioSession((s) => s.saving);
  const error = useRasterStudioSession((s) => s.error);
  const studioTool = useRasterStudioSession((s) => s.studioTool);
  const close = useRasterStudioSession((s) => s.close);
  const setSaving = useRasterStudioSession((s) => s.setSaving);
  const setError = useRasterStudioSession((s) => s.setError);
  const setStudioTool = useRasterStudioSession((s) => s.setStudioTool);

  const updateElements = useEngine((s) => s.updateElements);
  const applyRasterSelection = useEngine((s) => s.applyRasterSelection);
  const currentSlide = useEngine((s) => s.currentSlide);

  const controller = useMemo(
    () =>
      createEditorController({
        currentSlide,
        updateElements,
        applyRasterSelection,
      }),
    [applyRasterSelection, currentSlide, updateElements],
  );

  const optionsTool =
    studioTool === "hand"
      ? "rasterBrush"
      : isRasterPaintTool(studioTool) ||
          isRasterRetouchTool(studioTool) ||
          studioTool === "rasterMagicWand" ||
          studioTool === "rasterQuickSelection"
        ? studioTool
        : "rasterBrush";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const st = useEngine.getState();
      const slide = st.currentSlide();
      const image = slide?.elements.find(
        (el): el is ImageElement =>
          Boolean(payload && el.id === payload.elementId && el.type === "image"),
      );

      if (event.key === "Escape" && !saving) {
        // Prefer canceling selection / polygon before closing the studio.
        if (image && st.activeRasterSelection?.imageId === image.id) {
          event.preventDefault();
          st.clearRasterSelection(image.id);
          return;
        }
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const selection =
          image && st.activeRasterSelection?.imageId === image.id
            ? st.activeRasterSelection.selection
            : undefined;
        if (image && selection) {
          event.preventDefault();
          const stroke = createRasterStroke(
            [[image.width / 2, image.height / 2]],
            Math.max(1, Math.hypot(image.width, image.height) * 2),
            1,
            { mode: "erase", hardness: 1, selection },
          );
          createEditorController({
            currentSlide: st.currentSlide,
            updateElements: st.updateElements,
            applyRasterSelection: st.applyRasterSelection,
          }).commitRasterStroke(image.id, stroke, "delete selected pixels");
          useRasterStudioSession.getState().setDirty(true);
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const code = event.code;
      if (code === "KeyB") {
        event.preventDefault();
        setStudioTool(event.shiftKey ? "rasterPencil" : "rasterBrush");
      } else if (code === "KeyE") {
        event.preventDefault();
        setStudioTool("rasterEraser");
      } else if (code === "KeyM") {
        event.preventDefault();
        setStudioTool(event.shiftKey ? "rasterEllipse" : "rasterMarquee");
      } else if (code === "KeyL") {
        event.preventDefault();
        setStudioTool(event.shiftKey ? "rasterPolygonLasso" : "rasterLasso");
      } else if (code === "KeyW") {
        event.preventDefault();
        setStudioTool("rasterMagicWand");
      } else if (code === "KeyQ") {
        event.preventDefault();
        setStudioTool("rasterQuickSelection");
      } else if (code === "KeyJ") {
        event.preventDefault();
        setStudioTool("rasterHealing");
      } else if (code === "KeyS") {
        event.preventDefault();
        setStudioTool("rasterClone");
      } else if (code === "KeyH" || code === "Space") {
        event.preventDefault();
        setStudioTool("hand");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open, payload, saving, setStudioTool]);

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
          flexDirection: "column",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid color-mix(in srgb, #fff 12%, transparent)",
          background: "color-mix(in srgb, #020617 70%, transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <strong style={{ fontSize: 14, letterSpacing: "0.02em" }}>Raster Studio</strong>
          <span style={{ fontSize: 12, opacity: 0.7, flex: 1 }}>
            {payload.sourceName || "Smart Object"} · edit pixels here · Save keeps placement
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
              Unsaved edits
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
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <RasterStudioToolbar />
          <span
            aria-hidden
            style={{ width: 1, height: 28, background: "color-mix(in srgb, #fff 14%, transparent)" }}
          />
          <div style={{ color: "var(--ink, #e2e8f0)" }}>
            <RasterToolOptions tool={optionsTool} />
          </div>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <RasterStudioViewport elementId={payload.elementId} />
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
