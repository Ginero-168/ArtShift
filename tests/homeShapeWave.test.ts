import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachShapeWave,
  buildShapeGrid,
  durationToFactor,
  SHAPE_TYPES,
  SHAPE_WAVE,
  SHAPE_WAVE_PALETTE,
  smoothstep,
} from "@/lib/marketing/shapeWave";

const landing = readFileSync("app/page.tsx", "utf8");
const featuresPage = readFileSync("app/features/page.tsx", "utf8");
const featuresLanding = readFileSync("components/Marketing/FeaturesLanding.tsx", "utf8");
const background = readFileSync("components/Marketing/HomeShapeWaveBackground.tsx", "utf8");
const backgroundCss = readFileSync(
  "components/Marketing/HomeShapeWaveBackground.module.css",
  "utf8",
);
const engine = readFileSync("lib/marketing/shapeWave.ts", "utf8");

function createMockContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    setTransform: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: "",
  };
}

describe("home Shape Wave wiring", () => {
  it("keeps the home gate and mounts the CodePen-inspired background", () => {
    expect(landing).toContain("HomeShapeWaveBackground");
    expect(landing).toContain("data-shape-mask");
    expect(landing).toContain("signInWithGoogle");
    expect(landing).toContain("เข้าสู่ระบบด้วย Google (Log in with Google)");
    expect(landing).toContain("ArtShiftLogo");
    expect(landing).toContain('size="hero"');
    expect(landing).toContain("AI Powered Design Tools");
    expect(landing).toContain("ดูฟีเจอร์");
    expect(landing).toContain('href="/features"');
    expect(landing).not.toContain("<CanvasEditor");
    expect(landing).not.toContain("FeatureCard");

    expect(background).toContain("yyapzOP");
    expect(background).toContain("donotfold");
    expect(background).toContain("attachShapeWave");
    expect(background).toContain("prefers-reduced-motion");
    expect(background).toContain('data-testid="home-shape-wave"');
    expect(background).toContain('aria-hidden="true"');
    expect(backgroundCss).toContain("pointer-events: none");
    expect(backgroundCss).toContain("position: fixed");

    expect(engine).toContain("Inspired by CodePen yyapzOP / donotfold");
    expect(engine).toContain("visibilitychange");
    expect(engine).toContain("prefers-reduced-motion");
  });

  it("does not change the /features marketing page", () => {
    expect(featuresPage).toContain("FeaturesLanding");
    expect(featuresPage).not.toContain("HomeShapeWaveBackground");
    expect(featuresLanding).not.toContain("HomeShapeWaveBackground");
    expect(featuresLanding).not.toContain("attachShapeWave");
  });

  it("keeps the original pen constants and palette", () => {
    expect(SHAPE_WAVE).toMatchObject({
      gap: 40,
      radiusVmin: 30,
      speedIn: 0.5,
      speedOut: 0.6,
      restScale: 0.09,
      minHoverScale: 1,
      maxHoverScale: 3,
      waveSpeed: 1200,
      waveWidth: 180,
      background: "#080808",
    });
    expect(SHAPE_TYPES).toEqual(["circle", "pill", "star", "star"]);
    expect(SHAPE_WAVE_PALETTE).toHaveLength(17);
    expect(SHAPE_WAVE_PALETTE.filter((c) => c.type === "solid")).toHaveLength(10);
    expect(SHAPE_WAVE_PALETTE.filter((c) => c.type === "gradient")).toHaveLength(7);
  });
});

describe("shape wave math", () => {
  it("clamps smoothstep and maps duration to an easing factor", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(durationToFactor(0)).toBe(1);
    const mid = durationToFactor(0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("builds a viewport-sized grid of shapes", () => {
    const grid = buildShapeGrid(800, 600);
    expect(grid.width).toBe(800);
    expect(grid.height).toBe(600);
    expect(grid.shapes).toHaveLength(Math.floor(800 / 40) * Math.floor(600 / 40));
    expect(grid.shapes.every((shape) => shape.scale === SHAPE_WAVE.restScale)).toBe(true);
    expect(grid.shapes.every((shape) => SHAPE_TYPES.includes(shape.type))).toBe(true);
  });
});

describe("attachShapeWave lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  it("starts a RAF loop and tears it down", () => {
    const ctx = createMockContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(11);
    const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const canvas = document.createElement("canvas");
    const handle = attachShapeWave(canvas, { reducedMotion: false });
    expect(raf).toHaveBeenCalled();
    handle.stop();
    expect(caf).toHaveBeenCalledWith(11);
  });

  it("draws a static frame and skips RAF when reduced motion is preferred", () => {
    const ctx = createMockContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(3);

    const canvas = document.createElement("canvas");
    const handle = attachShapeWave(canvas, { reducedMotion: true });
    expect(raf).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
    handle.stop();
  });

  it("pauses the loop while the document is hidden", () => {
    const ctx = createMockContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(22);
    const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const canvas = document.createElement("canvas");
    attachShapeWave(canvas, { reducedMotion: false });
    raf.mockClear();

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(caf).toHaveBeenCalledWith(22);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(raf).toHaveBeenCalled();
  });
});
