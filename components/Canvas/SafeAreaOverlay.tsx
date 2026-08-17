"use client";

import type { WorldPoint } from "./CanvasRoot";

export type SafeAreaMode = "none" | "tiktok-reels" | "ig-story" | "print-bleed";

type Props = {
  mode: SafeAreaMode;
  slideWidth: number;
  slideHeight: number;
  worldToScreen: (p: WorldPoint) => { x: number; y: number };
};

export default function SafeAreaOverlay({ mode, slideWidth, slideHeight, worldToScreen }: Props) {
  if (mode === "none") return null;

  // Slide corners in screen space
  const tl = worldToScreen({ x: 0, y: 0 });
  const br = worldToScreen({ x: slideWidth, y: slideHeight });
  const width = br.x - tl.x;
  const height = br.y - tl.y;
  const scale = width / Math.max(1, slideWidth);

  if (mode === "tiktok-reels") {
    // 9:16 TikTok / Reels overlay
    const topBarHeight = 140 * scale;
    const bottomBarHeight = 360 * scale;
    const rightZoneWidth = 130 * scale;
    const rightZoneTop = 680 * scale;
    const rightZoneHeight = 720 * scale;

    return (
      <svg
        style={{
          position: "absolute",
          left: tl.x,
          top: tl.y,
          width,
          height,
          pointerEvents: "none",
          zIndex: 8,
        }}
      >
        {/* Top Restricted Bar (Account / Search) */}
        <rect
          x={0}
          y={0}
          width={width}
          height={topBarHeight}
          fill="rgba(239, 68, 68, 0.12)"
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={width / 2}
          y={topBarHeight / 2 + 4}
          fill="#ef4444"
          fontSize={11}
          fontWeight="bold"
          textAnchor="middle"
        >
          TIKTOK / REELS TOP HEADER (DANGER ZONE)
        </text>

        {/* Bottom Restricted Bar (Captions, Audio, CTA) */}
        <rect
          x={0}
          y={height - bottomBarHeight}
          width={width}
          height={bottomBarHeight}
          fill="rgba(239, 68, 68, 0.14)"
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={width / 2}
          y={height - bottomBarHeight / 2 + 4}
          fill="#ef4444"
          fontSize={11}
          fontWeight="bold"
          textAnchor="middle"
        >
          TIKTOK CAPTIONS & MUSIC ZONE (KEEP BOOK COPY ABOVE)
        </text>

        {/* Right-Side Interactive Zone (Like, Comment, Share icons) */}
        <rect
          x={width - rightZoneWidth}
          y={rightZoneTop}
          width={rightZoneWidth}
          height={rightZoneHeight}
          fill="rgba(245, 158, 11, 0.15)"
          stroke="#f59e0b"
          strokeWidth={1}
          strokeDasharray="4 4"
          rx={8}
        />
        <text
          x={width - rightZoneWidth / 2}
          y={rightZoneTop + rightZoneHeight / 2}
          fill="#f59e0b"
          fontSize={10}
          fontWeight="bold"
          textAnchor="middle"
        >
          SIDE ICONS
        </text>

        {/* Safe Core Area Border */}
        <rect
          x={24 * scale}
          y={topBarHeight + 10 * scale}
          width={width - rightZoneWidth - 30 * scale}
          height={height - topBarHeight - bottomBarHeight - 20 * scale}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  if (mode === "ig-story") {
    const topBarHeight = 160 * scale;
    const bottomBarHeight = 180 * scale;

    return (
      <svg
        style={{
          position: "absolute",
          left: tl.x,
          top: tl.y,
          width,
          height,
          pointerEvents: "none",
          zIndex: 8,
        }}
      >
        {/* Top Story Header */}
        <rect
          x={0}
          y={0}
          width={width}
          height={topBarHeight}
          fill="rgba(239, 68, 68, 0.12)"
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={width / 2}
          y={topBarHeight / 2 + 4}
          fill="#ef4444"
          fontSize={11}
          fontWeight="bold"
          textAnchor="middle"
        >
          INSTAGRAM STORY HEADER ZONE
        </text>

        {/* Bottom Reply Bar */}
        <rect
          x={0}
          y={height - bottomBarHeight}
          width={width}
          height={bottomBarHeight}
          fill="rgba(239, 68, 68, 0.12)"
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={width / 2}
          y={height - bottomBarHeight / 2 + 4}
          fill="#ef4444"
          fontSize={11}
          fontWeight="bold"
          textAnchor="middle"
        >
          INSTAGRAM REPLY / MESSAGE BAR
        </text>

        {/* Safe Core Area */}
        <rect
          x={30 * scale}
          y={topBarHeight + 10 * scale}
          width={width - 60 * scale}
          height={height - topBarHeight - bottomBarHeight - 20 * scale}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  if (mode === "print-bleed") {
    const bleedMargin = 28 * scale;
    const safeMargin = 60 * scale;

    return (
      <svg
        style={{
          position: "absolute",
          left: tl.x,
          top: tl.y,
          width,
          height,
          pointerEvents: "none",
          zIndex: 8,
        }}
      >
        {/* Bleed line (Trim boundary) */}
        <rect
          x={bleedMargin}
          y={bleedMargin}
          width={width - bleedMargin * 2}
          height={height - bleedMargin * 2}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={1.5}
          strokeDasharray="6 3"
        />
        <text
          x={bleedMargin + 8}
          y={bleedMargin + 14}
          fill="#06b6d4"
          fontSize={10}
          fontWeight="bold"
        >
          TRIM LINE (3mm)
        </text>

        {/* Title Safe Line */}
        <rect
          x={safeMargin}
          y={safeMargin}
          width={width - safeMargin * 2}
          height={height - safeMargin * 2}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1}
        />
        <text x={safeMargin + 8} y={safeMargin + 14} fill="#22c55e" fontSize={10} fontWeight="bold">
          TITLE / CONTENT SAFE ZONE
        </text>
      </svg>
    );
  }

  return null;
}
