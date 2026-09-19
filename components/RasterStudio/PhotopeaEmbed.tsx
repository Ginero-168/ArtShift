"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  buildPhotopeaEmbedUrl,
  classifyPhotopeaMessage,
  createPhotopeaHandshake,
  isPhotopeaMessageSource,
  PHOTOPEA_ORIGIN,
  PHOTOPEA_READY_TIMEOUT_MS,
  type PhotopeaPhase,
} from "@/lib/raster/studio/photopea";
import { studioChrome } from "./studioChrome";

export type PhotopeaEmbedProps = {
  fileBuffer: ArrayBuffer;
  sourceName?: string;
  applying?: boolean;
  applyError?: string | null;
  onApplyPng: (buffer: ArrayBuffer) => void;
  onDismiss: () => void;
};

type StatusKind = "loading" | "ready" | "error";

function statusCopy(phase: PhotopeaPhase, timedOut: boolean): { kind: StatusKind; text: string } {
  if (timedOut || phase === "error") {
    return {
      kind: "error",
      text: timedOut
        ? "Photopea did not become ready. Check the network and try again."
        : "Photopea could not open this document.",
    };
  }
  if (phase === "awaitingReady") {
    return { kind: "loading", text: "Loading Photopea…" };
  }
  if (phase === "awaitingOpen") {
    return { kind: "loading", text: "Opening current pixels…" };
  }
  return { kind: "ready", text: "Ready — File → Save applies back to this Smart Object." };
}

/**
 * Temporary Photopea iframe overlay. Closing returns to Raster Studio;
 * Apply / File → Save uses the same Smart Object bake path as Studio Save.
 */
export default function PhotopeaEmbed({
  fileBuffer,
  sourceName,
  applying = false,
  applyError = null,
  onApplyPng,
  onDismiss,
}: PhotopeaEmbedProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const handshakeRef = useRef<ReturnType<typeof createPhotopeaHandshake> | null>(null);
  const onApplyPngRef = useRef(onApplyPng);
  onApplyPngRef.current = onApplyPng;
  const [phase, setPhase] = useState<PhotopeaPhase>("awaitingReady");
  const [iframeKey, setIframeKey] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [handshakeError, setHandshakeError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [dirty, setDirty] = useState(false);
  const appliedRef = useRef(false);

  const embedUrl = buildPhotopeaEmbedUrl();
  const status = statusCopy(handshakeError ? "error" : phase, timedOut);
  const errorText = applyError || handshakeError || (status.kind === "error" ? status.text : null);

  const postToPhotopea = useCallback((data: ArrayBuffer | string) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(data, PHOTOPEA_ORIGIN);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
    // Retry remounts the iframe via key; re-show the dialog after that remount.
    void iframeKey;
  }, [iframeKey]);

  useEffect(() => {
    void iframeKey;
    appliedRef.current = false;
    setPhase("awaitingReady");
    setTimedOut(false);
    setHandshakeError(null);
    setDirty(false);
    setConfirmClose(false);

    const handshake = createPhotopeaHandshake({
      fileBuffer,
      sendBuffer: (buffer) => postToPhotopea(buffer),
      sendScript: (script) => postToPhotopea(script),
    });
    handshakeRef.current = handshake;

    const onMessage = (event: MessageEvent) => {
      if (!isPhotopeaMessageSource(event, iframeRef.current?.contentWindow ?? null)) return;
      const inbound = classifyPhotopeaMessage(event.data);
      const result = handshake.handle(inbound);
      setPhase(handshake.getPhase());
      if (result.type === "ready") {
        setDirty(true);
        return;
      }
      if (result.type === "png") {
        onApplyPngRef.current(result.buffer);
        return;
      }
      if (result.type === "error") {
        setHandshakeError(result.message);
      }
    };

    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => {
      if (handshake.getPhase() === "awaitingReady" || handshake.getPhase() === "awaitingOpen") {
        handshake.fail("timeout");
        setTimedOut(true);
        setPhase("error");
      }
    }, PHOTOPEA_READY_TIMEOUT_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
      handshakeRef.current = null;
    };
  }, [fileBuffer, iframeKey, postToPhotopea]);

  useEffect(() => {
    if (applying || !applyError) return;
    handshakeRef.current?.markReadyAgain();
    setPhase((current) => (current === "awaitingSave" ? "ready" : current));
  }, [applyError, applying]);

  const requestClose = useCallback(() => {
    if (applying) return;
    if (dirty && !appliedRef.current) {
      setConfirmClose(true);
      return;
    }
    onDismiss();
  }, [applying, dirty, onDismiss]);

  const retry = useCallback(() => {
    setIframeKey((value) => value + 1);
  }, []);

  const requestApply = useCallback(() => {
    if (applying || phase !== "ready") return;
    handshakeRef.current?.requestSave();
    setPhase("awaitingSave");
  }, [applying, phase]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className="photopea-hatch-dialog"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      style={dialogStyle}
    >
      <style>{`
        dialog.photopea-hatch-dialog::backdrop {
          background: rgba(0, 0, 0, 0.45);
        }
      `}</style>
      <header style={headerStyle}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.02em",
              outline: "none",
            }}
          >
            Photopea
            <span style={{ marginLeft: 8, fontWeight: 500, color: studioChrome.muted }}>
              temporary hatch
            </span>
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: studioChrome.muted }}>
            {sourceName || "Smart Object"} · runs on photopea.com · Save keeps placement
          </p>
        </div>
        <button
          type="button"
          onClick={requestApply}
          disabled={applying || phase !== "ready"}
          style={primaryButtonStyle}
        >
          {applying ? "Applying…" : phase === "awaitingSave" ? "Saving…" : "Apply back to ArtShift"}
        </button>
        <button type="button" onClick={requestClose} disabled={applying} style={ghostButtonStyle}>
          Close
        </button>
      </header>

      <div style={stageStyle}>
        <iframe
          key={iframeKey}
          ref={iframeRef}
          title="Photopea editor"
          src={embedUrl}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-read; clipboard-write"
          style={iframeStyle}
        />
        {status.kind !== "ready" || applying ? (
          <div style={overlayStyle} role="status" aria-live="polite">
            <p style={{ margin: 0, fontSize: 13 }}>
              {applying ? "Applying pixels back to the Smart Object…" : status.text}
            </p>
            {status.kind === "error" ? (
              <button
                type="button"
                onClick={retry}
                style={{ ...primaryButtonStyle, marginTop: 12 }}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer style={footerStyle}>
        <span aria-live="polite">
          {status.kind === "ready"
            ? "Ready — File → Save or Apply back keeps Smart Object placement."
            : "File → Save in Photopea also applies back. Close returns to Raster Studio without changing the canvas."}
        </span>
      </footer>

      {errorText && status.kind !== "error" ? (
        <div role="alert" style={errorBannerStyle}>
          {errorText}
        </div>
      ) : null}

      {confirmClose ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Close Photopea without applying?"
          style={confirmWrapStyle}
        >
          <div style={confirmCardStyle}>
            <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.4 }}>
              Close Photopea without applying pixels back to ArtShift? Raster Studio stays as it
              was.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setConfirmClose(false)} style={ghostButtonStyle}>
                Keep editing
              </button>
              <button type="button" onClick={onDismiss} style={primaryButtonStyle}>
                Close without applying
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  gridTemplateRows: "auto minmax(0, 1fr) auto",
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

const stageStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
  background: studioChrome.pasteboard,
};

const iframeStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
  background: "#1e1e1e",
};

const footerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 24,
  padding: "0 12px",
  borderTop: `1px solid ${studioChrome.hairline}`,
  fontSize: 11,
  color: studioChrome.muted,
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "rgba(20, 20, 20, 0.72)",
  color: studioChrome.ink,
  textAlign: "center",
  padding: 24,
};

const errorBannerStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 36,
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid rgba(239, 68, 68, 0.25)",
  background: "rgba(254, 226, 226, 0.95)",
  color: "#991b1b",
  fontSize: 13,
};

const confirmWrapStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "grid",
  placeItems: "center",
  background: "rgba(0, 0, 0, 0.35)",
};

const confirmCardStyle: CSSProperties = {
  minWidth: 280,
  maxWidth: 400,
  padding: "16px 18px",
  borderRadius: 8,
  background: studioChrome.chromeRaised,
  border: `1px solid ${studioChrome.hairline}`,
  color: studioChrome.ink,
  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
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
