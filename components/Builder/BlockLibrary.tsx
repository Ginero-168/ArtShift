"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconLayoutGrid, IconSearch, IconSparkles } from "@/components/icons";
import { subscribeCoPilotExternalTurn } from "@/lib/ai/coPilotRequestBus";
import {
  BUILDER_BLOCK_MIME,
  BUILDER_BLOCKS,
  type BuilderBlockDefinition,
  type BuilderBlockKind,
  createBuilderBlock,
} from "@/lib/builder/blocks";
import {
  createVectorPathFromIcon,
  type VectorIconDefinition,
} from "@/lib/builder/vectorIconLibrary";
import { type LineSubtype, type Tool, useEngine } from "@/lib/engine/store";
import {
  clampLibraryAssistantWidth,
  LIBRARY_ASSISTANT_DEFAULT_WIDTH,
  LIBRARY_ASSISTANT_MAX_WIDTH,
  libraryBlockWidth,
  persistLibraryAssistantWidth,
  readLibraryAssistantWidth,
} from "@/lib/ui/libraryPanelSize";
import { BlockIcon } from "./BlockIcon";
import styles from "./Builder.module.css";
import IconLibraryModal from "./IconLibraryModal";

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
  const [activeTab, setActiveTab] = useState<LibraryTab>("assistant");
  const [assistantWidth, setAssistantWidth] = useState(LIBRARY_ASSISTANT_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const assistantWidthRef = useRef(assistantWidth);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  assistantWidthRef.current = assistantWidth;

  useLayoutEffect(() => {
    setAssistantWidth(readLibraryAssistantWidth());
  }, []);

  useEffect(() => {
    return subscribeCoPilotExternalTurn((request) => {
      if (request.openAssistant !== false) setActiveTab("assistant");
    });
  }, []);

  const commitAssistantWidth = useCallback((width: number) => {
    const next = persistLibraryAssistantWidth(width);
    setAssistantWidth(next);
    return next;
  }, []);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeDragRef.current = { startX: event.clientX, startWidth: assistantWidth };
      setIsResizing(true);
    },
    [assistantWidth],
  );

  const onResizePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    setAssistantWidth(clampLibraryAssistantWidth(drag.startWidth + (event.clientX - drag.startX)));
  }, []);

  const onResizePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!resizeDragRef.current) return;
      resizeDragRef.current = null;
      setIsResizing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      commitAssistantWidth(assistantWidthRef.current);
    },
    [commitAssistantWidth],
  );

  const onResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const minWidth = libraryBlockWidth();
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitAssistantWidth(assistantWidth - 16);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commitAssistantWidth(assistantWidth + 16);
      } else if (event.key === "Home") {
        event.preventDefault();
        commitAssistantWidth(minWidth);
      } else if (event.key === "End") {
        event.preventDefault();
        commitAssistantWidth(LIBRARY_ASSISTANT_MAX_WIDTH);
      }
    },
    [assistantWidth, commitAssistantWidth],
  );
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);

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

  function handleSelectIcon(icon: VectorIconDefinition) {
    if (!slide) return;
    const size = 120;
    const element = createVectorPathFromIcon(icon, {
      x: Math.round((slide.width - size) / 2),
      y: Math.round((slide.height - size) / 2),
      size,
      color: "#111827",
    });
    addElement(element, `add ${icon.name} icon`);
    useEngine.getState().selectOnly([element.id]);
    setIsIconModalOpen(false);
  }

  function handleBlockClick(block: BuilderBlockDefinition) {
    if (block.kind === "icon") {
      setIsIconModalOpen(true);
      return;
    }

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
    <aside
      className={`${styles.library} ${activeTab === "assistant" ? styles.libraryAssistantActive : ""}`}
      aria-label="Blocks and AI Assistance"
      data-resizing={isResizing ? "true" : undefined}
      style={activeTab === "assistant" ? { width: assistantWidth } : undefined}
    >
      <div className={styles.libraryTabs} role="tablist" aria-label="Workspace tools">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "assistant"}
          className={`${styles.libraryTab} ${styles.libraryTabAssistant} ${activeTab === "assistant" ? styles.libraryTabActive : ""}`}
          onClick={() => setActiveTab("assistant")}
        >
          <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
            <IconSparkles size={14} color="currentColor" />
          </span>
          <span>AI Assistance</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "blocks"}
          className={`${styles.libraryTab} ${activeTab === "blocks" ? styles.libraryTabActive : ""}`}
          onClick={() => setActiveTab("blocks")}
        >
          <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
            <IconLayoutGrid size={14} color="currentColor" />
          </span>
          <span>Block</span>
        </button>
      </div>

      <div className={styles.libraryTabPanel} hidden={activeTab !== "blocks"}>
        <label className={styles.search}>
          <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
            <IconSearch size={14} color="currentColor" />
          </span>
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
      </div>

      <div
        className={`${styles.libraryTabPanel} ${styles.assistantTabPanel}`}
        hidden={activeTab !== "assistant"}
      >
        <AIAssistancePanel />
      </div>

      {activeTab === "assistant" ? (
        <button
          type="button"
          role="separator"
          className={styles.libraryResizeHandle}
          aria-label="ปรับขนาดแผง AI Assistance"
          aria-orientation="vertical"
          aria-valuemin={libraryBlockWidth()}
          aria-valuemax={LIBRARY_ASSISTANT_MAX_WIDTH}
          aria-valuenow={assistantWidth}
          title="ลากเพื่อปรับขนาด"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          onKeyDown={onResizeKeyDown}
        />
      ) : null}

      <IconLibraryModal
        isOpen={isIconModalOpen}
        onClose={() => setIsIconModalOpen(false)}
        onSelectIcon={handleSelectIcon}
      />
    </aside>
  );
}
