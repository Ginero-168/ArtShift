"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import AIImagePanel from "@/components/AIImagePanel";
import AIPrompt from "@/components/AIPrompt";

const AIImageTools = dynamic(() => import("@/components/AIImageTools"), { ssr: false });

type Tab = "generate" | "stock" | "tools";

interface Props {
  onClose: () => void;
  onInsertImage: (dataUrl: string) => void;
  defaultTab?: Tab;
}

export default function AIPanel({ onClose, onInsertImage, defaultTab = "generate" }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab);

  return (
    <div
      className="ai-panel"
      style={{
        position: "absolute",
        top: 48,
        right: 12,
        width: 360,
        maxHeight: "calc(100vh - 160px)",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        zIndex: 50,
        overflow: "hidden",
      }}
      role="dialog"
      aria-label="AI assistant"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid var(--stroke, #e5e7eb)",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "generate", label: "Generate" },
            { id: "stock", label: "Stock" },
            { id: "tools", label: "Tools" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as Tab)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                background: tab === t.id ? "var(--accent, #7c3aed)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--ink, #111)",
                cursor: "pointer",
                fontSize: 13,
              }}
              aria-pressed={tab === t.id}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 4,
            color: "var(--ink-muted, #6b7280)",
          }}
          aria-label="Close AI panel"
        >
          ×
        </button>
      </div>
      <div style={{ overflow: "auto", padding: 12 }}>
        {tab === "generate" && <AIPrompt />}
        {tab === "stock" && <AIImagePanel onInsert={onInsertImage} />}
        {tab === "tools" && <AIImageTools />}
      </div>
    </div>
  );
}
