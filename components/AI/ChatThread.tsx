import React, { useEffect, useState } from "react";
import type { CoPilotMessage, SubAgentActionLog } from "@/lib/ai/coPilot";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import type { CoPilotErrorCard } from "@/lib/ai/coPilot";
import ComposerImageTags from "@/components/AI/ComposerImageTags";
import InlineTagRenderer from "@/components/AI/InlineTagRenderer";
import {
  ChevronDownIcon,
  CheckIcon,
  CloseIcon,
  ImageSparkleIcon,
  SpinnerIcon,
  ThoughtBrainIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TrashIcon,
} from "@/components/AI/ChatIcons";
import { UNIFIED_AI_SYSTEM } from "@/lib/ai/unifiedSystem";
import { ContentPolicyErrorCard } from "@/components/AI/ChatActionCards";

export interface ChatThreadProps {
  messages: CoPilotMessage[];
  busy: boolean;
  liveAssistantState: {
    stage: "outputting" | "generating" | "analyzing" | "planning";
    thought?: string;
    toolLabel?: string;
    requestedCount?: number;
    statusMessage?: string;
    prompt?: string;
    isEdit?: boolean;
    stepDetails?: string[];
  } | null;
  streamingText: string;
  currentActions: SubAgentActionLog[];
  feedbackState: Record<string, "up" | "down">;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSelectCanvasImage: (fileId?: string) => void;
  onSelectSuggestion: (sug: string, errorCard?: CoPilotErrorCard) => void;
  onToggleFeedback: (messageId: string, type: "up" | "down") => void;
  onClearHistory: () => void;
  onEditPromptFromError?: (prompt: string) => void;
  children?: React.ReactNode;
}

export function UserMessageImagePreviews({
  refs,
  onSelect,
}: {
  refs: readonly ComposerImageRef[];
  onSelect: (fileId: string) => void;
}) {
  const [, rerender] = useState(0);
  useEffect(() => subscribeImageCache(() => rerender((v) => v + 1)), []);

  if (refs.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        gap: 8,
        width: "100%",
        marginBottom: 6,
      }}
    >
      {refs.map((ref) => {
        const dataUrl = getCached(ref.fileId)?.dataURL;
        return (
          <div
            key={`${ref.objectId}:${ref.elementVersion}`}
            onClick={() => onSelect(ref.fileId)}
            draggable={true}
            onDragStart={(e) => {
              const cachedData = getCached(ref.fileId);
              const url = cachedData?.dataURL || "";
              e.dataTransfer.setData(
                "application/x-artshift-chat-image",
                JSON.stringify({ fileId: ref.fileId, url }),
              );
              e.dataTransfer.setData("artshift/file-id", ref.fileId);
              if (url) {
                e.dataTransfer.setData("text/uri-list", url);
                e.dataTransfer.setData("text/plain", url);
              }
              e.dataTransfer.effectAllowed = "copy";
            }}
            title={`คลิกเพื่อเลือกภาพ ${ref.displayName} หรือลากไปวางบน Canvas`}
            style={{
              position: "relative",
              maxWidth: refs.length === 1 ? 240 : 150,
              width: refs.length === 1 ? "auto" : 140,
              minWidth: 110,
              borderRadius: 12,
              overflow: "hidden",
              background: "#f8fafc",
              border: "1.5px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
              cursor: "grab",
              transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.02)";
              e.currentTarget.style.borderColor = "#6366f1";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(99, 102, 241, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.08)";
            }}
          >
            {dataUrl ? (
              // biome-ignore lint/performance/noImgElement: user message referenced image preview
              <img
                src={dataUrl}
                alt={ref.displayName}
                draggable={false}
                style={{
                  width: "100%",
                  maxHeight: 200,
                  display: "block",
                  objectFit: "cover",
                  pointerEvents: "none",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: 100,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#e2e8f0",
                  color: "#64748b",
                  fontSize: 11,
                }}
              >
                กำลังโหลดภาพ...
              </div>
            )}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "4px 8px",
                background: "linear-gradient(to top, rgba(15, 23, 42, 0.8) 0%, transparent 100%)",
                color: "#ffffff",
                fontSize: 11,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 10 }}>📷</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                @{ref.displayName}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CollapsibleThought({
  thought,
  isLive = false,
  defaultOpen = false,
  statusMessage,
  stage = "outputting",
  prompt,
  isEdit = false,
  customMessages,
}: {
  thought: string;
  isLive?: boolean;
  defaultOpen?: boolean;
  statusMessage?: string;
  stage?: "outputting" | "generating" | "analyzing" | "planning";
  prompt?: string;
  isEdit?: boolean;
  customMessages?: string[];
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(1);

  // Rotating thought messages list tailored to context
  const messageList = React.useMemo(() => {
    if (customMessages && customMessages.length > 0) {
      return customMessages;
    }

    if (isEdit) {
      return [
        "กำลังวิเคราะห์รายละเอียดและตัวละครในภาพต้นฉบับ...",
        "กำลังทำความเข้าใจคำขอและวางแผนปรับแต่ง...",
        "Creative Director กำลังออกแบบบรรยากาศ แสง และเงา...",
        "กำลังจัดวางองค์ประกอบให้กลมกลืนกับภาพเดิม...",
        "กำลังส่งคำสั่งเพื่อเรนเดอร์รายละเอียดภาพ...",
        "กำลังตรวจสอบคุณภาพและความสมดุลของผลงาน...",
      ];
    }

    if (stage === "generating") {
      return [
        "กำลังวิเคราะห์โจทย์และคอนเซปต์ภาพ...",
        "Creative Director กำลังจัดวางมุมกล้องและสัดส่วนภาพ...",
        "กำลังคัดสรรคู่สี โทนแสง และรายละเอียดพื้นผิว...",
        "กำลังส่งคำสั่งสร้างภาพความละเอียดสูง...",
        "กำลังเรนเดอร์และปรับแต่งความสมบูรณ์...",
        "กำลังตรวจสอบคุณภาพงานก่อนส่งมอบ...",
      ];
    }

    if (stage === "analyzing") {
      return [
        "กำลังวิเคราะห์ภาพต้นฉบับและบริบทที่เกี่ยวข้อง...",
        "กำลังตรวจจับวัตถุและโครงสร้างบน Canvas...",
        "กำลังประเมินจุดสำคัญเพื่อนำมาใช้ออกแบบ...",
        "กำลังส่งต่อข้อมูลให้ Creative Director...",
      ];
    }

    if (stage === "planning") {
      return [
        "Creative Director กำลังวิเคราะห์และระดมไอเดีย...",
        "กำลังจัดวางโครงสร้างและองค์ประกอบศิลป์...",
        "กำลังเลือกสไตล์และโมเดลที่เหมาะสมที่สุด...",
        "กำลังจัดเตรียมแนวทางสร้างภาพที่แม่นยำ...",
      ];
    }

    return [
      "กำลังคิดและวิเคราะห์บริบท...",
      "กำลังทำความเข้าใจคำสั่งอย่างละเอียด...",
      "กำลังวางแผนขั้นตอนการทำงาน...",
      "Creative Director กำลังจัดเตรียมผลลัพธ์...",
      "กำลังตรวจสอบความถูกต้องและรายละเอียด...",
    ];
  }, [stage, isEdit, customMessages]);

  const effectiveMessages = React.useMemo(() => {
    if (
      statusMessage &&
      !statusMessage.startsWith("กำลังจัดเตรียม") &&
      !statusMessage.startsWith("กำลังวิเคราะห์บริบท")
    ) {
      if (!messageList.includes(statusMessage)) {
        return [statusMessage, ...messageList];
      }
    }
    return messageList;
  }, [messageList, statusMessage]);

  const currentMessage = effectiveMessages[messageIndex % effectiveMessages.length];

  // Rotate messages while active
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % effectiveMessages.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isLive, effectiveMessages.length]);

  // Elapsed time counter
  useEffect(() => {
    if (!isLive) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.max(1, Math.floor((Date.now() - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  const workflowSteps = React.useMemo(() => {
    const isAnalyzing = stage === "analyzing";
    const isPlanning = stage === "planning" || stage === "outputting";
    const isGenerating = stage === "generating";

    return [
      {
        label: isEdit ? "วิเคราะห์ภาพต้นฉบับและบริบทคำขอ" : "วิเคราะห์คำสั่งและบริบทบน Canvas",
        status: isAnalyzing ? "current" : "done",
      },
      {
        label: "Creative Director วางแผนแนวคิดและจัดองค์ประกอบ",
        status: isAnalyzing ? "pending" : isPlanning ? "current" : "done",
      },
      {
        label: isEdit ? "ปรับแต่งภาพ คุมแสงเงาและสไตล์เดิม" : "สร้างและเรนเดอร์ภาพความละเอียดสูง",
        status: isGenerating ? "current" : isPlanning || isAnalyzing ? "pending" : "done",
      },
    ];
  }, [stage, isEdit]);

  const thoughtDisplay = React.useMemo(() => {
    if (
      thought &&
      thought !== "กำลังจัดเตรียมผลลัพธ์..." &&
      thought !== "กำลังวิเคราะห์บริบทและเตรียมการสร้างภาพ..."
    ) {
      return thought;
    }
    if (isEdit) {
      const cleanPrompt = prompt ? prompt.replace(/@[^\s]+\s*/g, "").trim() : "";
      return cleanPrompt
        ? `กำลังวิเคราะห์ภาพต้นฉบับ และวางแผนปรับแต่งภาพโดย ${cleanPrompt} พร้อมคุมโทนสี แสง และเงาให้กลมกลืนเป็นธรรมชาติ`
        : "กำลังวิเคราะห์ภาพต้นฉบับ และวางแผนปรับแต่งตามคำขอ โดยรักษาเอกลักษณ์ของตัวละครและบรรยากาศเดิม";
    }
    if (stage === "generating") {
      return "กำลังสร้างสรรค์ภาพตามคอนเซปต์ของ Creative Director โดยเน้นความคมชัด แสงเงาที่สมจริง และองค์ประกอบระดับพรีเมียม";
    }
    return "กำลังวิเคราะห์และวางแผนกระบวนการทำงานที่ดีที่สุด เพื่อสร้างผลลัพธ์ที่ตรงกับคำขอของคุณมากที่สุด";
  }, [thought, isEdit, prompt, stage]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginBottom: 6,
      }}
    >
      <style>{`
        @keyframes artshiftBrainPulse {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 0 0px rgba(99, 102, 241, 0));
          }
          50% {
            transform: scale(1.12);
            filter: drop-shadow(0 0 5px rgba(99, 102, 241, 0.55));
          }
        }
        @keyframes artshiftSlideFadeIn {
          from {
            opacity: 0;
            transform: translateY(3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes artshiftWaveDot {
          0%, 80%, 100% {
            transform: scale(0.65);
            opacity: 0.35;
          }
          40% {
            transform: scale(1.25);
            opacity: 1;
          }
        }
        @keyframes artshiftShimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: isLive ? "rgba(238, 242, 255, 0.5)" : "transparent",
          border: isLive ? "1px solid rgba(199, 210, 254, 0.6)" : "none",
          borderRadius: isLive ? 18 : 0,
          outline: "none",
          padding: isLive ? "3px 10px 3px 7px" : "3px 0",
          cursor: "pointer",
          textAlign: "left",
          color: "#334155",
          transition: "all 0.15s ease",
          width: "fit-content",
          maxWidth: "100%",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#4f46e5";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#334155";
        }}
      >
        <ThoughtBrainIcon
          style={{
            color: "#6366f1",
            width: 15,
            height: 15,
            animation: isLive ? "artshiftBrainPulse 2s ease-in-out infinite" : undefined,
          }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em", color: isLive ? "#4338ca" : "inherit" }}>
          {isLive ? "กำลังคิดอยู่" : "ความคิดของ AI (Thought)"}
        </span>
        {isLive && (
          <>
            <span style={{ color: "#818cf8", fontSize: 12, fontWeight: 600 }}>:</span>
            <span
              key={currentMessage}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#475569",
                animation: "artshiftSlideFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
                maxWidth: 240,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "inline-block",
              }}
              title={currentMessage}
            >
              {currentMessage}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2.5,
                marginLeft: 2,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 3.5,
                  height: 3.5,
                  borderRadius: "50%",
                  background: "#6366f1",
                  animation: "artshiftWaveDot 1.2s ease-in-out infinite 0s",
                }}
              />
              <span
                style={{
                  display: "inline-block",
                  width: 3.5,
                  height: 3.5,
                  borderRadius: "50%",
                  background: "#6366f1",
                  animation: "artshiftWaveDot 1.2s ease-in-out infinite 0.2s",
                }}
              />
              <span
                style={{
                  display: "inline-block",
                  width: 3.5,
                  height: 3.5,
                  borderRadius: "50%",
                  background: "#6366f1",
                  animation: "artshiftWaveDot 1.2s ease-in-out infinite 0.4s",
                }}
              />
            </span>
          </>
        )}
        <ChevronDownIcon
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            width: 12,
            height: 12,
            color: isLive ? "#6366f1" : "#94a3b8",
            transition: "transform 0.2s ease, color 0.15s ease",
            marginLeft: isLive ? 3 : 2,
          }}
        />
      </button>

      {isOpen && (
        isLive ? (
          <div
            style={{
              position: "relative",
              marginTop: 6,
              marginLeft: 2,
              padding: "10px 14px",
              borderLeft: "2.5px solid #6366f1",
              background: "linear-gradient(180deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.7) 100%)",
              borderRadius: "0 10px 10px 0",
              boxShadow: "0 2px 8px -2px rgba(99, 102, 241, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              overflow: "hidden",
            }}
          >
            {/* Shimmer top line animation */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: "linear-gradient(90deg, transparent 0%, #6366f1 30%, #a855f7 70%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "artshiftShimmer 2s infinite linear",
              }}
            />

            {/* Live Activity & Timer header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 11.5,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#4338ca",
                  fontWeight: 600,
                }}
              >
                <SpinnerIcon style={{ width: 12, height: 12, color: "#6366f1" }} />
                <span key={currentMessage} style={{ animation: "artshiftSlideFadeIn 0.3s ease-out" }}>
                  {currentMessage}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: "#64748b",
                  background: "rgba(226, 232, 240, 0.6)",
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {elapsedSec}s
              </span>
            </div>

            {/* AI Thought & Intent Disclosure */}
            <div
              style={{
                color: "#334155",
                fontSize: 12,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {thoughtDisplay}
            </div>

            {/* Workflow Steps Indicator */}
            <div
              style={{
                marginTop: 2,
                paddingTop: 6,
                borderTop: "1px dashed #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {workflowSteps.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color:
                      step.status === "done"
                        ? "#15803d"
                        : step.status === "current"
                          ? "#4338ca"
                          : "#94a3b8",
                    fontWeight: step.status === "current" ? 600 : 400,
                  }}
                >
                  {step.status === "done" ? (
                    <CheckIcon style={{ width: 11, height: 11, color: "#16a34a", flexShrink: 0 }} />
                  ) : step.status === "current" ? (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#6366f1",
                        animation: "artshiftPulse 1s ease-in-out infinite",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        border: "1px solid #cbd5e1",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 4,
              marginLeft: 2,
              padding: "7px 12px",
              borderLeft: "2px solid #818cf8",
              color: "#475569",
              fontSize: 12,
              lineHeight: 1.6,
              background: "rgba(248, 250, 252, 0.7)",
              borderRadius: "0 8px 8px 0",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {thought}
          </div>
        )
      )}
    </div>
  );
}

export default function ChatThread({
  messages,
  busy,
  liveAssistantState,
  streamingText,
  currentActions,
  feedbackState,
  scrollRef,
  onSelectCanvasImage,
  onSelectSuggestion,
  onToggleFeedback,
  onClearHistory,
  onEditPromptFromError,
  children,
}: ChatThreadProps) {
  return (
    <div
      style={{
        width: "100%",
        flex: 1,
        minHeight: 0,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Thread Header */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid #f1f5f9",
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ThoughtBrainIcon style={{ color: "#6366f1", width: 15, height: 15 }} />
          <strong
            style={{
              fontSize: 12.5,
              color: "#334155",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {UNIFIED_AI_SYSTEM.label}
          </strong>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={onClearHistory}
              title="ล้างประวัติการสนทนา"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                border: "none",
                background: "transparent",
                fontSize: 11,
                color: "#94a3b8",
                cursor: "pointer",
                padding: "3px 6px",
                borderRadius: 4,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#475569";
                e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#94a3b8";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <TrashIcon style={{ width: 12, height: 12 }} />
              <span>ล้าง</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="artshift-custom-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "#ffffff",
        }}
      >
        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "88%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 4,
                }}
              >
                {msg.imageRefs && msg.imageRefs.length > 0 && (
                  <UserMessageImagePreviews
                    refs={msg.imageRefs}
                    onSelect={(fileId) => onSelectCanvasImage(fileId)}
                  />
                )}
                <div
                  style={{
                    padding: "7px 12px",
                    borderRadius: "14px 14px 3px 14px",
                    background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                    color: "#ffffff",
                    fontSize: 12.5,
                    fontWeight: 500,
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                    boxShadow: "0 1px 3px rgba(79, 70, 229, 0.12)",
                  }}
                >
                  <InlineTagRenderer
                    theme="dark"
                    content={msg.content}
                    imageRefs={msg.imageRefs}
                    onSelect={(fileId) => onSelectCanvasImage(fileId)}
                  />
                </div>
              </div>
            );
          }

          if (msg.kind === "progress") {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#475569",
                  fontSize: 11,
                  lineHeight: 1.4,
                  padding: "2px 0",
                  letterSpacing: "-0.01em",
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: "#94a3b8",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span>{msg.content}</span>
              </div>
            );
          }

          const hasStructuredThought =
            Boolean(msg.thought) ||
            Boolean(msg.toolLabel) ||
            (msg.images && msg.images.length > 0);

          return (
            <div
              key={msg.id}
              style={{
                alignSelf: "flex-start",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {/* Structured Collapsible Thought */}
              {msg.thought && (
                <CollapsibleThought
                  thought={msg.thought}
                  isLive={false}
                  defaultOpen={false}
                />
              )}

              {/* Tool Step Indicator */}
              {msg.toolLabel && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    alignSelf: "flex-start",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#475569",
                    fontSize: 11,
                    fontWeight: 500,
                    marginTop: msg.thought ? 0 : 2,
                  }}
                >
                  <ImageSparkleIcon style={{ color: "#4f46e5", width: 14, height: 14 }} />
                  <span>{msg.toolLabel}</span>
                </div>
              )}

              {/* Content Policy / Error Card */}
              {msg.errorCard && (
                <ContentPolicyErrorCard
                  messageId={msg.id}
                  errorCard={msg.errorCard}
                  onEditPrompt={onEditPromptFromError}
                />
              )}

              {/* Image thumbnails */}
              {msg.images && msg.images.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 6,
                    marginBottom: 4,
                    width: "100%",
                  }}
                >
                  {msg.images.map((img, idx) => (
                    <div
                      key={img.fileId || idx}
                      onClick={() => onSelectCanvasImage(img.fileId)}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-artshift-chat-image",
                          JSON.stringify({ fileId: img.fileId, url: img.url }),
                        );
                        if (img.fileId) {
                          e.dataTransfer.setData("artshift/file-id", img.fileId);
                        }
                        e.dataTransfer.setData("text/uri-list", img.url);
                        e.dataTransfer.setData("text/plain", img.url);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      title="คลิกเพื่อเลือกภาพบน Canvas หรือคลิกลากไปวางบน Canvas ได้"
                      style={{
                        flex: 1,
                        maxWidth: msg.images!.length === 1 ? 380 : 190,
                        aspectRatio: "1 / 1",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#f8fafc",
                        cursor: "grab",
                        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.06)",
                        border: "1px solid #e2e8f0",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scale(1.02)";
                        e.currentTarget.style.borderColor = "#4f46e5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.borderColor = "#e2e8f0";
                      }}
                    >
                      {/* biome-ignore lint/a11y/useAltText: AI generated image preview in chat message */}
                      {/* biome-ignore lint/performance/noImgElement: Direct chat message image rendering */}
                      <img
                        src={img.url}
                        alt="AI Generation result"
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Assistant message body */}
              <div
                style={{
                  alignSelf: "flex-start",
                  maxWidth: "92%",
                  padding: "8px 12px",
                  borderRadius: "3px 14px 14px 14px",
                  background: "#f8fafc",
                  color: "#1e293b",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  wordBreak: "break-word",
                  border: "1px solid #f1f5f9",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                }}
              >
                <InlineTagRenderer
                  theme="light"
                  content={msg.content}
                  onSelect={(fileId) => onSelectCanvasImage(fileId)}
                />
              </div>

              {/* Suggestion Chips */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                    marginBottom: 4,
                  }}
                >
                  {msg.suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectSuggestion(sug, msg.errorCard)}
                      disabled={busy}
                      style={{
                        background: sug.startsWith("✨") ? "#eef2ff" : "#f8fafc",
                        border: `1px solid ${sug.startsWith("✨") ? "#c7d2fe" : "#e2e8f0"}`,
                        borderRadius: 20,
                        padding: "5px 12px",
                        fontSize: 11.5,
                        color: sug.startsWith("✨") ? "#4338ca" : "#475569",
                        cursor: busy ? "default" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        transition: "all 0.15s ease",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                      }}
                      onMouseEnter={(e) => {
                        if (!busy) {
                          e.currentTarget.style.background = sug.startsWith("✨")
                            ? "#e0e7ff"
                            : "#f1f5f9";
                          e.currentTarget.style.borderColor = sug.startsWith("✨")
                            ? "#a5b4fc"
                            : "#cbd5e1";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!busy) {
                          e.currentTarget.style.background = sug.startsWith("✨")
                            ? "#eef2ff"
                            : "#f8fafc";
                          e.currentTarget.style.borderColor = sug.startsWith("✨")
                            ? "#c7d2fe"
                            : "#e2e8f0";
                        }
                      }}
                    >
                      <span>{sug}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Sub-agent Action logs (if any and not already structured) */}
              {!hasStructuredThought && msg.actions && msg.actions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  {msg.actions.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        fontSize: 10.5,
                        padding: "4px 8px",
                        borderRadius: 6,
                        background:
                          act.status === "success"
                            ? "#ecfdf5"
                            : act.status === "error"
                              ? "#fef2f2"
                              : "#eef2ff",
                        color:
                          act.status === "success"
                            ? "#065f46"
                            : act.status === "error"
                              ? "#991b1b"
                              : "#3730a3",
                        border: `1px solid ${
                          act.status === "success"
                            ? "#a7f3d0"
                            : act.status === "error"
                              ? "#fecaca"
                              : "#c7d2fe"
                        }`,
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {act.status === "success" ? (
                        <CheckIcon style={{ color: "#059669" }} />
                      ) : act.status === "error" ? (
                        <CloseIcon style={{ color: "#dc2626" }} />
                      ) : (
                        <SpinnerIcon style={{ color: "#4f46e5" }} />
                      )}
                      <strong>{act.title}</strong>
                      <span>— {act.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Feedback Thumbs */}
              {hasStructuredThought && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 2,
                    alignSelf: "flex-start",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onToggleFeedback(msg.id, "up")}
                    title="คำตอบมีประโยชน์"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: feedbackState[msg.id] === "up" ? "#4f46e5" : "#94a3b8",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (feedbackState[msg.id] !== "up") e.currentTarget.style.color = "#475569";
                    }}
                    onMouseLeave={(e) => {
                      if (feedbackState[msg.id] !== "up") e.currentTarget.style.color = "#94a3b8";
                    }}
                  >
                    <ThumbsUpIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFeedback(msg.id, "down")}
                    title="คำตอบยังไม่ตรงใจ"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: feedbackState[msg.id] === "down" ? "#dc2626" : "#94a3b8",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (feedbackState[msg.id] !== "down")
                        e.currentTarget.style.color = "#475569";
                    }}
                    onMouseLeave={(e) => {
                      if (feedbackState[msg.id] !== "down")
                        e.currentTarget.style.color = "#94a3b8";
                    }}
                  >
                    <ThumbsDownIcon />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Children (Action cards like approval, plans, refinement, etc.) */}
        {children}

        {/* Streaming text bubble */}
        {busy && streamingText && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: "12px 12px 12px 2px",
              background: "#f1f5f9",
              color: "#1e293b",
              fontSize: 12.5,
              lineHeight: 1.45,
              border: "1px solid #e2e8f0",
            }}
          >
            {streamingText}
          </div>
        )}

        {/* Live In-Progress State */}
        {busy && liveAssistantState && (
          <div
            style={{
              alignSelf: "flex-start",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {/* Collapsible Thought block */}
            <CollapsibleThought
              thought={
                liveAssistantState.thought ||
                (liveAssistantState.stage === "outputting"
                  ? "กำลังจัดเตรียมผลลัพธ์..."
                  : "กำลังวิเคราะห์บริบทและเตรียมการสร้างภาพ...")
              }
              isLive={true}
              defaultOpen={false}
              statusMessage={liveAssistantState.statusMessage}
              stage={liveAssistantState.stage}
              prompt={liveAssistantState.prompt}
              isEdit={liveAssistantState.isEdit}
            />

            {/* Tool Step (if generating) */}
            {liveAssistantState.stage === "generating" && (
              <>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    alignSelf: "flex-start",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#475569",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  <SpinnerIcon style={{ color: "#4f46e5", width: 12, height: 12 }} />
                  <span>
                    สร้างรูปภาพด้วย {liveAssistantState.toolLabel || "GPT Image 2"}...
                  </span>
                </div>

                {/* Skeleton placeholders */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 4,
                    width: "100%",
                  }}
                >
                  {Array.from({
                    length: Math.max(1, liveAssistantState.requestedCount || 1),
                  }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        flex: 1,
                        maxWidth: (liveAssistantState.requestedCount || 1) === 1 ? 380 : 190,
                        aspectRatio: "1 / 1",
                        borderRadius: 12,
                        background:
                          "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
                        backgroundSize: "200% 100%",
                        animation: "artshiftPulse 1.5s ease-in-out infinite",
                        border: "1px dashed #cbd5e1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ImageSparkleIcon
                        style={{
                          width: 24,
                          height: 24,
                          color: "#94a3b8",
                          opacity: 0.5,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Live running actions indicator */}
        {busy && !liveAssistantState && currentActions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {currentActions.map((act) => (
              <div
                key={act.id}
                style={{
                  fontSize: 10.5,
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: "#eef2ff",
                  color: "#3730a3",
                  border: "1px solid #c7d2fe",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <SpinnerIcon style={{ color: "#4f46e5" }} />
                <strong>{act.title}</strong>
                <span>— {act.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
