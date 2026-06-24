"use client";

import { useEffect, useRef, useState } from "react";
import { loadEngine } from "@/lib/engine/persist";
import type { EngineDoc, EngineSlide } from "@/lib/engine/types";
import { renderSlide } from "@/lib/renderer/canvas";

export default function PresentPage() {
  const [doc, setDoc] = useState<EngineDoc | null>(null);
  const [index, setIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadEngine().then((d) => setDoc(d));
  }, []);

  const slide = doc?.slides[index];

  useEffect(() => {
    if (!slide || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit slide to viewport.
    const pad = 40;
    const scale = Math.min((w - pad) / slide.width, (h - pad) / slide.height);
    const tx = (w - slide.width * scale) / 2;
    const ty = (h - slide.height * scale) / 2;

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    renderSlide(slide, { ctx, images: new Map() }, slide.width, slide.height);
    ctx.restore();
  }, [slide]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === " " ||
        e.key === "PageDown"
      ) {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, (doc?.slides.length ?? 1) - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        window.location.href = "/editor-v2";
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc]);

  if (!doc) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111",
          color: "#fff",
        }}
      >
        Loading...
      </div>
    );
  }

  const total = doc.slides.length;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "#111",
        overflow: "hidden",
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width * 0.3) {
          setIndex((i) => Math.max(i - 1, 0));
        } else if (x > rect.width * 0.7) {
          setIndex((i) => Math.min(i + 1, total - 1));
        }
      }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />

      {/* Controls */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(0,0,0,0.5)",
          padding: "8px 16px",
          borderRadius: 20,
          color: "#fff",
          fontSize: 13,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            fontSize: 16,
            cursor: "pointer",
            opacity: index === 0 ? 0.3 : 1,
          }}
        >
          ◀
        </button>
        <span>
          {index + 1} / {total}
        </span>
        <button
          onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
          disabled={index === total - 1}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            fontSize: 16,
            cursor: "pointer",
            opacity: index === total - 1 ? 0.3 : 1,
          }}
        >
          ▶
        </button>
        <button
          onClick={() => {
            window.location.href = "/editor-v2";
          }}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            fontSize: 12,
            cursor: "pointer",
            marginLeft: 8,
          }}
        >
          Exit
        </button>
      </div>
    </div>
  );
}
