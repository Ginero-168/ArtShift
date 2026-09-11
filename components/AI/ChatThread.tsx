import React, { useEffect, useState } from "react";
import type { CoPilotMessage, SubAgentActionLog } from "@/lib/ai/coPilot";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import type { CoPilotErrorCard } from "@/lib/ai/coPilot";
import ComposerImageTags from "@/components/AI/ComposerImageTags";
import InlineTagRenderer from "@/components/AI/InlineTagRenderer";
import {
  ChatCopyIcon,
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
    actions?: SubAgentActionLog[];
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

interface SubAgentTaskItem {
  id: string;
  name: string;
  modelBadge?: string;
  icon: string;
  themeColor: string;
  themeBg: string;
  themeBorder: string;
  task: string;
  status: "running" | "success" | "error" | "pending";
  statusText?: string;
}

function getAgentMeta(agent: string, title: string) {
  const lowerTitle = (title || "").toLowerCase();
  if (
    lowerTitle.includes("analyzer") ||
    lowerTitle.includes("analysis") ||
    lowerTitle.includes("วิเคราะห์ภาพ") ||
    lowerTitle.includes("วิเคราะห์บริบท")
  ) {
    return {
      icon: "🔍",
      roleName: "Image Analyzer",
      badgeColor: "#0284c7",
      badgeBg: "rgba(224, 242, 254, 0.75)",
      borderColor: "rgba(186, 230, 253, 0.9)",
    };
  }
  if (
    lowerTitle.includes("director") ||
    lowerTitle.includes("orchestrator") ||
    agent === "orchestrator"
  ) {
    return {
      icon: "🧠",
      roleName: "Creative Director",
      badgeColor: "#6366f1",
      badgeBg: "rgba(238, 242, 255, 0.8)",
      borderColor: "rgba(199, 210, 254, 0.95)",
    };
  }
  if (
    agent === "image_gen" ||
    agent === "image_edit" ||
    lowerTitle.includes("specialist") ||
    lowerTitle.includes("image") ||
    lowerTitle.includes("สร้างรูป") ||
    lowerTitle.includes("ปรับแต่ง")
  ) {
    return {
      icon: "🎨",
      roleName: agent === "image_edit" ? "Image Editor" : "Image Specialist",
      badgeColor: "#ea580c",
      badgeBg: "rgba(255, 237, 213, 0.8)",
      borderColor: "rgba(254, 215, 170, 0.95)",
    };
  }
  if (
    agent === "brand_stylist" ||
    lowerTitle.includes("reviewer") ||
    lowerTitle.includes("quality") ||
    lowerTitle.includes("ตรวจ")
  ) {
    return {
      icon: "🛡️",
      roleName: "Quality Reviewer",
      badgeColor: "#9333ea",
      badgeBg: "rgba(243, 232, 255, 0.8)",
      borderColor: "rgba(233, 213, 255, 0.95)",
    };
  }
  if (agent === "layout_designer" || lowerTitle.includes("layout") || lowerTitle.includes("จัดวาง")) {
    return {
      icon: "📐",
      roleName: "Layout Specialist",
      badgeColor: "#059669",
      badgeBg: "rgba(209, 250, 229, 0.8)",
      borderColor: "rgba(167, 243, 208, 0.95)",
    };
  }
  if (agent === "vectorizer" || lowerTitle.includes("vector") || lowerTitle.includes("เวกเตอร์")) {
    return {
      icon: "⚡",
      roleName: "Vector Specialist",
      badgeColor: "#0891b2",
      badgeBg: "rgba(207, 250, 254, 0.8)",
      borderColor: "rgba(165, 243, 252, 0.95)",
    };
  }
  if (agent === "copywriter" || lowerTitle.includes("copywriter")) {
    return {
      icon: "✍️",
      roleName: "Copywriter Specialist",
      badgeColor: "#d97706",
      badgeBg: "rgba(254, 243, 199, 0.8)",
      borderColor: "rgba(253, 230, 138, 0.95)",
    };
  }
  return {
    icon: "🤖",
    roleName: "AI Specialist",
    badgeColor: "#475569",
    badgeBg: "rgba(241, 245, 249, 0.8)",
    borderColor: "rgba(226, 232, 240, 0.95)",
  };
}

function renderStatusBadge(status: "running" | "success" | "error" | "pending", statusText?: string) {
  if (status === "success") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3.5,
          padding: "2px 7px",
          borderRadius: 12,
          fontSize: 10.5,
          fontWeight: 600,
          background: "rgba(220, 252, 231, 0.9)",
          color: "#15803d",
          border: "1px solid rgba(187, 247, 208, 0.9)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <CheckIcon style={{ width: 10.5, height: 10.5, color: "#16a34a" }} />
        <span>{statusText || "เสร็จสิ้น"}</span>
      </span>
    );
  }
  if (status === "running") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4.5,
          padding: "2px 7px",
          borderRadius: 12,
          fontSize: 10.5,
          fontWeight: 600,
          background: "rgba(238, 242, 255, 0.95)",
          color: "#4338ca",
          border: "1px solid rgba(199, 210, 254, 0.95)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <SpinnerIcon style={{ width: 10.5, height: 10.5, color: "#6366f1" }} />
        <span>{statusText || "กำลังทำ..."}</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3.5,
          padding: "2px 7px",
          borderRadius: 12,
          fontSize: 10.5,
          fontWeight: 600,
          background: "rgba(254, 242, 242, 0.9)",
          color: "#b91c1c",
          border: "1px solid rgba(254, 202, 202, 0.9)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10 }}>✕</span>
        <span>{statusText || "ไม่สำเร็จ"}</span>
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        borderRadius: 12,
        fontSize: 10.5,
        fontWeight: 500,
        background: "rgba(241, 245, 249, 0.85)",
        color: "#64748b",
        border: "1px solid rgba(226, 232, 240, 0.85)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#94a3b8" }} />
      <span>{statusText || "รอดำเนินการ"}</span>
    </span>
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

  const subAgentTasks = React.useMemo<SubAgentTaskItem[]>(() => {
    if (actions && actions.length > 0) {
      const items: SubAgentTaskItem[] = actions.map((act) => {
        const meta = getAgentMeta(act.agent, act.title);
        const modelMatch = act.title.match(/\(([^)]+)\)/);
        const modelBadge = modelMatch ? modelMatch[1] : undefined;
        const cleanName = act.title.replace(/\s*\([^)]+\)/g, "").trim();

        return {
          id: act.id,
          name: cleanName || meta.roleName,
          modelBadge,
          icon: meta.icon,
          themeColor: meta.badgeColor,
          themeBg: meta.badgeBg,
          themeBorder: meta.borderColor,
          task: act.description || "ปฏิบัติหน้าที่ตามขั้นตอนที่ได้รับมอบหมาย",
          status: act.status === "running" ? "running" : act.status === "error" ? "error" : "success",
          statusText:
            act.status === "success"
              ? "เสร็จสิ้น"
              : act.status === "running"
                ? "กำลังทำ..."
                : act.status === "error"
                  ? "ไม่สำเร็จ"
                  : "รอดำเนินการ",
        };
      });

      if (isLive && !items.some((i) => i.name.toLowerCase().includes("reviewer") || i.name.includes("ตรวจ"))) {
        items.push({
          id: "quality-reviewer-step",
          name: "Quality Reviewer",
          modelBadge: "Vision Quality Gate",
          icon: "🛡️",
          themeColor: "#9333ea",
          themeBg: "rgba(243, 232, 255, 0.8)",
          themeBorder: "rgba(233, 213, 255, 0.95)",
          task: "ตรวจเช็คความสมบูรณ์ ความคมชัด แสงเงา และความตรงตามบรีฟ",
          status: "pending",
          statusText: "รอดำเนินการ",
        });
      }

      return items;
    }

    const isAnalyzing = stage === "analyzing";
    const isPlanning = stage === "planning" || stage === "outputting";
    const isGenerating = stage === "generating";

    const defaultItems: SubAgentTaskItem[] = [];

    if (isEdit || prompt?.includes("@") || prompt?.includes("ภาพเดิม") || prompt?.includes("รูปเดิม")) {
      defaultItems.push({
        id: "step-analyzer",
        name: "Image Analyzer",
        modelBadge: "Vision Context",
        icon: "🔍",
        themeColor: "#0284c7",
        themeBg: "rgba(224, 242, 254, 0.75)",
        themeBorder: "rgba(186, 230, 253, 0.9)",
        task: "วิเคราะห์ภาพต้นฉบับและบริบทบน Canvas เพื่อดึงสไตล์ แสงเงา และคู่สีมาใช้งาน",
        status: isAnalyzing ? "running" : "success",
        statusText: isAnalyzing ? "กำลังวิเคราะห์..." : "เสร็จสิ้น",
      });
    }

    defaultItems.push({
      id: "step-director",
      name: "Creative Director",
      modelBadge: "gpt-oss-120b",
      icon: "🧠",
      themeColor: "#6366f1",
      themeBg: "rgba(238, 242, 255, 0.8)",
      themeBorder: "rgba(199, 210, 254, 0.95)",
      task: isEdit
        ? "วางแผนจัดวางองค์ประกอบ คุมแสงเงาและบรรยากาศเดิมให้กลมกลืนเป็นธรรมชาติ"
        : "วิเคราะห์โจทย์ จัดวางสัดส่วน กำหนดคอนเซปต์ 2D Graphic และคู่สีตามโจทย์",
      status: isLive ? (isAnalyzing ? "pending" : isPlanning ? "running" : "success") : "success",
      statusText: isLive ? (isAnalyzing ? "รอดำเนินการ" : isPlanning ? "กำลังวางแผน..." : "เสร็จสิ้น") : "เสร็จสิ้น",
    });

    const specialistModel = toolLabel || "GPT Image 2";
    defaultItems.push({
      id: "step-specialist",
      name: isEdit ? "Image Editor" : "Image Specialist",
      modelBadge: specialistModel,
      icon: "🎨",
      themeColor: "#ea580c",
      themeBg: "rgba(255, 237, 213, 0.8)",
      themeBorder: "rgba(254, 215, 170, 0.95)",
      task: isEdit
        ? "ปรับแต่งภาพ คุมแสงเงาและสไตล์เดิมตามคำสั่งของ Creative Director"
        : "เรนเดอร์ภาพกราฟิกความละเอียดสูงตามคอนเซปต์และสเปกของ Creative Director",
      status: isLive ? (isGenerating ? "running" : isPlanning || isAnalyzing ? "pending" : "success") : "success",
      statusText: isLive ? (isGenerating ? "กำลังเรนเดอร์..." : "รอดำเนินการ") : "เสร็จสิ้น",
    });

    defaultItems.push({
      id: "step-reviewer",
      name: "Quality Reviewer",
      modelBadge: "Vision Quality Gate",
      icon: "🛡️",
      themeColor: "#9333ea",
      themeBg: "rgba(243, 232, 255, 0.8)",
      themeBorder: "rgba(233, 213, 255, 0.95)",
      task: "ตรวจสอบความสมบูรณ์ ความคมชัด แสงเงา และความตรงตามบรีฟ",
      status: isLive ? "pending" : "success",
      statusText: isLive ? "รอดำเนินการ" : "เสร็จสิ้น (ผ่านเกณฑ์)",
    });

    return defaultItems;
  }, [actions, isLive, stage, isEdit, prompt, toolLabel]);

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

  const completedCount = subAgentTasks.filter((t) => t.status === "success").length;
  const isAllCompleted = completedCount === subAgentTasks.length && subAgentTasks.length > 0;

  const renderSubAgentPanel = () => (
    <div
      style={{
        marginTop: 4,
        paddingTop: 8,
        borderTop: "1px dashed #cbd5e1",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      {/* Sub-Agent Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          fontWeight: 600,
          color: "#475569",
          paddingBottom: 2,
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 12 }}>📋</span>
          <span>การสั่งงาน Sub-Agents</span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 10,
            background: isAllCompleted ? "rgba(220, 252, 231, 0.9)" : "rgba(238, 242, 255, 0.9)",
            color: isAllCompleted ? "#15803d" : "#4338ca",
          }}
        >
          {completedCount}/{subAgentTasks.length} เสร็จสิ้น
        </span>
      </div>

      {/* Sub-Agent Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4.5 }}>
        {subAgentTasks.map((taskItem) => (
          <div
            key={taskItem.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: "6px 9px",
              borderRadius: 7,
              background: "rgba(255, 255, 255, 0.8)",
              border: `1px solid ${
                taskItem.status === "running"
                  ? "rgba(199, 210, 254, 0.95)"
                  : taskItem.status === "error"
                    ? "rgba(254, 202, 202, 0.9)"
                    : "rgba(241, 245, 249, 0.95)"
              }`,
              boxShadow:
                taskItem.status === "running"
                  ? "0 0 0 1.5px rgba(99, 102, 241, 0.15), 0 1px 3px rgba(0,0,0,0.03)"
                  : "0 1px 2px rgba(0,0,0,0.02)",
            }}
          >
            {/* Header row: Icon + Agent Name + Model Badge + Status Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5.5,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "#1e293b",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: taskItem.themeBg,
                    border: `1px solid ${taskItem.themeBorder}`,
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  {taskItem.icon}
                </span>
                <span>{taskItem.name}</span>
                {taskItem.modelBadge && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 500,
                      padding: "0.5px 5px",
                      borderRadius: 4,
                      background: "rgba(241, 245, 249, 0.9)",
                      color: "#64748b",
                      border: "1px solid rgba(226, 232, 240, 0.8)",
                    }}
                  >
                    {taskItem.modelBadge}
                  </span>
                )}
              </div>
              {renderStatusBadge(taskItem.status, taskItem.statusText)}
            </div>

            {/* Description row: Assigned task (สิ่งที่ได้รับมอบหมาย) */}
            <div
              style={{
                fontSize: 11,
                lineHeight: 1.45,
                color: "#475569",
                paddingLeft: 23.5,
              }}
            >
              {taskItem.task}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

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

            {/* Sub-Agent Execution Details */}
            {renderSubAgentPanel()}
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              marginTop: 6,
              marginLeft: 2,
              padding: "10px 14px",
              borderLeft: "2.5px solid #818cf8",
              background: "linear-gradient(180deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.7) 100%)",
              borderRadius: "0 10px 10px 0",
              boxShadow: "0 2px 8px -2px rgba(99, 102, 241, 0.06)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              overflow: "hidden",
            }}
          >
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
              {thought}
            </div>

            {/* Sub-Agent Execution Details */}
            {renderSubAgentPanel()}
          </div>
        )
      )}
    </div>
  );
}

export function buildPromptWithTagsForCopy(msg: CoPilotMessage): string {
  let content = msg.content || "";
  if (msg.imageRefs && msg.imageRefs.length > 0) {
    const missingRefs: ComposerImageRef[] = [];
    for (const ref of msg.imageRefs) {
      const tagId = ref.objectId;
      const tagName = ref.displayName;
      const hasTag =
        content.includes(`:${tagId}]`) ||
        content.includes(`@[${tagName}`) ||
        content.includes(`@${tagName}`);
      if (!hasTag) {
        missingRefs.push(ref);
      }
    }
    if (missingRefs.length > 0) {
      const prefix = missingRefs
        .map((r) => `@[${r.displayName}:${r.objectId}]`)
        .join(" ");
      content = `${prefix} ${content}`.trim();
    }
  }
  return content;
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
                {msg.imageRefs && msg.imageRefs.length > 0 && (
                  <UserMessageImagePreviews
                    refs={msg.imageRefs}
                    onSelect={(fileId) => onSelectCanvasImage(fileId)}
                  />
                )}
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
                      border: isCopied
                        ? "1px solid #10b981"
                        : "1px solid rgba(255, 255, 255, 0.12)",
                      background: isCopied ? "#064e3b" : "#1e242d",
                      color: isCopied ? "#34d399" : "#cbd5e1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: "0 1.5px 4px rgba(0, 0, 0, 0.16)",
                      flexShrink: 0,
                      marginBottom: 2,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isCopied) {
                        e.currentTarget.style.background = "#2b323d";
                        e.currentTarget.style.color = "#ffffff";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.25)";
                        e.currentTarget.style.transform = "scale(1.04)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCopied) {
                        e.currentTarget.style.background = "#1e242d";
                        e.currentTarget.style.color = "#cbd5e1";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
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
                  prompt={msg.role === "assistant" ? undefined : msg.content}
                  actions={msg.actions}
                  toolLabel={msg.toolLabel}
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
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg)}
                    title={copiedMessageId === msg.id ? "คัดลอกแล้ว!" : "คัดลอกข้อความ"}
                    aria-label="Copy assistant message"
                    data-testid={`copy-assistant-message-${msg.id}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: copiedMessageId === msg.id ? "#10b981" : "#94a3b8",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      transition: "color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (copiedMessageId !== msg.id) e.currentTarget.style.color = "#475569";
                    }}
                    onMouseLeave={(e) => {
                      if (copiedMessageId !== msg.id) e.currentTarget.style.color = "#94a3b8";
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
              actions={liveAssistantState.actions || currentActions}
              toolLabel={liveAssistantState.toolLabel}
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
