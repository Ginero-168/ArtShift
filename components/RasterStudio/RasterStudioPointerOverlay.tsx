"use client";

import { studioChrome } from "./studioChrome";

type Point = [number, number];

export function RasterStudioBrushCursor({
  local,
  size,
  hardness,
  visible,
}: {
  local: Point | null;
  size: number;
  hardness: number;
  visible: boolean;
}) {
  if (!visible || !local) return null;
  const radius = Math.max(0.5, size / 2);
  const inner = radius * Math.max(0, Math.min(1, hardness));
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <circle
        cx={local[0]}
        cy={local[1]}
        r={radius}
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={local[0]}
        cy={local[1]}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={1}
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      {hardness < 0.98 && inner > 0.75 ? (
        <circle
          cx={local[0]}
          cy={local[1]}
          r={inner}
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

export function RasterStudioCloneMarker({
  source,
  follow,
  size,
}: {
  source: Point | null;
  follow: Point | null;
  size: number;
}) {
  if (!source) return null;
  const radius = Math.max(2, size / 2);
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <CloneCrosshair point={source} radius={radius} color={studioChrome.selectedAccent} />
      {follow ? (
        <CloneCrosshair point={follow} radius={radius} color="rgba(255,255,255,0.7)" />
      ) : null}
    </svg>
  );
}

function CloneCrosshair({ point, radius, color }: { point: Point; radius: number; color: string }) {
  const arm = Math.max(6, radius * 0.35);
  return (
    <g>
      <circle
        cx={point[0]}
        cy={point[1]}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={point[0] - arm}
        y1={point[1]}
        x2={point[0] + arm}
        y2={point[1]}
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={point[0]}
        y1={point[1] - arm}
        x2={point[0]}
        y2={point[1] + arm}
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
