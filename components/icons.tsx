"use client";

import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

function svg(size: number | undefined, children: React.ReactNode, props: Props) {
  const s = size ?? 16;
  const { size: _ignored, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconBrand = (p: Props) =>
  svg(p.size, <path d="M4 20V6l4 8 4-8 4 8 4-8v14" strokeWidth="2.2" />, p);

export const IconPalette = (p: Props) =>
  svg(
    p.size,
    <>
      <circle cx="13.5" cy="6.5" r="0.9" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.9" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.9" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.9" fill="currentColor" />
      <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 3-4 3h-2a2 2 0 0 0-1 3.7 2 2 0 0 1-3 3.3Z" />
    </>,
    p,
  );

export const IconDownload = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>,
    p,
  );

export const IconCursor = (p: Props) => svg(p.size, <path d="M4 3l7 17 2.5-7 7-2.5Z" />, p);
export const IconDirectSelect = (p: Props) =>
  svg(
    p.size,
    <path d="M4 3l7 17 2.5-7 7-2.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />,
    p,
  );

export const IconText = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M5 6V4h14v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>,
    p,
  );

export const IconSquare = (p: Props) =>
  svg(p.size, <rect x="4" y="4" width="16" height="16" rx="2" />, p);

export const IconCircle = (p: Props) => svg(p.size, <circle cx="12" cy="12" r="8" />, p);

export const IconTriangle = (p: Props) => svg(p.size, <path d="M12 4 3 20h18Z" />, p);

export const IconStar = (p: Props) =>
  svg(
    p.size,
    <path
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      fill="none"
      strokeWidth="1.8"
    />,
    p,
  );

export const IconHexagon = (p: Props) =>
  svg(p.size, <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" />, p);

export const IconHeart = (p: Props) =>
  svg(
    p.size,
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    p,
  );

export const IconPlus = (p: Props) => svg(p.size, <path d="M12 5v14M5 12h14" />, p);

export const IconLine = (p: Props) => svg(p.size, <path d="M4 20 20 4" />, p);

export const IconArrow = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </>,
    p,
  );

export const IconImage = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </>,
    p,
  );

export const IconUndo = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10H8" />
    </>,
    p,
  );

export const IconRedo = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h7" />
    </>,
    p,
  );

export const IconSparkles = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M12 3 13.5 8 19 9.5 13.5 11 12 16 10.5 11 5 9.5 10.5 8Z" />
      <path d="M19 15v4" />
      <path d="M17 17h4" />
    </>,
    p,
  );

export const IconReturn = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M9 10H19v6" />
      <path d="m13 14-4-4 4-4" />
    </>,
    p,
  );

export const IconSend = (p: Props) => svg(p.size, <path d="m4 12 16-8-5 18-3-8Z" />, p);

export const IconBold = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M7 4h6a4 4 0 0 1 0 8H7Z" />
      <path d="M7 12h7a4 4 0 0 1 0 8H7Z" />
    </>,
    p,
  );

export const IconItalic = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M14 4h-4" />
      <path d="M14 20h-4" />
      <path d="M15 4 9 20" />
    </>,
    p,
  );

export const IconAlignLeft = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="4"
        y1="3"
        x2="4"
        y2="21"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="7" y="5" width="13" height="5" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="7" y="14" width="8" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconAlignCenter = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M5 18h14" />
    </>,
    p,
  );

export const IconAlignCenterH = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="12"
        y1="3"
        x2="12"
        y2="21"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="5.5" y="5" width="13" height="5" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="8" y="14" width="8" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconAlignRight = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="20"
        y1="3"
        x2="20"
        y2="21"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="4" y="5" width="13" height="5" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="9" y="14" width="8" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconAlignTop = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="3"
        y1="4"
        x2="21"
        y2="4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="5" y="7" width="5" height="13" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="14" y="7" width="5" height="8" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconAlignMiddleV = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="3"
        y1="12"
        x2="21"
        y2="12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="5" y="5.5" width="5" height="13" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="14" y="8" width="5" height="8" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconAlignBottom = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="3"
        y1="20"
        x2="21"
        y2="20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="5" y="4" width="5" height="13" rx="1.5" fill="currentColor" stroke="none" />
      <rect x="14" y="9" width="5" height="8" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconDistributeH = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="3"
        y1="3"
        x2="3"
        y2="21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="21"
        y1="3"
        x2="21"
        y2="21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="8.5" y="6" width="7" height="12" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconDistributeV = (p: Props) =>
  svg(
    p.size,
    <>
      <line
        x1="3"
        y1="3"
        x2="21"
        y2="3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="3"
        y1="21"
        x2="21"
        y2="21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="6" y="8.5" width="12" height="7" rx="1.5" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const IconFront = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="3" y="3" width="12" height="12" rx="1.5" />
      <rect x="9" y="9" width="12" height="12" rx="1.5" fill="currentColor" fillOpacity="0.15" />
    </>,
    p,
  );

export const IconBack = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="9" y="9" width="12" height="12" rx="1.5" />
      <rect x="3" y="3" width="12" height="12" rx="1.5" fill="currentColor" fillOpacity="0.15" />
    </>,
    p,
  );

export const IconLock = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </>,
    p,
  );

export const IconUnlock = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0" />
    </>,
    p,
  );

export const IconEye = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>,
    p,
  );

export const IconEyeOff = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </>,
    p,
  );

export const IconTrash = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7v14h12V7" />
    </>,
    p,
  );

export const IconChevronDown = (p: Props) => svg(p.size, <path d="m6 9 6 6 6-6" />, p);

export const IconGripVertical = (p: Props) =>
  svg(
    p.size,
    <>
      <circle cx="9" cy="6" r="1.25" fill="currentColor" />
      <circle cx="9" cy="12" r="1.25" fill="currentColor" />
      <circle cx="9" cy="18" r="1.25" fill="currentColor" />
      <circle cx="15" cy="6" r="1.25" fill="currentColor" />
      <circle cx="15" cy="12" r="1.25" fill="currentColor" />
      <circle cx="15" cy="18" r="1.25" fill="currentColor" />
    </>,
    p,
  );

export const IconSlides = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="3" y="5" width="18" height="12" rx="1.5" />
      <path d="M7 20h10" />
    </>,
    p,
  );

export const IconCopy = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>,
    p,
  );

/* ——— Excalidraw-style icons ——— */

export const IconHand = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M18 11V6a2 2 0 0 0-4 0v3" />
      <path d="M14 10V4a2 2 0 0 0-4 0v6" />
      <path d="M10 10V5a2 2 0 0 0-4 0v9a7 7 0 0 0 14 0v-4a2 2 0 0 0-4 0" />
    </>,
    p,
  );

export const IconDiamond = (p: Props) => svg(p.size, <path d="M12 2 22 12 12 22 2 12Z" />, p);

export const IconPen = (p: Props) =>
  svg(
    p.size,
    <>
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        strokeWidth="0"
        fill="none"
      />
      <path d="M12 20c-4-8 0-16 0-16s8 4 4 10c-2 3-4 6-4 6Z" />
    </>,
    p,
  );

export const IconFreedraw = (p: Props) =>
  svg(p.size, <path d="M4 20C8 16 10 10 14 8c2-1 4 1 6-4" />, p);

export const IconEraser = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </>,
    p,
  );

export const IconMenu = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>,
    p,
  );

export const IconLink = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>,
    p,
  );

export const IconDuplicate = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>,
    p,
  );

export const IconLockOpen = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0" />
    </>,
    p,
  );

export const IconGroup = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="2" y="2" width="8" height="8" rx="1" />
      <rect x="14" y="14" width="8" height="8" rx="1" />
      <path d="M12 2h6a2 2 0 0 1 2 2v6" />
      <path d="M2 12v6a2 2 0 0 0 2 2h6" />
    </>,
    p,
  );

/* ——— Visual property icons (Excalidraw-style) ——— */

/** Thin stroke line */
export const IconStrokeThin = (p: Props) => svg(p.size, <path d="M4 12h16" strokeWidth="1" />, p);

/** Medium stroke line */
export const IconStrokeMed = (p: Props) => svg(p.size, <path d="M4 12h16" strokeWidth="2.5" />, p);

/** Thick stroke line */
export const IconStrokeThick = (p: Props) =>
  svg(p.size, <path d="M4 12h16" strokeWidth="4.5" />, p);

/** Solid line style */
export const IconLineSolid = (p: Props) => svg(p.size, <path d="M4 12h16" strokeWidth="2" />, p);

/** Dashed line style */
export const IconLineDashed = (p: Props) =>
  svg(p.size, <path d="M4 12h16" strokeWidth="2" strokeDasharray="6 3" />, p);

/** Dotted line style */
export const IconLineDotted = (p: Props) =>
  svg(p.size, <path d="M4 12h16" strokeWidth="2" strokeDasharray="2 3" />, p);

/** Architect (clean) roughness */
export const IconSloppyClean = (p: Props) =>
  svg(p.size, <path d="M4 12h16" strokeWidth="1.5" />, p);

/** Artist (normal) roughness */
export const IconSloppyNormal = (p: Props) =>
  svg(p.size, <path d="M4 13c2-1 4-3 6-2s4 3 6 2 4-3 4-2" strokeWidth="1.5" />, p);

/** Cartoonist (rough) roughness */
export const IconSloppyRough = (p: Props) =>
  svg(p.size, <path d="M3 14c1-2 2-4 4-3s2 4 4 3 2-4 4-3 2 4 4 3 2-3 2-3" strokeWidth="1.5" />, p);

/** Hachure fill */
export const IconFillHachure = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5" />
      <path
        d="M8 4 4 8M12 4 4 12M16 4 4 16M20 4 4 20M20 8 8 20M20 12 12 20M20 16 16 20"
        strokeWidth="0.8"
        opacity="0.6"
      />
    </>,
    p,
  );

/** Cross-hatch fill */
export const IconFillCrossHatch = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5" />
      <path
        d="M8 4 4 8M14 4 4 14M20 4 4 20M20 10 10 20M20 16 16 20"
        strokeWidth="0.8"
        opacity="0.6"
      />
      <path
        d="M16 4 20 8M10 4 20 14M4 4 20 20M4 10 14 20M4 16 8 20"
        strokeWidth="0.8"
        opacity="0.6"
      />
    </>,
    p,
  );

/** Solid fill */
export const IconFillSolid = (p: Props) =>
  svg(
    p.size,
    <rect
      x="4"
      y="4"
      width="16"
      height="16"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
      strokeWidth="1.5"
    />,
    p,
  );

/** No fill */
export const IconFillNone = (p: Props) =>
  svg(p.size, <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5" />, p);

/** Send to back */
export const IconSendToBack = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.2" />
      <rect x="12" y="12" width="8" height="8" rx="1" />
      <path d="M4 16v2a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    </>,
    p,
  );

/** Send backward */
export const IconSendBackward = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M14 4v10H4" />
      <path d="m5 13 5-5" />
    </>,
    p,
  );

/** Bring forward */
export const IconBringForward = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M10 20V10h10" />
      <path d="m19 11-5 5" />
    </>,
    p,
  );

/** Bring to front */
export const IconBringToFront = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="12" y="12" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.2" />
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <path d="M20 8v-2a2 2 0 0 0-2-2h-2" />
      <path d="M8 20h-2a2 2 0 0 1-2-2v-2" />
    </>,
    p,
  );

/** Settings / Gear */
export const IconSettings = (p: Props) =>
  svg(
    p.size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    p,
  );

/** Library / Collection */
export const IconLibrary = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1" strokeWidth="1.5" />
    </>,
    p,
  );

/** Stats / Bar chart */
export const IconStats = (p: Props) =>
  svg(
    p.size,
    <>
      <path d="M6 20V10" strokeWidth="1.8" />
      <path d="M12 20V4" strokeWidth="1.8" />
      <path d="M18 20v-8" strokeWidth="1.8" />
    </>,
    p,
  );

export const IconGrid = (p: Props) =>
  svg(
    p.size,
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
    </>,
    p,
  );

export const IconZoomIn = (p: Props) =>
  svg(
    p.size,
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <path d="M11 8v6M8 11h6" />
    </>,
    p,
  );

export const IconZoomOut = (p: Props) =>
  svg(
    p.size,
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <path d="M8 11h6" />
    </>,
    p,
  );

/** Illustrator-style Pathfinder icons */
export const IconPathfinderUnite = (p: Props) =>
  svg(
    p.size,
    <>
      <rect
        x="3"
        y="3"
        width="11"
        height="11"
        rx="1.5"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="10"
        y="10"
        width="11"
        height="11"
        rx="1.5"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>,
    p,
  );

export const IconPathfinderMinusFront = (p: Props) =>
  svg(
    p.size,
    <>
      <rect
        x="3"
        y="3"
        width="11"
        height="11"
        rx="1.5"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="10"
        y="10"
        width="11"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
    </>,
    p,
  );

export const IconPathfinderIntersect = (p: Props) =>
  svg(
    p.size,
    <>
      <rect
        x="3"
        y="3"
        width="11"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
      <rect
        x="10"
        y="10"
        width="11"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
      <rect
        x="10"
        y="10"
        width="4"
        height="4"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
      />
    </>,
    p,
  );

export const IconPathfinderExclude = (p: Props) =>
  svg(
    p.size,
    <>
      <rect
        x="3"
        y="3"
        width="11"
        height="11"
        rx="1.5"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="10"
        y="10"
        width="11"
        height="11"
        rx="1.5"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="10"
        y="10"
        width="4"
        height="4"
        fill="var(--surface-solid, #fff)"
        stroke="currentColor"
        strokeWidth="1"
      />
    </>,
    p,
  );

export const IconPathfinderMinusBack = (p: Props) =>
  svg(
    p.size,
    <>
      <rect
        x="3"
        y="3"
        width="11"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 2"
      />
      <rect
        x="10"
        y="10"
        width="11"
        height="11"
        rx="1.5"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>,
    p,
  );

export const IconPathfinderDivide = (p: Props) =>
  svg(
    p.size,
    <>
      <rect
        x="3"
        y="3"
        width="11"
        height="11"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="10"
        y="10"
        width="11"
        height="11"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line x1="3" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="3" x2="10" y2="14" stroke="currentColor" strokeWidth="1" />
    </>,
    p,
  );
