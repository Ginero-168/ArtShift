"use client";

import { useMemo, useState } from "react";
import { IconChevronDown } from "@/components/icons";
import {
  BUILDER_BLOCK_MIME,
  BUILDER_BLOCKS,
  type BuilderBlockDefinition,
  type BuilderBlockKind,
  createBuilderBlock,
} from "@/lib/builder/blocks";
import { type LineSubtype, type Tool, useEngine } from "@/lib/engine/store";
import { BlockIcon } from "./BlockIcon";
import styles from "./Builder.module.css";

const CATEGORIES: BuilderBlockDefinition["category"][] = [
  "Content",
  "Frames",
  "Shapes",
  "Lines",
  "Commerce",
  "Structure",
];

const DRAWING_TOOL_MAP: Partial<
  Record<
    BuilderBlockKind,
    {
      tool: Tool;
      lineSubtype?: LineSubtype;
    }
  >
> = {
  // Geometric Shapes (Click tool then drag to size on canvas)
  shapeRect: { tool: "rect" },
  shapeEllipse: { tool: "ellipse" },
  shapeDiamond: { tool: "diamond" },
  shapeTriangle: { tool: "triangle" },
  shapeStar: { tool: "star" },
  shapeHexagon: { tool: "hexagon" },
  shapeHeart: { tool: "heart" },
  shapePlus: { tool: "plus" },

  // Lines & Drawing
  shapeLine: { tool: "line", lineSubtype: "solid" },
  shapeArrow: { tool: "arrow", lineSubtype: "arrow" },
  shapeDoubleArrow: { tool: "arrow", lineSubtype: "doubleArrow" },
  shapeDashedLine: { tool: "line", lineSubtype: "dashed" },
  shapeCurvedArrow: { tool: "arrow", lineSubtype: "curvedArrow" },
  shapeFreedraw: { tool: "freedraw", lineSubtype: "freedraw" },
  shapePen: { tool: "pen", lineSubtype: "pen" },
};

export default function BlockLibrary() {
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const tool = useEngine((state) => state.tool);
  const setTool = useEngine((state) => state.setTool);
  const lineSubtype = useEngine((state) => state.lineSubtype);
  const setLineSubtype = useEngine((state) => state.setLineSubtype);
  const addElement = useEngine((state) => state.addElement);
  const [query, setQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

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

  function toggleCategory(category: string) {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }

  function handleBlockClick(block: BuilderBlockDefinition) {
    const drawingDef = DRAWING_TOOL_MAP[block.kind];
    if (drawingDef) {
      if (
        tool === drawingDef.tool &&
        (!drawingDef.lineSubtype || lineSubtype === drawingDef.lineSubtype)
      ) {
        setTool("select");
      } else {
        setTool(drawingDef.tool);
        if (drawingDef.lineSubtype) {
          setLineSubtype(drawingDef.lineSubtype);
        }
      }
      return;
    }

    if (!slide) return;
    const element = createBuilderBlock(block.kind, {
      width: slide.width,
      height: slide.height,
    });
    addElement(element, `add ${block.label}`);
  }

  function isBlockActive(block: BuilderBlockDefinition): boolean {
    const drawingDef = DRAWING_TOOL_MAP[block.kind];
    if (!drawingDef) return false;
    if (tool !== drawingDef.tool) return false;
    if (drawingDef.lineSubtype) {
      return lineSubtype === drawingDef.lineSubtype;
    }
    return true;
  }

  return (
    <aside className={styles.library} aria-label="Block library">
      <label className={styles.search}>
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search blocks"
          aria-label="Search blocks"
        />
      </label>
      <div className={styles.libraryScroll}>
        <div style={{ padding: "0 0 10px 0" }}>
          <button
            type="button"
            onClick={() => useEngine.getState().setAiImageModalOpen(true)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(99, 102, 241, 0.25)",
              background:
                "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.12) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              textAlign: "left",
              boxShadow: "0 1px 3px rgba(99, 102, 241, 0.1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 13,
                  boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)",
                }}
              >
                ✨
              </div>
              <div>
                <strong style={{ fontSize: 11, color: "#1e1b4b", display: "block" }}>
                  AI Image Studio
                </strong>
                <span style={{ fontSize: 9.5, color: "#64748b" }}>Prompt to Image (FLUX)</span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 700 }}>➔</span>
          </button>
        </div>

        {CATEGORIES.map((category) => {
          const blocks = filtered.filter((block) => block.category === category);
          if (!blocks.length) return null;
          const isCollapsed = Boolean(collapsedCategories[category]);

          return (
            <section className={styles.blockGroup} key={category}>
              <button
                type="button"
                className={styles.groupTitleButton}
                onClick={() => toggleCategory(category)}
                aria-expanded={!isCollapsed}
                title={isCollapsed ? `Expand ${category}` : `Collapse ${category}`}
              >
                <span>{category}</span>
                <span
                  className={`${styles.groupChevron} ${isCollapsed ? styles.groupChevronCollapsed : ""}`}
                >
                  <IconChevronDown size={11} />
                </span>
              </button>

              {!isCollapsed ? (
                <div className={styles.blockGrid}>
                  {blocks.map((block) => {
                    const active = isBlockActive(block);
                    return (
                      <button
                        type="button"
                        className={`${styles.blockCard} ${active ? styles.blockCardActive : ""}`}
                        key={block.kind}
                        draggable
                        onClick={() => handleBlockClick(block)}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData(BUILDER_BLOCK_MIME, block.kind);
                          event.dataTransfer.setData("text/plain", block.label);
                        }}
                        title={
                          DRAWING_TOOL_MAP[block.kind]
                            ? `${block.label} · Click to draw on canvas`
                            : `${block.label} · ${block.description}`
                        }
                      >
                        <span className={styles.glyph}>
                          <BlockIcon kind={block.kind} size={20} />
                        </span>
                        <span className={styles.blockLabel}>{block.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
        {!filtered.length ? <p className={styles.empty}>No matching blocks.</p> : null}
      </div>
    </aside>
  );
}
