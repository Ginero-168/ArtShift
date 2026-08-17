"use client";

/**
 * / — Excalidraw-style canvas editor (main app route).
 *
 * Layout:
 * - TopBar (ArtShift brand + title + Search/Stats/Import/Share)
 * - SlideRail (left, collapsible)
 * - Canvas workspace with floating toolbar + hamburger menu
 * - Properties panel (left of workspace, on selection)
 */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import AutoLayoutAction from "@/components/Builder/AutoLayoutAction";
import BlockLibrary from "@/components/Builder/BlockLibrary";
import BuilderInspector from "@/components/Builder/BuilderInspector";
import LayerPanel from "@/components/Builder/LayerPanel";
import ResizeArtworkAction from "@/components/Builder/ResizeArtworkAction";
import CanvasEditor, { type CanvasEditorHandle } from "@/components/Canvas/CanvasEditor";
import SlideRail from "@/components/Canvas/SlideRail";
import { useCanvasHotkeys } from "@/components/Canvas/useCanvasHotkeys";
import {
  IconBrand,
  IconChevronDown,
  IconCursor,
  IconDirectSelect,
  IconDownload,
  IconGrid,
  IconHand,
  IconMenu,
  IconPalette,
  IconRedo,
  IconSettings,
  IconSparkles,
  IconStats,
  IconUndo,
  IconZoomIn,
  IconZoomOut,
} from "@/components/icons";
import { legacyToEngineDoc } from "@/lib/engine/adapter";

const AIPanel = dynamic(() => import("@/components/AI/AIPanel"), { ssr: false });
const AIImageGeneratorModal = dynamic(() => import("@/components/AI/AIImageGeneratorModal"), {
  ssr: false,
});
const BrandKitModal = dynamic(() => import("@/components/Brand/BrandKitModal"), { ssr: false });
const CampaignStudioModal = dynamic(() => import("@/components/Campaign/CampaignStudioModal"), {
  ssr: false,
});
const TemplateBrowser = dynamic(() => import("@/components/TemplateBrowser"), { ssr: false });

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
import { clearEngine, type EngineLoadResult, loadEngine, saveEngine } from "@/lib/engine/persist";
import { usePresetStore } from "@/lib/engine/presetStore";
import { useEngine } from "@/lib/engine/store";
import { loadThaiFonts } from "@/lib/fonts";
import { useStore } from "@/lib/store";

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

type LoadIssue = Extract<EngineLoadResult, { status: "corrupt" }>;
type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; savedAt: number }
  | { status: "error"; message: string };

/* ——— Main component ——— */

export default function HomePage() {
  const tool = useEngine((s) => s.tool);
  const setTool = useEngine((s) => s.setTool);
  const undo = useEngine((s) => s.undo);
  const redo = useEngine((s) => s.redo);
  const deleteElements = useEngine((s) => s.deleteElements);
  const loadDoc = useEngine((s) => s.loadDoc);
  const doc = useEngine((s) => s.doc);
  const theme = useStore((s) => s.theme);
  const cycleTheme = useStore((s) => s.cycleTheme);
  const setSlideBackground = useEngine((s) => s.setSlideBackground);
  const showHexGrid = useEngine((s) => s.showHexGrid);
  const setShowHexGrid = useEngine((s) => s.setShowHexGrid);
  const layerFilter = useEngine((s) => s.layerFilter);
  const setLayerFilter = useEngine((s) => s.setLayerFilter);
  const currentSlideId = useEngine((s) => s.currentSlideId);
  const currentSlide = doc.slides.find((sl) => sl.id === currentSlideId);
  const aiImageModalOpen = useEngine((s) => s.aiImageModalOpen);
  const setAiImageModalOpen = useEngine((s) => s.setAiImageModalOpen);

  const [loaded, setLoaded] = useState(false);
  const [loadIssue, setLoadIssue] = useState<LoadIssue | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [showGSlidesModal, setShowGSlidesModal] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);
  const [campaignStudioOpen, setCampaignStudioOpen] = useState(false);
  const [brandKitOpen, setBrandKitOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const persistedRevision = useRef<number | null>(null);
  const saveRequest = useRef(0);

  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const [zoomInputText, setZoomInputText] = useState("");
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);

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

  // Load
  useEffect(() => {
    loadThaiFonts();
    usePresetStore.getState().hydrate();
    let cancelled = false;
    (async () => {
      const result = await loadEngine();
      if (cancelled) return;
      if (result.status === "corrupt") {
        setLoadIssue(result);
        return;
      }
      if (result.status === "loaded" || result.status === "recovered") {
        loadDoc(result.doc);
        persistedRevision.current = result.doc.updatedAt;
        if (result.status === "recovered") {
          setRecoveryNotice(
            result.source === "backup"
              ? "Recovered the last safe Artwork backup. Review it before continuing."
              : "Loaded your previous ArtShift document. It will migrate on your next edit.",
          );
        }
      } else {
        persistedRevision.current = useEngine.getState().doc.updatedAt;
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDoc]);

  // Auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (persistedRevision.current === doc.updatedAt) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const request = ++saveRequest.current;
    saveTimer.current = setTimeout(async () => {
      setSaveState({ status: "saving" });
      const revision = doc.updatedAt;
      const result = await saveEngine(doc);
      if (request !== saveRequest.current) return;
      if (result.ok) {
        persistedRevision.current = revision;
        setSaveState({ status: "saved", savedAt: result.savedAt });
      } else {
        setSaveState({ status: "error", message: result.message });
      }
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [doc, loaded]);

  function downloadRecoveryPayload() {
    if (!loadIssue?.recoveryPayload) return;
    const blob = new Blob([loadIssue.recoveryPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `artshift-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function startFreshArtwork() {
    await clearEngine();
    persistedRevision.current = useEngine.getState().doc.updatedAt;
    setLoadIssue(null);
    setSaveState({ status: "idle" });
    setLoaded(true);
  }

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
  useCanvasHotkeys(() => setSearchOpen(true));

  async function importLegacy() {
    const legacy = useStore.getState().doc;
    const engineDoc = await legacyToEngineDoc(legacy);
    loadDoc(engineDoc);
    setMenuOpen(false);
  }

  async function runExport(
    kind: "pptx" | "pdf" | "png" | "pngAll" | "svg" | "svgAll" | "webp" | "jpg",
  ) {
    if (exportBusy) return;
    setExportBusy(kind);
    try {
      const images = getImageCache();
      if (kind === "pptx") {
        await exportPPTX(doc, images);
        setShowGSlidesModal(true);
      } else if (kind === "pdf") {
        await exportPDF(doc, images);
      } else if (kind === "png") {
        const slide = doc.slides.find((sl) => sl.id === currentSlideId);
        if (slide) await exportCurrentSlidePNG(slide, doc, images);
      } else if (kind === "webp") {
        const slide = doc.slides.find((sl) => sl.id === currentSlideId);
        if (slide) await exportCurrentSlideWebP(slide, doc, images);
      } else if (kind === "jpg") {
        const slide = doc.slides.find((sl) => sl.id === currentSlideId);
        if (slide) await exportCurrentSlideJPEG(slide, doc, images);
      } else if (kind === "pngAll") {
        await exportAllPNG(doc, images);
      } else if (kind === "svg") {
        const slide = doc.slides.find((slide) => slide.id === currentSlideId);
        if (slide) exportCurrentSlideSVG(slide);
      } else if (kind === "svgAll") {
        exportAllSVG(doc);
      }
    } finally {
      setExportBusy(null);
      setMenuOpen(false);
    }
  }

  function handleLoadCampaignIntoCanvas(newSlides: import("@/lib/engine/types").EngineSlide[]) {
    if (!newSlides.length) return;
    const cur = useEngine.getState();
    const existingSlides = cur.doc.slides.filter((s) => s.elements.length > 0);
    const combinedSlides =
      existingSlides.length > 0 ? [...cur.doc.slides, ...newSlides] : newSlides;
    const updatedDoc = {
      ...cur.doc,
      slides: combinedSlides,
      updatedAt: Date.now(),
    };
    loadDoc(updatedDoc);
  }

  function resetCanvas() {
    if (confirm("Reset the canvas? All elements will be removed.")) {
      const cur = useEngine.getState();
      const slideId = cur.currentSlideId;
      const slide = cur.doc.slides.find((s) => s.id === slideId);
      if (slide) {
        const ids = slide.elements.filter((e) => !e.isDeleted).map((e) => e.id);
        if (ids.length) deleteElements(ids);
      }
    }
    setMenuOpen(false);
  }

  if (loadIssue) {
    return (
      <main className={`recovery-screen theme-${theme}`}>
        <section className="recovery-card" aria-labelledby="recovery-title">
          <span className="recovery-kicker">Artwork recovery</span>
          <h1 id="recovery-title">Your saved work needs attention.</h1>
          <p>
            ArtShift stopped autosave so the unreadable data stays untouched. Download a recovery
            copy before starting over.
          </p>
          <code>{loadIssue.message}</code>
          <div className="recovery-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={downloadRecoveryPayload}
              disabled={!loadIssue.recoveryPayload}
            >
              Download recovery data
            </button>
            <button type="button" className="ghost-btn recovery-reset" onClick={startFreshArtwork}>
              Start a fresh Artwork
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!loaded) {
    return (
      <div
        className={`theme-${theme}`}
        style={{
          height: "100vh",
          width: "100vw",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
          color: "var(--ink-muted)",
        }}
      >
        Loading…
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
      {/* ——— TopBar ——— */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <div className="brand-mark">
              <IconBrand />
            </div>
            <span>ArtShift</span>
          </div>
          <span
            className={`save-state save-state-${saveState.status}`}
            role="status"
            title={saveState.status === "error" ? saveState.message : undefined}
          >
            {saveState.status === "saving"
              ? "Saving…"
              : saveState.status === "saved"
                ? "Saved"
                : saveState.status === "error"
                  ? "Save failed"
                  : "Local workspace"}
          </span>
        </div>
        <div className="topbar-center">
          <AutoLayoutAction />
          <ResizeArtworkAction />
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
                style={{ position: "absolute", top: 32, right: 0, zIndex: 30, width: 160 }}
              >
                <button
                  onClick={async () => {
                    if (
                      confirm("Reset all data? This will clear all slides and cannot be undone.")
                    ) {
                      await clearEngine();
                      window.location.reload();
                    }
                    setSettingsOpen(false);
                  }}
                  style={{ color: "#dc2626" }}
                >
                  Reset
                </button>
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
        </div>
      </header>

      {recoveryNotice ? (
        <div className="recovery-banner" role="status">
          <span>{recoveryNotice}</span>
          <button type="button" onClick={() => setRecoveryNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

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
        <div style={{ flex: 1, position: "relative" }} className="canvas-stage">
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
                      width: 200,
                      background: "var(--surface-solid, #fff)",
                      border: "1px solid var(--stroke, #e5e7eb)",
                      borderRadius: 9,
                      boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
                      padding: "6px 0",
                      zIndex: 20,
                    }}
                  >
                    {/* Open */}
                    <HamburgerItem
                      label="Open"
                      shortcut="⌘O"
                      onClick={() => {
                        importLegacy();
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
                    {/* Save */}
                    <HamburgerItem
                      label="Save to..."
                      onClick={() => {
                        saveEngine(doc);
                        setMenuOpen(false);
                      }}
                    />
                    {/* Export */}
                    <HamburgerItem
                      label="Export image..."
                      shortcut="⌘⇧E"
                      onClick={() => {
                        runExport("png");
                      }}
                    />
                    {/* Find */}
                    <HamburgerItem
                      label="Find on canvas"
                      shortcut="⌘F"
                      onClick={() => setMenuOpen(false)}
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
                      label="✨ AI Image Studio (Prompt)"
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
                    <HamburgerItem label="Help" shortcut="?" onClick={() => setMenuOpen(false)} />
                    {/* Reset */}
                    <HamburgerItem label="Reset the canvas" onClick={resetCanvas} />

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
                              if (currentSlide) setSlideBackground(currentSlide.id, c);
                            }}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 3,
                              border:
                                currentSlide?.background === c
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

            {/* AI Image Studio Button */}
            <button
              onClick={() => useEngine.getState().setAiImageModalOpen(true)}
              style={{
                height: 28,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid rgba(99, 102, 241, 0.3)",
                background:
                  "linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
                color: "var(--accent, #6366f1)",
                fontWeight: 600,
                fontSize: 11,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
              title="AI Image Studio (Text-to-Image with FLUX.1)"
              aria-label="Open AI Image Studio"
            >
              <span>✨</span>
              <span>AI Image</span>
            </button>

            {/* AI button */}
            <button
              onClick={() => setAiPanelOpen((v) => !v)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "1px solid #7c3aed",
                background: aiPanelOpen ? "#7c3aed" : "var(--surface-solid, #fff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: aiPanelOpen ? "#fff" : "#7c3aed",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
              title="AI Tools"
              aria-label="Open AI panel"
              aria-expanded={aiPanelOpen}
            >
              <IconSparkles size={13} />
            </button>

            {/* AI panel */}
            {aiPanelOpen && (
              <AIPanel
                onClose={() => setAiPanelOpen(false)}
                onInsertImage={(dataUrl) => {
                  (async () => {
                    const { loadDataURL } = await import("@/lib/engine/imageCache");
                    const entry = await loadDataURL(dataUrl);
                    const st = useEngine.getState();
                    const slide = st.doc.slides.find((sl) => sl.id === st.currentSlideId);
                    const sw = slide?.width ?? 1920;
                    const sh = slide?.height ?? 1080;
                    const maxW = sw * 0.6;
                    const maxH = sh * 0.6;
                    const ratio = Math.min(maxW / entry.width, maxH / entry.height, 1);
                    const w = entry.width * ratio;
                    const h = entry.height * ratio;
                    const x = (sw - w) / 2;
                    const y = (sh - h) / 2;
                    st.addElement(
                      (await import("@/lib/engine/factory")).createImage({
                        x,
                        y,
                        width: w,
                        height: h,
                        fileId: entry.fileId,
                        naturalWidth: entry.width,
                        naturalHeight: entry.height,
                      }),
                      "ai image insert",
                    );
                  })();
                }}
              />
            )}
          </div>

          {/* ——— Top-center toolbar: Hand/Cursor | Viewport Controls | Layer Filter ——— */}
          <div
            style={{
              position: "absolute",
              top: 9,
              left: "50%",
              transform: "translateX(-50%)",
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
            {/* 0. History: Undo & Redo (FAR LEFT) */}
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                onClick={undo}
                title="Undo · ⌘Z"
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
                title="Redo · ⌘⇧Z"
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

            {/* DIVIDER */}
            <div
              style={{
                width: 1,
                height: 18,
                background: "var(--stroke, #e5e7eb)",
                margin: "0 3px",
              }}
            />

            {/* 1. Tools: Hand & Selection */}
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                onClick={() => setTool("hand")}
                title="Hand (pan) — H"
                style={{
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  border: "none",
                  background: tool === "hand" ? "var(--accent, #6366f1)" : "transparent",
                  color: tool === "hand" ? "#fff" : "var(--ink, #111827)",
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <IconHand size={14} />
              </button>
              <button
                type="button"
                onClick={() => setTool("select")}
                title="Selection (Whole Object) — V"
                style={{
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  border: "none",
                  background: tool === "select" ? "var(--accent, #6366f1)" : "transparent",
                  color: tool === "select" ? "#fff" : "var(--ink, #111827)",
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <IconCursor size={14} />
              </button>
              <button
                type="button"
                onClick={() => setTool("directSelect")}
                title="Direct Selection (Anchor Points & Bezier Curves) — A"
                style={{
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  border: "none",
                  background: tool === "directSelect" ? "var(--accent, #6366f1)" : "transparent",
                  color: tool === "directSelect" ? "#fff" : "var(--ink, #111827)",
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <IconDirectSelect size={14} />
              </button>
            </div>

            {/* DIVIDER */}
            <div
              style={{
                width: 1,
                height: 18,
                background: "var(--stroke, #e5e7eb)",
                margin: "0 3px",
              }}
            />

            {/* 2. Viewport Controls: Grid, Zoom Out, Zoom %, Zoom In */}
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {/* Block Grid Toggle */}
              <button
                type="button"
                onClick={() => setShowHexGrid(!showHexGrid)}
                title={showHexGrid ? "Hide Block Grid" : "Show Block Grid"}
                style={{
                  height: 26,
                  padding: "0 6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  borderRadius: 5,
                  border: "none",
                  background: showHexGrid ? "rgba(99, 102, 241, 0.12)" : "transparent",
                  color: showHexGrid ? "var(--accent, #6366f1)" : "var(--ink-muted, #6b7280)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "all 0.12s ease",
                }}
                aria-pressed={showHexGrid}
              >
                <IconGrid size={13} />
                <span style={{ fontSize: 11, letterSpacing: -0.2 }}>Grid</span>
              </button>

              {/* Zoom Out */}
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(0.1, zoomScale - 0.15);
                  canvasEditorRef.current?.setZoom(next);
                }}
                title="Zoom out"
                style={{
                  width: 24,
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
                <IconZoomOut size={13} />
              </button>

              {/* Zoom % dropdown + input */}
              <div ref={zoomMenuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    setZoomInputText(`${Math.round(zoomScale * 100)}%`);
                    setZoomDropdownOpen((v) => !v);
                  }}
                  title="Zoom percentage (click for presets or type custom %)"
                  style={{
                    height: 26,
                    padding: "0 6px",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    borderRadius: 5,
                    border: "1px solid var(--stroke, #e5e7eb)",
                    background: zoomDropdownOpen ? "rgba(0,0,0,0.04)" : "transparent",
                    color: "var(--ink, #111827)",
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 600,
                    transition: "all 0.12s ease",
                    minWidth: 56,
                    justifyContent: "space-between",
                  }}
                >
                  <span>{Math.round(zoomScale * 100)}%</span>
                  <IconChevronDown size={10} />
                </button>

                {zoomDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 34,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--surface-solid, #fff)",
                      border: "1px solid var(--stroke, #e5e7eb)",
                      borderRadius: 8,
                      boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
                      padding: "5px",
                      zIndex: 50,
                      minWidth: 130,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {/* Direct % input field */}
                    <div style={{ padding: "2px 2px 4px 2px" }}>
                      <input
                        type="text"
                        value={zoomInputText}
                        onChange={(e) => setZoomInputText(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const raw = zoomInputText.replace(/[^0-9.]/g, "");
                            const num = parseFloat(raw);
                            if (!Number.isNaN(num) && num > 0) {
                              canvasEditorRef.current?.setZoom(num / 100);
                              setZoomDropdownOpen(false);
                            }
                          } else if (e.key === "Escape") {
                            setZoomDropdownOpen(false);
                          }
                        }}
                        onBlur={() => {
                          const raw = zoomInputText.replace(/[^0-9.]/g, "");
                          const num = parseFloat(raw);
                          if (!Number.isNaN(num) && num > 0) {
                            canvasEditorRef.current?.setZoom(num / 100);
                          }
                        }}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "4px 6px",
                          fontSize: 12,
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 600,
                          textAlign: "center",
                          borderRadius: 4,
                          border: "1px solid var(--accent, #6366f1)",
                          outline: "none",
                        }}
                      />
                    </div>
                    <div
                      style={{ height: 1, background: "var(--stroke, #e5e7eb)", margin: "1px 0" }}
                    />
                    {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((preset) => {
                      const isActive = Math.round(zoomScale * 100) === Math.round(preset * 100);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            canvasEditorRef.current?.setZoom(preset);
                            setZoomDropdownOpen(false);
                          }}
                          style={{
                            border: "none",
                            background: isActive ? "rgba(99, 102, 241, 0.1)" : "transparent",
                            color: isActive ? "var(--accent, #6366f1)" : "var(--ink, #111)",
                            fontSize: 11,
                            fontFamily: "var(--font-mono, monospace)",
                            fontWeight: isActive ? 600 : 500,
                            padding: "5px 8px",
                            borderRadius: 4,
                            textAlign: "left",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span>{Math.round(preset * 100)}%</span>
                          {isActive && <span>✓</span>}
                        </button>
                      );
                    })}
                    <div
                      style={{ height: 1, background: "var(--stroke, #e5e7eb)", margin: "1px 0" }}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        canvasEditorRef.current?.resetView();
                        setZoomDropdownOpen(false);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--ink, #111)",
                        fontSize: 11,
                        padding: "5px 8px",
                        borderRadius: 4,
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Fit to screen</span>
                      <span style={{ fontSize: 9, color: "var(--ink-muted, #9ca3af)" }}>⌘0</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Zoom In */}
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(4.0, zoomScale + 0.15);
                  canvasEditorRef.current?.setZoom(next);
                }}
                title="Zoom in"
                style={{
                  width: 24,
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
                <IconZoomIn size={13} />
              </button>
            </div>

            {/* DIVIDER */}
            <div
              style={{
                width: 1,
                height: 18,
                background: "var(--stroke, #e5e7eb)",
                margin: "0 3px",
              }}
            />

            {/* 3. Layer Filter (All / Block / Free) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                background: "rgba(0,0,0,0.03)",
                padding: "1px",
                borderRadius: 6,
                border: "1px solid var(--stroke, #e5e7eb)",
              }}
            >
              <button
                type="button"
                onClick={() => setLayerFilter("all")}
                title="Show all layers"
                style={{
                  padding: "2px 7px",
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  border: "none",
                  background: layerFilter === "all" ? "var(--surface-solid, #fff)" : "transparent",
                  color:
                    layerFilter === "all" ? "var(--ink, #111827)" : "var(--ink-muted, #6b7280)",
                  fontWeight: layerFilter === "all" ? 600 : 500,
                  boxShadow: layerFilter === "all" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  fontSize: 11,
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setLayerFilter("block")}
                title="Show Block layers only"
                style={{
                  padding: "2px 7px",
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  borderRadius: 5,
                  border: "none",
                  background: layerFilter === "block" ? "rgba(59, 130, 246, 0.16)" : "transparent",
                  color: layerFilter === "block" ? "#2563eb" : "var(--ink-muted, #6b7280)",
                  fontWeight: layerFilter === "block" ? 600 : 500,
                  boxShadow: layerFilter === "block" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  fontSize: 11,
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <span style={{ fontSize: 10 }}>⬡</span>
                <span>Block</span>
              </button>

              <button
                type="button"
                onClick={() => setLayerFilter("free")}
                title="Show Free layers only"
                style={{
                  padding: "2px 7px",
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  borderRadius: 5,
                  border: "none",
                  background: layerFilter === "free" ? "rgba(249, 115, 22, 0.16)" : "transparent",
                  color: layerFilter === "free" ? "#ea580c" : "var(--ink-muted, #6b7280)",
                  fontWeight: layerFilter === "free" ? 600 : 500,
                  boxShadow: layerFilter === "free" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  fontSize: 11,
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <span style={{ fontSize: 10 }}>◇</span>
                <span>Free</span>
              </button>
            </div>
          </div>

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
        </div>
        <BuilderInspector />
      </div>

      {/* ——— Google Slides instruction modal ——— */}
      {searchOpen && <SearchReplaceModal onClose={() => setSearchOpen(false)} />}
      {statsOpen && <StatsModal onClose={() => setStatsOpen(false)} />}
      {showGSlidesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowGSlidesModal(false)}
        >
          <div
            style={{
              background: "var(--surface-solid, #fff)",
              borderRadius: 14,
              padding: 28,
              maxWidth: 440,
              width: "90%",
              boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--stroke, #e5e7eb)",
              color: "var(--ink, #111)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 600 }}>
              🌟 Import into Google Slides
            </h3>
            <ol style={{ margin: 0, paddingLeft: 22, fontSize: 14, lineHeight: 2 }}>
              <li>
                Open{" "}
                <a
                  href="https://slides.google.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent, #6366f1)" }}
                >
                  Google Slides
                </a>
              </li>
              <li>
                Click <strong>File → Import slides</strong>
              </li>
              <li>
                Click <strong>Upload</strong> and select the{" "}
                <code
                  style={{
                    background: "var(--stroke, #e5e7eb)",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  .pptx
                </code>{" "}
                file
              </li>
              <li>Select the slides you want to import</li>
              <li>Done! 🎉</li>
            </ol>
            <div style={{ marginTop: 18, textAlign: "right" }}>
              <button
                onClick={() => setShowGSlidesModal(false)}
                style={{
                  padding: "8px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--accent, #6366f1)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ——— Sub-components ——— */

function SearchReplaceModal({ onClose }: { onClose: () => void }) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [results, setResults] = useState<{ slideIndex: number; elementId: string; text: string }[]>(
    [],
  );
  const doc = useEngine((s) => s.doc);
  const updateElements = useEngine((s) => s.updateElements);
  const setCurrentSlide = useEngine((s) => s.setCurrentSlide);
  const selectOnly = useEngine((s) => s.selectOnly);

  function doSearch() {
    if (!find.trim()) {
      setResults([]);
      return;
    }
    const hits: { slideIndex: number; elementId: string; text: string }[] = [];
    doc.slides.forEach((sl, si) => {
      sl.elements.forEach((el) => {
        if (el.type === "text" && el.text.toLowerCase().includes(find.toLowerCase())) {
          hits.push({ slideIndex: si, elementId: el.id, text: el.text });
        }
      });
    });
    setResults(hits);
  }

  function doReplace() {
    if (!find.trim()) return;
    const patches: { id: string; patch: Partial<import("@/lib/engine/types").EngineElement> }[] =
      [];
    doc.slides.forEach((sl) => {
      sl.elements.forEach((el) => {
        if (el.type === "text" && el.text.toLowerCase().includes(find.toLowerCase())) {
          patches.push({
            id: el.id,
            patch: {
              text: el.text.replace(
                new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
                replace,
              ),
            },
          });
        }
      });
    });
    if (patches.length) updateElements(patches, "replace all");
    doSearch();
  }

  function goToResult(r: (typeof results)[0]) {
    const slide = doc.slides[r.slideIndex];
    if (slide) {
      setCurrentSlide(slide.id);
      selectOnly([r.elementId]);
    }
  }

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
          width: 420,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Find & Replace</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={find}
            onChange={(e) => setFind(e.currentTarget.value)}
            placeholder="Find..."
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--stroke, #e5e7eb)",
              fontSize: 12,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch();
            }}
          />
          <input
            value={replace}
            onChange={(e) => setReplace(e.currentTarget.value)}
            placeholder="Replace with..."
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--stroke, #e5e7eb)",
              fontSize: 12,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") doReplace();
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={doSearch}
            style={{
              flex: 1,
              padding: "6px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent, #6366f1)",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Find
          </button>
          <button
            onClick={doReplace}
            style={{
              flex: 1,
              padding: "6px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent, #6366f1)",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Replace All
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>{results.length} result(s)</div>
        <div
          style={{
            overflow: "auto",
            maxHeight: 250,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => goToResult(r)}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 5,
                border: "1px solid var(--stroke, #e5e7eb)",
                background: "var(--surface-hover, #f3f4f6)",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              <span style={{ color: "#6366f1", fontWeight: 600 }}>Slide {r.slideIndex + 1}</span>{" "}
              <span style={{ color: "var(--ink, #111)" }}>
                {r.text.slice(0, 60)}
                {r.text.length > 60 ? "..." : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsModal({ onClose }: { onClose: () => void }) {
  const doc = useEngine((s) => s.doc);
  const slides = doc.slides.length;
  const elements = doc.slides.reduce(
    (acc, sl) => acc + sl.elements.filter((e) => !e.isDeleted).length,
    0,
  );
  const textElements = doc.slides.reduce(
    (acc, sl) => acc + sl.elements.filter((e) => !e.isDeleted && e.type === "text").length,
    0,
  );
  const imageElements = doc.slides.reduce(
    (acc, sl) => acc + sl.elements.filter((e) => !e.isDeleted && e.type === "image").length,
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
