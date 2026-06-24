"use client";

import { useRef, useState } from "react";
import { IconLibrary, IconTrash } from "@/components/icons";
import { cloneElementsForPaste, useLibraryStore } from "@/lib/engine/libraryStore";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement } from "@/lib/engine/types";

type Props = {
  selectedElements: EngineElement[];
  onClose: () => void;
};

export default function LibraryPanel({ selectedElements, onClose }: Props) {
  const items = useLibraryStore((s) => s.items);
  const addItem = useLibraryStore((s) => s.addItem);
  const removeItem = useLibraryStore((s) => s.removeItem);
  const addElement = useEngine((s) => s.addElement);
  const clearSelection = useEngine((s) => s.clearSelection);
  const [name, setName] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  const save = () => {
    if (!selectedElements.length) return;
    const label = name.trim() || `Item ${items.length + 1}`;
    addItem(label, selectedElements);
    setName("");
  };

  const insert = (elements: EngineElement[]) => {
    const clones = cloneElementsForPaste(elements);
    // Offset by 20px so pasted copies are visible and not exactly on top.
    const offset = 20;
    for (const el of clones) {
      addElement({ ...el, x: el.x + offset, y: el.y + offset }, "library insert");
    }
    clearSelection();
    // Select the pasted group
    const ids = clones.map((el) => el.id);
    useEngine.getState().selectOnly(ids);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: 60,
        right: 12,
        width: 240,
        maxHeight: "80vh",
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 12,
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
        padding: 12,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <IconLibrary size={18} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>Library</span>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Name"
          style={{
            flex: 1,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid var(--stroke, #e5e7eb)",
            fontSize: 12,
            background: "var(--surface, #f9fafb)",
            color: "var(--ink, #111)",
          }}
        />
        <button
          onClick={save}
          disabled={selectedElements.length === 0}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "none",
            background: selectedElements.length ? "var(--accent, #6366f1)" : "#e5e7eb",
            color: selectedElements.length ? "#fff" : "#9ca3af",
            fontSize: 12,
            cursor: selectedElements.length ? "pointer" : "not-allowed",
          }}
        >
          Save
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#9ca3af" }}>
        {selectedElements.length === 0
          ? "Select elements to save"
          : `${selectedElements.length} selected`}
      </div>

      <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.length === 0 && (
          <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: 16 }}>
            No saved items yet.
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid var(--stroke, #e5e7eb)",
              background: "var(--surface, #f9fafb)",
            }}
          >
            <button
              onClick={() => insert(item.elements)}
              style={{
                flex: 1,
                textAlign: "left",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--ink, #111)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.name}
              <span style={{ color: "#9ca3af", marginLeft: 6 }}>({item.elements.length})</span>
            </button>
            <button
              onClick={() => removeItem(item.id)}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "#ef4444",
                padding: 2,
              }}
              title="Remove"
            >
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
