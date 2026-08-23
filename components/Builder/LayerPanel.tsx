"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLock,
  IconTrash,
  IconUnlock,
} from "@/components/icons";
import { getElementDefaultName } from "@/lib/engine/layers";
import { isSelectionModifierPressed } from "@/lib/engine/selection";
import { useEngine } from "@/lib/engine/store";
import type { LayerMode } from "@/lib/engine/types";
import AutoLayoutAction from "./AutoLayoutAction";
import { BlockIcon } from "./BlockIcon";
import styles from "./Builder.module.css";
import ResizeArtworkAction from "./ResizeArtworkAction";

export default function LayerPanel() {
  const [open, setOpen] = useState(false);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const selectedIds = useEngine((state) => state.selectedIds);

  const selectOnly = useEngine((state) => state.selectOnly);
  const toggleSelect = useEngine((state) => state.toggleSelect);
  const toggleObjectLayoutMode = useEngine((state) => state.toggleObjectLayoutMode);
  const setElementVisibility = useEngine((state) => state.setElementVisibility);
  const setElementLocked = useEngine((state) => state.setElementLocked);
  const reorderElement = useEngine((state) => state.reorderElement);
  const renameElement = useEngine((state) => state.renameElement);
  const deleteElements = useEngine((state) => state.deleteElements);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  // Sort objects in descending z-order (top-most object on canvas is at the top of the list)
  const objectLayers = useMemo(() => {
    const elements = slide?.elements ?? [];
    return [...elements].filter((el) => !el.isDeleted).sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  }, [slide]);

  return (
    <div className={styles.layerDock}>
      {open ? (
        <aside className={styles.layerDrawer} aria-label="Layers">
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
            {objectLayers.map((element) => {
              const isSelected = selectedIds.has(element.id);
              const mode: LayerMode = element.layoutMode ?? "block";
              const isVisible = !element.hidden;
              const isLocked = element.locked === true;
              const displayName = getElementDefaultName(element);
              const isDragging = draggedId === element.id;
              const isDragOver = dragOverId === element.id && draggedId !== element.id;

              return (
                <section
                  className={`${styles.objectLayerCard} ${isSelected ? styles.selectedObjectCard : ""} ${!isVisible ? styles.hiddenLayer : ""} ${isDragging ? styles.layerDragging : ""} ${isDragOver ? styles.layerDragOver : ""}`}
                  key={element.id}
                  data-mode={mode}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", element.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedId(element.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverId !== element.id) setDragOverId(element.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === element.id) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceId = e.dataTransfer.getData("text/plain") || draggedId;
                    if (sourceId && sourceId !== element.id) {
                      reorderElement(sourceId, element.id);
                    }
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  onClick={(event) => {
                    if (isSelectionModifierPressed(event)) toggleSelect(element.id);
                    else selectOnly([element.id]);
                  }}
                >
                  <div className={styles.objectLayerRow}>
                    <div
                      className={styles.layerDragHandle}
                      title="Drag to reorder layer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconGripVertical size={13} />
                    </div>

                    <span className={styles.objectIconBox} data-mode={mode}>
                      <BlockIcon
                        kind={
                          (element.builderKind ??
                            element.type) as import("@/lib/builder/blocks").BuilderBlockKind
                        }
                        size={14}
                      />
                    </span>

                    <div className={styles.objectNameContainer}>
                      {editingElementId === element.id ? (
                        <input
                          // biome-ignore lint/a11y/noAutofocus: user initiated inline rename
                          autoFocus
                          className={styles.layerNameInput}
                          value={editingName}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              renameElement(element.id, editingName);
                              setEditingElementId(null);
                            } else if (e.key === "Escape") {
                              setEditingElementId(null);
                            }
                          }}
                          onBlur={() => {
                            renameElement(element.id, editingName);
                            setEditingElementId(null);
                          }}
                        />
                      ) : (
                        <span
                          className={styles.objectNameText}
                          title="Double-click to rename"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingElementId(element.id);
                            setEditingName(displayName);
                          }}
                        >
                          {displayName}
                        </span>
                      )}
                    </div>

                    <div className={styles.objectLayerActions}>
                      <button
                        type="button"
                        className={styles.modeBadgeButton}
                        data-mode={mode}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleObjectLayoutMode(element.id);
                        }}
                        title={`Click to switch to ${mode === "block" ? "Free" : "Block"} mode`}
                      >
                        {mode === "block" ? "⬡ BLOCK" : "◇ FREE"}
                      </button>

                      <button
                        type="button"
                        className={`${styles.layerIconButton} ${!isVisible ? styles.layerIconHidden : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setElementVisibility(element.id, !isVisible);
                        }}
                        title={isVisible ? "Hide object" : "Show object"}
                        aria-label={isVisible ? `Hide ${displayName}` : `Show ${displayName}`}
                      >
                        {isVisible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
                      </button>

                      <button
                        type="button"
                        className={`${styles.layerIconButton} ${isLocked ? styles.layerIconLocked : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setElementLocked(element.id, !isLocked);
                        }}
                        title={isLocked ? "Unlock object" : "Lock object"}
                        aria-label={isLocked ? `Unlock ${displayName}` : `Lock ${displayName}`}
                      >
                        {isLocked ? <IconLock size={12} /> : <IconUnlock size={12} />}
                      </button>

                      <button
                        type="button"
                        className={`${styles.layerIconButton} ${styles.layerIconDelete}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteElements([element.id]);
                        }}
                        title="Delete object"
                        aria-label={`Delete ${displayName}`}
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                  </div>
                </section>
              );
            })}
            {!objectLayers.length ? (
              <p className={styles.empty}>No matching layers or objects.</p>
            ) : null}
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
        <div className={styles.layerDockActions} role="group" aria-label="Artwork actions">
          <AutoLayoutAction />
          <ResizeArtworkAction />
        </div>
      </div>
    </div>
  );
}
