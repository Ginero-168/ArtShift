import React from "react";
import InlineTagEditor, { type InlineTagEditorHandle } from "@/components/AI/InlineTagEditor";
import { extractInlineTagObjectIds } from "@/lib/ai/orchestration/inlineTagSynthesis";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { MagicWandPromptIcon, SendIcon, StopIcon } from "@/components/AI/ChatIcons";

export interface ChatComposerProps {
  input: string;
  setInput: (value: string) => void;
  busy: boolean;
  hasSelection: boolean;
  omittedCount: number;
  composerImageRefs: ComposerImageRef[];
  allSlideImageRefs: ComposerImageRef[];
  setEditorRef: (handle: InlineTagEditorHandle | null) => void;
  onSend: (text?: string) => void;
  onStop: () => void;
  onBackspaceAtStart: () => void;
  onInlineTagsChange: (inlineIds: string[]) => void;
  topSlot?: React.ReactNode;
  onTogglePromptHelper?: () => void;
  isPromptHelperOpen?: boolean;
}

export default function ChatComposer({
  input,
  setInput,
  busy,
  hasSelection,
  omittedCount,
  composerImageRefs,
  allSlideImageRefs,
  setEditorRef,
  onSend,
  onStop,
  onBackspaceAtStart,
  onInlineTagsChange,
  topSlot,
  onTogglePromptHelper,
  isPromptHelperOpen = false,
}: ChatComposerProps) {
  return (
    <div
      style={{
        width: "100%",
        flex: "0 0 auto",
        background: "#ffffff",
        borderTop: "1px solid #e2e8f0",
        padding: "10px 14px 14px",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 8,
      }}
    >
      {topSlot}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, width: "100%" }}>
        {/* Input Field with InlineTagEditor */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 90,
            borderRadius: 14,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "8px 12px",
            boxSizing: "border-box",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
          onFocusCapture={(e) => {
            e.currentTarget.style.borderColor = "#4f46e5";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(79, 70, 229, 0.1)";
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderColor = "#e2e8f0";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <InlineTagEditor
            ref={setEditorRef}
            rows={3}
            omittedCount={omittedCount}
            placeholder={
              hasSelection || composerImageRefs.length > 0
                ? "แก้ไขภาพหรือวัตถุที่เลือก..."
                : "บอกสิ่งที่ต้องการออกแบบ..."
            }
            availableImages={allSlideImageRefs}
            onSend={() => onSend()}
            onBackspaceAtStart={onBackspaceAtStart}
            onChange={(val) => {
              setInput(val);
              const inlineIds = extractInlineTagObjectIds(val);
              onInlineTagsChange(inlineIds);
            }}
          />
        </div>

        {/* Action column (Prompt Helper button on top, Send / Stop button below) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
            flex: "0 0 36px",
          }}
        >
          {/* Prompt Refinement Helper Button */}
          {onTogglePromptHelper && (
            <button
              type="button"
              disabled={busy}
              onClick={onTogglePromptHelper}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: isPromptHelperOpen ? "1.5px solid #6366f1" : "1px solid #e2e8f0",
                background: isPromptHelperOpen
                  ? "linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)"
                  : "#f8fafc",
                color: isPromptHelperOpen ? "#4f46e5" : "#6366f1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: busy ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                boxShadow: isPromptHelperOpen ? "0 0 0 2px rgba(99, 102, 241, 0.2)" : "none",
              }}
              title={
                isPromptHelperOpen
                  ? "ปิดตัวช่วยแต่ง Prompt"
                  : "เปิดตัวช่วยแต่ง Prompt (Prompt Helper)"
              }
              onMouseEnter={(e) => {
                if (!busy && !isPromptHelperOpen) {
                  e.currentTarget.style.background = "#f1f5f9";
                  e.currentTarget.style.borderColor = "#c7d2fe";
                  e.currentTarget.style.transform = "scale(1.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (!busy && !isPromptHelperOpen) {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.transform = "scale(1)";
                }
              }}
            >
              <MagicWandPromptIcon style={{ width: 16, height: 16 }} />
            </button>
          )}

          {/* Send / Stop action */}
          <button
            type="button"
            disabled={!busy && !input.trim()}
            onClick={() => (busy ? onStop() : onSend())}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              background: busy ? "#ef4444" : input.trim() ? "#4f46e5" : "#f1f5f9",
              color: busy || input.trim() ? "#ffffff" : "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: busy || !input.trim() ? (busy ? "pointer" : "default") : "pointer",
              transition: "all 0.15s ease",
            }}
            title={busy ? "Cancel current task" : "Send to AI Assistance"}
          >
            {busy ? (
              <StopIcon style={{ width: 12, height: 12, fill: "#ffffff" }} />
            ) : (
              <SendIcon
                style={{
                  width: 14,
                  height: 14,
                  stroke: input.trim() ? "#ffffff" : "#94a3b8",
                }}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
