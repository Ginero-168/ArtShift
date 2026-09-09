"use client";

import { useEffect, useRef, useState } from "react";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { parseInlineTagTokens } from "@/lib/ai/orchestration/inlineTagSynthesis";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import ImageReferencePreview from "./ImageReferencePreview";

type Props = {
  content: string;
  imageRefs?: readonly ComposerImageRef[];
  onSelect?: (fileId?: string) => void;
  style?: React.CSSProperties;
};

export default function InlineTagRenderer({ content, imageRefs = [], onSelect, style }: Props) {
  const [, rerender] = useState(0);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeImageCache(() => rerender((v) => v + 1)), []);
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const segments = parseInlineTagTokens(content);
  const hasTags = segments.some((s) => s.type === "tag");

  if (!hasTags) {
    return <span style={style}>{content}</span>;
  }

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setActivePreviewId(null);
      setAnchor(null);
    }, 140);
  };

  const openPreview = (el: HTMLElement, id: string) => {
    cancelClose();
    setActivePreviewId(id);
    setAnchor(el);
  };

  const activeRef = imageRefs.find((r) => r.objectId === activePreviewId);
  const activeDataUrl = activeRef ? getCached(activeRef.fileId)?.dataURL : undefined;

  return (
    <span style={{ display: "inline", ...style }}>
      {segments.map((seg, idx) => {
        if (seg.type === "text") {
          return <span key={`text-${idx}`}>{seg.text}</span>;
        }

        // Tag segment
        const matchedRef = imageRefs.find(
          (r) =>
            r.objectId === seg.objectId ||
            r.displayName.toLowerCase() === seg.displayName.toLowerCase(),
        );
        const dataUrl = matchedRef ? getCached(matchedRef.fileId)?.dataURL : undefined;

        return (
          <span
            key={`tag-${seg.objectId}-${idx}`}
            role="button"
            tabIndex={0}
            data-testid={`inline-tag-pill-${seg.objectId}`}
            title={`@${seg.displayName} · คลิกเพื่อเลือกบน Canvas`}
            onClick={() => onSelect?.(matchedRef?.fileId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onSelect?.(matchedRef?.fileId);
              }
            }}
            onPointerEnter={(e) => openPreview(e.currentTarget, seg.objectId)}
            onPointerLeave={scheduleClose}
            onFocus={(e) => openPreview(e.currentTarget, seg.objectId)}
            onBlur={scheduleClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3.5,
              verticalAlign: "middle",
              padding: "1px 6px 1px 2px",
              margin: "0 2px",
              borderRadius: 9999,
              height: 20,
              boxSizing: "border-box",
              background: "rgba(255, 255, 255, 0.22)",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
              cursor: "pointer",
              userSelect: "none",
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.32)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.22)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
            }}
          >
            {dataUrl ? (
              // biome-ignore lint/performance/noImgElement: local thumbnail for inline tag pill
              <img
                src={dataUrl}
                alt=""
                draggable={false}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: "rgba(255, 255, 255, 0.3)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
            )}
            <span
              style={{
                maxWidth: 110,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              @{seg.displayName}
            </span>
          </span>
        );
      })}

      {activeRef && anchor ? (
        <ImageReferencePreview
          anchor={anchor}
          dataUrl={activeDataUrl}
          displayName={activeRef.displayName}
          width={activeRef.sourceWidth}
          height={activeRef.sourceHeight}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          onClose={() => {
            setActivePreviewId(null);
            setAnchor(null);
          }}
        />
      ) : null}
    </span>
  );
}
