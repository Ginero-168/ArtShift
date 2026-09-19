"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createEditorController } from "@/lib/engine/editorController";
import { getImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { bakeImageElementRevision } from "@/lib/raster/studio/bakeRevision";
import { commitPngRevisionToSmartObject } from "@/lib/raster/studio/commitBakedRevision";
import {
  arrayBufferToPngDataUrl,
  pngDataUrlToArrayBuffer,
} from "@/lib/raster/studio/encodeRevision";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import PhotopeaEmbed from "./PhotopeaEmbed";
import { studioChrome } from "./studioChrome";

/**
 * Primary raster Edit session: bake current pixels → Photopea Live Messaging
 * → Apply commits through the Smart Object placement-invariant path.
 * Close without applying returns to the design canvas unchanged.
 */
export default function PhotopeaEditSession() {
  const payload = useRasterStudioSession((s) => s.payload);
  const saving = useRasterStudioSession((s) => s.saving);
  const error = useRasterStudioSession((s) => s.error);
  const close = useRasterStudioSession((s) => s.close);
  const setSaving = useRasterStudioSession((s) => s.setSaving);
  const setError = useRasterStudioSession((s) => s.setError);
  const currentSlide = useEngine((s) => s.currentSlide);
  const updateElements = useEngine((s) => s.updateElements);
  const applyRasterSelection = useEngine((s) => s.applyRasterSelection);
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [preparing, setPreparing] = useState(true);

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
    const dialog = dialogRef.current;
    if (!dialog || fileBuffer) return;
    if (!dialog.open) dialog.showModal();
  }, [fileBuffer]);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    setPreparing(true);
    setFileBuffer(null);
    setError(null);

    const prepare = async () => {
      try {
        const image = currentSlide()?.elements.find(
          (el): el is ImageElement => el.id === payload.elementId && el.type === "image",
        );
        if (!image) throw new Error("Image is no longer on the canvas");
        const baked = await bakeImageElementRevision(image, getImageCache(), 2);
        if (cancelled) return;
        setFileBuffer(pngDataUrlToArrayBuffer(baked.dataURL));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not open Photopea");
      } finally {
        if (!cancelled) setPreparing(false);
      }
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [currentSlide, payload, setError]);

  const applyPhotopeaPng = useCallback(
    async (buffer: ArrayBuffer) => {
      if (!payload) return;
      setSaving(true);
      setError(null);
      try {
        const image = currentSlide()?.elements.find(
          (el): el is ImageElement => el.id === payload.elementId && el.type === "image",
        );
        if (!image) throw new Error("Image is no longer on the canvas");
        await commitPngRevisionToSmartObject({
          elementId: image.id,
          placement: payload.placement,
          dataURL: arrayBufferToPngDataUrl(buffer),
          controller,
          currentSlide,
          historyLabel: "apply Photopea raster revision",
        });
        close();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Photopea apply failed");
      } finally {
        setSaving(false);
      }
    },
    [close, controller, currentSlide, payload, setError, setSaving],
  );

  const dismissToCanvas = useCallback(() => {
    if (saving) return;
    setError(null);
    close();
  }, [close, saving, setError]);

  if (!payload) return null;

  if (fileBuffer) {
    return (
      <PhotopeaEmbed
        fileBuffer={fileBuffer}
        sourceName={payload.sourceName}
        applying={saving}
        applyError={error}
        onApplyPng={(buffer) => void applyPhotopeaPng(buffer)}
        onDismiss={dismissToCanvas}
      />
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className="photopea-edit-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) dismissToCanvas();
      }}
      style={dialogStyle}
    >
      <style>{`
        dialog.photopea-edit-dialog::backdrop {
          background: rgba(0, 0, 0, 0.45);
        }
      `}</style>
      <header style={headerStyle}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 id={titleId} style={titleStyle}>
            Photopea
            <span style={{ marginLeft: 8, fontWeight: 500, color: studioChrome.muted }}>
              primary raster editor
            </span>
          </h1>
          <p style={subtitleStyle}>
            {payload.sourceName || "Smart Object"} · runs on photopea.com · Apply keeps placement
          </p>
        </div>
        <button type="button" onClick={dismissToCanvas} disabled={saving} style={ghostButtonStyle}>
          Cancel
        </button>
      </header>
      <div style={stageStyle} role="status" aria-live="polite">
        <p style={{ margin: 0, fontSize: 13 }}>
          {error || (preparing ? "Opening current pixels in Photopea…" : "Could not open Photopea")}
        </p>
        {error ? (
          <button
            type="button"
            onClick={dismissToCanvas}
            style={{ ...primaryButtonStyle, marginTop: 12 }}
          >
            Return to canvas
          </button>
        ) : null}
      </div>
    </dialog>
  );
}

const dialogStyle: CSSProperties = {
  width: "100vw",
  height: "100vh",
  maxWidth: "100vw",
  maxHeight: "100vh",
  margin: 0,
  padding: 0,
  border: "none",
  background: studioChrome.chrome,
  color: studioChrome.ink,
  fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  height: 48,
  padding: "0 12px",
  borderBottom: `1px solid ${studioChrome.hairline}`,
  background: studioChrome.chrome,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.02em",
};

const subtitleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 11,
  color: studioChrome.muted,
};

const stageStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minWidth: 0,
  minHeight: 0,
  background: studioChrome.pasteboard,
  color: studioChrome.ink,
  textAlign: "center",
  padding: 24,
};

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
