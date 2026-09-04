"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { localToWorld, worldToLocal } from "@/lib/engine/bounds";
import { useEngine } from "@/lib/engine/store";
import type { VectorPathElement } from "@/lib/engine/types";
import {
  getVectorPathSubpathRanges,
  insertNodeAt,
  moveVectorPathNode,
  recomputeVectorPathBounds,
  removeNodeAt,
  setNodeHandle,
  toggleNodeSmoothness,
} from "@/lib/engine/vectorPath";

type Props = {
  element: VectorPathElement;
  worldToScreen: (point: { x: number; y: number }) => { x: number; y: number };
  clientToWorld: (x: number, y: number) => { x: number; y: number };
  onExit?: () => void;
};

type DragState =
  | {
      kind: "node";
      indices: number[];
      source: VectorPathElement;
      startWorld: { x: number; y: number };
    }
  | {
      kind: "handle";
      index: number;
      handle: "in" | "out";
      source: VectorPathElement;
      altKey: boolean;
    };

export default function PathNodeOverlay({ element, worldToScreen, clientToWorld, onExit }: Props) {
  const checkpointInteraction = useEngine((state) => state.checkpointInteraction);
  const previewElements = useEngine((state) => state.previewElements);
  const updateElements = useEngine((state) => state.updateElements);
  const [selectedNodeIndices, setSelectedNodeIndices] = useState<number[]>([0]);
  const [hoverSegment, setHoverSegment] = useState<{ index: number; x: number; y: number } | null>(
    null,
  );
  const drag = useRef<DragState | null>(null);

  const segments = useMemo(() => {
    const result: Array<{ index: number; nextIndex: number }> = [];
    for (const { start, end } of getVectorPathSubpathRanges(element)) {
      const segmentCount = end - start - (element.closed ? 0 : 1);
      for (let offset = 0; offset < segmentCount; offset++) {
        const index = start + offset;
        result.push({ index, nextIndex: index + 1 < end ? index + 1 : start });
      }
    }
    return result;
  }, [element]);

  // Keyboard shortcuts: Delete, Escape, Tab, Shift+Tab
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") {
        onExit?.();
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        setSelectedNodeIndices((prev) => {
          const current = prev[0] ?? 0;
          const next = e.shiftKey
            ? (current - 1 + element.nodes.length) % element.nodes.length
            : (current + 1) % element.nodes.length;
          return [next];
        });
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeIndices.length > 0) {
        if (element.nodes.length > 2) {
          let updatedNodes = [...element.nodes];
          let updatedSubpathStarts = element.subpathStarts;
          const sorted = [...selectedNodeIndices].sort((a, b) => b - a);
          for (const idx of sorted) {
            if (updatedNodes.length > 2) {
              updatedNodes = removeNodeAt(updatedNodes, idx);
              updatedSubpathStarts = shiftSubpathStartsAfterDelete(updatedSubpathStarts, idx);
            }
          }
          const updatedElement = recomputeVectorPathBounds(
            { ...element, nodes: updatedNodes, subpathStarts: updatedSubpathStarts },
            16,
          );
          updateElements([{ id: element.id, patch: updatedElement }], "delete vector node");
          setSelectedNodeIndices([0]);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [element, selectedNodeIndices, updateElements, onExit]);

  const screenNodes = useMemo(
    () =>
      element.nodes.map((node) =>
        worldToScreen(
          localToWorld(element, {
            x: node.x * element.width,
            y: node.y * element.height,
          }),
        ),
      ),
    [element, worldToScreen],
  );

  // Smooth SVG cubic Bezier path representation of the outline
  const svgPathD = useMemo(
    () => buildVectorPathGuide(element, worldToScreen),
    [element, worldToScreen],
  );

  return (
    <svg
      aria-label="Vector path nodes and bezier handles"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 12,
        pointerEvents: "none",
      }}
    >
      {/* Exact Smooth Curve Outline Guide */}
      {svgPathD && (
        <path
          d={svgPathD}
          fill="none"
          stroke="#1877f2"
          strokeWidth={1}
          strokeDasharray="3 3"
          strokeOpacity={0.6}
        />
      )}

      {/* Clickable Path Segments to Insert Points */}
      {segments.map(({ index, nextIndex }) => {
        const ptA = screenNodes[index];
        const nextIdx = nextIndex;
        const ptB = screenNodes[nextIdx];

        return (
          <line
            key={`seg-${index}`}
            x1={ptA.x}
            y1={ptA.y}
            x2={ptB.x}
            y2={ptB.y}
            stroke="transparent"
            strokeWidth={16}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
            onPointerMove={(e) => {
              const svg = e.currentTarget.ownerSVGElement ?? e.currentTarget.closest("svg");
              const rect = svg?.getBoundingClientRect();
              if (rect) {
                setHoverSegment({
                  index,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }
            }}
            onPointerLeave={() => setHoverSegment(null)}
            onClick={(e) => {
              e.stopPropagation();
              const world = clientToWorld(e.clientX, e.clientY);
              const local = worldToLocal(element, world);
              const normX = local.x / Math.max(1, element.width);
              const normY = local.y / Math.max(1, element.height);
              const insertAt = index + 1;
              const updatedNodes = insertNodeAt(element.nodes, insertAt, { x: normX, y: normY });
              const updatedElement = recomputeVectorPathBounds(
                {
                  ...element,
                  nodes: updatedNodes,
                  subpathStarts: shiftSubpathStartsAfterInsert(element.subpathStarts, insertAt),
                },
                16,
              );
              updateElements([{ id: element.id, patch: updatedElement }], "add vector node");
              setSelectedNodeIndices([insertAt]);
              setHoverSegment(null);
            }}
          />
        );
      })}

      {/* Hover preview indicator when cursor is over a segment */}
      {hoverSegment && (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={hoverSegment.x} cy={hoverSegment.y} r={5} fill="#1877f2" fillOpacity={0.3} />
          <circle cx={hoverSegment.x} cy={hoverSegment.y} r={3} fill="#1877f2" />
          <text
            x={hoverSegment.x + 6}
            y={hoverSegment.y - 6}
            fill="#1877f2"
            fontSize={11}
            fontWeight="bold"
          >
            +
          </text>
        </g>
      )}

      {/* Render Bezier Tangent Handles for selected / active nodes */}
      {element.nodes.map((node, index) => {
        const centerPt = screenNodes[index];
        const handles: React.ReactNode[] = [];
        const isSelected = selectedNodeIndices.includes(index);

        if (isSelected || node.in || node.out) {
          if (node.in) {
            const inWorld = localToWorld(element, {
              x: (node.x + node.in[0]) * element.width,
              y: (node.y + node.in[1]) * element.height,
            });
            const inScreen = worldToScreen(inWorld);
            handles.push(
              <g key={`in-${index}`}>
                <line
                  x1={centerPt.x}
                  y1={centerPt.y}
                  x2={inScreen.x}
                  y2={inScreen.y}
                  stroke="#1877f2"
                  strokeWidth={1}
                />
                <circle
                  cx={inScreen.x}
                  cy={inScreen.y}
                  r={3.5}
                  fill="#ffffff"
                  stroke="#1877f2"
                  strokeWidth={1.5}
                  style={{ pointerEvents: "all", cursor: "crosshair" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    checkpointInteraction("move vector handle");
                    drag.current = {
                      kind: "handle",
                      index,
                      handle: "in",
                      source: structuredClone(element),
                      altKey: event.altKey,
                    };
                  }}
                  onPointerMove={(event) => {
                    if (
                      drag.current?.kind !== "handle" ||
                      !event.currentTarget.hasPointerCapture(event.pointerId)
                    )
                      return;
                    const world = clientToWorld(event.clientX, event.clientY);
                    const local = worldToLocal(drag.current.source, world);
                    const targetNode = drag.current.source.nodes[drag.current.index];
                    const dx = local.x / Math.max(1, drag.current.source.width) - targetNode.x;
                    const dy = local.y / Math.max(1, drag.current.source.height) - targetNode.y;
                    const symmetric = !event.altKey && !drag.current.altKey;
                    previewElements([
                      {
                        id: element.id,
                        patch: {
                          nodes: setNodeHandle(
                            drag.current.source.nodes,
                            drag.current.index,
                            "in",
                            [dx, dy],
                            symmetric,
                          ),
                        },
                      },
                    ]);
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    drag.current = null;
                    const normalized = recomputeVectorPathBounds(element, 16);
                    updateElements([{ id: element.id, patch: normalized }], "update vector bounds");
                  }}
                />
              </g>,
            );
          }

          if (node.out) {
            const outWorld = localToWorld(element, {
              x: (node.x + node.out[0]) * element.width,
              y: (node.y + node.out[1]) * element.height,
            });
            const outScreen = worldToScreen(outWorld);
            handles.push(
              <g key={`out-${index}`}>
                <line
                  x1={centerPt.x}
                  y1={centerPt.y}
                  x2={outScreen.x}
                  y2={outScreen.y}
                  stroke="#1877f2"
                  strokeWidth={1}
                />
                <circle
                  cx={outScreen.x}
                  cy={outScreen.y}
                  r={3.5}
                  fill="#ffffff"
                  stroke="#1877f2"
                  strokeWidth={1.5}
                  style={{ pointerEvents: "all", cursor: "crosshair" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    checkpointInteraction("move vector handle");
                    drag.current = {
                      kind: "handle",
                      index,
                      handle: "out",
                      source: structuredClone(element),
                      altKey: event.altKey,
                    };
                  }}
                  onPointerMove={(event) => {
                    if (
                      drag.current?.kind !== "handle" ||
                      !event.currentTarget.hasPointerCapture(event.pointerId)
                    )
                      return;
                    const world = clientToWorld(event.clientX, event.clientY);
                    const local = worldToLocal(drag.current.source, world);
                    const targetNode = drag.current.source.nodes[drag.current.index];
                    const dx = local.x / Math.max(1, drag.current.source.width) - targetNode.x;
                    const dy = local.y / Math.max(1, drag.current.source.height) - targetNode.y;
                    const symmetric = !event.altKey && !drag.current.altKey;
                    previewElements([
                      {
                        id: element.id,
                        patch: {
                          nodes: setNodeHandle(
                            drag.current.source.nodes,
                            drag.current.index,
                            "out",
                            [dx, dy],
                            symmetric,
                          ),
                        },
                      },
                    ]);
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    drag.current = null;
                    const normalized = recomputeVectorPathBounds(element, 16);
                    updateElements([{ id: element.id, patch: normalized }], "update vector bounds");
                  }}
                />
              </g>,
            );
          }
        }

        return handles;
      })}

      {/* Main Anchor Points (Illustrator-style 6.5x6.5px crisp square handles) */}
      {screenNodes.map((point, index) => {
        const isSelected = selectedNodeIndices.includes(index);
        const size = isSelected ? 7.5 : 6;
        const half = size / 2;

        return (
          <rect
            key={`${element.id}-${index}`}
            x={point.x - half}
            y={point.y - half}
            width={size}
            height={size}
            fill={isSelected ? "#1877f2" : "#ffffff"}
            stroke={isSelected ? "#ffffff" : "#1877f2"}
            strokeWidth={isSelected ? 1 : 1.5}
            style={{
              pointerEvents: "all",
              cursor: "pointer",
            }}
            onClick={(event) => {
              if (event.altKey) {
                // Alt+Click toggles Corner vs Smooth
                event.stopPropagation();
                const updatedNodes = toggleNodeSmoothness(
                  element.nodes,
                  index,
                  element.subpathStarts,
                );
                const updatedElement = recomputeVectorPathBounds(
                  { ...element, nodes: updatedNodes },
                  16,
                );
                updateElements(
                  [{ id: element.id, patch: updatedElement }],
                  "toggle node smoothness",
                );
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              const updatedNodes = toggleNodeSmoothness(
                element.nodes,
                index,
                element.subpathStarts,
              );
              const updatedElement = recomputeVectorPathBounds(
                { ...element, nodes: updatedNodes },
                16,
              );
              updateElements([{ id: element.id, patch: updatedElement }], "toggle node smoothness");
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.shiftKey) {
                setSelectedNodeIndices((prev) =>
                  prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
                );
              } else {
                setSelectedNodeIndices([index]);
              }

              event.currentTarget.setPointerCapture(event.pointerId);
              checkpointInteraction("move vector node");
              const world = clientToWorld(event.clientX, event.clientY);
              drag.current = {
                kind: "node",
                indices:
                  event.shiftKey && selectedNodeIndices.includes(index)
                    ? selectedNodeIndices
                    : [index],
                source: structuredClone(element),
                startWorld: world,
              };
            }}
            onPointerMove={(event) => {
              if (
                drag.current?.kind !== "node" ||
                !event.currentTarget.hasPointerCapture(event.pointerId)
              )
                return;

              const currentWorld = clientToWorld(event.clientX, event.clientY);
              const currentLocal = worldToLocal(drag.current.source, currentWorld);
              const startLocal = worldToLocal(drag.current.source, drag.current.startWorld);
              const deltaNormX =
                (currentLocal.x - startLocal.x) / Math.max(1, drag.current.source.width);
              const deltaNormY =
                (currentLocal.y - startLocal.y) / Math.max(1, drag.current.source.height);

              let updated = [...drag.current.source.nodes];
              for (const idx of drag.current.indices) {
                const orig = drag.current.source.nodes[idx];
                if (orig) {
                  updated = moveVectorPathNode(updated, idx, {
                    x: orig.x + deltaNormX,
                    y: orig.y + deltaNormY,
                  });
                }
              }

              previewElements([
                {
                  id: element.id,
                  patch: { nodes: updated },
                },
              ]);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              drag.current = null;
              const normalized = recomputeVectorPathBounds(element, 16);
              updateElements([{ id: element.id, patch: normalized }], "update vector bounds");
            }}
          />
        );
      })}
    </svg>
  );
}

function buildVectorPathGuide(
  element: VectorPathElement,
  worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
): string {
  if (element.nodes.length < 2) return "";
  const paths: string[] = [];
  for (const { start, end } of getVectorPathSubpathRanges(element)) {
    if (end - start < 2) continue;
    let path = `M ${formatPoint(screenNodePoint(element, element.nodes[start], worldToScreen))}`;
    for (let index = start + 1; index < end; index++) {
      path += appendGuideSegment(element, index - 1, index, worldToScreen);
    }
    if (element.closed) {
      path += appendGuideSegment(element, end - 1, start, worldToScreen);
      path += " Z";
    }
    paths.push(path);
  }
  return paths.join(" ");
}

function screenNodePoint(
  element: VectorPathElement,
  node: VectorPathElement["nodes"][number],
  worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
) {
  return worldToScreen(
    localToWorld(element, {
      x: node.x * element.width,
      y: node.y * element.height,
    }),
  );
}

function appendGuideSegment(
  element: VectorPathElement,
  fromIndex: number,
  toIndex: number,
  worldToScreen: (point: { x: number; y: number }) => { x: number; y: number },
): string {
  const from = element.nodes[fromIndex];
  const to = element.nodes[toIndex];
  if (!from || !to) return "";
  const end = screenNodePoint(element, to, worldToScreen);
  if (!from.out && !to.in) return ` L ${formatPoint(end)}`;
  const out = from.out ?? [0, 0];
  const incoming = to.in ?? [0, 0];
  const control1 = worldToScreen(
    localToWorld(element, {
      x: (from.x + out[0]) * element.width,
      y: (from.y + out[1]) * element.height,
    }),
  );
  const control2 = worldToScreen(
    localToWorld(element, {
      x: (to.x + incoming[0]) * element.width,
      y: (to.y + incoming[1]) * element.height,
    }),
  );
  return ` C ${formatPoint(control1)}, ${formatPoint(control2)}, ${formatPoint(end)}`;
}

function formatPoint(point: { x: number; y: number }): string {
  return `${point.x} ${point.y}`;
}

function shiftSubpathStartsAfterInsert(
  starts: number[] | undefined,
  index: number,
): number[] | undefined {
  return starts?.map((start) => (start >= index ? start + 1 : start));
}

function shiftSubpathStartsAfterDelete(
  starts: number[] | undefined,
  index: number,
): number[] | undefined {
  return starts?.map((start) => (start > index ? start - 1 : start));
}
