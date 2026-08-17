"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CoPilotMessage,
  executeCoPilotInstruction,
  type SubAgentActionLog,
} from "@/lib/ai/coPilot";
import { useEngine } from "@/lib/engine/store";

export default function AICoPilotBar() {
  const _currentSlideId = useEngine((s) => s.currentSlideId);
  const slide = useEngine((s) =>
    s.doc.slides.find((candidate) => candidate.id === s.currentSlideId),
  );
  const selectedIds = useEngine((s) => s.selectedIds);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<CoPilotMessage[]>([
    {
      id: "initial-msg",
      role: "assistant",
      content:
        "สวัสดีครับ! ผมคือ AI Design Co-Pilot ของคุณ พร้อมช่วยสร้างรูป (FLUX), ลบพื้นหลัง, แปลง Vector, คิดพาดหัว และจัด Layout 60-30-10 สั่งการได้เลยครับ ✨",
      timestamp: Date.now(),
      suggestions: [
        "🎨 สร้างรูปแก้วกาแฟมินิมอล",
        "✂️ ลบพื้นหลังของรูปที่เลือก",
        "📐 จัด Layout สไลด์นี้แบบ 60-30-10",
        "✍️ ออกแบบแบนเนอร์ Mid-Year Sale",
      ],
    },
  ]);

  const [currentActions, setCurrentActions] = useState<SubAgentActionLog[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll chat tray to bottom
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded]);

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? input).trim();
    if (!promptToSend || busy) return;

    setInput("");
    setBusy(true);
    setExpanded(true);

    const userMsg: CoPilotMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: promptToSend,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setCurrentActions([]);

    try {
      const result = await executeCoPilotInstruction(promptToSend, (action) => {
        setCurrentActions((prev) => {
          const idx = prev.findIndex((a) => a.id === action.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = action;
            return next;
          }
          return [...prev, action];
        });
      });

      const assistantMsg: CoPilotMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply,
        timestamp: Date.now(),
        actions: result.actions,
        suggestions: result.suggestions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: CoPilotMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `ขออภัยครับ เกิดข้อผิดพลาด: ${(err as Error).message}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setBusy(false);
      setCurrentActions([]);
    }
  };

  const elementCount = (slide?.elements ?? []).filter((e) => !e.isDeleted).length;
  const hasSelection = selectedIds.size > 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 35,
        width: "90%",
        maxWidth: 700,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "auto",
      }}
    >
      {/* 1. Expandable Chat Thread Drawer */}
      {expanded && (
        <div
          style={{
            width: "100%",
            maxHeight: "44vh",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(12px)",
            borderRadius: "16px 16px 8px 8px",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.12)",
            display: "flex",
            flexDirection: "column",
            marginBottom: 6,
            overflow: "hidden",
          }}
        >
          {/* Thread Header */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13 }}>🧠</span>
              <strong style={{ fontSize: 11, color: "#1e1b4b" }}>
                AI Co-Pilot Activity & Chat
              </strong>
              <span
                style={{
                  fontSize: 9.5,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: "rgba(99, 102, 241, 0.1)",
                  color: "#4f46e5",
                  fontWeight: 600,
                }}
              >
                {elementCount} Elements on Slide
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                onClick={() => setMessages([])}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 10,
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "2px 6px",
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  color: "#64748b",
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
                title="Minimize chat drawer"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    background:
                      msg.role === "user"
                        ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                        : "#f8fafc",
                    color: msg.role === "user" ? "#ffffff" : "#1e293b",
                    fontSize: 11.5,
                    lineHeight: 1.45,
                    border: msg.role === "user" ? "none" : "1px solid rgba(226, 232, 240, 0.8)",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                  }}
                >
                  {msg.content}
                </div>

                {/* Sub-agent Action logs (if any) */}
                {msg.actions && msg.actions.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      marginTop: 2,
                    }}
                  >
                    {msg.actions.map((act) => (
                      <div
                        key={act.id}
                        style={{
                          fontSize: 9.5,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background:
                            act.status === "success"
                              ? "#ecfdf5"
                              : act.status === "error"
                                ? "#fef2f2"
                                : "#eff6ff",
                          color:
                            act.status === "success"
                              ? "#065f46"
                              : act.status === "error"
                                ? "#991b1b"
                                : "#1e40af",
                          border: "1px solid",
                          borderColor:
                            act.status === "success"
                              ? "#a7f3d0"
                              : act.status === "error"
                                ? "#fecaca"
                                : "#bfdbfe",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span>
                          {act.status === "success" ? "✓" : act.status === "error" ? "✕" : "⏳"}
                        </span>
                        <strong>{act.title}</strong>
                        <span>— {act.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Follow-up Suggestions Chips */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      marginTop: 3,
                    }}
                  >
                    {msg.suggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleSend(sug)}
                        style={{
                          fontSize: 9.5,
                          padding: "3px 7px",
                          borderRadius: 12,
                          background: "#ffffff",
                          border: "1px solid rgba(99, 102, 241, 0.3)",
                          color: "#4f46e5",
                          cursor: "pointer",
                          transition: "all 0.12s ease",
                        }}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Live running actions indicator */}
            {busy && currentActions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {currentActions.map((act) => (
                  <div
                    key={act.id}
                    style={{
                      fontSize: 10,
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "#eff6ff",
                      color: "#1e40af",
                      border: "1px solid #bfdbfe",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ animation: "spin 1s linear infinite" }}>⚙️</span>
                    <strong>{act.title}</strong>
                    <span>{act.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Floating Bottom Prompt & Action Bar */}
      <div
        style={{
          width: "100%",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(16px)",
          borderRadius: 14,
          border: "1px solid rgba(99, 102, 241, 0.35)",
          boxShadow:
            "0 10px 25px -5px rgba(99, 102, 241, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          padding: "5px 6px 5px 10px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* Sparkle Co-Pilot Indicator */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Hide Chat History" : "Show Chat History"}
          style={{
            background:
              "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.2) 100%)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: 8,
            padding: "4px 7px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            color: "var(--accent, #6366f1)",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          <span>✨</span>
          <span>AI Co-Pilot</span>
          <span style={{ fontSize: 9, opacity: 0.7 }}>{expanded ? "▼" : "▲"}</span>
        </button>

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
            if (e.key === "Escape") setExpanded(false);
          }}
          placeholder={
            hasSelection
              ? "Ask AI to edit selected object (e.g. ลบพื้นหลัง, แปลงเป็น Vector, เปลี่ยนฟอนต์)..."
              : "Ask AI to create images, compose layouts, or design slides (e.g. สร้างแบนเนอร์กาแฟสด)..."
          }
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: 11.5,
            color: "#0f172a",
            padding: "4px 4px",
            fontFamily: "inherit",
          }}
        />

        {/* Quick-Action Chips (When input is empty and not busy) */}
        {!input && !busy && (
          <div style={{ display: "flex", gap: 3 }}>
            <button
              type="button"
              onClick={() => handleSend("📐 จัด Layout สไลด์นี้แบบ 60-30-10")}
              title="Apply 60-30-10 Auto Layout"
              style={{
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 5,
                padding: "3px 6px",
                fontSize: 9.5,
                fontWeight: 600,
                color: "#475569",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              📐 Layout
            </button>
            {hasSelection && (
              <button
                type="button"
                onClick={() => handleSend("✂️ ลบพื้นหลังของรูปที่เลือก")}
                title="Remove background from selected image"
                style={{
                  background: "#eef2ff",
                  border: "1px solid #c7d2fe",
                  borderRadius: 5,
                  padding: "3px 6px",
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: "#4338ca",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                🪄 Remove BG
              </button>
            )}
          </div>
        )}

        {/* Send Action Button */}
        <button
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => handleSend()}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: "none",
            background:
              busy || !input.trim()
                ? "#e2e8f0"
                : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: busy || !input.trim() ? "#94a3b8" : "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: busy || !input.trim() ? "default" : "pointer",
            fontSize: 12,
            transition: "all 0.12s ease",
            boxShadow: input.trim() && !busy ? "0 2px 6px rgba(99, 102, 241, 0.3)" : "none",
          }}
        >
          {busy ? "⏳" : "➔"}
        </button>
      </div>
    </div>
  );
}
