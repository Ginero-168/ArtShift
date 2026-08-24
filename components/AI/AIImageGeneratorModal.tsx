"use client";

import { useEffect, useState } from "react";
import {
  ASPECT_RATIOS,
  type AspectRatioOption,
  generateAIImage,
  INSPIRATION_PROMPTS,
  type PollinationsModel,
} from "@/lib/ai/pollinations";
import { createImage } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";
import { enqueueAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const STYLE_PRESETS: Array<{
  id: PollinationsModel;
  label: string;
  badge: string;
  description: string;
}> = [
  {
    id: "flux-realism",
    label: "Photorealistic",
    badge: "📸",
    description: "Studio lighting, lifelike textures & faces",
  },
  {
    id: "flux",
    label: "Digital Art",
    badge: "🎨",
    description: "Creative concepts, balanced & versatile",
  },
  {
    id: "flux-3d",
    label: "3D Render",
    badge: "🧊",
    description: "Isometric, Pixar / Unreal Engine style",
  },
  {
    id: "flux-anime",
    label: "Anime & Manga",
    badge: "🌸",
    description: "Japanese animation, vibrant 2D illustration",
  },
  {
    id: "turbo",
    label: "Ultra Fast",
    badge: "⚡",
    description: "SDXL Turbo, instant sub-second results",
  },
];

export default function AIImageGeneratorModal({ isOpen, onClose }: Props) {
  const addElement = useEngine((s) => s.addElement);
  const selectOnly = useEngine((s) => s.selectOnly);
  const currentSlideId = useEngine((s) => s.currentSlideId);
  const slides = useEngine((s) => s.doc.slides);

  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState<PollinationsModel>("flux-realism");
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>(ASPECT_RATIOS[0]);
  const [enhance, setEnhance] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    dataUrl: string;
    fileId: string;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function randomizePrompt() {
    const random = INSPIRATION_PROMPTS[Math.floor(Math.random() * INSPIRATION_PROMPTS.length)];
    setPrompt(random);
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError("Please describe what image you want to create.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await generateAIImage({
        prompt,
        model: selectedModel,
        width: selectedRatio.width,
        height: selectedRatio.height,
        enhance,
      });

      setPreviewImage({
        dataUrl: res.dataUrl,
        fileId: res.fileId,
        width: res.width,
        height: res.height,
      });
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Failed to generate image.");
    } finally {
      setLoading(false);
    }
  }

  function handleInsertToCanvas() {
    if (!previewImage) return;

    const currentSlide = slides.find((s) => s.id === currentSlideId) || slides[0];
    const sw = currentSlide?.width ?? 1920;
    const sh = currentSlide?.height ?? 1080;

    // Fit within 60% of canvas
    const maxW = sw * 0.55;
    const maxH = sh * 0.55;
    const scale = Math.min(maxW / previewImage.width, maxH / previewImage.height, 1);

    const w = Math.round(previewImage.width * scale);
    const h = Math.round(previewImage.height * scale);
    const x = Math.round((sw - w) / 2);
    const y = Math.round((sh - h) / 2);

    const element = createImage({
      x,
      y,
      width: w,
      height: h,
      fileId: previewImage.fileId,
      naturalWidth: previewImage.width,
      naturalHeight: previewImage.height,
    });

    enqueueAssetAnalysis({
      fileId: previewImage.fileId,
      dataURL: previewImage.dataUrl,
      width: previewImage.width,
      height: previewImage.height,
    });
    addElement(element, `insert AI image: ${prompt.slice(0, 24)}...`);
    selectOnly([element.id]);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 880,
          maxHeight: "92vh",
          backgroundColor: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 16,
                boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
              }}
            >
              ✨
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>
                AI Image Studio (Text-to-Image)
              </h2>
              <p style={{ fontSize: 11, color: "#64748b", margin: 0, marginTop: 2 }}>
                100% Free & Unlimited • Powered by FLUX.1 & Open-Source AI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 20,
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: 20,
            padding: 24,
            overflowY: "auto",
          }}
        >
          {/* Left Column: Prompt & Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Prompt Input Box */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <label
                  htmlFor="ai-prompt-input"
                  style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}
                >
                  Prompt (คำอธิบายภาพ)
                </label>
                <button
                  type="button"
                  onClick={randomizePrompt}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#6366f1",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <span>🎲</span>
                  <span>Inspire Me</span>
                </button>
              </div>

              <textarea
                id="ai-prompt-input"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to see in English or Thai (e.g. Modern minimalist coffee shop interior with soft sunlight)..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 12,
                  lineHeight: 1.5,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Visual Style Selection */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#1e293b",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Art Style
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {STYLE_PRESETS.map((style) => {
                  const active = selectedModel === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedModel(style.id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: active ? "1.5px solid #6366f1" : "1px solid #e2e8f0",
                        background: active ? "#eef2ff" : "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span>{style.badge}</span>
                        <strong style={{ fontSize: 11, color: active ? "#4338ca" : "#1e293b" }}>
                          {style.label}
                        </strong>
                      </div>
                      <span style={{ fontSize: 9.5, color: "#64748b" }}>{style.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aspect Ratio Selection */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#1e293b",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Aspect Ratio
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {ASPECT_RATIOS.map((ratio) => {
                  const active = selectedRatio.id === ratio.id;
                  return (
                    <button
                      key={ratio.id}
                      type="button"
                      onClick={() => setSelectedRatio(ratio)}
                      style={{
                        flex: 1,
                        padding: "6px 4px",
                        borderRadius: 6,
                        border: active ? "1.5px solid #6366f1" : "1px solid #e2e8f0",
                        background: active ? "#6366f1" : "#f8fafc",
                        color: active ? "#fff" : "#475569",
                        cursor: "pointer",
                        fontSize: 10,
                        fontWeight: 600,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>{ratio.icon}</span>
                      <span>{ratio.label}</span>
                      <span style={{ fontSize: 8.5, opacity: 0.8 }}>{ratio.ratio}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Options Toggle: Prompt Enhancement */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#f8fafc",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>✨</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1e293b" }}>
                    AI Prompt Magic
                  </div>
                  <div style={{ fontSize: 9.5, color: "#64748b" }}>
                    Auto-enhance details, lighting & composition
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={enhance}
                onChange={(e) => setEnhance(e.target.checked)}
                style={{ cursor: "pointer", width: 16, height: 16 }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#dc2626",
                  fontSize: 11,
                }}
              >
                {error}
              </div>
            )}

            {/* Generate Action Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handleGenerate}
              style={{
                padding: "11px 16px",
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, #6366f1 0%, #9333ea 100%)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? "wait" : "pointer",
                boxShadow: "0 4px 12px rgba(99, 102, 241, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: "auto",
              }}
            >
              {loading ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                  <span>Generating with FLUX AI (1-3s)...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Generate Image</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Live Preview & Canvas Placement */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "#0f172a",
              borderRadius: 12,
              padding: 16,
              color: "#fff",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 380,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {loading ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎨</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                  Creating your masterpiece...
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  Rendering with FLUX.1 neural network
                </div>
              </div>
            ) : previewImage ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                {/* Image Container */}
                <div
                  style={{
                    flex: 1,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderRadius: 8,
                    background: "#000",
                  }}
                >
                  {/* biome-ignore lint/performance/noImgElement: Data URL preview */}
                  <img
                    src={previewImage.dataUrl}
                    alt="AI Generated Artwork"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 280,
                      objectFit: "contain",
                      borderRadius: 6,
                    }}
                  />
                </div>

                {/* Bottom Placement Controls */}
                <div style={{ width: "100%", display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #334155",
                      background: "#1e293b",
                      color: "#e2e8f0",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    🎲 New Seed
                  </button>

                  <button
                    type="button"
                    onClick={handleInsertToCanvas}
                    style={{
                      flex: 2,
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: "var(--accent, #6366f1)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      boxShadow: "0 2px 8px rgba(99, 102, 241, 0.4)",
                    }}
                  >
                    <span>🖼️</span>
                    <span>Insert to Canvas</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "#64748b", padding: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🖼️</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
                  Ready to Create
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, maxWidth: 220 }}>
                  Enter a prompt on the left and click Generate to see the result here.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
