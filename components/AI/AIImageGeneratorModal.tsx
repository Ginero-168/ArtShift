"use client";

import { useEffect, useRef, useState } from "react";
import { executeCoPilotInstruction } from "@/lib/ai/coPilot";
import {
  ASPECT_RATIOS,
  type AspectRatioOption,
  enrichPrompt,
  GPT_IMAGE_2_MODEL,
  GPT_IMAGE_2_QUALITY,
  INSPIRATION_PROMPTS,
} from "@/lib/ai/imageGeneration";

type ImageStyleId = "photorealistic" | "digital-art" | "3d-render" | "anime";

const STYLE_PRESETS: Array<{
  id: ImageStyleId;
  label: string;
  badge: string;
  description: string;
  promptSuffix: string;
}> = [
  {
    id: "photorealistic",
    label: "Photorealistic",
    badge: "📸",
    description: "Studio lighting, lifelike textures & faces",
    promptSuffix: "photorealistic, natural lens rendering, lifelike textures, studio lighting",
  },
  {
    id: "digital-art",
    label: "Digital Art",
    badge: "🎨",
    description: "Creative concepts, balanced & versatile",
    promptSuffix: "polished digital art, expressive composition, rich color design",
  },
  {
    id: "3d-render",
    label: "3D Render",
    badge: "🧊",
    description: "Isometric, cinematic 3D scene",
    promptSuffix: "high-quality 3D render, cinematic lighting, clean materials and depth",
  },
  {
    id: "anime",
    label: "Anime & Manga",
    badge: "🌸",
    description: "Vibrant 2D illustration",
    promptSuffix: "vibrant 2D anime illustration, expressive linework, polished cel shading",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIImageGeneratorModal({ isOpen, onClose }: Props) {
  const generationAbortRef = useRef<AbortController | null>(null);

  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<ImageStyleId>("photorealistic");
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>(ASPECT_RATIOS[0]);
  const [enhance, setEnhance] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => generationAbortRef.current?.abort();
  }, []);

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

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const style = STYLE_PRESETS.find((preset) => preset.id === selectedStyle);
      const basePrompt = enhance ? enrichPrompt(prompt.trim()) : prompt.trim();
      const generationPrompt = [
        basePrompt,
        style?.promptSuffix,
        `สำหรับอัตราส่วน ${selectedRatio.ratio}`,
      ]
        .filter(Boolean)
        .join("\n\nVisual direction: ");
      const result = await executeCoPilotInstruction(`สร้างภาพ ${generationPrompt}`, undefined, {
        contextAwareValidated: true,
        cloudConsent: true,
        signal: controller.signal,
      });
      if (result.actions.some((action) => action.status === "error")) {
        setError(result.reply);
        return;
      }
      onClose();
    } catch (err) {
      if (controller.signal.aborted || (err as Error).name === "AbortError") return;
      setError((err as Error).message || "Failed to generate image.");
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
        setLoading(false);
      }
    }
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
        role="dialog"
        aria-label="AI Image Studio"
        aria-modal="true"
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
                Replicate · {GPT_IMAGE_2_MODEL} · quality: auto (default {GPT_IMAGE_2_QUALITY}) ·
                cost varies by quality
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
                Visual Style (prompt guidance)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {STYLE_PRESETS.map((style) => {
                  const active = selectedStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyle(style.id)}
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
                  <span>🎨</span>
                  <span>Creating with GPT Image 2...</span>
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
                  The context-aware task is analyzing, generating, and placing the result safely.
                </div>
              </div>
            ) : error ? (
              <div style={{ textAlign: "center", color: "#fecaca", padding: 20 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Task was not committed</div>
                <div style={{ fontSize: 10, color: "#fda4af", marginTop: 5 }}>
                  The original Canvas remains unchanged.
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "#64748b", padding: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🖼️</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
                  Ready to Create
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, maxWidth: 240 }}>
                  The verified task will analyze the brief, preload the output, and place a
                  duplicate on the Canvas.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
