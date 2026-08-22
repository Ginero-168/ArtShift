"use client";

import dynamic from "next/dynamic";
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

const AIAssistancePanel = dynamic(() => import("@/components/AI/AICoPilotBar"), { ssr: false });

type LibraryTab = "blocks" | "assistant";

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
  const [activeTab, setActiveTab] = useState<LibraryTab>("blocks");

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
  const showAiImageStudio =
    !query.trim() || "ai image studio prompt to image flux".includes(query.trim().toLowerCase());

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
    <aside className={styles.library} aria-label="Blocks and AI Assistance">
      <div className={styles.libraryTabs} role="tablist" aria-label="Workspace tools">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "blocks"}
          className={`${styles.libraryTab} ${activeTab === "blocks" ? styles.libraryTabActive : ""}`}
          onClick={() => setActiveTab("blocks")}
        >
          <span aria-hidden="true">▦</span>
          <span>Block</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "assistant"}
          className={`${styles.libraryTab} ${activeTab === "assistant" ? styles.libraryTabActive : ""}`}
          onClick={() => setActiveTab("assistant")}
        >
          <span aria-hidden="true">✦</span>
          <span>AI Assistance</span>
        </button>
      </div>

      <div className={styles.libraryTabPanel} hidden={activeTab !== "blocks"}>
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
          {CATEGORIES.map((category) => {
            const blocks = filtered.filter((block) => block.category === category);
            const includeAiImageStudio = category === "Content" && showAiImageStudio;
            if (!blocks.length && !includeAiImageStudio) return null;
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
                    {includeAiImageStudio ? (
                      <button
                        type="button"
                        className={`${styles.blockCard} ${styles.aiImageBlock}`}
                        onClick={() => useEngine.getState().setAiImageModalOpen(true)}
                        title="AI Image Studio · Prompt to Image (FLUX)"
                        aria-label="AI Image Studio"
                      >
                        <span className={styles.glyph} aria-hidden="true">
                          ✨
                        </span>
                        <span className={styles.blockLabel}>AI Image</span>
                      </button>
                    ) : null}
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
          {!filtered.length && !showAiImageStudio ? (
            <p className={styles.empty}>No matching blocks.</p>
          ) : null}
        </div>
      </div>

      <div
        className={`${styles.libraryTabPanel} ${styles.assistantTabPanel}`}
        hidden={activeTab !== "assistant"}
      >
        <AIAssistancePanel />
      </div>
    </aside>
  );
}
