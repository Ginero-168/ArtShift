"use client";

import { useEffect, useRef, useState } from "react";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { parseInlineTagTokens } from "@/lib/ai/orchestration/inlineTagSynthesis";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import ImageReferencePreview from "./ImageReferencePreview";

type Props = {
  content: string;
  imageRefs?: readonly ComposerImageRef[];
  onSelect?: (fileId?: string) => void;
  style?: React.CSSProperties;
  theme?: "light" | "dark";
};

export default function InlineTagRenderer({
  content,
  imageRefs = [],
  onSelect,
  style,
  theme = "light",
}: Props) {
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

  const isLight = theme === "light";

  return (
    <span style={{ display: "inline", ...style }}>
      {segments.map((seg, idx) => {
        if (seg.type === "text") {
          return <span key={`text-${idx}`}>{seg.text}</span>;
        }

        // Tag segment
        let matchedRef = imageRefs.find(
          (r) =>
            r.objectId === seg.objectId ||
            r.displayName.toLowerCase() === seg.displayName.toLowerCase(),
        );

        let dataUrl = matchedRef ? getCached(matchedRef.fileId)?.dataURL : undefined;
        let effectiveFileId = matchedRef?.fileId;

        // Fallback: search current slide elements if not in passed imageRefs
        if (!dataUrl) {
          const slide = useEngine.getState().currentSlide();
          const el = slide?.elements.find(
            (candidate) =>
              !candidate.isDeleted &&
              (candidate.id === seg.objectId || candidate.name === seg.displayName),
          );
          if (el && "fileId" in el && typeof (el as any).fileId === "string") {
            effectiveFileId = (el as any).fileId;
            dataUrl = getCached(effectiveFileId!)?.dataURL;
            if (!matchedRef) {
              matchedRef = {
                objectId: el.id,
                elementVersion: el.version,
                fileId: effectiveFileId!,
                displayName: (el as any).sourceName || el.name || seg.displayName,
                sourceWidth: (el as any).naturalWidth || el.width,
                sourceHeight: (el as any).naturalHeight || el.height,
                width: el.width,
                height: el.height,
                angle: el.angle,
              };
            }
          }
        }

        const activeRef = activePreviewId === seg.objectId ? matchedRef : null;
        const activeDataUrl = activeRef ? getCached(activeRef.fileId)?.dataURL : undefined;

        return (
          <span
            key={`tag-${seg.objectId}-${idx}`}
            role="button"
            tabIndex={0}
            data-testid={`inline-tag-pill-${seg.objectId}`}
            title={`@${seg.displayName} · คลิกเพื่อเลือกบน Canvas`}
            onClick={() => onSelect?.(effectiveFileId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onSelect?.(effectiveFileId);
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
              padding: "1px 6px 1px 2.5px",
              margin: "0 2px",
              borderRadius: 9999,
              height: 21,
              boxSizing: "border-box",
              background: isLight ? "#eef2ff" : "rgba(255, 255, 255, 0.22)",
              border: isLight ? "1px solid #c7d2fe" : "1px solid rgba(255, 255, 255, 0.4)",
              color: isLight ? "#3730a3" : "#ffffff",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
              cursor: "pointer",
              userSelect: "none",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isLight ? "#e0e7ff" : "rgba(255, 255, 255, 0.32)";
              e.currentTarget.style.borderColor = isLight ? "#a5b4fc" : "rgba(255, 255, 255, 0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isLight ? "#eef2ff" : "rgba(255, 255, 255, 0.22)";
              e.currentTarget.style.borderColor = isLight ? "#c7d2fe" : "rgba(255, 255, 255, 0.4)";
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
                  background: isLight ? "#c7d2fe" : "rgba(255, 255, 255, 0.3)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
            )}
            <span
              style={{
                maxWidth: 120,
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

      {activePreviewId && anchor && (
        <ImageReferencePreview
          anchor={anchor}
          dataUrl={getCached(imageRefs.find((r) => r.objectId === activePreviewId)?.fileId || "")?.dataURL}
          displayName={imageRefs.find((r) => r.objectId === activePreviewId)?.displayName || ""}
          width={imageRefs.find((r) => r.objectId === activePreviewId)?.sourceWidth || 800}
          height={imageRefs.find((r) => r.objectId === activePreviewId)?.sourceHeight || 600}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          onClose={() => {
            setActivePreviewId(null);
            setAnchor(null);
          }}
        />
      )}
    </span>
  );
}
