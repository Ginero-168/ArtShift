"use client";

/**
 * PresetPanel — Shows saved presets in a floating panel, organized by folders.
 *
 * Renders mini-thumbnails of each preset using canvas. The user can:
 * - Click a preset to paste its elements onto the current slide
 * - Hover to see the preset name
 * - Click the × button to delete a preset
 * - Create folders and move presets between folders
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { getImageCache } from "@/lib/engine/imageCache";
import { type Preset, type PresetFolder, usePresetStore } from "@/lib/engine/presetStore";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, EngineSlide } from "@/lib/engine/types";
import { renderSlide } from "@/lib/renderer/canvas";

const THUMB_SIZE = 40;

type Props = {
  onClose: () => void;
};

export default function PresetPanel({ onClose }: Props) {
  const presets = usePresetStore((s) => s.presets);
  const folders = usePresetStore((s) => s.folders);
  const deletePreset = usePresetStore((s) => s.deletePreset);
  const renamePreset = usePresetStore((s) => s.renamePreset);
  const movePresetToFolder = usePresetStore((s) => s.movePresetToFolder);
  const createFolder = usePresetStore((s) => s.createFolder);
  const deleteFolder = usePresetStore((s) => s.deleteFolder);
  const renameFolder = usePresetStore((s) => s.renameFolder);
  const ref = useRef<HTMLDivElement | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);

  const rootPresets = useMemo(() => presets.filter((p) => p.folderId === null), [presets]);

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 44,
        left: "50%",
        transform: "translateX(-50%)",
        width: 320,
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 10,
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
        padding: 12,
        zIndex: 20,
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: "1px solid var(--stroke, #e5e7eb)",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--ink, #111)" }}>
          ★ My Presets
        </span>
        <span style={{ fontSize: 10, color: "var(--ink-muted, #9ca3af)" }}>
          {presets.length} saved
        </span>
      </div>

      {/* Folder tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <FolderTab
          label="All"
          count={presets.length}
          active={activeFolderId === null}
          onClick={() => setActiveFolderId(null)}
        />
        <FolderTab
          label="Unsorted"
          count={rootPresets.length}
          active={activeFolderId === "root"}
          onClick={() => setActiveFolderId("root")}
        />
        {folders.map((f) => (
          <FolderTab
            key={f.id}
            label={f.name}
            count={presets.filter((p) => p.folderId === f.id).length}
            active={activeFolderId === f.id}
            onClick={() => setActiveFolderId(f.id)}
            onRename={() => {
              const name = prompt("Folder name:", f.name);
              if (name) renameFolder(f.id, name);
            }}
            onDelete={() => {
              if (confirm(`Delete folder "${f.name}"? Presets will move to Unsorted.`)) {
                deleteFolder(f.id);
                if (activeFolderId === f.id) setActiveFolderId("root");
              }
            }}
          />
        ))}
        <button
          onClick={() => {
            const name = prompt("New folder name:");
            if (!name) return;
            const id = createFolder(name);
            setActiveFolderId(id);
          }}
          style={{
            padding: "2px 8px",
            borderRadius: 12,
            border: "1px dashed var(--stroke, #d1d5db)",
            background: "transparent",
            cursor: "pointer",
            fontSize: 10,
            color: "var(--ink-muted, #6b7280)",
          }}
          title="Create folder"
        >
          + New
        </button>
      </div>

      {/* Preset grid */}
      {activeFolderId !== null && activeFolderId !== "root" && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 10, color: "var(--ink-muted, #9ca3af)" }}>
            {folders.find((f) => f.id === activeFolderId)?.name}
          </span>
          <select
            value={activeFolderId}
            onChange={(e) =>
              movePresetToFolder(
                presets.find((p) => p.folderId === activeFolderId)?.id ?? "",
                e.target.value === "root" ? null : e.target.value,
              )
            }
            style={{ fontSize: 10, borderRadius: 4, border: "1px solid var(--stroke, #e5e7eb)" }}
          >
            <option value="root">Move to Unsorted</option>
            {folders
              .filter((f) => f.id !== activeFolderId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  Move to {f.name}
                </option>
              ))}
          </select>
        </div>
      )}

      {displayedPresets(activeFolderId, presets, rootPresets).length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "var(--ink-muted, #9ca3af)",
            padding: "24px 0",
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
          <div style={{ fontSize: 11 }}>
            {activeFolderId === null
              ? "No presets yet."
              : activeFolderId === "root"
                ? "No unsorted presets."
                : "No presets in this folder."}
          </div>
          <div style={{ fontSize: 10, marginTop: 4 }}>
            Right-click any object and choose
            <br />
            <strong>"Save to Preset"</strong>
          </div>
        </div>
      )}

      {displayedPresets(activeFolderId, presets, rootPresets).length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_SIZE}px, 1fr))`,
            gap: 8,
          }}
        >
          {displayedPresets(activeFolderId, presets, rootPresets).map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              folders={folders}
              activeFolderId={activeFolderId}
              onDelete={() => deletePreset(p.id)}
              onRename={() => {
                const name = prompt("Preset name:", p.name);
                if (name) renamePreset(p.id, name);
              }}
              onMove={(folderId) => movePresetToFolder(p.id, folderId)}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function displayedPresets(
  activeFolderId: string | null,
  presets: Preset[],
  rootPresets: Preset[],
): Preset[] {
  if (activeFolderId === null) return presets;
  if (activeFolderId === "root") return rootPresets;
  return presets.filter((p) => p.folderId === activeFolderId);
}

function FolderTab({
  label,
  count,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onRename || onDelete) setMenuOpen(true);
        }}
        style={{
          padding: "2px 8px",
          borderRadius: 12,
          border: "1px solid",
          borderColor: active ? "var(--accent, #6366f1)" : "var(--stroke, #e5e7eb)",
          background: active ? "var(--accent-light, #eef2ff)" : "var(--surface, #f9fafb)",
          color: active ? "var(--accent, #6366f1)" : "var(--ink, #111)",
          cursor: "pointer",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {label}
        <span style={{ fontSize: 9, opacity: 0.7 }}>{count}</span>
      </button>
      {menuOpen && (onRename || onDelete) && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            zIndex: 30,
            background: "var(--surface-solid, #fff)",
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            padding: "2px 0",
            minWidth: 100,
          }}
        >
          {onRename && (
            <button
              onClick={() => {
                onRename();
                setMenuOpen(false);
              }}
              style={folderMenuItemStyle}
            >
              Rename
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                onDelete();
                setMenuOpen(false);
              }}
              style={{ ...folderMenuItemStyle, color: "#dc2626" }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const folderMenuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "4px 8px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 11,
  textAlign: "left",
  color: "var(--ink, #111)",
};

/** A single preset card with canvas thumbnail */
function PresetCard({
  preset,
  folders,
  activeFolderId,
  onDelete,
  onRename,
  onMove,
  onClose,
}: {
  preset: Preset;
  folders: PresetFolder[];
  activeFolderId: string | null;
  onDelete: () => void;
  onRename: () => void;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const addElement = useEngine((s) => s.addElement);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Render thumbnail
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(THUMB_SIZE * dpr);
    canvas.height = Math.round(THUMB_SIZE * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const elements = preset.elements.map((el) => ({
      ...el,
      id: el.id || crypto.randomUUID(),
    })) as EngineElement[];

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y + el.height > maxY) maxY = el.y + el.height;
    }
    const bw = maxX - minX || 100;
    const bh = maxY - minY || 100;
    const padding = 4;
    const available = THUMB_SIZE - padding * 2;
    const scale = Math.min(available / bw, available / bh, 1);

    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);

    ctx.save();
    const offsetX = (THUMB_SIZE - bw * scale) / 2 - minX * scale;
    const offsetY = (THUMB_SIZE - bh * scale) / 2 - minY * scale;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const fakeSlide: EngineSlide = {
      id: "preview",
      name: "preview",
      background: "transparent",
      elements,
      layers: [],
      width: bw + minX * 2,
      height: bh + minY * 2,
    };
    renderSlide(fakeSlide, { ctx, images: getImageCache() }, bw + minX * 2, bh + minY * 2);
    ctx.restore();
  }, [preset]);

  function handleClick() {
    const state = useEngine.getState();
    const slide = state.doc.slides.find((sl) => sl.id === state.currentSlideId);
    if (!slide) return;

    const centerX = slide.width / 2;
    const centerY = slide.height / 2;

    const els = preset.elements;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of els) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y + el.height > maxY) maxY = el.y + el.height;
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const offsetX = centerX - bw / 2 - minX;
    const offsetY = centerY - bh / 2 - minY;

    const newIds: string[] = [];
    for (const proto of els) {
      const el = {
        ...structuredClone(proto),
        id: crypto.randomUUID(),
        x: proto.x + offsetX,
        y: proto.y + offsetY,
      } as EngineElement;
      newIds.push(el.id);
      addElement(el, "paste preset");
    }

    useEngine.setState({ selectedIds: new Set(newIds) });
    onClose();
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setMenuOpen(false);
      }}
    >
      <button
        onClick={handleClick}
        title={`${preset.name} (${preset.elements.length} element${preset.elements.length > 1 ? "s" : ""})`}
        style={{
          width: "100%",
          aspectRatio: "1",
          border: "1px solid var(--stroke, #e5e7eb)",
          borderRadius: 6,
          overflow: "hidden",
          cursor: "pointer",
          background: "#fafafa",
          padding: 0,
          transition: "all 0.15s ease",
          outline: hovered ? "2px solid var(--accent, #6366f1)" : "none",
          outlineOffset: -1,
        }}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </button>

      {/* Name label */}
      <div
        style={{
          fontSize: 9,
          color: "var(--ink-muted, #6b7280)",
          textAlign: "center",
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {preset.name}
      </div>

      {/* Hover menu */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            display: "flex",
            gap: 2,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            style={miniBtnStyle}
            title="Move to folder"
          >
            ⋮
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            style={miniBtnStyle}
            title="Rename"
          >
            ✎
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={miniBtnStyle}
            title="Delete"
          >
            ×
          </button>
        </div>
      )}

      {menuOpen && (
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 2,
            zIndex: 30,
            background: "var(--surface-solid, #fff)",
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            padding: "2px 0",
            minWidth: 120,
          }}
        >
          <div style={{ padding: "2px 8px", fontSize: 9, color: "#9ca3af" }}>Move to</div>
          {(activeFolderId !== "root" || activeFolderId === null) && (
            <button
              onClick={() => {
                onMove(null);
                setMenuOpen(false);
              }}
              style={folderMenuItemStyle}
            >
              Unsorted
            </button>
          )}
          {folders
            .filter((f) => f.id !== activeFolderId)
            .map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  onMove(f.id);
                  setMenuOpen(false);
                }}
                style={folderMenuItemStyle}
              >
                {f.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

const miniBtnStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 4,
  border: "none",
  background: "rgba(0,0,0,0.5)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 10,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};
