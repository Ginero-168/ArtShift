import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const logoSource = readFileSync("components/Brand/ArtShiftLogo.tsx", "utf8");
const logoCss = readFileSync("components/Brand/ArtShiftLogo.module.css", "utf8");
const globalsCss = readFileSync("app/globals.css", "utf8");
const landing = readFileSync("app/page.tsx", "utf8");
const projects = readFileSync("app/projects/page.tsx", "utf8");
const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
const present = readFileSync("app/present/page.tsx", "utf8");
const portalPreset = readFileSync("lib/appearance/textEffectPresets/source.ts", "utf8");

describe("ArtShift Heatmap wordmark", () => {
  it("renders the Colorion Heatmap markup with ArtShift as visible text", () => {
    expect(logoSource).toContain('className="fx-heatmap"');
    expect(logoSource).toContain("{ARTSHIFT_WORDMARK}");
    expect(logoSource).toContain('export const ARTSHIFT_WORDMARK = "ArtShift"');
    expect(logoSource).not.toContain("data-text");
    expect(logoSource).not.toContain("fx-portal");
    expect(logoSource).not.toContain("PORTAL");
    expect(logoSource).not.toContain("THERMAL");
    expect(logoSource).toContain("--logo-size");
  });

  it("keeps the Heatmap animation and uses a static gradient when reduced motion is preferred", () => {
    expect(logoCss).toContain(".fx-heatmap");
    expect(logoCss).toContain("radial-gradient");
    expect(logoCss).toContain("linear-gradient(90deg, #2d7dff, #36f0b2, #ffcf4a, #ff4f8b)");
    expect(logoCss).toContain("@keyframes fx-heatmap");
    expect(logoCss).toContain("animation: fx-heatmap 3.5s ease-in-out infinite alternate");
    expect(logoCss).toContain("prefers-reduced-motion: reduce");
    expect(logoCss).toContain("animation: none");
    expect(logoCss).toContain("background-position: 0 0, 100% 20%, 40% 100%, 100% 0");
    expect(logoCss).toContain('"JetBrains Mono"');
    expect(logoCss).toContain("--logo-size");
    expect(logoCss).toContain(".sizeHero");
    expect(logoCss).toContain("clamp(3.25rem, 9vw, 5.5rem)");
    expect(logoCss).toContain(".sizeHeader");
    expect(logoCss).toContain(".sizeCompact");
    expect(logoCss).not.toContain(".fx-portal");
    expect(logoCss).not.toContain("::after");
    expect(logoCss).not.toContain("--primary");
  });

  it("loads JetBrains Mono for the wordmark", () => {
    expect(globalsCss).toContain("family=JetBrains+Mono");
  });

  it("uses the shared logo on landing, projects, editor, and present chrome", () => {
    expect(landing).toContain("<ArtShiftLogo");
    expect(landing).toContain('size="hero"');
    expect(landing).toContain("AI Powered Design Tools");
    expect(landing).not.toContain("<header");
    expect(landing).not.toContain("<IconBrand");
    expect(projects).toContain("<ArtShiftLogo");
    expect(editor).toContain("<ArtShiftLogo");
    expect(editor).toContain('size="compact"');
    expect(editor).not.toContain('className="brand-mark"');
    expect(present).toContain("<ArtShiftLogo");
  });

  it("links the Projects header wordmark to Index home, not a self-link", () => {
    const headerMatch = projects.match(/<header[\s\S]*?<\/header>/);
    expect(headerMatch).toBeTruthy();
    const header = headerMatch?.[0] ?? "";
    expect(header).toContain('href="/"');
    expect(header).toContain('aria-label="ArtShift home"');
    expect(header).toContain("<ArtShiftLogo");
    expect(header).not.toContain('href="/projects"');
  });

  it("keeps the editor wordmark as a Projects catalog link", () => {
    const headerMatch = editor.match(/<header className="topbar">[\s\S]*?<\/header>/);
    expect(headerMatch).toBeTruthy();
    const header = headerMatch?.[0] ?? "";
    expect(header).toContain('href="/projects"');
    expect(header).toContain("<ArtShiftLogo");
    expect(header).not.toContain('href="/"');
  });

  it("does not change the Colorion Text Effect Presets Portal recipe", () => {
    expect(portalPreset).toContain('slug: "portal"');
    expect(portalPreset).toContain("sourceHasAnimation: true");
    expect(portalPreset).toContain('"pseudo_layers"');
  });
});
