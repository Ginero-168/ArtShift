"use client";

import { useState } from "react";
import styles from "@/components/Builder/Builder.module.css";
import { useEngine } from "@/lib/engine/store";
import { isMoodboardSlide } from "@/lib/moodboard/types";

function itemLabel(kind: string, text?: string, query?: string): string {
  return text || query || kind;
}

export default function MoodboardLayers() {
  const [open, setOpen] = useState(false);
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const selectedIds = useEngine((state) => state.selectedIds);
  const selectOnly = useEngine((state) => state.selectOnly);
  const deleteMoodboardItems = useEngine((state) => state.deleteMoodboardItems);
  const items = isMoodboardSlide(slide) ? (slide?.moodboard?.items ?? []) : [];

  return (
    <div className={styles.layerDock}>
      {open ? (
        <aside className={`${styles.layerDrawer} ${styles.layerDrawerCompact}`} aria-label="Layers">
          <div className={styles.layerDrawerHeader}>
            <div>
              <span className={styles.kicker}>ORGANIZE</span>
              <h2>Layers</h2>
            </div>
            <div className={styles.layerDrawerHeaderActions}>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close layers">
                ×
              </button>
            </div>
          </div>
          <div className={styles.layerScroll}>
            {!items.length ? (
              <p className={styles.empty}>No objects on this moodboard yet.</p>
            ) : (
              [...items].reverse().map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <section
                    key={item.id}
                    className={`${styles.objectLayerCard} ${selected ? styles.selectedObjectCard : ""}`}
                    aria-label={`${itemLabel(item.kind, item.text, item.query)} layer`}
                    onClick={() => selectOnly([item.id])}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <strong>{itemLabel(item.kind, item.text, item.query)}</strong>
                        <div style={{ fontSize: 10, color: "#929aaa" }}>
                          {item.kind}
                          {item.role ? ` · ${item.role}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete ${itemLabel(item.kind, item.text, item.query)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteMoodboardItems([item.id]);
                          if (selected) selectOnly([]);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </aside>
      ) : null}
      <div className={styles.layerDockRow}>
        <button
          type="button"
          className={`${styles.layerDockButton} ${open ? styles.layerDockButtonOpen : ""}`}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label="Open layers"
        >
          <span className={styles.layerStackIcon} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>Layers</strong>
        </button>
      </div>
    </div>
  );
}
