"use client";

/**
 * Marquee selection rectangle — purely visual; selection commit is done in
 * `CanvasEditor` once the gesture ends. Coordinates are container-local
 * screen px so they're independent of the canvas transform.
 */

type Props = { rect: { x: number; y: number; width: number; height: number } | null };

export default function Marquee({ rect }: Props) {
  if (!rect || (rect.width < 1 && rect.height < 1)) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        background: "rgba(99, 102, 241, 0.08)",
        border: "1.5px dashed #6366f1",
        pointerEvents: "none",
      }}
    />
  );
}
