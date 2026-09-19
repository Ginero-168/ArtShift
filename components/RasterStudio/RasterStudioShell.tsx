"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import RasterToolOptions from "@/components/Canvas/RasterToolOptions";
import { createEditorController } from "@/lib/engine/editorController";
import { getImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import {
  isRasterPaintTool,
  isRasterRetouchTool,
  isRasterSelectionTool,
} from "@/lib/engine/toolBehavior";
import type { ImageElement } from "@/lib/engine/types";
import { createRasterStroke } from "@/lib/raster/mask";
import { bakeImageElementRevision } from "@/lib/raster/studio/bakeRevision";
import { commitPngRevisionToSmartObject } from "@/lib/raster/studio/commitBakedRevision";
import { studioToolHint, useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { buildRasterStudioDiscardPatch } from "@/lib/raster/studio/types";
import PhotopeaEditSession from "./PhotopeaEditSession";
import RasterStudioAdjustPanel from "./RasterStudioAdjustPanel";
import RasterStudioToolbar from "./RasterStudioToolbar";
import RasterStudioViewport from "./RasterStudioViewport";
import { studioChrome } from "./studioChrome";

/**
 * Raster edit mount: Photopea is the default Edit Raster surface.
 * Hidden Studio chrome (`?rasterStudio=1`) remains Affinity-inspired.
 */
export default function RasterStudioShell() {
  const open = useRasterStudioSession((s) => s.open);
  const surface = useRasterStudioSession((s) => s.surface);
  const payload = useRasterStudioSession((s) => s.payload);
  const dirty = useRasterStudioSession((s) => s.dirty);
  const sessionEdited = useRasterStudioSession((s) => s.sessionEdited);
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
  const adjustOpen = useRasterStudioSession((s) => s.adjustOpen);
  const setAdjustOpen = useRasterStudioSession((s) => s.setAdjustOpen);
  const navigatorCollapsed = useRasterStudioSession((s) => s.navigatorCollapsed);
  const setNavigatorCollapsed = useRasterStudioSession((s) => s.setNavigatorCollapsed);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (sessionEdited) {
      setConfirmingDiscard(true);
      return;
    }
    close();
  }, [close, saving, sessionEdited]);

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
    isRasterSelectionTool(studioTool) ||
    studioTool === "rasterMagicWand" ||
    studioTool === "rasterQuickSelection"
      ? studioTool
      : null;

  useEffect(() => {
    if (!open || surface !== "studio") return;
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
        requestClose();
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
  }, [
    actualSize,
    fitView,
    open,
    payload,
    surface,
    requestClose,
    saving,
    setStudioTool,
    studioTool,
  ]);

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

      const baked = await bakeImageElementRevision(image, getImageCache(), 2);
      await commitPngRevisionToSmartObject({
        elementId: image.id,
        placement: payload.placement,
        dataURL: baked.dataURL,
        naturalWidth: baked.width,
        naturalHeight: baked.height,
        controller,
        currentSlide,
        historyLabel: "update raster revision",
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [close, controller, currentSlide, payload, setError, setSaving]);

  const confirmDiscard = useCallback(() => {
    if (!payload) return;
    const image = currentSlide()?.elements.find(
      (el): el is ImageElement => el.id === payload.elementId && el.type === "image",
    );
    if (image) {
      updateElements(
        [{ id: image.id, patch: buildRasterStudioDiscardPatch(payload) }],
        "discard raster studio session",
      );
      useEngine.getState().clearRasterSelection(image.id);
    }
    setConfirmingDiscard(false);
    close();
  }, [close, currentSlide, payload, updateElements]);

  if (!open || !payload) return null;
  if (surface === "photopea") return <PhotopeaEditSession />;

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
        gridTemplateRows: "auto auto minmax(0, 1fr) auto",
        gridTemplateColumns: "44px minmax(0, 1fr)",
        gridTemplateAreas: `
          "title title"
          "context context"
          "rail stage"
          "status status"
        `,
        background: studioChrome.chrome,
        color: studioChrome.ink,
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        userSelect: "none",
      }}
    >
      <header
        style={{
          gridArea: "title",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
          height: 36,
          padding: "0 10px",
          borderBottom: `1px solid ${studioChrome.hairline}`,
          background: studioChrome.chrome,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <strong style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}>
            Raster Studio
          </strong>
          {dirty ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: studioChrome.muted,
              }}
            >
              Unsaved
            </span>
          ) : null}
          <span
            style={{
              fontSize: 12,
              color: studioChrome.muted,
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {payload.sourceName || "Smart Object"}
          </span>
        </div>
        <button type="button" onClick={requestClose} disabled={saving} style={ghostButtonStyle}>
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
          gridArea: "context",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          height: 38,
          padding: "0 10px 0 8px",
          borderBottom: `1px solid ${studioChrome.hairline}`,
          background: studioChrome.chromeRaised,
        }}
      >
        <div
          style={{
            minWidth: 0,
            flex: "1 1 auto",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {optionsTool ? (
            <RasterToolOptions tool={optionsTool} variant="studio" />
          ) : (
            <span style={{ fontSize: 12, color: studioChrome.muted }}>
              {studioToolHint(studioTool)}
            </span>
          )}
        </div>

        <div
          role="group"
          aria-label="Studio panels"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            paddingLeft: 12,
            borderLeft: `1px solid ${studioChrome.hairline}`,
          }}
        >
          <button
            type="button"
            aria-pressed={adjustOpen}
            title="Brightness and contrast (Studio only until Save)"
            onClick={() => setAdjustOpen(!adjustOpen)}
            style={adjustOpen ? activeGhostButtonStyle : ghostButtonStyle}
          >
            Adjust
          </button>
          <button
            type="button"
            aria-pressed={!navigatorCollapsed}
            title="Navigator thumbnail"
            onClick={() => setNavigatorCollapsed(!navigatorCollapsed)}
            style={!navigatorCollapsed ? activeGhostButtonStyle : ghostButtonStyle}
          >
            Navigator
          </button>
        </div>

        <div
          role="group"
          aria-label="Zoom"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            paddingLeft: 12,
            borderLeft: `1px solid ${studioChrome.hairline}`,
          }}
        >
          <span
            aria-live="polite"
            style={{
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              minWidth: 44,
              textAlign: "right",
              color: studioChrome.ink,
            }}
          >
            {zoomPercent}
          </span>
          <button type="button" onClick={fitView} title="Zoom to Fit (⌘0)" style={ghostButtonStyle}>
            Fit
          </button>
          <button
            type="button"
            onClick={actualSize}
            title="Actual Size 100% (⌘1)"
            style={ghostButtonStyle}
          >
            Actual Size
          </button>
        </div>
      </div>

      <aside
        style={{
          gridArea: "rail",
          borderRight: `1px solid ${studioChrome.hairline}`,
          background: studioChrome.chrome,
          minHeight: 0,
        }}
      >
        <RasterStudioToolbar />
      </aside>

      <div style={{ gridArea: "stage", position: "relative", minWidth: 0, minHeight: 0 }}>
        <RasterStudioViewport elementId={payload.elementId} />
        {adjustOpen ? <RasterStudioAdjustPanel elementId={payload.elementId} /> : null}
      </div>

      <div
        style={{
          gridArea: "status",
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 24,
          padding: "0 10px",
          background: studioChrome.chrome,
          borderTop: `1px solid ${studioChrome.hairline}`,
          fontSize: 11,
          color: studioChrome.muted,
        }}
      >
        <span>{studioToolHint(studioTool)}</span>
        <span style={{ marginInlineStart: "auto" }}>
          ⌘Z undo · Save keeps placement · hidden Studio (`?rasterStudio=1`)
        </span>
      </div>

      {confirmingDiscard ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Discard pixel edits?"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "grid",
            placeItems: "center",
            background: "rgba(0, 0, 0, 0.35)",
          }}
        >
          <div
            style={{
              minWidth: 280,
              maxWidth: 360,
              padding: "16px 18px",
              borderRadius: 8,
              background: studioChrome.chromeRaised,
              border: `1px solid ${studioChrome.hairline}`,
              color: studioChrome.ink,
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.4 }}>
              Discard pixel edits from this session? Placement and Appearance stay unchanged.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmingDiscard(false)}
                style={ghostButtonStyle}
              >
                Keep editing
              </button>
              <button type="button" onClick={confirmDiscard} style={primaryButtonStyle}>
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
  border: `1px solid ${studioChrome.buttonBorder}`,
  background: "transparent",
  color: studioChrome.ink,
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  flexShrink: 0,
};

const activeGhostButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  background: studioChrome.selected,
  boxShadow: `inset 0 0 0 1px ${studioChrome.selectedAccent}`,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: studioChrome.save,
  color: "#fff",
  borderRadius: 4,
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};
