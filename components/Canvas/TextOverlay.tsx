"use client";

/**
 * Inline text editor — a contenteditable div positioned at the text
 * element's screen rect, scaled with the viewport. Commits on blur or
 * Escape; Enter inserts a newline. The element is hidden from the canvas
 * renderer while editing (so no double draw) by the parent.
 */

import { useEffect, useRef, useState } from "react";
import { useEngine } from "@/lib/engine/store";
import { getTextRenderPadding, isPointText } from "@/lib/engine/textLayout";
import type { TextElement } from "@/lib/engine/types";

type Props = {
  element: TextElement;
  /** Top-left of the element in container-local screen px. */
  screen: { x: number; y: number };
  scale: number;
  onCommit: () => void;
};

export default function TextOverlay({ element, screen, scale, onCommit }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(element.text);
  const updateElements = useEngine((s) => s.updateElements);
  const point = isPointText(element);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.currentTarget.value;
    setValue(text);
    updateElements([{ id: element.id, patch: { text } }], "text edit");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCommit();
    }
    // Stop hotkeys (V/R/etc.) from firing while editing.
    e.stopPropagation();
  };

  const renderPadding = getTextRenderPadding(element) * scale;
  const textHeight =
    Math.max(1, value.split("\n").length) * element.fontSize * element.lineHeight * scale;
  const boxHeight = element.height * scale;
  const lastSafeStart = Math.max(renderPadding, boxHeight - renderPadding - textHeight);
  const paddingTop =
    element.verticalAlign === "middle"
      ? Math.min(lastSafeStart, Math.max(renderPadding, (boxHeight - textHeight) / 2))
      : element.verticalAlign === "bottom"
        ? lastSafeStart
        : renderPadding;

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      spellCheck={false}
      style={{
        position: "absolute",
        left: screen.x,
        top: screen.y,
        width: element.width * scale,
        height: element.height * scale,
        minHeight: element.height * scale,
        boxSizing: "border-box",
        border: "none",
        resize: "none",
        overflow: point ? "visible" : "hidden",
        padding: `${paddingTop}px ${renderPadding}px ${renderPadding}px`,
        margin: 0,
        outline: "2px solid #d64418",
        outlineOffset: 2,
        background:
          element.backgroundColor === "transparent" ? "transparent" : element.backgroundColor,
        borderRadius: (element.cornerRadius ?? 0) * scale,
        color: element.strokeColor,
        fontSize: element.fontSize * scale,
        fontFamily: element.fontFamily,
        fontWeight: element.fontStyle.includes("bold") ? 700 : 400,
        fontStyle: element.fontStyle.includes("italic") ? "italic" : "normal",
        lineHeight: element.lineHeight,
        textAlign: element.textAlign,
        whiteSpace: point ? "pre" : "pre-wrap",
        wordBreak: point ? "normal" : "break-word",
        cursor: "text",
        zIndex: 5,
      }}
    />
  );
}
