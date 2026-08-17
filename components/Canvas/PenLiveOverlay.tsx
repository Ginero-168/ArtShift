export type PenNode = {
  x: number;
  y: number;
  in?: [number, number];
  out?: [number, number];
};

type Props = {
  nodes: PenNode[];
  cursor?: { x: number; y: number } | null;
  worldToScreen: (point: { x: number; y: number }) => { x: number; y: number };
  isClosingHover?: boolean;
};

export default function PenLiveOverlay({ nodes, cursor, worldToScreen, isClosingHover }: Props) {
  if (nodes.length === 0 && !cursor) return null;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 25,
        overflow: "visible",
      }}
    >
      {/* 1. Draw all handle lines first so anchor points render on top */}
      {nodes.map((node, i) => {
        const anchor = worldToScreen({ x: node.x, y: node.y });
        const hIn = node.in
          ? worldToScreen({ x: node.x + node.in[0], y: node.y + node.in[1] })
          : null;
        const hOut = node.out
          ? worldToScreen({ x: node.x + node.out[0], y: node.y + node.out[1] })
          : null;

        return (
          <g key={`handles-${node.x}-${node.y}-${i}`}>
            {hIn ? (
              <g>
                <line
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={hIn.x}
                  y2={hIn.y}
                  stroke="#2563eb"
                  strokeWidth="1.5"
                />
                <circle
                  cx={hIn.x}
                  cy={hIn.y}
                  r="3.5"
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth="1.5"
                />
              </g>
            ) : null}

            {hOut ? (
              <g>
                <line
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={hOut.x}
                  y2={hOut.y}
                  stroke="#2563eb"
                  strokeWidth="1.5"
                />
                <circle
                  cx={hOut.x}
                  cy={hOut.y}
                  r="3.5"
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth="1.5"
                />
              </g>
            ) : null}
          </g>
        );
      })}

      {/* 2. Draw square anchor points for every node */}
      {nodes.map((node, i) => {
        const anchor = worldToScreen({ x: node.x, y: node.y });
        const isFirst = i === 0;

        return (
          <g key={`anchor-${node.x}-${node.y}-${i}`}>
            {isFirst && isClosingHover ? (
              <circle
                cx={anchor.x}
                cy={anchor.y}
                r="9"
                fill="rgba(59, 130, 246, 0.15)"
                stroke="#2563eb"
                strokeWidth="1.8"
                strokeDasharray="3 2"
              />
            ) : null}
            <rect
              x={anchor.x - 4}
              y={anchor.y - 4}
              width="8"
              height="8"
              fill={isFirst && isClosingHover ? "#2563eb" : "#ffffff"}
              stroke="#2563eb"
              strokeWidth="1.8"
              rx="1"
            />
          </g>
        );
      })}
    </svg>
  );
}
