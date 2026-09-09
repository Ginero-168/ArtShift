"use client";

import { useEffect, useRef, useState } from "react";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import ImageReferencePreview from "./ImageReferencePreview";

type Props = {
  refs: readonly ComposerImageRef[];
  omittedCount?: number;
  onRemove?: (ref: ComposerImageRef) => void;
  testId?: string;
  onSelect?: (ref: ComposerImageRef) => void;
};

export default function ComposerImageTags({
  refs,
  omittedCount = 0,
  onRemove,
  testId,
  onSelect,
}: Props) {
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
      data-testid={testId ?? "selected-image-tags"}
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
            data-testid={
              testId ? `${testId}-tag-${ref.objectId}` : `selected-image-tag-${ref.objectId}`
            }
            aria-label={`Selected image ${ref.displayName}`}
            title={`${ref.displayName} · ${ref.sourceWidth} × ${ref.sourceHeight}px`}
            onClick={() => onSelect?.(ref)}
            onPointerEnter={(event) => openPreview(event.currentTarget, ref.objectId)}
            onPointerLeave={scheduleClose}
            onFocus={(event) => openPreview(event.currentTarget, ref.objectId)}
            onBlur={scheduleClose}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setActiveId(null);
                setAnchor(null);
              } else if (event.key === "Backspace" || event.key === "Delete") {
                event.preventDefault();
                onRemove?.(ref);
                setActiveId(null);
                setAnchor(null);
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3.5,
              maxWidth: "min(100%, 120px)",
              minHeight: 22,
              height: 22,
              boxSizing: "border-box",
              padding: "1px 7px 1px 2.5px",
              borderRadius: 9999,
              border: "1px solid #c7d2fe",
              background: "#eef2ff",
              color: "#3730a3",
              cursor: onSelect ? "pointer" : "default",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
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
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  objectFit: "cover",
                  flex: "0 0 auto",
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: "#c7d2fe",
                  flex: "0 0 auto",
                }}
              />
            )}
            <span
              style={{
                display: "inline-block",
                maxWidth: 75,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              @{ref.displayName}
            </span>
          </button>
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
            minHeight: 22,
            height: 22,
            boxSizing: "border-box",
            padding: "0 6px",
            borderRadius: 9999,
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
