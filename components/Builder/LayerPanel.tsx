"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  IconChevronDown,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLock,
  IconTrash,
  IconUnlock,
} from "@/components/icons";
import { getElementDefaultName } from "@/lib/engine/layers";
import { isSelectionModifierPressed } from "@/lib/engine/selection";
import { buildLayerHierarchy, type LayerTreeNode } from "@/lib/engine/selectionGroups";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement } from "@/lib/engine/types";
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const selectedIds = useEngine((state) => state.selectedIds);

  const selectOnly = useEngine((state) => state.selectOnly);
  const toggleSelect = useEngine((state) => state.toggleSelect);
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

  const objectLayers = useMemo(() => {
    const elements = slide?.elements ?? [];
    return [...elements]
      .filter((element) => !element.isDeleted)
      .sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  }, [slide]);
  const layerTree = useMemo(() => buildLayerHierarchy(objectLayers), [objectLayers]);

  const renderElement = (element: EngineElement, depth = 0) => {
    const isSelected = selectedIds.has(element.id);
    const isVisible = !element.hidden;
    const isLocked = element.locked === true;
    const displayName = getElementDefaultName(element);
    const isDragging = draggedId === element.id;
    const isDragOver = dragOverId === element.id && draggedId !== element.id;

    return (
      <section
        className={`${styles.objectLayerCard} ${isSelected ? styles.selectedObjectCard : ""} ${!isVisible ? styles.hiddenLayer : ""} ${isDragging ? styles.layerDragging : ""} ${isDragOver ? styles.layerDragOver : ""}`}
        key={element.id}
        data-depth={depth}
        style={{ marginLeft: depth > 0 ? depth * 10 : undefined }}
        draggable
        aria-label={`${displayName} layer`}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", element.id);
          event.dataTransfer.effectAllowed = "move";
          setDraggedId(element.id);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (dragOverId !== element.id) setDragOverId(element.id);
        }}
        onDragLeave={() => {
          if (dragOverId === element.id) setDragOverId(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceId = event.dataTransfer.getData("text/plain") || draggedId;
          if (sourceId && sourceId !== element.id) reorderElement(sourceId, element.id);
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
            onClick={(event) => event.stopPropagation()}
          >
            <IconGripVertical size={11} />
          </div>
          <span className={styles.objectIconBox}>
            <BlockIcon
              kind={
                (element.builderKind ??
                  element.type) as import("@/lib/builder/blocks").BuilderBlockKind
              }
              size={11}
            />
          </span>
          <div className={styles.objectNameContainer}>
            {editingElementId === element.id ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: user initiated inline rename
                autoFocus
                className={styles.layerNameInput}
                value={editingName}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onChange={(event) => setEditingName(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    renameElement(element.id, editingName);
                    setEditingElementId(null);
                  } else if (event.key === "Escape") setEditingElementId(null);
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
                onDoubleClick={(event) => {
                  event.stopPropagation();
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
              className={`${styles.layerIconButton} ${!isVisible ? styles.layerIconHidden : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setElementVisibility(element.id, !isVisible);
              }}
              title={isVisible ? "Hide object" : "Show object"}
              aria-label={isVisible ? `Hide ${displayName}` : `Show ${displayName}`}
            >
              {isVisible ? <IconEye size={11} /> : <IconEyeOff size={11} />}
            </button>
            <button
              type="button"
              className={`${styles.layerIconButton} ${isLocked ? styles.layerIconLocked : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setElementLocked(element.id, !isLocked);
              }}
              title={isLocked ? "Unlock object" : "Lock object"}
              aria-label={isLocked ? `Unlock ${displayName}` : `Lock ${displayName}`}
            >
              {isLocked ? <IconLock size={10} /> : <IconUnlock size={10} />}
            </button>
            <button
              type="button"
              className={`${styles.layerIconButton} ${styles.layerIconDelete}`}
              onClick={(event) => {
                event.stopPropagation();
                deleteElements([element.id]);
              }}
              title="Delete object"
              aria-label={`Delete ${displayName}`}
            >
              <IconTrash size={10} />
            </button>
          </div>
        </div>
      </section>
    );
  };

  const renderNode = (node: LayerTreeNode, depth = 0): ReactNode => {
    if (node.kind === "element") return renderElement(node.element, depth);

    const collapsed = collapsedGroups[node.groupId] === true;
    const allSelected =
      node.memberIds.length > 0 && node.memberIds.every((id) => selectedIds.has(id));

    return (
      <div
        className={`${styles.compositionLayerGroup} ${allSelected ? styles.compositionGroupSelected : ""}`}
        key={node.groupId}
        style={{ marginLeft: depth > 0 ? depth * 10 : undefined }}
      >
        <button
          type="button"
          className={styles.compositionGroupHeader}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${node.label}`}
          title="Click to collapse or expand. Double-click to select group."
          onClick={() =>
            setCollapsedGroups((current) => ({
              ...current,
              [node.groupId]: !collapsed,
            }))
          }
          onDoubleClick={(event) => {
            event.preventDefault();
            selectOnly(node.memberIds);
          }}
        >
          <span
            aria-hidden="true"
            className={styles.compositionGroupChevron}
            style={{ transform: collapsed ? "rotate(-90deg)" : "none" }}
          >
            <IconChevronDown size={10} />
          </span>
          <strong>{node.label}</strong>
          <small>
            {node.memberIds.length}
            {allSelected ? " · selected" : ""}
          </small>
        </button>
        {!collapsed ? (
          <div className={styles.compositionLayerChildren}>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

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
            {layerTree.map((node) => renderNode(node))}
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
