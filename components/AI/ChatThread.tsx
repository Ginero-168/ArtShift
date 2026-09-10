import React, { useState } from "react";
import type { CoPilotMessage, SubAgentActionLog } from "@/lib/ai/coPilot";
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
    stage: "outputting" | "generating";
    thought?: string;
    toolLabel?: string;
    requestedCount?: number;
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

export function CollapsibleThought({
  thought,
  isLive = false,
  defaultOpen = false,
}: {
  thought: string;
  isLive?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginBottom: 6,
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          outline: "none",
          padding: "3px 0",
          cursor: "pointer",
          textAlign: "left",
          color: "#334155",
          transition: "color 0.15s ease",
          width: "fit-content",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#4f46e5";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#334155";
        }}
      >
        <ThoughtBrainIcon style={{ color: "#6366f1", width: 15, height: 15 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {isLive ? "กำลังคิดอยู่..." : "ความคิดของ AI (Thought)"}
        </span>
        {isLive && (
          <span
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#6366f1",
              animation: "artshiftPulse 1.2s ease-in-out infinite",
            }}
          />
        )}
        <ChevronDownIcon
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            width: 12,
            height: 12,
            color: "#94a3b8",
            transition: "transform 0.2s ease, color 0.15s ease",
            marginLeft: 2,
          }}
        />
      </button>

      {isOpen && (
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
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      width: "100%",
                      marginBottom: 2,
                    }}
                  >
                    <ComposerImageTags
                      refs={msg.imageRefs}
                      testId={`message-image-tags-${msg.id}`}
                      onSelect={(ref) => onSelectCanvasImage(ref.fileId)}
                    />
                  </div>
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
                      title="คลิกเพื่อเลือกภาพบน Canvas"
                      style={{
                        flex: 1,
                        maxWidth: msg.images!.length === 1 ? 380 : 190,
                        aspectRatio: "1 / 1",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#f8fafc",
                        cursor: "pointer",
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
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
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
