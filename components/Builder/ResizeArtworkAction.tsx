"use client";

import { useEffect, useState } from "react";
import { useEngine } from "@/lib/engine/store";
import styles from "./ResizeArtworkAction.module.css";

const SIZE_REFERENCES = [
  { label: "Square post", detail: "1:1", width: 1080, height: 1080 },
  { label: "Portrait post", detail: "4:5", width: 1080, height: 1350 },
  { label: "Story / Reel", detail: "9:16", width: 1080, height: 1920 },
  { label: "Landscape", detail: "16:9", width: 1920, height: 1080 },
  { label: "Facebook post", detail: "1.91:1", width: 1200, height: 630 },
  { label: "A4 print", detail: "210×297 mm", width: 2480, height: 3508 },
];

export default function ResizeArtworkAction() {
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const setSlideDimensions = useEngine((state) => state.setSlideDimensions);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [resizeContents, setResizeContents] = useState(true);
  const [locked, setLocked] = useState(false);
  const [ratio, setRatio] = useState(1);

  useEffect(() => {
    if (!open || !slide) return;
    setWidth(slide.width);
    setHeight(slide.height);
    setRatio(slide.width / Math.max(1, slide.height));
  }, [open, slide]);

  if (!slide) return null;

  function setDimension(axis: "width" | "height", value: number) {
    const safe = Math.max(64, Math.min(10000, Math.round(value || 0)));
    if (axis === "width") {
      setWidth(safe);
      if (locked) setHeight(Math.max(64, Math.round(safe / ratio)));
    } else {
      setHeight(safe);
      if (locked) setWidth(Math.max(64, Math.round(safe * ratio)));
    }
  }

  return (
    <>
      <button className={styles.action} type="button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">↔</span>
        Resize
        <small>
          {slide.width}×{slide.height}
        </small>
      </button>
      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resize-artwork-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>ARTWORK ACTION</span>
                <h2 id="resize-artwork-title">Resize artwork</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close resize dialog">
                ×
              </button>
            </header>

            <div className={styles.body}>
              <div className={styles.customSize}>
                <label>
                  <span>Width</span>
                  <input
                    type="number"
                    min={64}
                    max={10000}
                    value={width}
                    onChange={(event) => setDimension("width", Number(event.currentTarget.value))}
                  />
                  <small>PX</small>
                </label>
                <button
                  className={locked ? styles.locked : ""}
                  type="button"
                  onClick={() => {
                    setLocked((value) => !value);
                    setRatio(width / Math.max(1, height));
                  }}
                  title="Lock aspect ratio"
                  aria-pressed={locked}
                >
                  {locked ? "●" : "○"}
                </button>
                <label>
                  <span>Height</span>
                  <input
                    type="number"
                    min={64}
                    max={10000}
                    value={height}
                    onChange={(event) => setDimension("height", Number(event.currentTarget.value))}
                  />
                  <small>PX</small>
                </label>
                <button
                  type="button"
                  title="Swap orientation"
                  onClick={() => {
                    setWidth(height);
                    setHeight(width);
                    setRatio(height / Math.max(1, width));
                  }}
                >
                  ⇄
                </button>
              </div>

              <div className={styles.referenceHeader}>
                <strong>Size references</strong>
                <span>Choose one or enter any size above</span>
              </div>
              <div className={styles.references}>
                {SIZE_REFERENCES.map((size) => {
                  const active = width === size.width && height === size.height;
                  return (
                    <button
                      className={active ? styles.activeReference : ""}
                      type="button"
                      key={size.label}
                      onClick={() => {
                        setWidth(size.width);
                        setHeight(size.height);
                        setRatio(size.width / size.height);
                      }}
                    >
                      <span
                        className={styles.ratioPreview}
                        style={{ aspectRatio: `${size.width}/${size.height}` }}
                      />
                      <span>
                        <strong>{size.label}</strong>
                        <small>
                          {size.width} × {size.height} · {size.detail}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className={styles.reflowOption}>
                <input
                  type="checkbox"
                  checked={resizeContents}
                  onChange={(event) => setResizeContents(event.currentTarget.checked)}
                />
                <span>
                  <strong>Reflow and scale content</strong>
                  <small>Bento blocks keep their identity and rearrange to the new artwork.</small>
                </span>
              </label>
            </div>

            <footer>
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className={styles.apply}
                type="button"
                onClick={() => {
                  setSlideDimensions(slide.id, width, height, resizeContents);
                  setOpen(false);
                }}
              >
                Apply resize
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
