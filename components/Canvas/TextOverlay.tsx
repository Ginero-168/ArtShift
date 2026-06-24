"use client";

/**
 * Inline text editor — a contenteditable div positioned at the text
 * element's screen rect, scaled with the viewport. Commits on blur or
 * Escape; Enter inserts a newline. The element is hidden from the canvas
 * renderer while editing (so no double draw) by the parent.
 */

import { useEffect, useRef, useState } from "react";
import { useEngine } from "@/lib/engine/store";
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
    const lines = text.split("\n");
    const patch: Partial<TextElement> = { text };

    // Auto-expand height
    if (!element.containerId) {
      patch.height = Math.max(
        element.fontSize * 1.4,
        lines.length * element.fontSize * element.lineHeight,
      );
    }

    // Auto-expand width using canvas measureText
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `${element.fontStyle.includes("bold") ? "bold " : ""}${
        element.fontStyle.includes("italic") ? "italic " : ""
      }${element.fontSize}px ${element.fontFamily}`;
      let maxWidth = 0;
      for (const rawLine of lines) {
        const isBullet = rawLine.startsWith("- ") || rawLine.startsWith("• ");
        const line = isBullet ? rawLine.slice(2) : rawLine;
        // Account for bullet indentation + text width (including bold/italic segments).
        const segments = parseRichText(line);
        let lineWidth = 0;
        for (const seg of segments) {
          ctx.font = `${seg.bold || element.fontStyle.includes("bold") ? "bold " : ""}${
            seg.italic || element.fontStyle.includes("italic") ? "italic " : ""
          }${element.fontSize}px ${element.fontFamily}`;
          lineWidth += ctx.measureText(seg.text).width;
        }
        if (isBullet) lineWidth += element.fontSize * 0.8;
        if (lineWidth > maxWidth) maxWidth = lineWidth;
      }
      // Add some padding
      const needed = maxWidth + 16;
      if (!element.containerId && needed > element.width) {
        patch.width = needed;
      }
    }

    updateElements([{ id: element.id, patch }], "text edit");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCommit();
    }
    // Stop hotkeys (V/R/etc.) from firing while editing.
    e.stopPropagation();
  };

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
        minHeight: element.height * scale,
        border: "none",
        resize: "none",
        overflow: "hidden",
        padding: 0,
        paddingTop:
          element.verticalAlign === "middle"
            ? Math.max(
                0,
                (element.height * scale -
                  value.split("\n").length * element.fontSize * element.lineHeight * scale) /
                  2,
              )
            : element.verticalAlign === "bottom"
              ? Math.max(
                  0,
                  element.height * scale -
                    value.split("\n").length * element.fontSize * element.lineHeight * scale,
                )
              : 0,
        margin: 0,
        outline: "2px solid #6366f1",
        outlineOffset: 2,
        background: "transparent",
        color: element.strokeColor,
        fontSize: element.fontSize * scale,
        fontFamily: element.fontFamily,
        fontWeight: element.fontStyle.includes("bold") ? 700 : 400,
        fontStyle: element.fontStyle.includes("italic") ? "italic" : "normal",
        lineHeight: element.lineHeight,
        textAlign: element.textAlign,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        cursor: "text",
        zIndex: 5,
      }}
    />
  );
}

type Segment = { text: string; bold: boolean; italic: boolean };

function parseRichText(text: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let bold = false;
  let italic = false;
  let current = "";

  function flush() {
    if (current) {
      segments.push({ text: current, bold, italic });
      current = "";
    }
  }

  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      flush();
      bold = !bold;
      i += 2;
    } else if (text[i] === "*") {
      flush();
      italic = !italic;
      i += 1;
    } else {
      current += text[i];
      i++;
    }
  }
  flush();
  if (segments.length === 0) segments.push({ text, bold: false, italic: false });
  return segments;
}
