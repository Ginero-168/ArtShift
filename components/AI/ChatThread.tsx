import React, { useEffect, useState } from "react";
import { ContentPolicyErrorCard } from "@/components/AI/ChatActionCards";
import {
  ChatCopyIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  ImageSparkleIcon,
  SpinnerIcon,
  ThoughtBrainIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TrashIcon,
} from "@/components/AI/ChatIcons";
import { ChatResultImageThumb, ImageResultSummaryBlock } from "@/components/AI/ChatImageResult";
import InlineTagRenderer from "@/components/AI/InlineTagRenderer";
import {
  IconCamera,
  IconLayoutGrid,
  IconPenEdit,
  IconRotate,
  IconSettings,
  IconSparkles,
  IconUndo,
  IconWand,
} from "@/components/icons";
import { type ChatModelStep, formatModelDisclosure } from "@/lib/ai/chatModelAttribution";
import type { CoPilotErrorCard, CoPilotMessage, SubAgentActionLog } from "@/lib/ai/coPilot";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { resolveComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import {
  buildPromptWithTagsForCopy as buildCanonicalPromptWithTags,
  cleanTechnicalPromptText,
  type InlineTagToken,
  parseInlineTagTokens,
} from "@/lib/ai/orchestration/inlineTagSynthesis";
import { UNIFIED_AI_SYSTEM } from "@/lib/ai/unifiedSystem";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";

export type LiveAssistantState = {
  stage: "outputting" | "generating" | "analyzing" | "planning";
  thought?: string;
  toolLabel?: string;
  requestedCount?: number;
  statusMessage?: string;
  prompt?: string;
  isEdit?: boolean;
  stepDetails?: string[];
  actions?: SubAgentActionLog[];
  activeModels?: ChatModelStep[];
};

export interface ChatThreadProps {
  messages: CoPilotMessage[];
  busy: boolean;
  liveAssistantState: LiveAssistantState | null;
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

/** Same sparkle / spinner row image generation already uses for "using model X". */
export function ChatModelDisclosure({
  label,
  live = false,
}: {
  label?: string | null;
  live?: boolean;
}) {
  if (!label) return null;
  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      data-testid={live ? "chat-model-status" : "chat-model-meta"}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: live ? 6 : 5,
        alignSelf: "flex-start",
        padding: "2px 0",
        marginLeft: 6,
        color: "#78726a",
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      {live ? (
        <SpinnerIcon style={{ color: "#78726a", width: 12, height: 12 }} />
      ) : (
        <ImageSparkleIcon style={{ color: "#78726a", width: 13, height: 13 }} />
      )}
      <span>{label}</span>
    </div>
  );
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
        let dataUrl = getCached(ref.fileId)?.dataURL;
        let effectiveFileId = ref.fileId;
        if (!dataUrl) {
          const slide = useEngine.getState().currentSlide();
          const el = slide?.elements.find(
            (candidate: any) =>
              !candidate.isDeleted &&
              (candidate.id === ref.objectId || candidate.name === ref.displayName),
          );
          const fid = (el as any)?.fileId || (el as any)?.imageFileId;
          if (fid && typeof fid === "string") {
            effectiveFileId = fid;
            dataUrl = getCached(fid)?.dataURL;
          }
        }
        return (
          <div
            key={`${ref.objectId}:${ref.elementVersion}`}
            onClick={() => onSelect(effectiveFileId)}
            draggable={true}
            onDragStart={(e) => {
              const cachedData = getCached(effectiveFileId);
              const url = cachedData?.dataURL || "";
              e.dataTransfer.setData(
                "application/x-artshift-chat-image",
                JSON.stringify({ fileId: effectiveFileId, url }),
              );
              e.dataTransfer.setData("artshift/file-id", effectiveFileId);
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
              background: "#fcf9f5",
              border: "1.5px solid #ece7e0",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
              cursor: "grab",
              transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.02)";
              e.currentTarget.style.borderColor = "#d64418";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(214, 68, 24, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.borderColor = "#ece7e0";
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
                  background: "#ece7e0",
                  color: "#78726a",
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
                background: "linear-gradient(to top, rgba(26, 23, 20, 0.8) 0%, transparent 100%)",
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
              <IconCamera size={11} color="#78726a" />
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

function renderSuggestionLabel(sug: string) {
  let icon: React.ReactNode = null;
  let text = sug;

  if (sug.startsWith("✨")) {
    icon = <IconSparkles size={12} color="#d64418" />;
    text = sug.replace(/^✨\s*/, "");
  } else if (sug.startsWith("🔄")) {
    icon = <IconRotate size={12} color="#0284c7" />;
    text = sug.replace(/^🔄\s*/, "");
  } else if (
    sug.startsWith("✏️") ||
    sug.startsWith("✍️") ||
    sug.startsWith("✍") ||
    sug.startsWith("✏")
  ) {
    icon = <IconPenEdit size={12} color="#ea580c" />;
    text = sug.replace(/^(?:✏️|✍️|✍|✏)\s*/, "");
  } else if (sug.startsWith("📐")) {
    icon = <IconLayoutGrid size={12} color="#059669" />;
    text = sug.replace(/^📐\s*/, "");
  } else if (sug.startsWith("↶")) {
    icon = <IconUndo size={12} color="#78726a" />;
    text = sug.replace(/^↶\s*/, "");
  } else if (sug.startsWith("🧩")) {
    icon = <IconWand size={12} color="#d64418" />;
    text = sug.replace(/^🧩\s*/, "");
  } else if (sug.startsWith("⚙️") || sug.startsWith("⚙")) {
    icon = <IconSettings size={12} color="#78726a" />;
    text = sug.replace(/^(?:⚙️|⚙)\s*/, "");
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {icon}
      <span>{text}</span>
    </span>
  );
}

export function CollapsibleThought({
  thought,
  isLive = false,
  defaultOpen = true,
  statusMessage,
  stage = "outputting",
  prompt,
  isEdit = false,
  customMessages,
  actions,
  toolLabel,
}: {
  thought: string;
  isLive?: boolean;
  defaultOpen?: boolean;
  statusMessage?: string;
  stage?: "outputting" | "generating" | "analyzing" | "planning";
  prompt?: string;
  isEdit?: boolean;
  customMessages?: string[];
  actions?: SubAgentActionLog[];
  toolLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen || isLive);
  const [messageIndex, setMessageIndex] = useState(0);

  // Keep unused props referenced so call sites stay compatible without noisy lint.
  void prompt;
  void isEdit;
  void actions;
  void stage;

  const messageList = React.useMemo(() => {
    if (customMessages && customMessages.length > 0) return customMessages;
    if (isLive) {
      return [
        "กำลังอ่านคำขอ...",
        "กำลังจัดองค์ประกอบและโทนภาพ...",
        "กำลังสร้างภาพ...",
        "กำลังเก็บรายละเอียดให้ลงตัว...",
      ];
    }
    return [];
  }, [customMessages, isLive]);

  const liveLine = React.useMemo(() => {
    if (
      statusMessage &&
      !statusMessage.startsWith("กำลังจัดเตรียม") &&
      !statusMessage.startsWith("กำลังวิเคราะห์บริบท")
    ) {
      return statusMessage;
    }
    if (messageList.length === 0) return "";
    return messageList[messageIndex % messageList.length];
  }, [statusMessage, messageList, messageIndex]);

  useEffect(() => {
    if (!isLive || messageList.length === 0) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messageList.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isLive, messageList.length]);

  const thoughtDisplay = React.useMemo(() => {
    const cleaned = thought ? cleanTechnicalPromptText(thought) : "";
    if (cleaned && cleaned.length > 0) return cleaned;
    if (isLive) return "กำลังคิดแนวทางสร้างภาพให้ตรงคำขอ...";
    return "";
  }, [thought, isLive]);

  if (!thoughtDisplay && !isLive && !toolLabel) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginBottom: 4,
      }}
    >
      <style>{`
        @keyframes artshiftBrainPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes artshiftSlideFadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes artshiftWaveDot {
          0%, 80%, 100% { transform: scale(0.65); opacity: 0.35; }
          40% { transform: scale(1.2); opacity: 1; }
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
          background: "transparent",
          border: "none",
          outline: "none",
          padding: "2px 0",
          cursor: "pointer",
          textAlign: "left",
          color: "#78726a",
          width: "fit-content",
          maxWidth: "100%",
        }}
      >
        <ThoughtBrainIcon
          style={{
            color: "#78726a",
            width: 14,
            height: 14,
            animation: isLive ? "artshiftBrainPulse 2s ease-in-out infinite" : undefined,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#78726a" }}>Thought</span>
        {isLive && liveLine ? (
          <span
            key={liveLine}
            style={{
              fontSize: 11.5,
              color: "#a7a198",
              maxWidth: 220,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              animation: "artshiftSlideFadeIn 0.3s ease",
            }}
          >
            {liveLine}
          </span>
        ) : null}
        {isLive ? (
          <span style={{ display: "inline-flex", gap: 2, marginLeft: 2 }}>
            {[0, 0.2, 0.4].map((delay) => (
              <span
                key={delay}
                style={{
                  width: 3.5,
                  height: 3.5,
                  borderRadius: "50%",
                  background: "#a7a198",
                  animation: `artshiftWaveDot 1.2s ease-in-out infinite ${delay}s`,
                }}
              />
            ))}
          </span>
        ) : null}
        <ChevronDownIcon
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            width: 11,
            height: 11,
            color: "#a7a198",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {isOpen && thoughtDisplay ? (
        <div
          style={{
            marginTop: 4,
            marginLeft: 6,
            paddingLeft: 12,
            borderLeft: "1.5px solid #d9d3cc",
            color: "#78726a",
            fontSize: 12,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {thoughtDisplay}
        </div>
      ) : null}
    </div>
  );
}

export function buildPromptWithTagsForCopy(msg: CoPilotMessage): string {
  return buildCanonicalPromptWithTags(msg.content || "", msg.imageRefs);
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleCopyMessage = async (msg: CoPilotMessage) => {
    const textToCopy = buildPromptWithTagsForCopy(msg);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopiedMessageId(msg.id);
      setTimeout(() => {
        setCopiedMessageId((prev) => (prev === msg.id ? null : prev));
      }, 1800);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedMessageId(msg.id);
        setTimeout(() => {
          setCopiedMessageId((prev) => (prev === msg.id ? null : prev));
        }, 1800);
      } catch {
        // ignore
      }
    }
  };

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
          borderBottom: "1px solid #f8f4ef",
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
          <ThoughtBrainIcon style={{ color: "#d64418", width: 15, height: 15 }} />
          <strong
            style={{
              fontSize: 12.5,
              color: "#443f39",
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
                color: "#a7a198",
                cursor: "pointer",
                padding: "3px 6px",
                borderRadius: 4,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#58534c";
                e.currentTarget.style.background = "#fcf9f5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#a7a198";
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
            const isCopied = copiedMessageId === msg.id;
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
                {(() => {
                  let effectiveRefs = msg.imageRefs;
                  if (!effectiveRefs || effectiveRefs.length === 0) {
                    const segments = parseInlineTagTokens(msg.content);
                    const tagSegs = segments.filter((s): s is InlineTagToken => s.type === "tag");
                    if (tagSegs.length > 0) {
                      const elements = useEngine.getState().doc.slides.flatMap((s) => s.elements);
                      effectiveRefs = tagSegs.map((t: InlineTagToken) =>
                        resolveComposerImageRef(t.objectId, t.displayName, [], elements),
                      );
                    }
                  }
                  return effectiveRefs && effectiveRefs.length > 0 ? (
                    <UserMessageImagePreviews
                      refs={effectiveRefs}
                      onSelect={(fileId) => onSelectCanvasImage(fileId)}
                    />
                  ) : null;
                })()}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 6,
                    maxWidth: "100%",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg)}
                    title={isCopied ? "คัดลอกแล้ว!" : "คัดลอกข้อความพร้อม Name Tag"}
                    aria-label="Copy user message"
                    data-testid={`copy-user-message-${msg.id}`}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      border: isCopied ? "1px solid #10b981" : "1px solid #ece7e0",
                      background: isCopied ? "#ecfdf5" : "#ffffff",
                      color: isCopied ? "#059669" : "#58534c",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
                      flexShrink: 0,
                      marginBottom: 2,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isCopied) {
                        e.currentTarget.style.background = "#fcf9f5";
                        e.currentTarget.style.color = "#1a1714";
                        e.currentTarget.style.borderColor = "#d9d3cc";
                        e.currentTarget.style.transform = "scale(1.04)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCopied) {
                        e.currentTarget.style.background = "#ffffff";
                        e.currentTarget.style.color = "#58534c";
                        e.currentTarget.style.borderColor = "#ece7e0";
                        e.currentTarget.style.transform = "scale(1)";
                      }
                    }}
                  >
                    {isCopied ? (
                      <CheckIcon style={{ width: 12, height: 12 }} />
                    ) : (
                      <ChatCopyIcon size={13} />
                    )}
                  </button>

                  <div
                    style={{
                      padding: "7px 12px",
                      borderRadius: "14px 14px 3px 14px",
                      background: "#1a1714",
                      color: "#f4f0e8",
                      fontSize: 12.5,
                      fontWeight: 500,
                      lineHeight: 1.45,
                      wordBreak: "break-word",
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
                  color: "#58534c",
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
                    backgroundColor: "#a7a198",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span>{msg.content}</span>
              </div>
            );
          }

          const hasStructuredThought =
            Boolean(msg.thought) || Boolean(msg.toolLabel) || (msg.images && msg.images.length > 0);

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
                  defaultOpen={true}
                  prompt={msg.role === "assistant" ? undefined : msg.content}
                  actions={msg.actions}
                  toolLabel={msg.toolLabel}
                />
              )}

              {msg.followUpNote ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "#78726a",
                    lineHeight: 1.45,
                    marginTop: msg.thought ? 0 : 2,
                  }}
                >
                  {msg.followUpNote}
                </div>
              ) : null}

              {/* Same model row as image generation (sparkle + id) */}
              <ChatModelDisclosure label={formatModelDisclosure(msg.usedModels, msg.toolLabel)} />

              {/* Content Policy / Error Card */}
              {msg.errorCard && (
                <ContentPolicyErrorCard
                  messageId={msg.id}
                  errorCard={msg.errorCard}
                  onEditPrompt={onEditPromptFromError}
                />
              )}

              {/* Aspect-true result thumbs */}
              {msg.images && msg.images.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 4,
                    marginBottom: 2,
                    width: "100%",
                  }}
                >
                  {msg.images.map((img, idx) => (
                    <ChatResultImageThumb
                      key={img.fileId || idx}
                      image={img}
                      imageCount={msg.images!.length}
                      generationContext={msg.generationContext}
                      qualityLabel={msg.qualityLabel}
                      toolLabel={msg.toolLabel}
                      onSelect={onSelectCanvasImage}
                    />
                  ))}
                </div>
              )}

              {/* Assistant message body / structured summary */}
              {msg.resultSummary && !msg.isError ? (
                <ImageResultSummaryBlock summary={msg.resultSummary} />
              ) : (
                <div
                  style={{
                    alignSelf: "flex-start",
                    maxWidth: "92%",
                    padding: "8px 12px",
                    borderRadius: "3px 14px 14px 14px",
                    background: msg.isError ? "#fff1f2" : "#fcf9f5",
                    color: msg.isError ? "#991b1b" : "#2c2824",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    wordBreak: "break-word",
                    border: msg.isError ? "1px solid #fecdd3" : "1px solid #f8f4ef",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <InlineTagRenderer
                    theme="light"
                    content={msg.content}
                    imageRefs={
                      msg.imageRefs ||
                      (msg.images
                        ? msg.images.map((im) => ({
                            objectId: im.fileId || "",
                            elementVersion: 1,
                            fileId: im.fileId || "",
                            displayName: im.label || "ภาพ",
                            sourceWidth: im.width || 1024,
                            sourceHeight: im.height || 1024,
                            width: im.width || 1024,
                            height: im.height || 1024,
                            angle: 0,
                          }))
                        : undefined)
                    }
                    onSelect={(fileId) => onSelectCanvasImage(fileId)}
                  />
                </div>
              )}

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
                        background: sug.startsWith("✨") ? "#fff0ea" : "#fcf9f5",
                        border: `1px solid ${sug.startsWith("✨") ? "#ffc7b3" : "#ece7e0"}`,
                        borderRadius: 20,
                        padding: "5px 12px",
                        fontSize: 11.5,
                        color: sug.startsWith("✨") ? "#9b2500" : "#58534c",
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
                            ? "#ffe2d6"
                            : "#f8f4ef";
                          e.currentTarget.style.borderColor = sug.startsWith("✨")
                            ? "#ff9f83"
                            : "#d9d3cc";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!busy) {
                          e.currentTarget.style.background = sug.startsWith("✨")
                            ? "#fff0ea"
                            : "#fcf9f5";
                          e.currentTarget.style.borderColor = sug.startsWith("✨")
                            ? "#ffc7b3"
                            : "#ece7e0";
                        }
                      }}
                    >
                      {renderSuggestionLabel(sug)}
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
                              : "#fff0ea",
                        color:
                          act.status === "success"
                            ? "#065f46"
                            : act.status === "error"
                              ? "#991b1b"
                              : "#7f1f00",
                        border: `1px solid ${
                          act.status === "success"
                            ? "#a7f3d0"
                            : act.status === "error"
                              ? "#fecaca"
                              : "#ffc7b3"
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
                        <SpinnerIcon style={{ color: "#b52c00" }} />
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
                      color: feedbackState[msg.id] === "up" ? "#b52c00" : "#a7a198",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (feedbackState[msg.id] !== "up") e.currentTarget.style.color = "#58534c";
                    }}
                    onMouseLeave={(e) => {
                      if (feedbackState[msg.id] !== "up") e.currentTarget.style.color = "#a7a198";
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
                      color: feedbackState[msg.id] === "down" ? "#dc2626" : "#a7a198",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (feedbackState[msg.id] !== "down") e.currentTarget.style.color = "#58534c";
                    }}
                    onMouseLeave={(e) => {
                      if (feedbackState[msg.id] !== "down") e.currentTarget.style.color = "#a7a198";
                    }}
                  >
                    <ThumbsDownIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg)}
                    title={copiedMessageId === msg.id ? "คัดลอกแล้ว!" : "คัดลอกข้อความ"}
                    aria-label="Copy assistant message"
                    data-testid={`copy-assistant-message-${msg.id}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: copiedMessageId === msg.id ? "#10b981" : "#a7a198",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (copiedMessageId !== msg.id) e.currentTarget.style.color = "#58534c";
                    }}
                    onMouseLeave={(e) => {
                      if (copiedMessageId !== msg.id) e.currentTarget.style.color = "#a7a198";
                    }}
                  >
                    {copiedMessageId === msg.id ? (
                      <CheckIcon style={{ width: 13, height: 13 }} />
                    ) : (
                      <ChatCopyIcon size={13} />
                    )}
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
              background: "#f8f4ef",
              color: "#2c2824",
              fontSize: 12.5,
              lineHeight: 1.45,
              border: "1px solid #ece7e0",
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
                  : "กำลังคิดแนวทางสร้างภาพให้ตรงคำขอ...")
              }
              isLive={true}
              defaultOpen={true}
              statusMessage={liveAssistantState.statusMessage}
              stage={liveAssistantState.stage}
              prompt={liveAssistantState.prompt}
              isEdit={liveAssistantState.isEdit}
              actions={liveAssistantState.actions || currentActions}
              toolLabel={liveAssistantState.toolLabel}
            />

            <ChatModelDisclosure
              live
              label={formatModelDisclosure(
                liveAssistantState.activeModels,
                liveAssistantState.toolLabel,
              )}
            />

            {/* Image-gen skeleton thumbs */}
            {liveAssistantState.stage === "generating" && (
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
                      width: (liveAssistantState.requestedCount || 1) === 1 ? 168 : 120,
                      maxWidth: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: 12,
                      background: "linear-gradient(90deg, #f8f4ef 0%, #ece7e0 50%, #f8f4ef 100%)",
                      backgroundSize: "200% 100%",
                      animation: "artshiftPulse 1.5s ease-in-out infinite",
                      border: "1px dashed #d9d3cc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <ImageSparkleIcon
                      style={{
                        width: 20,
                        height: 20,
                        color: "#a7a198",
                        opacity: 0.5,
                      }}
                    />
                  </div>
                ))}
              </div>
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
                  background: "#fff0ea",
                  color: "#7f1f00",
                  border: "1px solid #ffc7b3",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <SpinnerIcon style={{ color: "#b52c00" }} />
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
