"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { CloseIcon, ImageSparkleIcon } from "@/components/AI/ChatIcons";
import { IconClose, IconSparkles } from "@/components/icons";
import type { CoPilotMessageImage } from "@/lib/ai/coPilot";
import {
  buildPromptStructure,
  formatAspectOrientationLabel,
  type ImageResultSummary,
  type PromptStructureSection,
} from "@/lib/ai/imageResultPresentation";
import type { PriorImageGenerationContext } from "@/lib/ai/orchestration/chatContinuity";
import { resolveChatImageSrc } from "@/lib/ai/orchestration/chatImageResolve";
import { getCached, subscribeImageCache } from "@/lib/engine/imageCache";

function ExpandArrowsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function OverlayIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "none",
        background: "rgba(26, 23, 20, 0.55)",
        backdropFilter: "blur(8px)",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }}
    >
      {children}
    </button>
  );
}

export function ImageExpandOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ขยายรูปภาพ"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(2, 6, 23, 0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(26, 23, 20, 0.7)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <IconClose size={16} />
      </button>
      {/* biome-ignore lint/performance/noImgElement: Fullscreen chat image expand */}
      <img
        src={url}
        alt="Expanded generation"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(96vw, 1400px)",
          maxHeight: "92vh",
          objectFit: "contain",
          borderRadius: 12,
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        }}
      />
    </div>
  );
}

export function PromptStructureModal({
  sections,
  thumbUrl,
  onClose,
}: {
  sections: PromptStructureSection[];
  thumbUrl?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How I created this"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(2, 6, 23, 0.55)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 94vw)",
          maxHeight: "86vh",
          overflow: "auto",
          borderRadius: 18,
          background: "#1a1714",
          color: "#fcf9f5",
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          border: "1px solid rgba(167, 161, 152, 0.18)",
          padding: "16px 18px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {thumbUrl ? (
              // biome-ignore lint/performance/noImgElement: Tiny modal thumb
              <img
                src={thumbUrl}
                alt=""
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : null}
            <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: "-0.01em" }}>
              How I created this
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "rgba(167, 161, 152, 0.15)",
              color: "#ece7e0",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloseIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {sections.map((section) => (
            <div key={section.label}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#a7a198",
                  marginBottom: 3,
                }}
              >
                {section.label}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  color: "#f8f4ef",
                  fontWeight: 500,
                }}
              >
                {section.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ImageResultSummaryBlock({ summary }: { summary: ImageResultSummary }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: "92%",
        padding: "8px 2px 2px",
        color: "#2c2824",
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, color: "#1a1714" }}>{summary.headline}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {summary.fields.map((field) => (
          <div key={field.label}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#78726a", marginBottom: 1 }}>
              {field.label}
            </div>
            <div style={{ color: "#443f39" }}>{field.value}</div>
          </div>
        ))}
      </div>
      {summary.printHint ? (
        <div style={{ fontSize: 11.5, color: "#78726a", whiteSpace: "pre-wrap" }}>
          {summary.printHint}
        </div>
      ) : null}
      {summary.pills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {summary.pills.map((pill) => (
            <span
              key={pill}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 8px",
                borderRadius: 999,
                background: "#f8f4ef",
                border: "1px solid #ece7e0",
                color: "#58534c",
                fontSize: 10.5,
                fontWeight: 600,
              }}
            >
              {/gpt|image|sunburst|flare/i.test(pill) ? (
                <ImageSparkleIcon style={{ width: 12, height: 12, color: "#b52c00" }} />
              ) : null}
              {pill}
            </span>
          ))}
        </div>
      ) : null}
      {summary.footer ? (
        <div style={{ fontSize: 12, color: "#78726a" }}>{summary.footer}</div>
      ) : null}
    </div>
  );
}

export function ChatResultImageThumb({
  image,
  imageCount,
  generationContext,
  qualityLabel,
  toolLabel,
  onSelect,
}: {
  image: CoPilotMessageImage;
  imageCount: number;
  generationContext?: PriorImageGenerationContext;
  qualityLabel?: string;
  toolLabel?: string;
  onSelect: (fileId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showStructure, setShowStructure] = useState(false);
  const [, bumpCache] = useState(0);
  useEffect(() => subscribeImageCache(() => bumpCache((v) => v + 1)), []);

  const src = resolveChatImageSrc(image);
  const cached = image.fileId ? getCached(image.fileId) : undefined;
  const width = image.width || cached?.width || generationContext?.width || 1024;
  const height = image.height || cached?.height || generationContext?.height || 1024;
  const orientation = formatAspectOrientationLabel(width, height);
  const maxWidth = imageCount === 1 ? (width / height >= 1.6 ? 220 : 168) : 132;

  const structure = useMemo(
    () =>
      buildPromptStructure({
        userPrompt: generationContext?.userPrompt || image.label || "",
        summary: generationContext?.summary,
        refinedPrompt: generationContext?.refinedPrompt || image.prompt,
        brief: image.label,
        width,
        height,
        aspectRatio: generationContext?.aspectRatio,
      }),
    [generationContext, image.label, image.prompt, width, height],
  );

  void qualityLabel;
  void toolLabel;

  return (
    <>
      <div
        onClick={() => onSelect(image.fileId)}
        draggable={Boolean(src || image.fileId)}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            "application/x-artshift-chat-image",
            JSON.stringify({ fileId: image.fileId, url: src }),
          );
          if (image.fileId) {
            e.dataTransfer.setData("artshift/file-id", image.fileId);
          }
          if (src) {
            e.dataTransfer.setData("text/uri-list", src);
            e.dataTransfer.setData("text/plain", src);
          }
          e.dataTransfer.effectAllowed = "copy";
        }}
        title="คลิกเพื่อซูมหารูปบน Canvas · ปุ่มซ้ายบนขยาย · ปุ่มขวาบนดูโครงสร้าง Prompt"
        style={{
          position: "relative",
          width: maxWidth,
          maxWidth: "100%",
          aspectRatio: `${width} / ${height}`,
          borderRadius: 12,
          overflow: "hidden",
          background: "#1a1714",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
          border: "1px solid #ece7e0",
          flexShrink: 0,
          transition: "transform 0.15s ease, border-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.015)";
          e.currentTarget.style.borderColor = "#a7a198";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.borderColor = "#ece7e0";
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            right: 6,
            display: "flex",
            justifyContent: "space-between",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <span style={{ pointerEvents: "auto" }}>
            <OverlayIconButton
              label="ขยายรูป"
              onClick={() => {
                if (src) setExpanded(true);
              }}
            >
              <ExpandArrowsIcon size={13} />
            </OverlayIconButton>
          </span>
          <span style={{ pointerEvents: "auto" }}>
            <OverlayIconButton label="โครงสร้าง Prompt" onClick={() => setShowStructure(true)}>
              <IconSparkles size={13} />
            </OverlayIconButton>
          </span>
        </div>

        <span
          style={{
            position: "absolute",
            left: 8,
            bottom: 7,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            textShadow: "0 1px 3px rgba(0,0,0,0.55)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {orientation}
        </span>

        {src ? (
          // biome-ignore lint/performance/noImgElement: Direct chat message image rendering
          <img
            src={src}
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
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#a7a198",
              fontSize: 11,
              background: "#2c2824",
            }}
          >
            กำลังโหลดภาพ...
          </div>
        )}
      </div>

      {expanded && src ? <ImageExpandOverlay url={src} onClose={() => setExpanded(false)} /> : null}
      {showStructure ? (
        <PromptStructureModal
          sections={structure}
          thumbUrl={src || undefined}
          onClose={() => setShowStructure(false)}
        />
      ) : null}
    </>
  );
}
