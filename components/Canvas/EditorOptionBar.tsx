"use client";

import { useState } from "react";
import { IconBrief } from "@/components/icons";
import { convertImageToBrief } from "@/lib/ai/briefGenerator";
import { reportAIError } from "@/lib/ai/progressReporter";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { COMMON_TOOL_DEFINITIONS, VECTOR_TOOL_DEFINITIONS } from "./toolRegistry";

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
  fontSize: 8,
  lineHeight: "10px",
  fontWeight: active ? 700 : 600,
  whiteSpace: "nowrap" as const,
  textAlign: "center" as const,
});

export default function EditorOptionBar() {
  const tool = useEngine((state) => state.tool);
  const setTool = useEngine((state) => state.setTool);
  const tools = [...COMMON_TOOL_DEFINITIONS, ...VECTOR_TOOL_DEFINITIONS];

  const [briefBusy, setBriefBusy] = useState(false);

  const handleToolbarConvertToBrief = async () => {
    if (briefBusy) return;
    const state = useEngine.getState();
    const slide = state.currentSlide();
    if (!slide) return;
    const selectedImage = slide.elements.find(
      (el): el is ImageElement =>
        el.type === "image" && state.selectedIds.has(el.id) && !el.isDeleted,
    );
    const anyImage = slide.elements.find(
      (el): el is ImageElement => el.type === "image" && !el.isDeleted,
    );
    const targetImage = selectedImage || anyImage;
    if (!targetImage) {
      reportAIError({
        taskId: `brief-${crypto.randomUUID()}`,
        operation: "Convert to Brief",
        message: "กรุณาวางหรือเลือกรูปภาพบน Canvas ก่อนสร้างบรีฟนะคะ",
      });
      return;
    }
    setBriefBusy(true);
    try {
      await convertImageToBrief(targetImage, { cloudConsent: true });
    } catch {
      // convertImageToBrief already reports the failure to AI Assistance Chat.
    } finally {
      setBriefBusy(false);
    }
  };

  return (
    <div
      className="editor-option-bar"
      role="toolbar"
      aria-label="Vector editing tools"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
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
      <div
        role="group"
        aria-label="Vector tools"
        style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
      >
        {tools.map((option) => {
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
              <Icon size={15} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      <span
        aria-hidden="true"
        style={{ width: 1, height: 20, margin: "0 3px", background: "var(--stroke, #e5e7eb)" }}
      />

      <button
        type="button"
        title="Convert to Brief: สร้างบรีฟเส้น กรอบ และตัวหนังสือจากภาพ Reference"
        aria-label="Convert to Brief"
        onClick={() => void handleToolbarConvertToBrief()}
        disabled={briefBusy}
        style={{
          ...toolButtonStyle(false),
          color: briefBusy ? "var(--ink-muted, #94a3b8)" : "var(--accent, #6366f1)",
          background: "rgba(99, 102, 241, 0.08)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          cursor: briefBusy ? "wait" : "pointer",
        }}
      >
        <IconBrief size={15} />
        <span>{briefBusy ? "Briefing..." : "Brief"}</span>
      </button>
    </div>
  );
}
