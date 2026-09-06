"use client";

import { useEffect, useRef, useState } from "react";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import ImageReferencePreview from "./ImageReferencePreview";

type Props = {
  refs: readonly ComposerImageRef[];
};

export default function ComposerImageTags({ refs }: Props) {
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
        gap: 5,
        minWidth: 0,
      }}
    >
      {refs.map((ref) => (
        <button
          key={`${ref.objectId}:${ref.elementVersion}`}
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
            gap: 6,
            maxWidth: "min(100%, 260px)",
            minHeight: 30,
            padding: "4px 8px 4px 5px",
            borderRadius: 8,
            border: "1px solid #c7d2fe",
            background: "#eef2ff",
            color: "#3730a3",
            cursor: "default",
            font: "600 10px/1.2 inherit",
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
                width: 22,
                height: 22,
                borderRadius: 5,
                objectFit: "cover",
                flex: "0 0 auto",
              }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: "#c7d2fe",
                flex: "0 0 auto",
              }}
            />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{ref.displayName}
          </span>
        </button>
      ))}
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
