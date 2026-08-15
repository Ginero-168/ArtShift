"use client";

import { useEffect, useMemo, useState } from "react";
import { getBuilderBlockDefinition } from "@/lib/builder/blocks";
import { getLayerObjects } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";
import type {
  EngineElement,
  EngineLayer,
  LayerMode,
  WorkspaceStrictness,
} from "@/lib/engine/types";
import styles from "./Builder.module.css";

const STRICTNESS_COPY: Record<WorkspaceStrictness, string> = {
  1: "No shared cells",
  2: "Overlap by 1 cell",
  3: "Overlap by 2 cells",
};

export default function LayerPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const slide = useEngine((state) =>
    state.doc.slides.find((candidate) => candidate.id === state.currentSlideId),
  );
  const activeLayerId = useEngine((state) => state.activeLayerId);
  const selectedIds = useEngine((state) => state.selectedIds);
  const strictness = useEngine((state) => state.doc.workspaceStrictness);
  const setActiveLayer = useEngine((state) => state.setActiveLayer);
  const selectOnly = useEngine((state) => state.selectOnly);
  const addLayer = useEngine((state) => state.addLayer);
  const setLayerMode = useEngine((state) => state.setLayerMode);
  const setLayerVisibility = useEngine((state) => state.setLayerVisibility);
  const setLayerLocked = useEngine((state) => state.setLayerLocked);
  const moveLayer = useEngine((state) => state.moveLayer);
  const moveObjectsToLayer = useEngine((state) => state.moveObjectsToLayer);
  const setWorkspaceStrictness = useEngine((state) => state.setWorkspaceStrictness);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  useEffect(() => {
    if (!activeLayerId) return;
    setExpanded((current) => new Set(current).add(activeLayerId));
  }, [activeLayerId]);

  const layers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(slide?.layers ?? [])]
      .sort((a, b) => b.z - a.z)
      .filter((layer) => {
        if (!needle || !slide) return true;
        const objectCopy = getLayerObjects(slide, layer.id)
          .map((object) => {
            const copy = getObjectCopy(object);
            return `${copy.label} ${copy.detail}`;
          })
          .join(" ");
        return `${layer.name} ${layer.mode} ${objectCopy}`.toLowerCase().includes(needle);
      });
  }, [query, slide]);

  function createLayer(mode: LayerMode) {
    const id = addLayer(mode);
    setExpanded((current) => new Set(current).add(id));
  }

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
              <span>{String(slide?.layers.length ?? 0).padStart(2, "0")}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close layers">
                ×
              </button>
            </div>
          </div>

          <section className={styles.strictnessPanel}>
            <div className={styles.strictnessHeading}>
              <span>Workspace strictness</span>
              <strong>{STRICTNESS_COPY[strictness]}</strong>
            </div>
            <div className={styles.strictnessTabs} role="group" aria-label="Workspace strictness">
              {([1, 2, 3] as const).map((level) => (
                <button
                  type="button"
                  key={level}
                  aria-pressed={strictness === level}
                  className={strictness === level ? styles.strictnessActive : undefined}
                  onClick={() => setWorkspaceStrictness(level)}
                >
                  <b>{level}</b>
                  <small>{level === 1 ? "Exact" : `+${level - 1} cell`}</small>
                </button>
              ))}
            </div>
          </section>

          <div className={styles.addLayerRow}>
            <button type="button" onClick={() => createLayer("block")}>
              <span className={styles.blockLayerMark}>⬡</span> Add Block layer
            </button>
            <button type="button" onClick={() => createLayer("free")}>
              <span className={styles.freeLayerMark}>◇</span> Add Free layer
            </button>
          </div>

          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search layers or objects"
              aria-label="Search layers or objects"
            />
          </label>

          <div className={styles.layerScroll}>
            {layers.map((layer) => {
              if (!slide) return null;
              const objects = getLayerObjects(slide, layer.id);
              const isActive = layer.id === activeLayerId;
              const isExpanded = expanded.has(layer.id);
              const selectedOutside = [...selectedIds].some(
                (objectId) => !layer.objectIds.includes(objectId),
              );
              return (
                <section
                  className={`${styles.layerCard} ${isActive ? styles.activeLayerCard : ""} ${!layer.visible ? styles.hiddenLayer : ""}`}
                  key={layer.id}
                  data-mode={layer.mode}
                >
                  <div className={styles.layerCardTop}>
                    <button
                      type="button"
                      className={styles.layerDisclosure}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(layer.id)) next.delete(layer.id);
                          else next.add(layer.id);
                          return next;
                        })
                      }
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${layer.name}`}
                    >
                      {isExpanded ? "⌄" : "›"}
                    </button>
                    <button
                      className={styles.layerNameButton}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setActiveLayer(layer.id)}
                    >
                      <span className={styles.layerTypeGlyph}>
                        {layer.mode === "block" ? "⬡" : "◇"}
                      </span>
                      <span>
                        <strong>{layer.name}</strong>
                        <small>
                          {objects.length} {objects.length === 1 ? "object" : "objects"}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.layerIconButton}
                      onClick={() => setLayerVisibility(layer.id, !layer.visible)}
                      title={layer.visible ? "Hide layer" : "Show layer"}
                      aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                    >
                      {layer.visible ? "◉" : "○"}
                    </button>
                    <button
                      type="button"
                      className={styles.layerIconButton}
                      onClick={() => setLayerLocked(layer.id, !layer.locked)}
                      title={layer.locked ? "Unlock layer" : "Lock layer"}
                      aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                    >
                      {layer.locked ? "◆" : "◇"}
                    </button>
                  </div>

                  <div className={styles.layerCardControls}>
                    <div
                      className={styles.layerModeTabs}
                      role="group"
                      aria-label={`${layer.name} type`}
                    >
                      <LayerModeButton
                        mode="block"
                        layer={layer}
                        onChange={() => setLayerMode(layer.id, "block")}
                      />
                      <LayerModeButton
                        mode="free"
                        layer={layer}
                        onChange={() => setLayerMode(layer.id, "free")}
                      />
                    </div>
                    <div className={styles.layerOrderButtons}>
                      <button
                        type="button"
                        title="Move layer backward"
                        onClick={() => moveLayer(layer.id, "backward")}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        title="Move layer forward"
                        onClick={() => moveLayer(layer.id, "forward")}
                      >
                        ↑
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className={styles.layerObjects}>
                      {selectedIds.size > 0 && selectedOutside ? (
                        <button
                          className={styles.moveSelectionButton}
                          type="button"
                          onClick={() => moveObjectsToLayer([...selectedIds], layer.id)}
                        >
                          Move {selectedIds.size} selected here
                        </button>
                      ) : null}
                      {objects.map((object) => {
                        const copy = getObjectCopy(object);
                        return (
                          <button
                            type="button"
                            className={`${styles.objectRow} ${selectedIds.has(object.id) ? styles.selectedObjectRow : ""}`}
                            key={object.id}
                            onClick={() => selectOnly([object.id])}
                          >
                            <span>{copy.glyph}</span>
                            <span>
                              <strong>{copy.label}</strong>
                              <small>{copy.detail}</small>
                            </span>
                          </button>
                        );
                      })}
                      {!objects.length ? (
                        <p className={styles.layerGroupEmpty}>
                          Select this Layer, then add Blocks.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })}
            {!layers.length ? <p className={styles.empty}>No matching layers.</p> : null}
          </div>
        </aside>
      ) : null}

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
        <b>{slide?.layers.length ?? 0}</b>
      </button>
    </div>
  );
}

function LayerModeButton({
  mode,
  layer,
  onChange,
}: {
  mode: LayerMode;
  layer: EngineLayer;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={layer.mode === mode}
      className={layer.mode === mode ? styles.layerModeActive : undefined}
      onClick={onChange}
    >
      {mode === "block" ? "Block" : "Free"}
    </button>
  );
}

function getObjectCopy(element: EngineElement) {
  const definition = element.builderKind
    ? getBuilderBlockDefinition(element.builderKind)
    : undefined;
  const typeLabel = element.type === "bookMockup" ? "3D book" : element.type;
  const textDetail = element.type === "text" ? element.text.trim().replace(/\s+/g, " ") : "";
  return {
    glyph: definition?.glyph ?? objectGlyph(element),
    label: definition?.label ?? typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1),
    detail: textDetail ? textDetail.slice(0, 44) : (definition?.description ?? typeLabel),
  };
}

function objectGlyph(element: EngineElement) {
  if (element.type === "text") return "T";
  if (element.type === "image") return "▧";
  if (element.type === "bookMockup") return "◩";
  if (element.type === "frame") return "□";
  return "◇";
}
