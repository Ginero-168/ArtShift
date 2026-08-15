"use client";

import { useMemo, useState } from "react";
import {
  BUILDER_BLOCK_MIME,
  BUILDER_BLOCKS,
  type BuilderBlockDefinition,
  createBuilderBlock,
} from "@/lib/builder/blocks";
import { useEngine } from "@/lib/engine/store";
import styles from "./Builder.module.css";

const CATEGORIES: BuilderBlockDefinition["category"][] = [
  "Content",
  "Media",
  "Shapes",
  "Commerce",
  "Structure",
];

export default function BlockLibrary() {
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const activeLayerId = useEngine((state) => state.activeLayerId);
  const addElement = useEngine((state) => state.addElement);
  const [query, setQuery] = useState("");

  const activeLayer = slide?.layers.find((layer) => layer.id === activeLayerId);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return BUILDER_BLOCKS;
    return BUILDER_BLOCKS.filter(
      (block) =>
        block.label.toLowerCase().includes(needle) ||
        block.description.toLowerCase().includes(needle) ||
        block.category.toLowerCase().includes(needle),
    );
  }, [query]);

  function add(block: BuilderBlockDefinition) {
    if (!slide || !activeLayer) return;
    const element = createBuilderBlock(block.kind, {
      width: slide.width,
      height: slide.height,
      point: activeLayer.mode === "free" ? { x: slide.width / 2, y: slide.height / 2 } : undefined,
    });
    addElement(element, `add ${block.label}`);
  }

  return (
    <aside className={styles.library} aria-label="Block library">
      <div className={styles.libraryHeader}>
        <div>
          <span className={styles.kicker}>BUILD</span>
          <h2>Blocks</h2>
        </div>
        <span className={styles.blockCount}>{BUILDER_BLOCKS.length}</span>
      </div>

      <div className={styles.activeLayerBanner} data-mode={activeLayer?.mode ?? "block"}>
        <span className={styles.activeLayerSignal} aria-hidden="true" />
        <span>
          <small>Adding to</small>
          <strong>{activeLayer?.name ?? "Choose a layer"}</strong>
        </span>
        <b>{activeLayer?.mode.toUpperCase() ?? "—"}</b>
      </div>

      <label className={styles.search}>
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search blocks"
          aria-label="Search blocks"
        />
      </label>
      <p className={styles.hint}>
        Blocks inherit placement from the active Layer. Drag to place or click to add.
      </p>
      <div className={styles.libraryScroll}>
        {CATEGORIES.map((category) => {
          const blocks = filtered.filter((block) => block.category === category);
          if (!blocks.length) return null;
          return (
            <section className={styles.blockGroup} key={category}>
              <div className={styles.groupTitle}>
                <span>{category}</span>
                <span>{String(blocks.length).padStart(2, "0")}</span>
              </div>
              <div className={styles.blockGrid}>
                {blocks.map((block) => (
                  <button
                    className={styles.blockCard}
                    key={block.kind}
                    draggable
                    disabled={!activeLayer || activeLayer.locked}
                    onClick={() => add(block)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(BUILDER_BLOCK_MIME, block.kind);
                      event.dataTransfer.setData("text/plain", block.label);
                    }}
                    title={
                      activeLayer?.locked
                        ? "Unlock the active layer before adding objects"
                        : `Add ${block.label} to ${activeLayer?.name ?? "the active layer"}`
                    }
                  >
                    <span className={styles.glyph}>{block.glyph}</span>
                    <span className={styles.blockCopy}>
                      <strong>{block.label}</strong>
                      <small>{block.description}</small>
                    </span>
                    <span className={styles.dragHandle} aria-hidden="true">
                      ⠿
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {!filtered.length ? <p className={styles.empty}>No matching blocks.</p> : null}
      </div>
    </aside>
  );
}
