import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const logoSource = readFileSync("components/Brand/ArtShiftLogo.tsx", "utf8");
const logoCss = readFileSync("components/Brand/ArtShiftLogo.module.css", "utf8");
const globalsCss = readFileSync("app/globals.css", "utf8");
const landing = readFileSync("app/page.tsx", "utf8");
const features = readFileSync("components/Marketing/FeaturesLanding.tsx", "utf8");
const projects = readFileSync("app/projects/page.tsx", "utf8");
const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
const present = readFileSync("app/present/page.tsx", "utf8");
const portalPreset = readFileSync("lib/appearance/textEffectPresets/source.ts", "utf8");

describe("ArtShift editorial wordmark", () => {
  it("renders the off-register mark plus a serif Art/Shift wordmark", () => {
    expect(logoSource).toContain("export function ArtShiftMark");
    expect(logoSource).toContain("<span className={styles.art}>Art</span>");
    expect(logoSource).toContain("<span className={styles.shift}>Shift</span>");
    expect(logoSource).toContain('export const ARTSHIFT_WORDMARK = "ArtShift"');
    expect(logoSource).toContain('aria-hidden="true"');
    expect(logoSource).not.toContain("fx-heatmap");
    expect(logoSource).not.toContain("fx-portal");
  });

  it("sets the wordmark in the display serif without a rainbow animation", () => {
    expect(logoCss).toContain("var(--font-display");
    expect(logoCss).toContain("font-style: italic");
    expect(logoCss).toContain("--logo-signal");
    expect(logoCss).toContain("--logo-size");
    expect(logoCss).toContain(".sizeHero");
    expect(logoCss).toContain("clamp(3.5rem, 11vw, 7.5rem)");
    expect(logoCss).toContain(".sizeHeader");
    expect(logoCss).toContain(".sizeCompact");
    expect(logoCss).toContain("forced-colors: active");
    expect(logoCss).not.toContain("@keyframes");
    expect(logoCss).not.toContain("linear-gradient");
    expect(logoCss).not.toContain("--primary");
  });

  it("loads the brand display and UI fonts", () => {
    expect(globalsCss).toContain("family=Instrument+Serif");
    expect(globalsCss).toContain("family=Anuphan");
    expect(globalsCss).toContain("family=JetBrains+Mono");
    expect(globalsCss).toContain("--brand-signal: #d64418");
  });

  it("uses the shared logo on landing, projects, editor, and present chrome", () => {
    expect(landing).toContain("<ArtShiftLogo");
    expect(landing).toContain('size="hero"');
    expect(landing).not.toContain("AI Powered Design Tools");
    expect(landing).not.toContain("<header");
    expect(landing).not.toContain("<IconBrand");
    expect(features).toContain("<ArtShiftLogo");
    expect(features).toContain('size="header"');
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
