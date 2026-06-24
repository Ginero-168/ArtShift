"use client";

/**
 * Snap guide lines drawn during a move/draw drag. Pure presentation —
 * `CanvasEditor` provides the active guides in world coords and we project
 * to screen here.
 */

import type { Guide } from "@/lib/engine/snap";
import type { WorldPoint } from "./CanvasRoot";

type Props = {
  guides: Guide[];
  worldToScreen: (p: WorldPoint) => { x: number; y: number };
};

export default function Guides({ guides, worldToScreen }: Props) {
  if (!guides.length) return null;
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {guides.map((g, i) => {
        if (g.axis === "x") {
          const a = worldToScreen({ x: g.at, y: g.from });
          const b = worldToScreen({ x: g.at, y: g.to });
          return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f97316" strokeWidth={1} />
          );
        }
        if (g.axis === "y") {
          const a = worldToScreen({ x: g.from, y: g.at });
          const b = worldToScreen({ x: g.to, y: g.at });
          return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f97316" strokeWidth={1} />
          );
        }
        if (g.axis === "gap_x") {
          const a = worldToScreen({ x: g.from, y: g.y });
          const b = worldToScreen({ x: g.to, y: g.y });
          const dist = Math.round(Math.abs(g.to - g.from));
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f97316" strokeWidth={1} />
              <line x1={a.x} y1={a.y - 4} x2={a.x} y2={a.y + 4} stroke="#f97316" strokeWidth={1} />
              <line x1={b.x} y1={b.y - 4} x2={b.x} y2={b.y + 4} stroke="#f97316" strokeWidth={1} />
              <text
                x={(a.x + b.x) / 2}
                y={a.y - 6}
                fill="#f97316"
                fontSize={10}
                textAnchor="middle"
              >
                {dist}px
              </text>
            </g>
          );
        }
        if (g.axis === "gap_y") {
          const a = worldToScreen({ x: g.x, y: g.from });
          const b = worldToScreen({ x: g.x, y: g.to });
          const dist = Math.round(Math.abs(g.to - g.from));
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f97316" strokeWidth={1} />
              <line x1={a.x - 4} y1={a.y} x2={a.x + 4} y2={a.y} stroke="#f97316" strokeWidth={1} />
              <line x1={b.x - 4} y1={b.y} x2={b.x + 4} y2={b.y} stroke="#f97316" strokeWidth={1} />
              <text
                x={a.x + 6}
                y={(a.y + b.y) / 2 + 4}
                fill="#f97316"
                fontSize={10}
                textAnchor="start"
              >
                {dist}px
              </text>
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}
