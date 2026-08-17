"use client";

/**
 * Right-click context menu for the engine canvas.
 *
 * Renders a small floating menu at the screen position passed in. The set of
 * actions shown depends on whether anything is selected and how many. Closes
 * on outside-click, Escape, or any action.
 */

import { useEffect, useRef } from "react";
import { usePresetStore } from "@/lib/engine/presetStore";
import { useEngine } from "@/lib/engine/store";
import { convertElementToVectorPath } from "@/lib/engine/vectorPath";

type Props = {
  /** Screen position (CSS px relative to viewport). */
  position: { x: number; y: number };
  onClose: () => void;
};

export default function ContextMenu({ position, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedIds = useEngine((s) => s.selectedIds);

  const copyElements = useEngine((s) => s.copyElements);
  const cutElements = useEngine((s) => s.cutElements);
  const pasteElements = useEngine((s) => s.pasteElements);
  const deleteElements = useEngine((s) => s.deleteElements);
  const groupElements = useEngine((s) => s.groupElements);
  const ungroupElements = useEngine((s) => s.ungroupElements);
  const flipHorizontal = useEngine((s) => s.flipHorizontal);
  const flipVertical = useEngine((s) => s.flipVertical);
  const bringForward = useEngine((s) => s.bringForward);
  const sendBackward = useEngine((s) => s.sendBackward);
  const bringToFront = useEngine((s) => s.bringToFront);
  const sendToBack = useEngine((s) => s.sendToBack);
  const selectAll = useEngine((s) => s.selectAll);

  // Close on outside-click + Escape.
  useEffect(() => {
    function onDocPointer(ev: PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(ev.target as Node)) onClose();
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDocPointer, { capture: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, { capture: true });
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const ids = Array.from(selectedIds);
  const has = ids.length > 0;

  const items: Array<
    | { kind: "item"; label: string; hint?: string; onClick: () => void; disabled?: boolean }
    | { kind: "sep" }
  > = [];
  if (has) {
    items.push(
      { kind: "item", label: "Cut", hint: "⌘X", onClick: () => cutElements(ids) },
      { kind: "item", label: "Copy", hint: "⌘C", onClick: () => copyElements(ids) },
    );
  }
  items.push({ kind: "item", label: "Paste", hint: "⌘V", onClick: () => pasteElements() });
  if (has) {
    items.push(
      {
        kind: "item",
        label: "Duplicate",
        hint: "⌘D",
        onClick: () => {
          copyElements(ids);
          pasteElements();
        },
      },
      { kind: "sep" },
      { kind: "item", label: "Bring Forward", hint: "]", onClick: () => bringForward(ids) },
      { kind: "item", label: "Send Backward", hint: "[", onClick: () => sendBackward(ids) },
      { kind: "item", label: "Bring to Front", hint: "⌘]", onClick: () => bringToFront(ids) },
      { kind: "item", label: "Send to Back", hint: "⌘[", onClick: () => sendToBack(ids) },
      { kind: "sep" },
      { kind: "item", label: "Flip Horizontal", hint: "⇧H", onClick: () => flipHorizontal(ids) },
      { kind: "item", label: "Flip Vertical", hint: "⇧V", onClick: () => flipVertical(ids) },
    );

    if (ids.length === 1) {
      items.push(
        { kind: "sep" },
        {
          kind: "item",
          label: "✒ Edit Vector Points",
          hint: "Double-click",
          onClick: () => {
            const slide = useEngine
              .getState()
              .doc.slides.find((sl) => sl.id === useEngine.getState().currentSlideId);
            if (!slide || ids.length !== 1) return;
            const el = slide.elements.find((e) => e.id === ids[0]);
            if (!el) return;
            if (el.type !== "path") {
              const converted = convertElementToVectorPath(el);
              if (converted) {
                useEngine
                  .getState()
                  .updateElements([{ id: el.id, patch: converted }], "convert to editable path");
              }
            }
            useEngine.getState().setTool("directSelect");
          },
        },
      );
    }
    if (ids.length > 1) {
      items.push(
        { kind: "sep" },
        { kind: "item", label: "Group", hint: "⌘G", onClick: () => groupElements(ids) },
        { kind: "item", label: "Ungroup", hint: "⌘⇧G", onClick: () => ungroupElements(ids) },
      );
    }
    items.push(
      { kind: "sep" },
      {
        kind: "item",
        label: "★ Save to Preset",
        onClick: () => {
          const slide = useEngine
            .getState()
            .doc.slides.find((sl) => sl.id === useEngine.getState().currentSlideId);
          if (!slide) return;
          const elements = slide.elements.filter((el) => ids.includes(el.id) && !el.isDeleted);
          if (!elements.length) return;
          const name = prompt(
            "Preset name:",
            `Preset ${usePresetStore.getState().presets.length + 1}`,
          );
          if (!name) return;
          usePresetStore.getState().savePreset(name, elements);
        },
      },
      { kind: "item", label: "Delete", hint: "⌫", onClick: () => deleteElements(ids) },
    );
  } else {
    items.push(
      { kind: "sep" },
      { kind: "item", label: "Select All", hint: "⌘A", onClick: () => selectAll() },
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        minWidth: 200,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
        padding: 4,
        zIndex: 9999,
        fontSize: 13,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.kind === "sep" ? (
          <div key={`sep-${i}`} style={{ height: 1, background: "#f3f4f6", margin: "4px 0" }} />
        ) : (
          <button
            key={item.label}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 10px",
              border: "none",
              background: "transparent",
              color: item.disabled ? "#9ca3af" : "#111827",
              cursor: item.disabled ? "default" : "pointer",
              borderRadius: 4,
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span>{item.label}</span>
            {item.hint && <span style={{ color: "#9ca3af", fontSize: 11 }}>{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
