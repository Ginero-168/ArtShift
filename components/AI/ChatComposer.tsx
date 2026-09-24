"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MagicWandPromptIcon, SendIcon, StopIcon } from "@/components/AI/ChatIcons";
import InlineTagEditor, { type InlineTagEditorHandle } from "@/components/AI/InlineTagEditor";
import {
  IconCheck,
  IconChevronDown,
  IconCrown,
  IconGem,
  IconTierDot,
  IconZap,
} from "@/components/icons";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { extractInlineTagObjectIds } from "@/lib/ai/orchestration/inlineTagSynthesis";

export type QualitySelection = "auto" | "low" | "medium" | "high" | "xhigh" | "max";

export interface QualityOption {
  id: QualitySelection;
  label: string;
  badge: string;
  price: string;
  tier: string;
  description: string;
  accentColor: string;
}

export function renderQualityIcon(id: QualitySelection, accentColor: string, size = 14) {
  switch (id) {
    case "auto":
      return <IconZap size={size} fill={accentColor} stroke={accentColor} />;
    case "low":
    case "medium":
    case "high":
      return <IconTierDot size={size} color={accentColor} />;
    case "xhigh":
      return <IconGem size={size} color={accentColor} fill={accentColor} fillOpacity={0.25} />;
    case "max":
      return <IconCrown size={size} color={accentColor} fill={accentColor} fillOpacity={0.3} />;
    default:
      return <IconZap size={size} color={accentColor} />;
  }
}

export const QUALITY_OPTIONS: readonly QualityOption[] = [
  {
    id: "auto",
    label: "Auto",
    badge: "",
    price: "Auto",
    tier: "Tier 1-3",
    description: "คำนวณอัตโนมัติ: Tier 1 (Low) / Tier 2 (Med) / Tier 3 (High)",
    accentColor: "#1a1714",
  },
  {
    id: "low",
    label: "Tier 1 · Low",
    badge: "",
    price: "$0.012",
    tier: "Tier 1 (0–3)",
    description: "ประหยัด & สร้างภาพรวดเร็ว เหมาะกับงานร่าง",
    accentColor: "#10b981",
  },
  {
    id: "medium",
    label: "Tier 2 · Medium",
    badge: "",
    price: "$0.047",
    tier: "Tier 2 (4–7)",
    description: "คุณภาพมาตรฐาน คมชัดสมดุล สำหรับงานทั่วไป",
    accentColor: "#2743d6",
  },
  {
    id: "high",
    label: "Tier 3 · High",
    badge: "",
    price: "$0.128",
    tier: "Tier 3 (8–10)",
    description: "ความละเอียดสูง สำหรับงานจริง/สื่อพิมพ์/ตัวหนังสือ",
    accentColor: "#d64418",
  },
  {
    id: "xhigh",
    label: "X-High",
    badge: "",
    price: "$0.250",
    tier: "Special",
    description: "ความคมชัดระดับสูงพิเศษ เก็บรายละเอียดลึก",
    accentColor: "#ec4899",
  },
  {
    id: "max",
    label: "Max",
    badge: "",
    price: "$0.500",
    tier: "Masterwork",
    description: "รายละเอียดสูงสุดระดับ Masterwork ละเอียดทุกพิกเซล",
    accentColor: "#f59e0b",
  },
] as const;

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
  onClear?: () => void;
  topSlot?: React.ReactNode;
  onTogglePromptHelper?: () => void;
  isPromptHelperOpen?: boolean;
  selectedQuality?: QualitySelection;
  onSelectQuality?: (quality: QualitySelection) => void;
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
  onClear,
  topSlot,
  onTogglePromptHelper,
  isPromptHelperOpen = false,
  selectedQuality = "auto",
  onSelectQuality,
}: ChatComposerProps) {
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement>(null);
  const canClear = Boolean(onClear) && (Boolean(input.trim()) || composerImageRefs.length > 0);

  // Close dropdown on outside click or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(event.target as Node)) {
        setIsQualityMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsQualityMenuOpen(false);
      }
    }
    if (isQualityMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isQualityMenuOpen]);

  const activeOption =
    QUALITY_OPTIONS.find((opt) => opt.id === selectedQuality) || QUALITY_OPTIONS[0];

  return (
    <div
      style={{
        width: "100%",
        flex: "0 0 auto",
        background: "#ffffff",
        borderTop: "1px solid #ece7e0",
        padding: "10px 14px 14px",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 8,
        position: "relative",
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
            background: "#fcf9f5",
            border: "1px solid #ece7e0",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: canClear ? "8px 28px 8px 12px" : "8px 12px",
            boxSizing: "border-box",
            position: "relative",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
          onFocusCapture={(e) => {
            e.currentTarget.style.borderColor = "#b52c00";
            e.currentTarget.style.boxShadow = "0 0 0 2px rgba(181, 44, 0, 0.1)";
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderColor = "#ece7e0";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {canClear && (
            <button
              type="button"
              data-testid="composer-clear-all"
              aria-label="ล้างข้อความและแท็กทั้งหมด"
              title="ล้างช่องแชท"
              onClick={onClear}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 22,
                height: 22,
                padding: 0,
                margin: 0,
                border: "none",
                borderRadius: 6,
                background: "transparent",
                color: "#a7a198",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 2,
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#78726a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#a7a198";
              }}
            >
              <CloseIcon style={{ width: 12, height: 12, color: "currentColor" }} />
            </button>
          )}
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
                border: isPromptHelperOpen ? "1.5px solid #d64418" : "1px solid #ece7e0",
                background: isPromptHelperOpen ? "#fff0ea" : "#fcf9f5",
                color: isPromptHelperOpen ? "#b52c00" : "#d64418",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: busy ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                boxShadow: isPromptHelperOpen ? "0 0 0 2px rgba(214, 68, 24, 0.2)" : "none",
              }}
              title={
                isPromptHelperOpen ? "ปิดตัวช่วยแต่ง Prompt" : "เปิดตัวช่วยแต่ง Prompt (Prompt Helper)"
              }
              onMouseEnter={(e) => {
                if (!busy && !isPromptHelperOpen) {
                  e.currentTarget.style.background = "#f8f4ef";
                  e.currentTarget.style.borderColor = "#ffc7b3";
                  e.currentTarget.style.transform = "scale(1.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (!busy && !isPromptHelperOpen) {
                  e.currentTarget.style.background = "#fcf9f5";
                  e.currentTarget.style.borderColor = "#ece7e0";
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
              background: busy ? "#ef4444" : input.trim() ? "#b52c00" : "#f8f4ef",
              color: busy || input.trim() ? "#ffffff" : "#a7a198",
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
                  stroke: input.trim() ? "#ffffff" : "#a7a198",
                }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Toolbar row with Quality Selector — below chat input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 12,
        }}
      >
        <div ref={qualityMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => setIsQualityMenuOpen((prev) => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              border: isQualityMenuOpen
                ? "1.5px solid #d64418"
                : selectedQuality !== "auto"
                  ? `1.5px solid ${activeOption.accentColor}`
                  : "1px solid #ece7e0",
              background:
                selectedQuality !== "auto" ? "#fcf9f5" : isQualityMenuOpen ? "#f8f4ef" : "#ffffff",
              color: "#2c2824",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              boxShadow: isQualityMenuOpen ? "0 2px 8px rgba(214, 68, 24, 0.15)" : "none",
            }}
            title="คลิกเพื่อเลือกระดับคุณภาพของภาพ (openai/gpt-image-2.5-sunburst)"
          >
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              {renderQualityIcon(activeOption.id, activeOption.accentColor, 14)}
            </span>
            <span>Quality:</span>
            <span style={{ color: activeOption.accentColor, fontWeight: 700 }}>
              {activeOption.label.split(" · ")[1] || activeOption.label}
            </span>
            {selectedQuality !== "auto" && (
              <span
                style={{
                  fontSize: 10,
                  color: "#78726a",
                  background: "#f8f4ef",
                  padding: "1px 5px",
                  borderRadius: 6,
                }}
              >
                {activeOption.price}
              </span>
            )}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                color: "#a7a198",
                marginLeft: 2,
                transform: isQualityMenuOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.15s ease",
              }}
            >
              <IconChevronDown size={11} />
            </span>
          </button>

          {/* Quality Options Dropdown List — opens upward */}
          {isQualityMenuOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                width: 310,
                background: "#ffffff",
                border: "1px solid #ece7e0",
                borderRadius: 12,
                boxShadow:
                  "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                zIndex: 9999,
                animation: "fadeIn 0.12s ease-out",
              }}
            >
              {/* Dropdown Header */}
              <div
                style={{
                  padding: "6px 8px 4px",
                  borderBottom: "1px solid #f8f4ef",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#58534c" }}>
                  เลือกความละเอียดภาพ (Quality)
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: "#d64418",
                    background: "#ffe2d6",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  Sunburst Only
                </span>
              </div>

              {/* Options List */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  maxHeight: 280,
                  overflowY: "auto",
                }}
              >
                {QUALITY_OPTIONS.map((opt) => {
                  const isSelected = selectedQuality === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelectQuality?.(opt.id);
                        setIsQualityMenuOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: isSelected
                          ? `1.5px solid ${opt.accentColor}`
                          : "1px solid transparent",
                        background: isSelected ? "#fcf9f5" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.12s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "#f8f4ef";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", marginTop: 2 }}>
                        {renderQualityIcon(opt.id, opt.accentColor, 15)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 4,
                          }}
                        >
                          <strong
                            style={{
                              fontSize: 12,
                              color: isSelected ? opt.accentColor : "#2c2824",
                              fontWeight: isSelected ? 700 : 600,
                            }}
                          >
                            {opt.label}
                          </strong>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#78726a",
                              background: isSelected ? "#ece7e0" : "#f8f4ef",
                              padding: "1px 5px",
                              borderRadius: 4,
                            }}
                          >
                            {opt.price}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#78726a",
                            marginTop: 2,
                            lineHeight: 1.3,
                          }}
                        >
                          {opt.description}
                        </div>
                      </div>
                      {isSelected && (
                        <span
                          style={{
                            color: opt.accentColor,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <IconCheck size={14} color={opt.accentColor} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Dropdown Footer Note */}
              <div
                style={{
                  padding: "4px 8px 2px",
                  borderTop: "1px solid #f8f4ef",
                  fontSize: 9.5,
                  color: "#a7a198",
                  textAlign: "center",
                }}
              >
                โมเดล: openai/gpt-image-2.5-sunburst
              </div>
            </div>
          )}
        </div>

        {/* Selected Quality Hint */}
        {selectedQuality !== "auto" && (
          <div style={{ fontSize: 10.5, color: "#a7a198" }}>{`${activeOption.price} / run`}</div>
        )}
      </div>
    </div>
  );
}
