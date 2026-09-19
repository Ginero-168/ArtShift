"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";
import {
  imageSpaceViewRect,
  navigatorThumbSize,
  panByImageDelta,
  panToCenterImagePoint,
  thumbToImagePoint,
} from "@/lib/raster/studio/navigatorView";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { studioChrome } from "./studioChrome";

type Props = {
  imageWidth: number;
  imageHeight: number;
  sourceCanvas: HTMLCanvasElement | null;
  revision?: number;
};

/**
 * Affinity-style navigator: optional thumbnail with the pasteboard viewport rect.
 */
export default function RasterStudioNavigator({
  imageWidth,
  imageHeight,
  sourceCanvas,
  revision = 0,
}: Props) {
  const collapsed = useRasterStudioSession((s) => s.navigatorCollapsed);
  const setCollapsed = useRasterStudioSession((s) => s.setNavigatorCollapsed);
  const zoom = useRasterStudioSession((s) => s.zoom);
  const pan = useRasterStudioSession((s) => s.pan);
  const stageSize = useRasterStudioSession((s) => s.stageSize);
  const setPan = useRasterStudioSession((s) => s.setPan);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ lastImageX: number; lastImageY: number } | null>(null);

  const thumb = navigatorThumbSize(imageWidth, imageHeight);
  const view = imageSpaceViewRect(
    stageSize.width,
    stageSize.height,
    imageWidth,
    imageHeight,
    zoom,
    pan,
  );
  const scaleX = thumb.width / Math.max(1, imageWidth);
  const scaleY = thumb.height / Math.max(1, imageHeight);

  useEffect(() => {
    const canvas = thumbCanvasRef.current;
    if (!canvas || collapsed) return;
    if (canvas.width !== thumb.width || canvas.height !== thumb.height) {
      canvas.width = thumb.width;
      canvas.height = thumb.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(0, 0, thumb.width, thumb.height);
    if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sourceCanvas, 0, 0, thumb.width, thumb.height);
    }
    void revision;
  }, [collapsed, revision, sourceCanvas, thumb.height, thumb.width]);

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Show navigator"
        title="Navigator"
        onClick={() => setCollapsed(false)}
        style={collapsedChipStyle}
      >
        Navigator
      </button>
    );
  }

  const rect = {
    left: view.x * scaleX,
    top: view.y * scaleY,
    width: view.width * scaleX,
    height: view.height * scaleY,
  };

  const clientToImage = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    return thumbToImagePoint(x, y, thumb.width, thumb.height, imageWidth, imageHeight);
  };

  return (
    <div
      role="region"
      aria-label="Navigator"
      style={{
        position: "absolute",
        right: 10,
        bottom: 10,
        zIndex: 3,
        width: thumb.width + 16,
        padding: 8,
        borderRadius: 6,
        background: "rgba(36, 36, 36, 0.92)",
        border: `1px solid ${studioChrome.hairline}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: studioChrome.muted,
          }}
        >
          Navigator
        </span>
        <button
          type="button"
          aria-label="Hide navigator"
          title="Hide navigator"
          onClick={() => setCollapsed(true)}
          style={iconButtonStyle}
        >
          ×
        </button>
      </div>
      <div
        style={{
          position: "relative",
          width: thumb.width,
          height: thumb.height,
          overflow: "hidden",
          borderRadius: 3,
          cursor: "pointer",
          background: "#2a2a2a",
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          const image = clientToImage(event);
          const insideRect =
            image.x >= view.x &&
            image.x <= view.x + view.width &&
            image.y >= view.y &&
            image.y <= view.y + view.height;
          if (insideRect) {
            dragRef.current = { lastImageX: image.x, lastImageY: image.y };
          } else {
            dragRef.current = { lastImageX: image.x, lastImageY: image.y };
            setPan(panToCenterImagePoint(image.x, image.y, imageWidth, imageHeight, zoom));
          }
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const image = clientToImage(event);
          const dx = image.x - dragRef.current.lastImageX;
          const dy = image.y - dragRef.current.lastImageY;
          dragRef.current = { lastImageX: image.x, lastImageY: image.y };
          const current = useRasterStudioSession.getState().pan;
          setPan(panByImageDelta(current, dx, dy, zoom));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <canvas
          ref={thumbCanvasRef}
          width={thumb.width}
          height={thumb.height}
          aria-hidden
          style={{ display: "block", width: thumb.width, height: thumb.height }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: rect.left,
            top: rect.top,
            width: Math.max(4, rect.width),
            height: Math.max(4, rect.height),
            border: `1px solid ${studioChrome.selectedAccent}`,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

const collapsedChipStyle = {
  position: "absolute" as const,
  right: 10,
  bottom: 10,
  zIndex: 3,
  height: 24,
  padding: "0 8px",
  borderRadius: 4,
  border: `1px solid ${studioChrome.buttonBorder}`,
  background: "rgba(36, 36, 36, 0.88)",
  color: studioChrome.muted,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  pointerEvents: "auto" as const,
};

const iconButtonStyle = {
  width: 18,
  height: 18,
  padding: 0,
  border: "none",
  background: "transparent",
  color: studioChrome.muted,
  cursor: "pointer",
  fontSize: 14,
  lineHeight: "18px",
};
