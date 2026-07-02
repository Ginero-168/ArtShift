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

import { useEffect, useRef, useState } from "react";
import AIPanel from "@/components/AI/AIPanel";
import CanvasEditor from "@/components/Canvas/CanvasEditor";
import PresetPanel from "@/components/Canvas/PresetPanel";
import SlideRail from "@/components/Canvas/SlideRail";
import { TOOLBAR_TOOLS } from "@/components/Canvas/toolDefinitions";
import { useCanvasHotkeys } from "@/components/Canvas/useCanvasHotkeys";
import {
  IconBrand,
  IconDownload,
  IconMenu,
  IconPalette,
  IconRedo,
  IconSettings,
  IconSparkles,
  IconStats,
  IconUndo,
} from "@/components/icons";
import TemplateBrowser from "@/components/TemplateBrowser";
import { legacyToEngineDoc } from "@/lib/engine/adapter";
import { exportAllPNG, exportCurrentSlidePNG, exportPDF } from "@/lib/engine/exportPNG";
import { exportPPTX } from "@/lib/engine/exportPPTX";
import { getImageCache } from "@/lib/engine/imageCache";
import { clearEngine, loadEngine, saveEngine } from "@/lib/engine/persist";
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
  const setGridSnap = useEngine((s) => s.setGridSnap);
  const snapGrid = useEngine((s) => s.doc.snapGrid);
  const currentSlideId = useEngine((s) => s.currentSlideId);
  const currentSlide = doc.slides.find((sl) => sl.id === currentSlideId);

  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [showGSlidesModal, setShowGSlidesModal] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Load
  useEffect(() => {
    loadThaiFonts();
    usePresetStore.getState().hydrate();
    let cancelled = false;
    (async () => {
      const persisted = await loadEngine();
      if (cancelled) return;
      if (persisted) loadDoc(persisted);
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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveEngine(doc), 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [doc, loaded]);

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

  async function runExport(kind: "pptx" | "pdf" | "png" | "pngAll") {
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
      } else if (kind === "pngAll") {
        await exportAllPNG(doc, images);
      }
    } finally {
      setExportBusy(null);
      setMenuOpen(false);
    }
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
                  onClick={() => {
                    if (
                      confirm("Reset all data? This will clear all slides and cannot be undone.")
                    ) {
                      clearEngine();
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
                    runExport("pngAll");
                    setExportOpen(false);
                  }}
                >
                  <IconDownload size={13} /> Download .png (all)
                </button>
              </div>
            )}
          </div>
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
        <div style={{ flex: 1, position: "relative" }} className="canvas-stage">
          {loaded && <CanvasEditor />}

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

              {/* Undo / Redo */}
              <SmallToolBtn onClick={undo} title="Undo · ⌘Z">
                <IconUndo size={11} />
              </SmallToolBtn>
              <SmallToolBtn onClick={redo} title="Redo · ⌘⇧Z">
                <IconRedo size={11} />
              </SmallToolBtn>
            </div>

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
              title="AI"
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

          {/* ——— Top-center toolbar ——— */}
          <div
            style={{
              position: "absolute",
              top: 9,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 1,
              background: "var(--surface-solid, #fff)",
              border: "1px solid var(--stroke, #e5e7eb)",
              borderRadius: 8,
              padding: "2px 3px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <button
              onClick={() => setPresetOpen((v) => !v)}
              title="My Presets"
              style={{
                width: 26,
                height: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 5,
                border: "none",
                background: presetOpen ? "var(--surface-hover, #f3f4f6)" : "transparent",
                color: "var(--ink, #111827)",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>★</span>
            </button>
            <button
              onClick={() => setGridSnap(snapGrid ? null : 16)}
              title="Toggle grid snap"
              style={{
                width: 26,
                height: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 5,
                border: "none",
                background: snapGrid ? "var(--accent, #6366f1)" : "transparent",
                color: snapGrid ? "#fff" : "var(--ink, #111827)",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}
              aria-pressed={!!snapGrid}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>#</span>
            </button>
            <div
              style={{
                width: 1,
                height: 16,
                background: "var(--stroke, #e5e7eb)",
                margin: "0 4px",
              }}
            />
            {TOOLBAR_TOOLS.map((t) => {
              const Ic = t.icon;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  title={`${t.label} — ${t.hotkey}`}
                  style={{
                    width: 26,
                    height: 26,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 5,
                    border: "none",
                    background: active ? "var(--accent, #6366f1)" : "transparent",
                    color: active ? "#fff" : "var(--ink, #111827)",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                >
                  <Ic size={14} />
                </button>
              );
            })}
          </div>

          {presetOpen && <PresetPanel onClose={() => setPresetOpen(false)} />}
          {templateBrowserOpen && <TemplateBrowser onClose={() => setTemplateBrowserOpen(false)} />}
        </div>
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

function SmallToolBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 5,
        border: "1px solid var(--stroke, #e5e7eb)",
        background: "var(--surface-solid, #fff)",
        color: "var(--ink, #111827)",
        cursor: "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {children}
    </button>
  );
}
