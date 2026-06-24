"use client";

/**
 * Sandbox preview for the new engine canvas.
 *
 * Open at /sandbox to manually exercise the rewrite without touching the
 * live editor. Provides a tiny tool palette so you can drag rectangles,
 * ellipses, lines, arrows, and freehand strokes onto a 1920×1080 slide.
 */

import { useEffect } from "react";
import CanvasEditor from "@/components/Canvas/CanvasEditor";
import { legacyToEngineDoc } from "@/lib/engine/adapter";
import { type Tool, useEngine } from "@/lib/engine/store";
import { useStore } from "@/lib/store";

const TOOLS: { id: Tool; label: string; hotkey: string }[] = [
  { id: "select", label: "Select", hotkey: "V" },
  { id: "rect", label: "Rect", hotkey: "R" },
  { id: "ellipse", label: "Ellipse", hotkey: "O" },
  { id: "diamond", label: "Diamond", hotkey: "D" },
  { id: "line", label: "Line", hotkey: "L" },
  { id: "arrow", label: "Arrow", hotkey: "A" },
  { id: "freedraw", label: "Pen", hotkey: "P" },
  { id: "text", label: "Text", hotkey: "T" },
];

export default function SandboxPage() {
  const tool = useEngine((s) => s.tool);
  const setTool = useEngine((s) => s.setTool);
  const undo = useEngine((s) => s.undo);
  const redo = useEngine((s) => s.redo);
  const deleteElements = useEngine((s) => s.deleteElements);
  const selectedIds = useEngine((s) => s.selectedIds);
  const loadDoc = useEngine((s) => s.loadDoc);

  useEffect(() => {
    (window as unknown as { __engine?: typeof useEngine }).__engine = useEngine;
  }, []);

  async function importLegacy() {
    const legacy = useStore.getState().doc;
    const engineDoc = await legacyToEngineDoc(legacy);
    loadDoc(engineDoc);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size) {
          e.preventDefault();
          deleteElements(Array.from(selectedIds));
        }
        return;
      }
      const k = e.key.toLowerCase();
      const found = TOOLS.find((tt) => tt.hotkey.toLowerCase() === k);
      if (found) setTool(found.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteElements, redo, selectedIds, setTool, undo]);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
        }}
      >
        <strong style={{ fontSize: 13, marginRight: 8 }}>Engine sandbox</strong>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: tool === t.id ? "#6366f1" : "#fff",
              color: tool === t.id ? "#fff" : "#111827",
              fontSize: 12,
              cursor: "pointer",
            }}
            title={`${t.label} (${t.hotkey})`}
          >
            {t.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          onClick={importLegacy}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #c7d2fe",
            background: "#eef2ff",
            color: "#3730a3",
            fontSize: 12,
          }}
          title="Load the current legacy SlideDoc into the new engine via adapter"
        >
          Import legacy
        </button>
        <button
          onClick={undo}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: 12,
          }}
        >
          Undo
        </button>
        <button
          onClick={redo}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: 12,
          }}
        >
          Redo
        </button>
        <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>
          Space-drag = pan · ⌘-wheel = zoom
        </span>
      </header>
      <main style={{ flex: 1, position: "relative" }}>
        <CanvasEditor />
      </main>
    </div>
  );
}
