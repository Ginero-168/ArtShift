"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ArtShiftLogo from "@/components/Brand/ArtShiftLogo";
import { absorbWorkspaceWheel } from "@/lib/editor/overscrollLock";
import { useEditorOverscrollLock } from "@/lib/editor/useEditorOverscrollLock";
import { getImageCache } from "@/lib/engine/imageCache";
import {
  getExportableSlides,
  INFINITY_CANVAS_EXPORT_NOTE,
  INFINITY_CANVAS_LABEL,
} from "@/lib/engine/slideKind";
import type { EngineDoc, EngineSlide } from "@/lib/engine/types";
import { leavePresent, loadPresentDocument, presentSlideIndex } from "@/lib/project/presentProject";
import { projectStore } from "@/lib/project/projectStore";
import { renderSlide } from "@/lib/renderer/canvas";

export default function PresentPage() {
  const [doc, setDoc] = useState<EngineDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEditorOverscrollLock();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("projectId");
    const slideId = params.get("slideId");
    loadPresentDocument(projectStore, projectId).then((result) => {
      if (result.status === "loaded") {
        setIndex(presentSlideIndex(getExportableSlides(result.doc), slideId));
        setDoc(result.doc);
        return;
      }
      if (result.status === "missing") {
        setLoadError(
          `Project ${result.projectId} was not found in local storage. Open it from Projects, then present again.`,
        );
        return;
      }
      setLoadError(
        "No project is available to present. Open a project from /projects first — Present reads the last opened ArtShift project, not the legacy workspace.",
      );
    });
  }, []);

  const presentSlides: EngineSlide[] = doc ? getExportableSlides(doc) : [];
  const slide = presentSlides[index];

  const exitPresent = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    leavePresent({
      hasOpener: Boolean(window.opener && !window.opener.closed),
      projectId: params.get("projectId"),
      slideId: slide?.id ?? params.get("slideId"),
      close: () => window.close(),
      go: (href) => {
        window.location.assign(href);
      },
    });
  }, [slide?.id]);

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

    const pad = 40;
    const scale = Math.min((w - pad) / slide.width, (h - pad) / slide.height);
    const tx = (w - slide.width * scale) / 2;
    const ty = (h - slide.height * scale) / 2;

    ctx.fillStyle = "#0e1218";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    renderSlide(slide, { ctx, images: getImageCache() }, slide.width, slide.height, {
      showFrames: true,
    });
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
        setIndex((i) => Math.min(i + 1, Math.max(presentSlides.length - 1, 0)));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        exitPresent();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentSlides.length, exitPresent]);

  useEffect(() => {
    if (!doc) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      absorbWorkspaceWheel(event);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [doc]);

  if (!doc) {
    return (
      <div className="present-room present-note">
        <ArtShiftLogo size="header" />
        <p>{loadError ?? "Loading…"}</p>
        {loadError ? (
          <a className="present-link" href="/projects">
            Back to Projects
          </a>
        ) : null}
      </div>
    );
  }

  if (!presentSlides.length) {
    return (
      <div className="present-room present-note">
        <ArtShiftLogo size="header" />
        <p>
          This project has no exportable slides. {INFINITY_CANVAS_LABEL} slides are skipped in
          Present. {INFINITY_CANVAS_EXPORT_NOTE}
        </p>
        <a className="present-link" href="/projects">
          Back to Projects
        </a>
      </div>
    );
  }

  const total = presentSlides.length;

  return (
    <div
      ref={containerRef}
      className="present-room present-stage"
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

      <div className="present-dock" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          aria-label="Previous slide"
        >
          Prev
        </button>
        <span className="present-count">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
          disabled={index === total - 1}
          aria-label="Next slide"
        >
          Next
        </button>
        <button type="button" onClick={exitPresent}>
          Exit
        </button>
      </div>
    </div>
  );
}
