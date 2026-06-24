"use client";

import type { ArrowElement, EngineElement } from "@/lib/engine/types";
import type { WorldPoint } from "./CanvasRoot";

type Props = {
  selectedIds: Set<string>;
  elements: EngineElement[];
  worldToScreen: (p: WorldPoint) => { x: number; y: number };
};

function isSelectedArrow(el: EngineElement, selectedIds: Set<string>): el is ArrowElement {
  return el.type === "arrow" && selectedIds.has(el.id) && !!(el.startBinding || el.endBinding);
}

export default function BindingIndicators({ selectedIds, elements, worldToScreen }: Props) {
  const selectedArrows = elements.filter((el) => isSelectedArrow(el, selectedIds));
  if (!selectedArrows.length) return null;

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
      {selectedArrows.map((arrow) => {
        const items: React.ReactNode[] = [];
        if (arrow.startBinding) {
          const [lx, ly] = arrow.points[0];
          const pt = worldToScreen({ x: arrow.x + lx, y: arrow.y + ly });
          items.push(
            <circle
              key={`${arrow.id}-start`}
              cx={pt.x}
              cy={pt.y}
              r={5}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
            />,
          );
        }
        if (arrow.endBinding) {
          const [lx, ly] = arrow.points[arrow.points.length - 1];
          const pt = worldToScreen({ x: arrow.x + lx, y: arrow.y + ly });
          items.push(
            <circle
              key={`${arrow.id}-end`}
              cx={pt.x}
              cy={pt.y}
              r={5}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
            />,
          );
        }
        return items;
      })}
    </svg>
  );
}
