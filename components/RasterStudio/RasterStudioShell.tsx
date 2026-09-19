"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo } from "react";
import RasterToolOptions from "@/components/Canvas/RasterToolOptions";
import { createEditorController } from "@/lib/engine/editorController";
import { getImageCache, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { isRasterPaintTool, isRasterRetouchTool } from "@/lib/engine/toolBehavior";
import type { ImageElement } from "@/lib/engine/types";
import { createRasterStroke } from "@/lib/raster/mask";
import { bakeImageElementRevision } from "@/lib/raster/studio/bakeRevision";
import { studioToolHint, useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { placementUnchanged } from "@/lib/raster/studio/types";
import RasterStudioToolbar from "./RasterStudioToolbar";
import RasterStudioViewport from "./RasterStudioViewport";

/**
 * Fullscreen Raster Studio shell (UX-1 chrome).
 * Open → edit pixels in image space → Save (bake revision) / Cancel.
 */
export default function RasterStudioShell() {
  const open = useRasterStudioSession((s) => s.open);
  const payload = useRasterStudioSession((s) => s.payload);
  const dirty = useRasterStudioSession((s) => s.dirty);
  const saving = useRasterStudioSession((s) => s.saving);
  const error = useRasterStudioSession((s) => s.error);
  const studioTool = useRasterStudioSession((s) => s.studioTool);
  const zoom = useRasterStudioSession((s) => s.zoom);
  const close = useRasterStudioSession((s) => s.close);
  const setSaving = useRasterStudioSession((s) => s.setSaving);
  const setError = useRasterStudioSession((s) => s.setError);
  const setStudioTool = useRasterStudioSession((s) => s.setStudioTool);
  const fitView = useRasterStudioSession((s) => s.fitView);
  const actualSize = useRasterStudioSession((s) => s.actualSize);

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
    isRasterPaintTool(studioTool) ||
    isRasterRetouchTool(studioTool) ||
    studioTool === "rasterMagicWand" ||
    studioTool === "rasterQuickSelection"
      ? studioTool
      : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const st = useEngine.getState();
      const slide = st.currentSlide();
      const image = slide?.elements.find((el): el is ImageElement =>
        Boolean(payload && el.id === payload.elementId && el.type === "image"),
      );

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        if (event.code === "Digit0") {
          event.preventDefault();
          fitView();
          return;
        }
        if (event.code === "Digit1") {
          event.preventDefault();
          actualSize();
          return;
        }
      }

      if (event.key === "Escape" && !saving) {
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

      const brushSizeDelta =
        event.code === "BracketLeft" || event.key === "["
          ? -1
          : event.code === "BracketRight" || event.key === "]"
            ? 1
            : 0;
      if (brushSizeDelta !== 0 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (studioTool === "rasterQuickSelection") {
          st.setRasterQuickSelectionSize(st.rasterQuickSelectionSize + brushSizeDelta);
        } else {
          st.setRasterBrushSize(st.rasterBrushSize + brushSizeDelta);
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
      } else if (code === "KeyH") {
        event.preventDefault();
        setStudioTool("hand");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actualSize, close, fitView, open, payload, saving, setStudioTool, studioTool]);

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

  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Raster Studio"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        gridTemplateColumns: "48px minmax(0, 1fr)",
        gridTemplateAreas: `
          "top top"
          "rail stage"
          "status status"
        `,
        background: "var(--bg, #1f2330)",
        color: "var(--ink, #111827)",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
      }}
    >
      <header
        style={{
          gridArea: "top",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(15, 23, 42, 0.12)",
          background: "var(--surface-solid, #fff)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 0 }}>
          <strong style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.01em" }}>
            Raster Studio
          </strong>
          {dirty ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgba(245, 158, 11, 0.12)",
                color: "#b45309",
                border: "1px solid rgba(245, 158, 11, 0.28)",
              }}
            >
              Unsaved
            </span>
          ) : null}
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-muted, #6b7280)",
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {payload.sourceName || "Smart Object"}
          </span>
        </div>

        <div
          style={{
            minWidth: 0,
            flex: "1 1 auto",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {optionsTool ? <RasterToolOptions tool={optionsTool} /> : null}
        </div>

        <div
          role="group"
          aria-label="Zoom"
          style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
        >
          <span
            aria-live="polite"
            style={{ fontSize: 11, fontWeight: 700, minWidth: 44, textAlign: "right" }}
          >
            {zoomPercent}
          </span>
          <button type="button" onClick={fitView} title="Fit to view (⌘0)" style={ghostButtonStyle}>
            Fit
          </button>
          <button
            type="button"
            onClick={actualSize}
            title="Actual size 100% (⌘1)"
            style={ghostButtonStyle}
          >
            100%
          </button>
        </div>

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

      <aside
        style={{
          gridArea: "rail",
          borderRight: "1px solid rgba(15, 23, 42, 0.1)",
          background: "var(--surface-solid, #fff)",
          minHeight: 0,
        }}
      >
        <RasterStudioToolbar />
      </aside>

      <div style={{ gridArea: "stage", minWidth: 0, minHeight: 0 }}>
        <RasterStudioViewport elementId={payload.elementId} />
      </div>

      <div
        style={{
          gridArea: "status",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 12px",
          background: "var(--surface-solid, #fff)",
          borderTop: "1px solid rgba(15, 23, 42, 0.1)",
          fontSize: 11,
          color: "var(--ink-muted, #6b7280)",
        }}
      >
        <span>{studioToolHint(studioTool)}</span>
        <span style={{ marginInlineStart: "auto" }}>
          Save keeps placement · Esc cancels · Space pans
        </span>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            position: "absolute",
            left: 60,
            right: 16,
            bottom: 40,
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid rgba(239, 68, 68, 0.25)",
            background: "rgba(254, 226, 226, 0.95)",
            color: "#991b1b",
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
  border: "1px solid var(--stroke, #d1d5db)",
  background: "var(--surface-solid, #fff)",
  color: "var(--ink, #374151)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "var(--accent, #6366f1)",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 16px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
  boxShadow: "0 1px 3px rgba(79, 70, 229, 0.28)",
};
