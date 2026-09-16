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
    accentColor: "#6366f1",
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
    accentColor: "#3b82f6",
  },
  {
    id: "high",
    label: "Tier 3 · High",
    badge: "",
    price: "$0.128",
    tier: "Tier 3 (8–10)",
    description: "ความละเอียดสูง สำหรับงานจริง/สื่อพิมพ์/ตัวหนังสือ",
    accentColor: "#8b5cf6",
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
        borderTop: "1px solid #e2e8f0",
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
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: canClear ? "8px 28px 8px 12px" : "8px 12px",
            boxSizing: "border-box",
            position: "relative",
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
                color: "#94a3b8",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 2,
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#64748b";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#94a3b8";
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
                isPromptHelperOpen ? "ปิดตัวช่วยแต่ง Prompt" : "เปิดตัวช่วยแต่ง Prompt (Prompt Helper)"
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
                ? "1.5px solid #6366f1"
                : selectedQuality !== "auto"
                  ? `1.5px solid ${activeOption.accentColor}`
                  : "1px solid #e2e8f0",
              background:
                selectedQuality !== "auto" ? "#f8fafc" : isQualityMenuOpen ? "#f1f5f9" : "#ffffff",
              color: "#1e293b",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              boxShadow: isQualityMenuOpen ? "0 2px 8px rgba(99, 102, 241, 0.15)" : "none",
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
                  color: "#64748b",
                  background: "#f1f5f9",
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
                color: "#94a3b8",
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
                border: "1px solid #e2e8f0",
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
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                  เลือกความละเอียดภาพ (Quality)
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: "#6366f1",
                    background: "#e0e7ff",
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
                        background: isSelected ? "#f8fafc" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.12s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = "#f1f5f9";
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
                              color: isSelected ? opt.accentColor : "#1e293b",
                              fontWeight: isSelected ? 700 : 600,
                            }}
                          >
                            {opt.label}
                          </strong>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#64748b",
                              background: isSelected ? "#e2e8f0" : "#f1f5f9",
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
                            color: "#64748b",
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
                  borderTop: "1px solid #f1f5f9",
                  fontSize: 9.5,
                  color: "#94a3b8",
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
          <div style={{ fontSize: 10.5, color: "#94a3b8" }}>
            {`${activeOption.price} / run`}
          </div>
        )}
      </div>
    </div>
  );
}
