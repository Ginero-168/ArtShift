"use client";

import type { SVGProps } from "react";
import type { BuilderBlockKind } from "@/lib/builder/blocks";

type Props = SVGProps<SVGSVGElement> & {
  kind: BuilderBlockKind;
  size?: number;
};

export function BlockIcon({ kind, size = 20, ...props }: Props) {
  const s = size;
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };

  switch (kind) {
    case "text":
    case "heading":
    case "subtitle":
    case "synopsis":
    case "author":
    case "metadata":
      return (
        <svg {...common}>
          <path d="M4 6V4h16v2" />
          <path d="M12 4v16" />
          <path d="M8 20h8" />
        </svg>
      );

    case "quote":
      return (
        <svg {...common}>
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 0 4-1 6-1 8zm14 0c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 0 4-1 6-1 8z" />
        </svg>
      );

    case "coverImage":
      return (
        <svg {...common}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M6 6h10" />
          <path d="M6 10h7" />
        </svg>
      );

    case "bookMockup":
      return (
        <svg {...common}>
          <path d="m4 6 8-3 8 3v13l-8 3-8-3Z" />
          <path d="M12 3v16" />
          <path d="M4 6v13" />
          <path d="M20 6v13" />
        </svg>
      );

    case "supportingImage":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      );

    // Frame Masks
    case "frameCircle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5a1.2 1.2 0 1 0 0 .01" strokeWidth="2.5" />
          <path d="M6 16c2-2 4-1 6-3s4-1 6 2" />
        </svg>
      );

    case "framePolaroid":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <rect x="6" y="5" width="12" height="10" rx="1" />
        </svg>
      );

    case "frameArch":
      return (
        <svg {...common}>
          <path d="M5 21V11a7 7 0 0 1 14 0v10Z" />
          <path d="M8 21v-8a4 4 0 0 1 8 0v8" />
        </svg>
      );

    case "frameHeart":
      return (
        <svg {...common}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          <path d="M12 11a1.5 1.5 0 1 0 0 .01" strokeWidth="2" />
        </svg>
      );

    case "frameStar":
      return (
        <svg {...common}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );

    case "frameRounded":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="6" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m21 15-5-5-7 7" />
        </svg>
      );

    case "frameHexagon":
      return (
        <svg {...common}>
          <polygon points="12 2 20.66 7 20.66 17 12 22 3.34 17 3.34 7" />
          <circle cx="12" cy="8" r="1.5" />
          <path d="M6 17l4-4 3 2 5-5" />
        </svg>
      );

    // Basic Shapes
    case "shapeRect":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      );

    case "shapeEllipse":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );

    case "shapeDiamond":
      return (
        <svg {...common}>
          <polygon points="12 3 21 12 12 21 3 12" />
        </svg>
      );

    case "shapeTriangle":
      return (
        <svg {...common}>
          <polygon points="12 4 21 20 3 20" />
        </svg>
      );

    case "shapeStar":
      return (
        <svg {...common}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );

    case "shapeHexagon":
      return (
        <svg {...common}>
          <polygon points="12 2 20.66 7 20.66 17 12 22 3.34 17 3.34 7" />
        </svg>
      );

    case "shapeHeart":
      return (
        <svg {...common}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      );

    case "shapePlus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" strokeWidth="2.5" />
        </svg>
      );

    // Lines & Drawing
    case "shapeLine":
      return (
        <svg {...common}>
          <path d="M4 20 20 4" strokeWidth="2.2" />
        </svg>
      );

    case "shapeArrow":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" strokeWidth="2" />
        </svg>
      );

    case "shapeDoubleArrow":
      return (
        <svg {...common}>
          <path d="m7 7-4 5 4 5M17 7l4 5-4 5M3 12h18" strokeWidth="2" />
        </svg>
      );

    case "shapeDashedLine":
      return (
        <svg {...common}>
          <path d="M3 12h18" strokeWidth="2.5" strokeDasharray="3 3" />
        </svg>
      );

    case "shapeCurvedArrow":
      return (
        <svg {...common}>
          <path d="M4 19a12 12 0 0 1 15-11M14 8h5V3" strokeWidth="2" />
        </svg>
      );

    case "shapeFreedraw":
      return (
        <svg {...common}>
          <path d="m12 19 7-7 3 3-7 7-3-3z" />
          <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z" />
          <path
            d="M2 20c2-1.5 4 1.5 6 0s4-1.5 6 0"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );

    case "shapePen":
      return (
        <svg {...common}>
          <path d="m12 19 7-7 3 3-7 7-3-3z" />
          <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      );

    // Commerce
    case "cta":
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="3" />
          <path d="m11 10 2 2-2 2M13 12H8" strokeWidth="1.8" />
        </svg>
      );

    case "badge":
      return (
        <svg {...common}>
          <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );

    case "badgeStarburst":
      return (
        <svg {...common}>
          <path d="M12 2l2.2 4.5 4.9-1.2-1.2 4.9 4.5 2.2-4.5 2.2 1.2 4.9-4.9-1.2L12 22l-2.2-4.5-4.9 1.2 1.2-4.9L1.6 12l4.5-2.2-1.2-4.9 4.9 1.2z" />
          <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );

    case "badgeFlash":
      return (
        <svg {...common}>
          <path d="M12 2l1.6 3.5 3.8-.5-.8 3.8 3.5 1.6-3.5 1.6.8 3.8-3.8-.5L12 22l-1.6-3.5-3.8.5.8-3.8L4.1 12l3.5-1.6-.8-3.8 3.8.5z" />
          <path d="M13 8l-3 4h3l-1 4 4-5h-3z" fill="currentColor" strokeWidth="0" />
        </svg>
      );

    case "badgeRibbon":
      return (
        <svg {...common}>
          <path d="M3 7h18l-3 5 3 5H3l3-5-3-5z" />
          <path d="M7 10h10M7 14h6" strokeWidth="1.2" />
        </svg>
      );

    case "badgeSeal":
      return (
        <svg {...common}>
          <path d="M12 3a3 3 0 0 0-2.1.9 3 3 0 0 0-3 0 3 3 0 0 0-2.1 2.1 3 3 0 0 0 0 3 3 3 0 0 0-.9 2.1 3 3 0 0 0 .9 2.1 3 3 0 0 0 0 3 3 3 0 0 0 2.1 2.1 3 3 0 0 0 3 0 3 3 0 0 0 2.1.9 3 3 0 0 0 2.1-.9 3 3 0 0 0 3 0 3 3 0 0 0 2.1-2.1 3 3 0 0 0 0-3 3 3 0 0 0 .9-2.1 3 3 0 0 0-.9-2.1 3 3 0 0 0 0-3 3 3 0 0 0-2.1-2.1 3 3 0 0 0-3 0A3 3 0 0 0 12 3z" />
          <path d="m9.5 12 1.8 1.8 3.7-3.7" />
        </svg>
      );

    case "badgePriceTag":
      return (
        <svg {...common}>
          <path d="M7 3h14v18H3V7l4-4z" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="M11 12h6M11 16h4" strokeWidth="1.2" />
        </svg>
      );

    case "badgeBookmark":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-6-4-6 4V3z" />
          <path d="M10 7h4M10 11h4" strokeWidth="1.2" />
        </svg>
      );

    case "price":
    case "salePrice":
      return (
        <svg {...common}>
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );

    // Structure
    case "panel":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M3 10h18" strokeWidth="1.2" />
        </svg>
      );

    case "divider":
      return (
        <svg {...common}>
          <path d="M3 12h18" strokeWidth="2.5" strokeDasharray="3 3" />
        </svg>
      );

    case "spacer":
      return (
        <svg {...common}>
          <path d="M12 4v16M8 7l4-3 4 3M8 17l4 3 4-3" />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
  }
}
