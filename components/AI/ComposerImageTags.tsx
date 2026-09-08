"use client";

import { useEffect, useRef, useState } from "react";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import ImageReferencePreview from "./ImageReferencePreview";

type Props = {
  refs: readonly ComposerImageRef[];
  omittedCount?: number;
  onRemove?: (ref: ComposerImageRef) => void;
};

export default function ComposerImageTags({ refs, omittedCount = 0, onRemove }: Props) {
  const [, rerender] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeImageCache(() => rerender((value) => value + 1)), []);
  useEffect(() => {
    if (!activeId || refs.some((ref) => ref.objectId === activeId)) return;
    setActiveId(null);
    setAnchor(null);
  }, [activeId, refs]);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  if (refs.length === 0) return null;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setActiveId(null);
      setAnchor(null);
    }, 140);
  };
  const openPreview = (button: HTMLButtonElement, id: string) => {
    cancelClose();
    setActiveId(id);
    setAnchor(button);
  };
  const activeRef = refs.find((ref) => ref.objectId === activeId);
  const activeDataUrl = activeRef ? getCached(activeRef.fileId)?.dataURL : undefined;

  return (
    <div
      role="list"
      data-testid="selected-image-tags"
      aria-label="Selected Canvas images"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
      }}
    >
      {refs.map((ref) => (
        <span
          key={`${ref.objectId}:${ref.elementVersion}`}
          role="listitem"
          style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
        >
          <button
            type="button"
            data-testid={`selected-image-tag-${ref.objectId}`}
            aria-label={`Selected image ${ref.displayName}`}
            title={`${ref.displayName} · ${ref.sourceWidth} × ${ref.sourceHeight}px`}
            onPointerEnter={(event) => openPreview(event.currentTarget, ref.objectId)}
            onPointerLeave={scheduleClose}
            onFocus={(event) => openPreview(event.currentTarget, ref.objectId)}
            onBlur={scheduleClose}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setActiveId(null);
                setAnchor(null);
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              maxWidth: "min(100%, 105px)",
              minHeight: 28,
              boxSizing: "border-box",
              padding: "2px 6px 2px 3px",
              borderRadius: 8,
              border: "1px solid #c7d2fe",
              background: "#eef2ff",
              color: "#3730a3",
              cursor: "default",
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 1.2,
              textAlign: "left",
            }}
          >
            {getCached(ref.fileId)?.dataURL ? (
              // biome-ignore lint/performance/noImgElement: local thumbnail for selected Canvas context
              <img
                src={getCached(ref.fileId)?.dataURL}
                alt=""
                draggable={false}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  objectFit: "cover",
                  flex: "0 0 auto",
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  background: "#c7d2fe",
                  flex: "0 0 auto",
                }}
              />
            )}
            <span
              style={{
                display: "inline-block",
                maxWidth: 62,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              @{ref.displayName}
            </span>
          </button>
          {onRemove ? (
            <button
              type="button"
              data-testid={`remove-selected-image-tag-${ref.objectId}`}
              aria-label={`Remove selected image ${ref.displayName}`}
              title="นำภาพออกจากบริบท AI"
              onClick={() => onRemove(ref)}
              style={{
                width: 20,
                height: 20,
                boxSizing: "border-box",
                padding: 0,
                border: "1px solid #c7d2fe",
                borderRadius: 5,
                background: "#ffffffaa",
                color: "#3730a3",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {omittedCount > 0 ? (
        <span
          role="status"
          data-testid="selected-image-overflow"
          aria-label={`${omittedCount} more selected Canvas images`}
          title="ลด selection เหลือไม่เกิน 4 ภาพก่อนส่งงาน"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 26,
            boxSizing: "border-box",
            padding: "0 6px",
            borderRadius: 7,
            background: "#f1f5f9",
            border: "1px solid #cbd5e1",
            color: "#475569",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          +{omittedCount}
        </span>
      ) : null}
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
            setActiveId(null);
            setAnchor(null);
          }}
        />
      ) : null}
    </div>
  );
}
