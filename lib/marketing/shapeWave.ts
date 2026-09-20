/**
 * Shape Wave canvas engine.
 * Inspired by CodePen yyapzOP / donotfold (https://codepen.io/donotfold/pen/yyapzOP).
 */

export const SHAPE_WAVE = {
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
} as const;

export const SHAPE_TYPES = ["circle", "pill", "star", "star"] as const;

export type ShapeWaveType = "circle" | "pill" | "star";

export type ShapeWaveColor =
  | { type: "solid"; value: string }
  | { type: "gradient"; stops: readonly [string, string] };

export const SHAPE_WAVE_PALETTE: readonly ShapeWaveColor[] = [
  { type: "solid", value: "#22c55e" },
  { type: "solid", value: "#06b6d4" },
  { type: "solid", value: "#f97316" },
  { type: "solid", value: "#ef4444" },
  { type: "solid", value: "#facc15" },
  { type: "solid", value: "#ec4899" },
  { type: "solid", value: "#9ca3af" },
  { type: "solid", value: "#a78bfa" },
  { type: "solid", value: "#60a5fa" },
  { type: "solid", value: "#34d399" },
  { type: "gradient", stops: ["#6366f1", "#3b82f6"] },
  { type: "gradient", stops: ["#06b6d4", "#6366f1"] },
  { type: "gradient", stops: ["#22c55e", "#06b6d4"] },
  { type: "gradient", stops: ["#f97316", "#ef4444"] },
  { type: "gradient", stops: ["#8b5cf6", "#06b6d4"] },
  { type: "gradient", stops: ["#3b82f6", "#8b5cf6"] },
  { type: "gradient", stops: ["#34d399", "#3b82f6"] },
];

type ShapeCell = {
  x: number;
  y: number;
  type: ShapeWaveType;
  color: ShapeWaveColor;
  angle: number;
  size: number;
  scale: number;
  maxScale: number;
  hovered: boolean;
  points: number;
  innerRatio: number;
};

type Wave = { x: number; y: number; startTime: number };

export type ShapeWaveGrid = {
  shapes: ShapeCell[];
  width: number;
  height: number;
};

export type ShapeWaveHandle = {
  stop: () => void;
};

export function rnd(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function rndInt(min: number, max: number): number {
  return Math.floor(rnd(min, max + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function durationToFactor(seconds: number): number {
  if (seconds <= 0) return 1;
  return 1 - 0.05 ** (1 / (60 * seconds));
}

export function prefersReducedMotion(target: Window = window): boolean {
  return target.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function queryShapeMaskRects(root: ParentNode = document): DOMRect[] {
  return Array.from(root.querySelectorAll("[data-shape-mask]")).map((el) =>
    el.getBoundingClientRect(),
  );
}

function randomStarProps(): { points: number; innerRatio: number } {
  return {
    points: rndInt(4, 10),
    innerRatio: rnd(0.1, 0.5),
  };
}

export function buildShapeGrid(
  width: number,
  height: number,
  gap = SHAPE_WAVE.gap,
  restScale = SHAPE_WAVE.restScale,
): ShapeWaveGrid {
  const cols = Math.floor(width / gap);
  const rows = Math.floor(height / gap);
  const offsetX = (width - (cols - 1) * gap) / 2;
  const offsetY = (height - (rows - 1) * gap) / 2;
  const shapes: ShapeCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const type = pick(SHAPE_TYPES);
      const star = type === "star" ? randomStarProps() : { points: 5, innerRatio: 0.4 };
      shapes.push({
        x: offsetX + col * gap,
        y: offsetY + row * gap,
        type,
        color: pick(SHAPE_WAVE_PALETTE),
        angle: rnd(0, Math.PI * 2),
        size: gap * 0.38,
        scale: restScale,
        maxScale: rnd(SHAPE_WAVE.minHoverScale, SHAPE_WAVE.maxHoverScale),
        hovered: false,
        points: star.points,
        innerRatio: star.innerRatio,
      });
    }
  }

  return { shapes, width, height };
}

function drawCircle(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawPill(ctx: CanvasRenderingContext2D, size: number) {
  const w = size * 0.48;
  const h = size;
  ctx.beginPath();
  ctx.roundRect(-w, -h, w * 2, h * 2, w);
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, size: number, points: number, innerRatio: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * innerRatio;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeCell) {
  switch (shape.type) {
    case "circle":
      drawCircle(ctx, shape.size / 1.5);
      break;
    case "pill":
      drawPill(ctx, shape.size / 1.4);
      break;
    case "star":
      drawStar(ctx, shape.size, shape.points, shape.innerRatio);
      break;
  }
}

function resolveFill(
  ctx: CanvasRenderingContext2D,
  colorDef: ShapeWaveColor,
  size: number,
): string | CanvasGradient {
  if (colorDef.type === "solid") return colorDef.value;
  const grad = ctx.createRadialGradient(0, -size * 0.3, 0, 0, size * 0.3, size * 1.5);
  grad.addColorStop(0, colorDef.stops[0]);
  grad.addColorStop(1, colorDef.stops[1]);
  return grad;
}

function paintShape(ctx: CanvasRenderingContext2D, shape: ShapeCell) {
  if (shape.scale < SHAPE_WAVE.restScale * 0.15) return;
  ctx.save();
  ctx.translate(shape.x, shape.y);
  ctx.rotate(shape.angle);
  ctx.scale(shape.scale, shape.scale);
  ctx.fillStyle = resolveFill(ctx, shape.color, shape.size);
  drawShape(ctx, shape);
  ctx.restore();
}

function fillBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = SHAPE_WAVE.background;
  ctx.fillRect(0, 0, width, height);
}

function isMasked(shape: ShapeCell, maskRects: DOMRect[], pad: number): boolean {
  return maskRects.some(
    (r) =>
      shape.x >= r.left - pad &&
      shape.x <= r.right + pad &&
      shape.y >= r.top - pad &&
      shape.y <= r.bottom + pad,
  );
}

export function attachShapeWave(
  canvas: HTMLCanvasElement,
  options: {
    reducedMotion?: boolean;
    queryMasks?: () => DOMRect[];
  } = {},
): ShapeWaveHandle {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) {
    return { stop() {} };
  }
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const reducedMotion = options.reducedMotion ?? false;
  const queryMasks = options.queryMasks ?? queryShapeMaskRects;

  let grid: ShapeWaveGrid | null = null;
  let rafId: number | null = null;
  let pointer: { x: number; y: number } | null = null;
  let activity = 0;
  let waves: Wave[] = [];
  let maskRects: DOMRect[] = [];
  let frameCount = 0;
  let maskOverride = false;
  let maskOverrideTimer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let stopped = false;

  function init() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    grid = buildShapeGrid(width, height);
    maskRects = queryMasks();
  }

  function triggerWave(x?: number, y?: number) {
    const px = x !== undefined ? x : window.innerWidth / 2;
    const py = y !== undefined ? y : window.innerHeight / 2;
    waves.push({ x: px, y: py, startTime: performance.now() });
    maskOverride = true;
    const delay =
      Math.sqrt(window.innerWidth * window.innerWidth + window.innerHeight * window.innerHeight) /
      SHAPE_WAVE.waveSpeed;
    if (maskOverrideTimer) clearTimeout(maskOverrideTimer);
    maskOverrideTimer = setTimeout(() => {
      maskOverride = false;
      maskOverrideTimer = null;
    }, delay * 1000);
  }

  function drawStaticFrame() {
    if (!grid) return;
    fillBackground(ctx, grid.width, grid.height);
    const pad = SHAPE_WAVE.gap / 2;
    const masks = queryMasks();
    for (const shape of grid.shapes) {
      if (isMasked(shape, masks, pad)) continue;
      shape.scale = SHAPE_WAVE.restScale;
      paintShape(ctx, shape);
    }
  }

  function tick() {
    if (stopped || paused || reducedMotion) return;
    if (!grid) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const { shapes, width, height } = grid;
    const radius = Math.min(width, height) * (SHAPE_WAVE.radiusVmin / 100);
    const now = performance.now();

    fillBackground(ctx, width, height);
    activity *= 0.93;
    frameCount++;
    if (frameCount % 10 === 0) {
      maskRects = queryMasks();
    }

    const maxDist = Math.sqrt(width * width + height * height);
    waves = waves.filter(
      (w) => ((now - w.startTime) / 1000) * SHAPE_WAVE.waveSpeed < maxDist + SHAPE_WAVE.waveWidth,
    );

    const pad = SHAPE_WAVE.gap / 2;
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i]!;
      const masked = !maskOverride && isMasked(shape, maskRects, pad);

      if (masked) {
        shape.scale += (0 - shape.scale) * durationToFactor(SHAPE_WAVE.speedOut);
        if (shape.scale < 0.005) shape.scale = 0;
        continue;
      }

      let pointerInfluence = 0;
      if (pointer && activity > 0.001) {
        const dx = shape.x - pointer.x;
        const dy = shape.y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        pointerInfluence = smoothstep(1 - dist / radius) * activity;

        if (pointerInfluence > 0.05 && !shape.hovered) {
          shape.hovered = true;
          shape.maxScale = rnd(SHAPE_WAVE.minHoverScale, SHAPE_WAVE.maxHoverScale);
          shape.angle = rnd(0, Math.PI * 2);
          if (shape.type === "star") Object.assign(shape, randomStarProps());
        } else if (pointerInfluence <= 0.05) {
          shape.hovered = false;
        }
      } else {
        shape.hovered = false;
      }

      let waveInfluence = 0;
      for (let j = 0; j < waves.length; j++) {
        const wave = waves[j]!;
        const waveRadius = ((now - wave.startTime) / 1000) * SHAPE_WAVE.waveSpeed;
        const wdx = shape.x - wave.x;
        const wdy = shape.y - wave.y;
        const wdist = Math.sqrt(wdx * wdx + wdy * wdy);
        const t = 1 - Math.abs(wdist - waveRadius) / SHAPE_WAVE.waveWidth;
        if (t > 0) waveInfluence = Math.max(waveInfluence, Math.sin(Math.PI * t));
      }

      const pointerTarget =
        SHAPE_WAVE.restScale + pointerInfluence * (shape.maxScale - SHAPE_WAVE.restScale);
      const waveTarget =
        SHAPE_WAVE.restScale + waveInfluence * (shape.maxScale - SHAPE_WAVE.restScale);
      const target = Math.max(pointerTarget, waveTarget);
      const factor =
        target > shape.scale
          ? durationToFactor(SHAPE_WAVE.speedIn)
          : durationToFactor(SHAPE_WAVE.speedOut);
      shape.scale += (target - shape.scale) * factor;
      paintShape(ctx, shape);
    }

    rafId = requestAnimationFrame(tick);
  }

  function onMove(event: PointerEvent) {
    pointer = { x: event.clientX, y: event.clientY };
    activity = 1;
  }

  function onClick(event: MouseEvent) {
    triggerWave(event.clientX, event.clientY);
  }

  function onVisibility() {
    if (reducedMotion) return;
    if (document.hidden) {
      paused = true;
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      return;
    }
    if (stopped) return;
    paused = false;
    if (rafId == null) rafId = requestAnimationFrame(tick);
  }

  init();

  if (reducedMotion) {
    const onStaticResize = () => {
      init();
      drawStaticFrame();
    };
    drawStaticFrame();
    window.addEventListener("resize", onStaticResize);
    return {
      stop() {
        stopped = true;
        window.removeEventListener("resize", onStaticResize);
      },
    };
  }

  const onResize = () => init();
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("click", onClick);
  document.addEventListener("visibilitychange", onVisibility);

  triggerWave();
  rafId = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      paused = true;
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (maskOverrideTimer) {
        clearTimeout(maskOverrideTimer);
        maskOverrideTimer = null;
      }
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
