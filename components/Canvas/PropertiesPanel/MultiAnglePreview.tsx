"use client";

import { useEffect, useRef } from "react";
import {
  cameraFromPointerDelta,
  cameraFromWheel,
  type MultiAngleCamera,
} from "@/lib/image/multiAngleCamera";
import { paintMultiAngleScene } from "@/lib/image/multiAngleScene";

export function MultiAnglePreview({
  camera,
  onCameraChange,
}: {
  camera: MultiAngleCamera;
  onCameraChange: (next: MultiAngleCamera) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    camera: MultiAngleCamera;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      const context = canvas.getContext("2d");
      if (!context) return;
      const bounds = canvas.getBoundingClientRect();
      paintMultiAngleScene(
        context,
        bounds.width || canvas.clientWidth || 360,
        bounds.height || canvas.clientHeight || 210,
        camera,
      );
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [camera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (event.cancelable) event.preventDefault();
      onCameraChange(cameraFromWheel(cameraRef.current, event.deltaY));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onCameraChange]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="multi-angle-preview"
      data-rotate={camera.rotateDegrees}
      data-move-forward={camera.moveForward}
      data-vertical-tilt={camera.verticalTilt}
      data-wide-angle={camera.useWideAngle ? "true" : "false"}
      aria-label="Camera orbit. Drag sideways to rotate, drag vertically to tilt, scroll to move closer."
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          camera,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        onCameraChange(
          cameraFromPointerDelta(drag.camera, event.clientX - drag.x, event.clientY - drag.y),
        );
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onKeyDown={(event) => {
        const current = cameraRef.current;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onCameraChange({ ...current, rotateDegrees: current.rotateDegrees + 5 });
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onCameraChange({ ...current, rotateDegrees: current.rotateDegrees - 5 });
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          onCameraChange({ ...current, verticalTilt: current.verticalTilt - 1 });
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          onCameraChange({ ...current, verticalTilt: current.verticalTilt + 1 });
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          onCameraChange(cameraFromWheel(current, -1));
        } else if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          onCameraChange(cameraFromWheel(current, 1));
        }
      }}
      style={{
        width: "100%",
        height: 210,
        display: "block",
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
        touchAction: "none",
        cursor: "grab",
      }}
    />
  );
}
