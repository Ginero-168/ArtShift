"use client";

import styles from "@/components/Builder/Builder.module.css";
import { useEngine } from "@/lib/engine/store";
import { isMoodboardSlide } from "@/lib/moodboard/types";

export default function MoodboardInspector() {
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const selectedIds = useEngine((state) => state.selectedIds);
  const updateMoodboardItems = useEngine((state) => state.updateMoodboardItems);
  const items = isMoodboardSlide(slide) ? (slide?.moodboard?.items ?? []) : [];
  const selected = items.filter((item) => selectedIds.has(item.id));
  const item = selected[0];

  return (
    <aside className={styles.inspector} aria-label="Properties">
      <div className={styles.inspectorHeader}>
        <h2>Properties</h2>
      </div>
      <div className={styles.inspectorScroll}>
        {!item ? (
          <p className={styles.emptyInspector}>
            Select an object on the infinite artboard. Position, size, and labels use the same
            fields as artwork slides. Rotation stays at 0°. Copy to slide converts these into normal
            EngineElements.
          </p>
        ) : (
          <>
            <section className={styles.optionSection}>
              <h3>Object</h3>
              <div className={styles.field}>
                <label htmlFor="mb-kind">Kind</label>
                <input id="mb-kind" value={item.kind} disabled />
              </div>
              <div className={styles.field}>
                <label htmlFor="mb-name">Name</label>
                <input
                  id="mb-name"
                  value={item.text ?? ""}
                  onChange={(event) =>
                    updateMoodboardItems(
                      [{ id: item.id, patch: { text: event.target.value } }],
                      "rename moodboard item",
                    )
                  }
                />
              </div>
            </section>
            <section className={styles.optionSection}>
              <h3>Transform</h3>
              <div className={styles.field}>
                <label htmlFor="mb-x">X</label>
                <input
                  id="mb-x"
                  type="number"
                  value={Math.round(item.x)}
                  onChange={(event) =>
                    updateMoodboardItems(
                      [{ id: item.id, patch: { x: Number(event.target.value) } }],
                      "move moodboard item",
                    )
                  }
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="mb-y">Y</label>
                <input
                  id="mb-y"
                  type="number"
                  value={Math.round(item.y)}
                  onChange={(event) =>
                    updateMoodboardItems(
                      [{ id: item.id, patch: { y: Number(event.target.value) } }],
                      "move moodboard item",
                    )
                  }
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="mb-w">W</label>
                <input
                  id="mb-w"
                  type="number"
                  min={24}
                  value={Math.round(item.width)}
                  onChange={(event) =>
                    updateMoodboardItems(
                      [{ id: item.id, patch: { width: Math.max(24, Number(event.target.value)) } }],
                      "resize moodboard item",
                    )
                  }
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="mb-h">H</label>
                <input
                  id="mb-h"
                  type="number"
                  min={24}
                  value={Math.round(item.height)}
                  onChange={(event) =>
                    updateMoodboardItems(
                      [
                        {
                          id: item.id,
                          patch: { height: Math.max(24, Number(event.target.value)) },
                        },
                      ],
                      "resize moodboard item",
                    )
                  }
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="mb-rot">Rotation</label>
                <input id="mb-rot" value="0°" disabled title="Moodboard images stay upright" />
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
