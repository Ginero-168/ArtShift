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

describe("ArtShift Portal wordmark", () => {
  it("renders the Colorion Portal markup with ArtShift as visible text and data-text", () => {
    expect(logoSource).toContain('className="fx-portal"');
    expect(logoSource).toContain("data-text={ARTSHIFT_WORDMARK}");
    expect(logoSource).toContain('export const ARTSHIFT_WORDMARK = "ArtShift"');
    expect(logoSource).toContain("{ARTSHIFT_WORDMARK}");
    expect(logoSource).not.toContain("PORTAL");
    expect(logoSource).toContain("--logo-size");
  });

  it("keeps the Portal animations and pauses them when reduced motion is preferred", () => {
    expect(logoCss).toContain(".fx-portal");
    expect(logoCss).toContain("conic-gradient");
    expect(logoCss).toContain("@keyframes fx-portal");
    expect(logoCss).toContain("@keyframes fx-portal-pulse");
    expect(logoCss).toContain("prefers-reduced-motion: reduce");
    expect(logoCss).toContain("animation: none");
    expect(logoCss).toContain('"JetBrains Mono"');
    expect(logoCss).not.toContain("--primary");
  });

  it("loads JetBrains Mono for the wordmark", () => {
    expect(globalsCss).toContain("family=JetBrains+Mono");
  });

  it("uses the shared logo on landing, projects, editor, and present chrome", () => {
    expect(landing).toContain("<ArtShiftLogo");
    expect(landing).toContain('size="hero"');
    expect(landing).not.toContain("<IconBrand");
    expect(projects).toContain("<ArtShiftLogo");
    expect(editor).toContain("<ArtShiftLogo");
    expect(editor).toContain('size="compact"');
    expect(editor).not.toContain('className="brand-mark"');
    expect(present).toContain("<ArtShiftLogo");
  });

  it("does not change the Colorion Text Effect Presets Portal recipe", () => {
    expect(portalPreset).toContain('slug: "portal"');
    expect(portalPreset).toContain("sourceHasAnimation: true");
    expect(portalPreset).toContain('"pseudo_layers"');
  });
});
