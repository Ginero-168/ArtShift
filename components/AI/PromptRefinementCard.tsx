import React, { useRef, useState } from "react";
import {
  buildRefinedPromptString,
  type PromptRefinementCardData,
} from "@/lib/ai/orchestration/promptRefinement";

export interface PromptRefinementCardProps {
  data: PromptRefinementCardData;
  onGenerate: (refinedPrompt: string) => void;
  onApplyToComposer: (refinedPrompt: string) => void;
  onDismiss: () => void;
}

export default function PromptRefinementCard({
  data,
  onGenerate,
  onApplyToComposer,
  onDismiss,
}: PromptRefinementCardProps) {
  // Local state for active selections: { [dimensionId]: optionId | null }
  const [selections, setSelections] = useState<Record<string, string | null>>(
    () => ({ ...data.selectedOptions })
  );

  const assembledPrompt = buildRefinedPromptString(data, selections);

  const handleToggleOption = (dimId: string, optionId: string) => {
    setSelections((prev) => ({
      ...prev,
      [dimId]: prev[dimId] === optionId ? null : optionId,
    }));
  };

  const handleClearDimension = (dimId: string) => {
    setSelections((prev) => ({
      ...prev,
      [dimId]: null,
    }));
  };

  return (
    <div
      data-testid="prompt-refinement-card"
      style={{
        border: "2px solid #0f172a",
        borderRadius: 20,
        background: "#ffffff",
        padding: "16px 18px",
        margin: "8px 0",
        boxShadow: "0 6px 24px rgba(0, 0, 0, 0.07)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: "inherit",
        position: "relative",
      }}
    >
      {/* Header with Live Prompt Preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.01em",
            }}
          >
            Prompt ของผู้ใช้ ...
          </div>
          <button
            type="button"
            onClick={onDismiss}
            title="ปิดการ์ด"
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "4px 8px",
              borderRadius: 6,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#0f172a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#94a3b8";
            }}
          >
            ✕
          </button>
        </div>

        {/* Live dynamic preview box */}
        <div
          style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderRadius: 10,
            border: "1px dashed #cbd5e1",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#1e293b",
            fontWeight: 500,
            minHeight: 38,
            wordBreak: "break-word",
          }}
        >
          {assembledPrompt}
        </div>
      </div>

      {/* Category Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.dimensions.map((dim) => {
          const selectedOptionId = selections[dim.id] ?? null;
          const isCleared = selectedOptionId === null;

          return (
            <DimensionRow
              key={dim.id}
              title={dim.title}
              options={dim.options}
              selectedOptionId={selectedOptionId}
              isCleared={isCleared}
              onClear={() => handleClearDimension(dim.id)}
              onToggleOption={(optId) => handleToggleOption(dim.id, optId)}
            />
          );
        })}
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
          paddingTop: 10,
          borderTop: "1px solid #f1f5f9",
        }}
      >
        <button
          type="button"
          data-testid="refinement-generate-button"
          onClick={() => onGenerate(assembledPrompt)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "9px 14px",
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(2, 132, 199, 0.35)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "none";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(2, 132, 199, 0.25)";
          }}
        >
          <span>สร้างรูปภาพตามตัวเลือกนี้ 🪄</span>
        </button>

        <button
          type="button"
          onClick={() => onApplyToComposer(assembledPrompt)}
          title="คัดลอกลงในช่องพิมพ์เพื่อแก้ไขต่อ"
          style={{
            padding: "9px 12px",
            background: "#f1f5f9",
            color: "#334155",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
          }}
        >
          <span>คัดลอกลงช่องพิมพ์ ✏️</span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: "9px 10px",
            background: "transparent",
            color: "#64748b",
            border: "none",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#0f172a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#64748b";
          }}
        >
          ข้าม
        </button>
      </div>
    </div>
  );
}

interface DimensionRowProps {
  title: string;
  options: Array<{ id: string; label: string; modifier: string }>;
  selectedOptionId: string | null;
  isCleared: boolean;
  onClear: () => void;
  onToggleOption: (id: string) => void;
}

function DimensionRow({
  title,
  options,
  selectedOptionId,
  isCleared,
  onClear,
  onToggleOption,
}: DimensionRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = (delta: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {/* Dimension Title */}
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {title}
      </div>

      {/* Row with Navigation and Options */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
        }}
      >
        {/* Left Arrow Button */}
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => handleScroll(-140)}
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "1.5px solid #0f172a",
            background: "#ffffff",
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 900,
            padding: 0,
            transition: "all 0.1s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ffffff";
          }}
        >
          ‹
        </button>

        {/* Scrollable Container with X and Option Pills */}
        <div
          ref={scrollContainerRef}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            flex: 1,
            padding: "2px 0",
          }}
        >
          {/* First Pill: X button */}
          <button
            type="button"
            onClick={onClear}
            title={`ไม่ระบุ${title} (ใช้ค่าเริ่มต้น)`}
            style={{
              flexShrink: 0,
              minWidth: 42,
              height: 32,
              padding: "0 10px",
              borderRadius: 8,
              border: "none",
              background: isCleared ? "#b91c1c" : "#fee2e2",
              color: isCleared ? "#ffffff" : "#991b1b",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.12s ease",
            }}
          >
            ✕
          </button>

          {/* Option Pills */}
          {options.map((opt) => {
            const isSelected = selectedOptionId === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onToggleOption(opt.id)}
                style={{
                  flexShrink: 0,
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: "none",
                  background: isSelected ? "#0284c7" : "#cbd5e1",
                  color: isSelected ? "#ffffff" : "#1e293b",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  transition: "all 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "#94a3b8";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "#cbd5e1";
                  }
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Right Arrow Button */}
        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => handleScroll(140)}
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "1.5px solid #0f172a",
            background: "#ffffff",
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 900,
            padding: 0,
            transition: "all 0.1s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ffffff";
          }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
