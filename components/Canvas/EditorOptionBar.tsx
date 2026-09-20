"use client";

import { useEngine } from "@/lib/engine/store";
import { COMMON_TOOL_DEFINITIONS, VECTOR_TOOL_DEFINITIONS } from "./toolRegistry";

const VECTOR_RAIL_TOOLS = [...COMMON_TOOL_DEFINITIONS, ...VECTOR_TOOL_DEFINITIONS];

const toolButtonStyle = (active: boolean) => ({
  height: 42,
  minWidth: 52,
  padding: "3px 4px 2px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column" as const,
  gap: 1,
  border: "none",
  borderRadius: 6,
  background: active ? "var(--accent, #6366f1)" : "transparent",
  color: active ? "#fff" : "var(--ink, #111827)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontSize: 8,
  lineHeight: "10px",
  fontWeight: active ? 700 : 600,
  whiteSpace: "nowrap" as const,
  textAlign: "center" as const,
});

export default function EditorOptionBar() {
  const tool = useEngine((state) => state.tool);
  const setTool = useEngine((state) => state.setTool);

  return (
    <div
      className="editor-option-bar"
      role="toolbar"
      aria-label="Vector editing tools"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        minWidth: 0,
        maxWidth: "100%",
        padding: 3,
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 8,
        background: "var(--surface-solid, #fff)",
        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {VECTOR_RAIL_TOOLS.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            title={option.title}
            aria-label={option.title}
            aria-pressed={tool === option.id}
            onClick={() => setTool(option.id)}
            style={toolButtonStyle(tool === option.id)}
          >
            <Icon size={16} aria-hidden="true" focusable="false" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
