import React from "react";
import InlineTagEditor, { type InlineTagEditorHandle } from "@/components/AI/InlineTagEditor";
import { extractInlineTagObjectIds } from "@/lib/ai/orchestration/inlineTagSynthesis";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { SendIcon, StopIcon } from "@/components/AI/ChatIcons";

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

        {/* Send / Stop action */}
        <button
          type="button"
          disabled={!busy && !input.trim()}
          onClick={() => (busy ? onStop() : onSend())}
          style={{
            flex: "0 0 36px",
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
  );
}
