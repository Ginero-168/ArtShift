"use client";

/**
 * /projects/[projectId]/editor — Project-scoped Canvas Editor.
 *
 * Requirements:
 * - Scoped to projectId
 * - Header: [Heatmap ArtShift wordmark -> /projects] [Project Name Input]
 * - No "Saved" / "Local Workspace" status in header
 * - Scoped IndexedDB Autosave
 * - Friendly Not Found state if projectId does not exist
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ProfileMenu from "@/components/Auth/ProfileMenu";
import ArtShiftLogo from "@/components/Brand/ArtShiftLogo";
import BlockLibrary from "@/components/Builder/BlockLibrary";
import BuilderInspector from "@/components/Builder/BuilderInspector";
import LayerPanel from "@/components/Builder/LayerPanel";
import CanvasEditor, { type CanvasEditorHandle } from "@/components/Canvas/CanvasEditor";
import EditorOptionBar from "@/components/Canvas/EditorOptionBar";
import SlideRail from "@/components/Canvas/SlideRail";
import { useCanvasHotkeys } from "@/components/Canvas/useCanvasHotkeys";
import {
  IconBrand,
  IconChevronDown,
  IconDownload,
  IconMenu,
  IconPalette,
  IconRedo,
  IconSettings,
  IconStats,
  IconUndo,
  IconZoomIn,
  IconZoomOut,
} from "@/components/icons";
import { useAuth } from "@/lib/auth/useAuth";
import { useEditorOverscrollLock } from "@/lib/editor/useEditorOverscrollLock";
import {
  exportAllPNG,
  exportCurrentSlideJPEG,
  exportCurrentSlidePNG,
  exportCurrentSlideWebP,
  exportPDF,
} from "@/lib/engine/exportPNG";
import { exportPPTX } from "@/lib/engine/exportPPTX";
import { exportAllSVG, exportCurrentSlideSVG } from "@/lib/engine/exportSVG";
import { getImageCache } from "@/lib/engine/imageCache";
import { importLegacyStoreDocument } from "@/lib/engine/legacyBridge";
import { usePresetStore } from "@/lib/engine/presetStore";
import { createEmptyEngineDoc, useEngine } from "@/lib/engine/store";
import type { EngineSlide } from "@/lib/engine/types";
import { loadThaiFonts } from "@/lib/fonts";
import { createProjectAutosave, type ProjectAutosaveStatus } from "@/lib/project/projectAutosave";
import { type ProjectMetadata, projectStore } from "@/lib/project/projectStore";
import { useStore } from "@/lib/store";

const AIImageGeneratorModal = dynamic(() => import("@/components/AI/AIImageGeneratorModal"), {
  ssr: false,
});
const BrandKitModal = dynamic(() => import("@/components/Brand/BrandKitModal"), { ssr: false });
const CampaignStudioModal = dynamic(() => import("@/components/Campaign/CampaignStudioModal"), {
  ssr: false,
});
const TemplateBrowser = dynamic(() => import("@/components/TemplateBrowser"), { ssr: false });
const ModelManagerPanel = dynamic(() => import("@/components/ModelManagerPanel"), { ssr: false });
const RasterStudioShell = dynamic(() => import("@/components/RasterStudio/RasterStudioShell"), {
  ssr: false,
});

/* ——— Slide background palette ——— */
const SLIDE_BG_PALETTE = [
  "#ffffff",
  "#f8f9fa",
  "#e9ecef",
  "#fff9db",
  "#ffe3e3",
  "#d3f9d8",
  "#d0ebff",
];

/* ——— Auto Save Status Indicator ——— */
function AutoSaveIndicator({ status }: { status: ProjectAutosaveStatus }) {
  const isSaving = status === "saving";
  const isError = status === "error";
  const label = isSaving ? "กำลัง Save" : isError ? "Save ไม่สำเร็จ" : "Save แล้ว";
  const stateClass = isSaving ? "is-saving" : isError ? "is-error" : "is-saved";
  return (
    <div
      className={`auto-save-indicator ${stateClass}`}
      data-status={status}
      role="status"
      aria-live="polite"
      aria-label={label}
      title={label}
    >
      {isSaving ? (
        <svg
          className="auto-save-spin"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="2.5"
          />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      ) : isError ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeOpacity="0.35"
          />
          <path d="M9 9l6 6M15 9l-6 6" strokeWidth="2.2" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeOpacity="0.35"
          />
          <path d="m8.5 12.2 2.3 2.3 4.7-4.7" strokeWidth="2.2" />
        </svg>
      )}
    </div>
  );
}

export default function ProjectEditorPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.projectId;
  const projectId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  const { authenticated, loading: authLoading } = useAuth();
  useEditorOverscrollLock();

  const undo = useEngine((s) => s.undo);
  const redo = useEngine((s) => s.redo);
  const loadDoc = useEngine((s) => s.loadDoc);
  const setDocTitle = useEngine((s) => s.setDocTitle);
  const theme = useStore((s) => s.theme);
  const cycleTheme = useStore((s) => s.cycleTheme);
  const setSlideBackground = useEngine((s) => s.setSlideBackground);
  const currentSlideId = useEngine((s) => s.currentSlideId);
  const currentSlideBackground = useEngine(
    (s) => s.doc.slides.find((slide) => slide.id === s.currentSlideId)?.background ?? "#ffffff",
  );
  const aiImageModalOpen = useEngine((s) => s.aiImageModalOpen);
  const setAiImageModalOpen = useEngine((s) => s.setAiImageModalOpen);

  const [_project, setProject] = useState<ProjectMetadata | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [projectNameWidth, setProjectNameWidth] = useState(48);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<ProjectAutosaveStatus>("saved");

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [_showGSlidesModal, setShowGSlidesModal] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);
  const [campaignStudioOpen, setCampaignStudioOpen] = useState(false);
  const [brandKitOpen, setBrandKitOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projectNameMeasureRef = useRef<HTMLSpanElement | null>(null);
  const persistedRevision = useRef<number | null>(null);
  const autosaveRef = useRef<ReturnType<typeof createProjectAutosave> | null>(null);

  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const [_zoomInputText, setZoomInputText] = useState("");
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace(`/?returnTo=${encodeURIComponent(`/projects/${projectId}/editor`)}`);
    }
  }, [authLoading, authenticated, projectId, router]);

  useEffect(() => {
    if (!zoomDropdownOpen) return;
    function onDocClick(e: MouseEvent) {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setZoomDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [zoomDropdownOpen]);

  // Load project document
  useEffect(() => {
    if (!projectId) return;
    loadThaiFonts();
    usePresetStore.getState().hydrate();
    let cancelled = false;

    (async () => {
      try {
        const metadata = await projectStore.getProject(projectId);
        if (cancelled) return;
        if (!metadata) {
          setNotFound(true);
          setLoaded(true);
          return;
        }

        setProject(metadata);
        setProjectName(metadata.name);

        const loadedRecord = await projectStore.loadProjectDocument(projectId);
        if (cancelled) return;

        if (loadedRecord?.doc) {
          loadDoc(loadedRecord.doc);
          persistedRevision.current = loadedRecord.doc.updatedAt;
        }

        void projectStore.touchLastOpened(projectId);
        setLoaded(true);
        setSaveStatus("saved");
      } catch (err) {
        if (!cancelled) {
          setSaveError(err instanceof Error ? err.message : "Failed to load project");
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, loadDoc]);

  useLayoutEffect(() => {
    let cancelled = false;
    const measureProjectName = () => {
      if (cancelled || !projectNameMeasureRef.current) return;
      const titleText = projectName || "Untitled Project";
      if (projectNameMeasureRef.current.textContent !== titleText) return;
      const measuredWidth = Math.ceil(projectNameMeasureRef.current.getBoundingClientRect().width);
      const fallbackWidth = Math.max(48, Math.ceil(titleText.length * 6 + 16));
      const width = Math.max(measuredWidth, fallbackWidth);
      setProjectNameWidth((current) => (current === width ? current : width));
    };

    measureProjectName();
    const frame = requestAnimationFrame(measureProjectName);
    const measureElement = projectNameMeasureRef.current;
    const observer =
      typeof ResizeObserver === "undefined" || !measureElement
        ? null
        : new ResizeObserver(measureProjectName);
    if (observer && measureElement) observer.observe(measureElement);
    if (typeof document.fonts?.ready?.then === "function") {
      void document.fonts.ready.then(measureProjectName);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [projectName]);

  // Scoped Auto-save: debounce the UI, serialize IndexedDB writes, persist current engine state.
  useEffect(() => {
    if (!loaded || !projectId || notFound) return;
    const controller = createProjectAutosave({
      getDoc: () => useEngine.getState().doc,
      save: async (id, doc) => {
        const result = await projectStore.saveProjectDocument(id, doc);
        if (result.ok) persistedRevision.current = doc.updatedAt;
        return result;
      },
      onStatus: (status, error) => {
        setSaveStatus(status);
        setSaveError(error);
      },
    });
    autosaveRef.current = controller;
    if (persistedRevision.current != null) controller.markPersisted(persistedRevision.current);
    const unsubscribe = useEngine.subscribe((state, previous) => {
      if (state.doc.updatedAt === previous.doc.updatedAt) return;
      if (persistedRevision.current === state.doc.updatedAt) return;
      controller.schedule(projectId);
    });
    const onPageLeave = (event: Event) => {
      controller.handlePageLeave(projectId, event instanceof BeforeUnloadEvent ? event : undefined);
    };
    window.addEventListener("beforeunload", onPageLeave);
    window.addEventListener("pagehide", onPageLeave);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onPageLeave);
      window.removeEventListener("pagehide", onPageLeave);
      if (autosaveRef.current === controller) autosaveRef.current = null;
      controller.dispose();
    };
  }, [loaded, projectId, notFound]);

  async function persistCurrentDoc() {
    if (!projectId || notFound) {
      return { ok: false as const, message: "Project is not available." };
    }
    const controller = autosaveRef.current;
    if (controller) return controller.flush(projectId);
    setSaveStatus("saving");
    const doc = useEngine.getState().doc;
    const result = await projectStore.saveProjectDocument(projectId, doc);
    if (result.ok) {
      persistedRevision.current = doc.updatedAt;
      setSaveStatus("saved");
      setSaveError(null);
    } else {
      setSaveStatus("error");
      setSaveError(result.message);
    }
    return result;
  }

  // Rename handling
  const handleRename = async (name: string) => {
    const finalName = name.trim() || "Untitled Project";
    setProjectName(finalName);
    if (!projectId || notFound) return;
    setSaveStatus("saving");
    try {
      await projectStore.renameProject(projectId, finalName);
      setDocTitle(finalName);
      setSaveError(null);
      setSaveStatus("saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to rename project");
      setSaveStatus("error");
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Hotkeys
  useCanvasHotkeys();

  async function importLegacy() {
    const engineDoc = await importLegacyStoreDocument();
    loadDoc(engineDoc);
    if (projectId) {
      await persistCurrentDoc();
    }
    setMenuOpen(false);
  }

  async function exportProjectFile() {
    if (!projectId) return;
    const jsonString = await projectStore.exportProject(projectId);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${projectName.replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, "_")}.artshift`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  async function runExport(
    kind: "pptx" | "pdf" | "png" | "pngAll" | "svg" | "svgAll" | "webp" | "jpg",
  ) {
    if (exportBusy) return;
    const { doc, currentSlideId: activeSlideId } = useEngine.getState();
    setExportBusy(kind);
    try {
      const images = getImageCache();
      if (kind === "pptx") {
        await exportPPTX(doc, images);
        setShowGSlidesModal(true);
      } else if (kind === "pdf") {
        await exportPDF(doc, images);
      } else if (kind === "png") {
        const slide = doc.slides.find((sl) => sl.id === activeSlideId);
        if (slide) await exportCurrentSlidePNG(slide, doc, images);
      } else if (kind === "pngAll") {
        await exportAllPNG(doc, images);
      } else if (kind === "webp") {
        const slide = doc.slides.find((sl) => sl.id === activeSlideId);
        if (slide) await exportCurrentSlideWebP(slide, doc, images);
      } else if (kind === "jpg") {
        const slide = doc.slides.find((sl) => sl.id === activeSlideId);
        if (slide) await exportCurrentSlideJPEG(slide, doc, images);
      } else if (kind === "svg") {
        const slide = doc.slides.find((slide) => slide.id === activeSlideId);
        if (slide) exportCurrentSlideSVG(slide);
      } else if (kind === "svgAll") {
        exportAllSVG(doc);
      }
    } finally {
      setExportBusy(null);
    }
  }

  function handleLoadCampaignIntoCanvas(newSlides: EngineSlide[]) {
    if (!newSlides.length) return;
    const st = useEngine.getState();
    const currentDoc = st.doc;
    const updatedDoc = {
      ...currentDoc,
      slides: [...currentDoc.slides, ...newSlides],
      updatedAt: Date.now(),
    };
    loadDoc(updatedDoc);
    if (projectId) {
      void persistCurrentDoc();
    }
    setCampaignStudioOpen(false);
  }

  async function resetCanvas() {
    if (confirm("Reset the canvas for this project? This cannot be undone.")) {
      const emptyDoc = createEmptyEngineDoc(projectName);
      loadDoc(emptyDoc);
      if (projectId) {
        await persistCurrentDoc();
      }
      setMenuOpen(false);
    }
  }

  // Not Found State
  if (notFound) {
    return (
      <div
        className={`app-root theme-${theme}`}
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg, #f8fafc)",
          color: "var(--ink, #0f172a)",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "var(--surface-solid, #ffffff)",
            border: "1px solid var(--stroke, #e2e8f0)",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "#fee2e2",
              color: "#dc2626",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <IconBrand />
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>ไม่พบโปรเจกต์นี้</h2>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: 13,
              color: "var(--ink-muted, #64748b)",
              lineHeight: 1.5,
            }}
          >
            โปรเจกต์รหัส{" "}
            <code
              style={{
                background: "var(--surface-hover, #f1f5f9)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {projectId}
            </code>{" "}
            อาจถูกลบไปแล้ว หรือยังไม่เคยถูกบันทึกบนเครื่องนี้
          </p>
          <Link
            href="/projects"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 20px",
              background: "var(--accent, #6366f1)",
              color: "#ffffff",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
            }}
          >
            กลับไปหน้ารายการโปรเจกต์
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-root theme-${theme}`}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ——— TopBar: [Heatmap ArtShift wordmark -> /projects] [Project Name Input] ——— */}
      <header className="topbar">
        <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Top-left Logo button linking back to /projects */}
          <Link
            href="/projects"
            title="กลับไปหน้ารายการโปรเจกต์ (Back to Projects)"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              color: "inherit",
              padding: "4px 6px",
              borderRadius: 6,
              transition: "background 0.15s ease",
            }}
            className="brand-link"
          >
            <ArtShiftLogo size="compact" />
          </Link>

          {/* Inline Editable Project Name + attached save state */}
          <div className="project-title-group">
            <span ref={projectNameMeasureRef} className="project-title-measure" aria-hidden="true">
              {projectName || "Untitled Project"}
            </span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => {
                // Keep the indicator honest: typing alone does not persist yet.
                // Save status flips in handleRename / document autosave.
                setProjectName(e.target.value);
              }}
              onBlur={(e) => handleRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Untitled Project"
              aria-label="Project Title"
              className="project-title-input"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink, #111827)",
                background: "transparent",
                border: "1px solid transparent",
                borderRadius: 6,
                padding: "4px 8px",
                outline: "none",
                width: projectNameWidth,
                transition: "all 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = "var(--surface-solid, #ffffff)";
                e.currentTarget.style.borderColor = "var(--accent, #6366f1)";
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(99, 102, 241, 0.15)";
              }}
              onMouseEnter={(e) => {
                if (document.activeElement !== e.currentTarget) {
                  e.currentTarget.style.background = "var(--surface-hover, #f3f4f6)";
                  e.currentTarget.style.borderColor = "var(--stroke, #e5e7eb)";
                }
              }}
              onMouseLeave={(e) => {
                if (document.activeElement !== e.currentTarget) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "transparent";
                }
              }}
            />
            <AutoSaveIndicator status={saveStatus} />
          </div>

          {saveError && (
            <span
              style={{
                fontSize: 11,
                color: "#dc2626",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                padding: "2px 8px",
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title={saveError}
            >
              Autosave failed: {saveError}
            </span>
          )}
        </div>

        <div className="topbar-center">
          <EditorOptionBar />
        </div>

        <div className="topbar-right">
          <button className="ghost-btn" onClick={cycleTheme} title="Toggle theme">
            <IconPalette size={15} />
          </button>
          <button className="ghost-btn" onClick={() => setStatsOpen(true)} title="Stats">
            <IconStats size={15} />
          </button>

          <div style={{ position: "relative" }}>
            <button
              className="ghost-btn"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Settings"
            >
              <IconSettings size={15} />
            </button>
            {settingsOpen && (
              <div
                className="menu"
                style={{
                  position: "absolute",
                  top: 32,
                  right: 0,
                  zIndex: 30,
                  padding: 0,
                  overflow: "hidden",
                }}
              >
                <ModelManagerPanel
                  onResetProject={async () => {
                    if (confirm("Reset all slides in this project? This cannot be undone.")) {
                      const emptyDoc = createEmptyEngineDoc(projectName);
                      loadDoc(emptyDoc);
                      if (projectId) {
                        await persistCurrentDoc();
                      }
                      setSettingsOpen(false);
                    }
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              className="primary-btn"
              onClick={() => {
                setExportOpen((v) => !v);
                setStatsOpen(false);
              }}
            >
              <IconDownload size={11} /> Share
            </button>
            {exportOpen && (
              <div className="menu" style={{ position: "absolute", top: 32, right: 0, zIndex: 30 }}>
                <button
                  onClick={() => {
                    runExport("pptx");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download .pptx
                </button>
                <button
                  onClick={() => {
                    runExport("pdf");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download .pdf
                </button>
                <button
                  onClick={() => {
                    runExport("png");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download .png (current)
                </button>
                <button
                  onClick={() => {
                    runExport("webp");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download .webp (Optimized Ads)
                </button>
                <button
                  onClick={() => {
                    runExport("jpg");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download .jpg (High Quality)
                </button>
                <button
                  onClick={() => {
                    runExport("pngAll");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download .png (all)
                </button>
                <button
                  onClick={() => {
                    runExport("svg");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download editable .svg (current)
                </button>
                <button
                  onClick={() => {
                    runExport("svgAll");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download editable .svg (all)
                </button>
              </div>
            )}
          </div>
          <ProfileMenu />
        </div>
      </header>

      {/* Hidden PDF import input */}
      <input
        id="pdf-import-input"
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const { importPdfToImages } = await import("@/lib/import/pdfImport");
          const { loadDataURL } = await import("@/lib/engine/imageCache");
          const { createImage } = await import("@/lib/engine/factory");

          const images = await importPdfToImages(file, 2);
          for (let i = 0; i < images.length; i++) {
            const entry = await loadDataURL(images[i]);
            const st = useEngine.getState();
            const slide = st.doc.slides.find((sl) => sl.id === st.currentSlideId);
            const sw = slide?.width ?? 1920;
            const sh = slide?.height ?? 1080;
            const maxW = sw * 0.9;
            const maxH = sh * 0.9;
            const ratio = Math.min(maxW / entry.width, maxH / entry.height, 1);
            const w = entry.width * ratio;
            const h = entry.height * ratio;
            const x = (sw - w) / 2;
            const y = (sh - h) / 2;
            if (i > 0) {
              const newSlideId = useEngine.getState().addSlide();
              useEngine.getState().setCurrentSlide(newSlideId);
            }
            useEngine.getState().addElement(
              createImage({
                x,
                y,
                width: w,
                height: h,
                fileId: entry.fileId,
                naturalWidth: entry.width,
                naturalHeight: entry.height,
              }),
              "import pdf page",
            );
          }
          (e.target as HTMLInputElement).value = "";
        }}
      />

      {/* ——— Main area ——— */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SlideRail />
        <BlockLibrary />
        <div
          style={{ flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}
          className="canvas-stage"
        >
          {loaded && (
            <CanvasEditor ref={canvasEditorRef} onViewChange={(v) => setZoomScale(v.scale)} />
          )}
          <LayerPanel />

          {/* ——— Left toolbar (top-left of workspace) ——— */}
          <div
            style={{
              position: "absolute",
              top: 9,
              left: 9,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
            }}
          >
            {/* Top row: Hamburger + Settings + Undo + Redo */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {/* Hamburger menu */}
              <div ref={menuRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: "1px solid var(--stroke, #e5e7eb)",
                    background: "var(--surface-solid, #fff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "var(--ink, #111)",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  }}
                  title="Menu"
                >
                  <IconMenu size={12} />
                </button>
                {menuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 34,
                      left: 0,
                      width: 220,
                      background: "var(--surface-solid, #fff)",
                      border: "1px solid var(--stroke, #e5e7eb)",
                      borderRadius: 9,
                      boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
                      padding: "6px 0",
                      zIndex: 20,
                    }}
                  >
                    {/* Return to projects */}
                    <HamburgerItem
                      label="Back to Projects"
                      onClick={() => {
                        router.push("/projects");
                        setMenuOpen(false);
                      }}
                    />
                    {/* Export .artshift project */}
                    <HamburgerItem
                      label="Export .artshift (Backup)"
                      onClick={() => {
                        exportProjectFile();
                      }}
                    />
                    {/* Import PDF */}
                    <HamburgerItem
                      label="Import PDF"
                      onClick={() => {
                        document.getElementById("pdf-import-input")?.click();
                        setMenuOpen(false);
                      }}
                    />
                    {/* Open Legacy Workspace */}
                    <HamburgerItem
                      label="Import Legacy Artwork"
                      onClick={() => {
                        importLegacy();
                      }}
                    />
                    {/* Export image */}
                    <HamburgerItem
                      label="Export image..."
                      onClick={() => {
                        runExport("png");
                      }}
                    />
                    {/* Templates */}
                    <HamburgerItem
                      label="Templates"
                      onClick={() => {
                        setTemplateBrowserOpen(true);
                        setMenuOpen(false);
                      }}
                    />
                    {/* AI Image Studio */}
                    <HamburgerItem
                      label="✨ AI Image Studio (GPT Image 2 · low)"
                      onClick={() => {
                        useEngine.getState().setAiImageModalOpen(true);
                        setMenuOpen(false);
                      }}
                    />
                    {/* Campaign Studio */}
                    <HamburgerItem
                      label="Campaign Studio (Batch)"
                      onClick={() => {
                        setCampaignStudioOpen(true);
                        setMenuOpen(false);
                      }}
                    />
                    {/* Present */}
                    <HamburgerItem
                      label="Present"
                      onClick={() => {
                        window.open("/present", "_blank");
                        setMenuOpen(false);
                      }}
                    />
                    {/* Help */}
                    <HamburgerItem label="Help" onClick={() => setMenuOpen(false)} />
                    {/* Reset */}
                    <HamburgerItem label="Reset the canvas" onClick={resetCanvas} danger />

                    <div
                      style={{ height: 1, background: "var(--stroke, #e5e7eb)", margin: "4px 0" }}
                    />

                    {/* Canvas background */}
                    <div style={{ padding: "6px 12px" }}>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--ink-muted, #6b7280)",
                          marginBottom: 6,
                          fontWeight: 500,
                        }}
                      >
                        Canvas background
                      </div>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {SLIDE_BG_PALETTE.map((c) => (
                          <button
                            key={c}
                            onClick={() => {
                              setSlideBackground(currentSlideId, c);
                            }}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 3,
                              border:
                                currentSlideBackground === c
                                  ? "2px solid var(--accent, #6366f1)"
                                  : "1px solid var(--stroke, #d1d5db)",
                              background: c,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ——— Top-right toolbar: History + Zoom + Grid + Layer Filter ——— */}
          <div
            style={{
              position: "absolute",
              top: 9,
              right: 9,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 3,
              background: "var(--surface-solid, #fff)",
              border: "1px solid var(--stroke, #e5e7eb)",
              borderRadius: 8,
              padding: "3px 4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
          >
            {/* 0. History: Undo & Redo */}
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                onClick={undo}
                title="Undo"
                style={{
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  border: "none",
                  background: "transparent",
                  color: "var(--ink, #111827)",
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <IconUndo size={14} />
              </button>
              <button
                type="button"
                onClick={redo}
                title="Redo"
                style={{
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  border: "none",
                  background: "transparent",
                  color: "var(--ink, #111827)",
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <IconRedo size={14} />
              </button>
            </div>

            <div
              style={{
                width: 1,
                height: 16,
                background: "var(--stroke, #e5e7eb)",
                margin: "0 2px",
              }}
            />

            {/* 1. Zoom Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(0.1, zoomScale - 0.15);
                  canvasEditorRef.current?.setZoom(next);
                }}
                title="Zoom Out (Cmd -)"
                style={{
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  border: "none",
                  background: "transparent",
                  color: "var(--ink, #374151)",
                  cursor: "pointer",
                }}
              >
                <IconZoomOut size={13} />
              </button>

              <div ref={zoomMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setZoomInputText(`${Math.round(zoomScale * 100)}%`);
                    setZoomDropdownOpen((v) => !v);
                  }}
                  style={{
                    height: 22,
                    padding: "0 4px",
                    borderRadius: 4,
                    border: "1px solid transparent",
                    background: "transparent",
                    color: "var(--ink, #374151)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <span>{Math.round(zoomScale * 100)}%</span>
                  <IconChevronDown size={10} />
                </button>

                {zoomDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 28,
                      right: 0,
                      width: 140,
                      background: "var(--surface-solid, #fff)",
                      border: "1px solid var(--stroke, #e5e7eb)",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      padding: "6px 0",
                      zIndex: 30,
                    }}
                  >
                    {[50, 75, 100, 125, 150, 200].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          canvasEditorRef.current?.setZoom(pct / 100);
                          setZoomDropdownOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "5px 12px",
                          fontSize: 11,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--ink, #111)",
                          fontWeight: Math.round(zoomScale * 100) === pct ? 700 : 400,
                        }}
                      >
                        {pct}%
                      </button>
                    ))}
                    <div
                      style={{ height: 1, background: "var(--stroke, #e5e7eb)", margin: "4px 0" }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        canvasEditorRef.current?.setZoom(1);
                        setZoomDropdownOpen(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "5px 12px",
                        fontSize: 11,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--accent, #6366f1)",
                        fontWeight: 600,
                      }}
                    >
                      Fit to Screen
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = Math.min(3, zoomScale + 0.15);
                  canvasEditorRef.current?.setZoom(next);
                }}
                title="Zoom In (Cmd +)"
                style={{
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  border: "none",
                  background: "transparent",
                  color: "var(--ink, #374151)",
                  cursor: "pointer",
                }}
              >
                <IconZoomIn size={13} />
              </button>
            </div>
          </div>
        </div>
        <BuilderInspector />
      </div>

      {/* ——— Modals ——— */}
      {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} />}

      {templateBrowserOpen && <TemplateBrowser onClose={() => setTemplateBrowserOpen(false)} />}

      {campaignStudioOpen && (
        <CampaignStudioModal
          isOpen={campaignStudioOpen}
          onClose={() => setCampaignStudioOpen(false)}
          onLoadIntoCanvas={handleLoadCampaignIntoCanvas}
        />
      )}

      {brandKitOpen && (
        <BrandKitModal isOpen={brandKitOpen} onClose={() => setBrandKitOpen(false)} />
      )}

      {aiImageModalOpen && (
        <AIImageGeneratorModal
          isOpen={aiImageModalOpen}
          onClose={() => setAiImageModalOpen(false)}
        />
      )}

      <RasterStudioShell />
    </div>
  );
}

function StatsModal({ onClose }: { onClose: () => void }) {
  const doc = useEngine.getState().doc;
  const slides = doc.slides.length;
  const elements = doc.slides.reduce(
    (acc: number, sl) => acc + sl.elements.filter((e) => !e.isDeleted).length,
    0,
  );
  const textElements = doc.slides.reduce(
    (acc: number, sl) => acc + sl.elements.filter((e) => !e.isDeleted && e.type === "text").length,
    0,
  );
  const imageElements = doc.slides.reduce(
    (acc: number, sl) => acc + sl.elements.filter((e) => !e.isDeleted && e.type === "image").length,
    0,
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface-solid, #fff)",
          borderRadius: 14,
          padding: 24,
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Stats</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <StatBox label="Slides" value={slides} />
          <StatBox label="Elements" value={elements} />
          <StatBox label="Text boxes" value={textElements} />
          <StatBox label="Images" value={imageElements} />
        </div>
        <button
          onClick={onClose}
          style={{
            padding: "8px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent, #6366f1)",
            color: "#fff",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--stroke, #e5e7eb)",
        background: "var(--surface-hover, #f3f4f6)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent, #6366f1)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ink-muted, #6b7280)" }}>{label}</div>
    </div>
  );
}

function HamburgerItem({
  label,
  shortcut,
  danger,
  onClick,
}: {
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 12px",
        border: "none",
        background: "none",
        fontSize: 11,
        color: danger ? "#dc2626" : "var(--ink, #111)",
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = danger ? "#fef2f2" : "var(--surface-hover, #f3f4f6)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 9, color: "var(--ink-muted, #9ca3af)" }}>{shortcut}</span>
      )}
    </button>
  );
}
