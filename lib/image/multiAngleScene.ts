import { type MultiAngleCamera, multiAnglePose } from "@/lib/image/multiAngleCamera";

type Vec3 = { x: number; y: number; z: number };

const SUBJECT_CENTER: Vec3 = { x: 0, y: 0.62, z: 0 };
const VIEW_EYE: Vec3 = { x: 2.35, y: 1.85, z: 3.55 };
const VIEW_TARGET: Vec3 = { x: 0, y: 0.48, z: 0 };
const VIEW_FOV = 36;

export function paintMultiAngleScene(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  camera: MultiAngleCamera,
): void {
  const ratio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const width = Math.max(1, Math.floor(cssWidth * ratio));
  const height = Math.max(1, Math.floor(cssHeight * ratio));
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const project = createProjector(cssWidth, cssHeight);
  drawGrid(ctx, project);
  drawSubject(ctx, project);
  drawCamera(ctx, project, camera);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  project: (point: Vec3) => { x: number; y: number } | null,
): void {
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i += 1) {
    strokeLine(ctx, project, { x: i * 0.7, y: 0, z: -1.4 }, { x: i * 0.7, y: 0, z: 1.4 });
    strokeLine(ctx, project, { x: -1.4, y: 0, z: i * 0.7 }, { x: 1.4, y: 0, z: i * 0.7 });
  }
}

function drawSubject(
  ctx: CanvasRenderingContext2D,
  project: (point: Vec3) => { x: number; y: number } | null,
): void {
  const faces: Array<{ points: Vec3[]; color: string; depth: number }> = [];
  const hx = 0.34;
  const hy = 0.56;
  const hz = 0.22;
  const c = SUBJECT_CENTER;
  const corners = {
    lbf: { x: c.x - hx, y: c.y - hy, z: c.z + hz },
    rbf: { x: c.x + hx, y: c.y - hy, z: c.z + hz },
    rtf: { x: c.x + hx, y: c.y + hy, z: c.z + hz },
    ltf: { x: c.x - hx, y: c.y + hy, z: c.z + hz },
    lbb: { x: c.x - hx, y: c.y - hy, z: c.z - hz },
    rbb: { x: c.x + hx, y: c.y - hy, z: c.z - hz },
    rtb: { x: c.x + hx, y: c.y + hy, z: c.z - hz },
    ltb: { x: c.x - hx, y: c.y + hy, z: c.z - hz },
  };
  const push = (points: Vec3[], color: string) => {
    const depth = points.reduce((sum, point) => sum + point.z, 0) / points.length;
    faces.push({ points, color, depth });
  };
  push([corners.lbb, corners.rbb, corners.rtb, corners.ltb], "#cbd5e1");
  push([corners.lbf, corners.lbb, corners.ltb, corners.ltf], "#94a3b8");
  push([corners.rbf, corners.rbb, corners.rtb, corners.rtf], "#64748b");
  push([corners.ltf, corners.rtf, corners.rtb, corners.ltb], "#e0e7ff");
  push([corners.lbf, corners.rbf, corners.rbb, corners.lbb], "#cbd5e1");
  push([corners.lbf, corners.rbf, corners.rtf, corners.ltf], "#4f46e5");
  faces.sort((a, b) => a.depth - b.depth);
  for (const face of faces) fillPolygon(ctx, project, face.points, face.color);
}

function drawCamera(
  ctx: CanvasRenderingContext2D,
  project: (point: Vec3) => { x: number; y: number } | null,
  camera: MultiAngleCamera,
): void {
  const pose = multiAnglePose(camera);
  const origin: Vec3 = { x: pose.x, y: pose.y, z: pose.z };
  const aim: Vec3 = SUBJECT_CENTER;
  const forward = normalize(sub(aim, origin));
  const upHint = Math.abs(forward.y) > 0.92 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, upHint));
  const up = cross(right, forward);
  const near = 0.42;
  const half = Math.tan((pose.fov * Math.PI) / 360) * 0.72;
  const center = add(origin, scale(forward, near));
  const corners = [
    add(add(center, scale(right, -half)), scale(up, -half * 0.72)),
    add(add(center, scale(right, half)), scale(up, -half * 0.72)),
    add(add(center, scale(right, half)), scale(up, half * 0.72)),
    add(add(center, scale(right, -half)), scale(up, half * 0.72)),
  ];
  ctx.strokeStyle = "#4338ca";
  ctx.lineWidth = 1.4;
  for (const corner of corners) strokeLine(ctx, project, origin, corner);
  strokeLoop(ctx, project, corners);
  const body = add(origin, scale(forward, -0.16));
  const bodyCorners = [
    add(add(body, scale(right, -0.12)), scale(up, -0.09)),
    add(add(body, scale(right, 0.12)), scale(up, -0.09)),
    add(add(body, scale(right, 0.12)), scale(up, 0.09)),
    add(add(body, scale(right, -0.12)), scale(up, 0.09)),
  ];
  fillPolygon(ctx, project, bodyCorners, "#0f172a");
}

function createProjector(
  width: number,
  height: number,
): (point: Vec3) => { x: number; y: number } | null {
  const forward = normalize(sub(VIEW_TARGET, VIEW_EYE));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const focal = 1 / Math.tan((VIEW_FOV * Math.PI) / 360);
  return (point) => {
    const delta = sub(point, VIEW_EYE);
    const x = dot(delta, right);
    const y = dot(delta, up);
    const z = dot(delta, forward);
    if (z < 0.05) return null;
    return {
      x: ((x / z) * focal * 0.5 + 0.5) * width,
      y: ((-y / z) * focal * 0.5 + 0.5) * height,
    };
  };
}

function fillPolygon(
  ctx: CanvasRenderingContext2D,
  project: (point: Vec3) => { x: number; y: number } | null,
  points: Vec3[],
  color: string,
): void {
  const projected = points.map(project);
  if (projected.some((point) => !point)) return;
  ctx.beginPath();
  projected.forEach((point, index) => {
    if (!point) return;
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function strokeLoop(
  ctx: CanvasRenderingContext2D,
  project: (point: Vec3) => { x: number; y: number } | null,
  points: Vec3[],
): void {
  const projected = points.map(project);
  if (projected.some((point) => !point)) return;
  ctx.beginPath();
  projected.forEach((point, index) => {
    if (!point) return;
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  project: (point: Vec3) => { x: number; y: number } | null,
  from: Vec3,
  to: Vec3,
): void {
  const a = project(from);
  const b = project(to);
  if (!a || !b) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3, factor: number): Vec3 {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
