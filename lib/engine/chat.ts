"use client";

import type { ApplyTemplateInput } from "@/lib/schemas";
import {
  AddImageInputSchema,
  AddShapeInputSchema,
  AddSlideInputSchema,
  AddTextInputSchema,
  ApplyTemplateInputSchema,
  DeleteObjectInputSchema,
  SetBackgroundInputSchema,
  safeParse,
  UpdateObjectInputSchema,
} from "@/lib/schemas";
import { runTemplate } from "@/lib/templates";
import type { Mutation } from "@/lib/types";
import { loadDataURL } from "./imageCache";
import { useEngine } from "./store";
import type { EngineElement, TextElement } from "./types";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type RunChatResult = {
  text: string;
  mutations: Mutation[];
  applied: number;
  skipped: number;
  error?: string;
};

export type RunChatOptions = {
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
};

// The API was built for a 1280x720 canvas; the engine is 1920x1080.
const LEGACY_W = 1280;
const LEGACY_H = 720;
const ENGINE_W = 1920;
const ENGINE_H = 1080;
const SCALE_X = ENGINE_W / LEGACY_W;
const SCALE_Y = ENGINE_H / LEGACY_H;

export async function runEngineChat(
  messages: ChatMsg[],
  opts: RunChatOptions = {},
): Promise<RunChatResult> {
  const st = useEngine.getState();
  const slide = st.currentSlide();
  const slideState = {
    canvas: { width: LEGACY_W, height: LEGACY_H },
    background: slide?.background ?? "#ffffff",
    objects: (slide?.elements ?? []).filter((e) => !e.isDeleted).map(summarizeEngineObject),
  };

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({ messages, slideState, stream: true }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let errorMsg = `AI request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") errorMsg = data.error;
    } catch {
      // ignore parse error
    }
    return { text: "", mutations: [], applied: 0, skipped: 0, error: errorMsg };
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const data = await res.json();
    const muts: Mutation[] = data.mutations ?? [];
    let applied = 0;
    let skipped = 0;
    for (const m of muts) {
      const ok = await applyEngineMutation(m);
      if (ok) applied++;
      else skipped++;
    }
    return { text: data.text || "Done.", mutations: muts, applied, skipped };
  }

  return await readSseAndApply(res, opts);
}

async function readSseAndApply(res: Response, opts: RunChatOptions): Promise<RunChatResult> {
  const reader = res.body?.getReader();
  if (!reader) {
    return { text: "", mutations: [], applied: 0, skipped: 0, error: "no stream" };
  }
  const decoder = new TextDecoder();
  const mutations: Mutation[] = [];
  let text = "";
  let applied = 0;
  let skipped = 0;
  let errorMsg: string | undefined;
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const block of events) {
        if (!block.trim()) continue;
        const { event, data } = parseSseBlock(block);
        if (!event) continue;
        if (event === "text") {
          const delta = typeof data?.delta === "string" ? data.delta : "";
          if (delta) {
            text += delta;
            opts.onTextDelta?.(delta);
          }
        } else if (event === "mutation") {
          const mut = data as Mutation | undefined;
          if (mut && typeof mut.tool === "string") {
            mutations.push(mut);
            const ok = await applyEngineMutation(mut);
            if (ok) applied++;
            else skipped++;
          }
        } else if (event === "error") {
          errorMsg = typeof data?.message === "string" ? data.message : "AI error";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    text: text.trim() || (errorMsg ? `AI error: ${errorMsg}` : "Done."),
    mutations,
    applied,
    skipped,
    error: errorMsg,
  };
}

function parseSseBlock(block: string): {
  event: string | null;
  data: Record<string, unknown> | undefined;
} {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return { event, data: undefined };
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) as Record<string, unknown> };
  } catch {
    return { event, data: undefined };
  }
}

function summarizeEngineObject(el: EngineElement) {
  const base = {
    id: el.id,
    type: el.type,
    x: Math.round(el.x / SCALE_X),
    y: Math.round(el.y / SCALE_Y),
    width: Math.round(el.width / SCALE_X),
    height: Math.round(el.height / SCALE_Y),
    rotation: Math.round((el.angle * 180) / Math.PI),
  };
  if (el.type === "text") {
    return {
      ...base,
      text: el.text,
      fontSize: el.fontSize,
      fill: el.strokeColor,
      align: el.textAlign,
    };
  }
  if (el.type === "image") {
    return { ...base, src: "" };
  }
  if (el.type === "line" || el.type === "arrow") {
    return {
      ...base,
      shape: el.type,
      fill: el.strokeColor,
      stroke: el.strokeColor,
      strokeWidth: el.strokeWidth,
    };
  }
  return {
    ...base,
    shape: el.type,
    fill: el.backgroundColor,
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
  };
}

async function applyEngineMutation(m: Mutation): Promise<boolean> {
  const st = useEngine.getState();
  const slide = st.currentSlide();
  if (!slide) return false;

  switch (m.tool) {
    case "add_text": {
      const i = safeParse(AddTextInputSchema, m.input);
      if (!i) return false;
      const { createText } = await import("./factory");
      const el: TextElement = createText({
        x: (i.x ?? 120) * SCALE_X,
        y: (i.y ?? 120) * SCALE_Y,
        text: i.text,
      });
      el.width = (i.width ?? 480) * SCALE_X;
      el.height = (i.height ?? 80) * SCALE_Y;
      el.fontSize = i.fontSize ?? 40;
      el.fontStyle = i.fontStyle ?? "normal";
      el.textAlign = i.align ?? "left";
      el.strokeColor = i.fill ?? "#111111";
      st.addElement(el, "ai add text");
      return true;
    }
    case "add_shape": {
      const i = safeParse(AddShapeInputSchema, m.input);
      if (!i) return false;
      const { createRect, createEllipse, createTriangle, createLine, createArrow } = await import(
        "./factory"
      );
      const x = (i.x ?? 200) * SCALE_X;
      const y = (i.y ?? 200) * SCALE_Y;
      const w = (i.width ?? 240) * SCALE_X;
      const h = (i.height ?? 160) * SCALE_Y;
      let el: EngineElement;
      switch (i.shape) {
        case "rect":
          el = createRect({ x, y, width: w, height: h });
          (el as ReturnType<typeof createRect>).cornerRadius = i.cornerRadius ?? 0;
          break;
        case "ellipse":
          el = createEllipse({ x, y, width: w, height: h });
          break;
        case "triangle":
          el = createTriangle({ x, y, width: w, height: h });
          break;
        case "line":
          el = createLine([x, y], [x + w, y + h]);
          break;
        case "arrow":
          el = createArrow([x, y], [x + w, y + h]);
          break;
        default:
          return false;
      }
      if (i.shape === "line" || i.shape === "arrow") {
        el.strokeColor = i.stroke ?? i.fill ?? "#1f2230";
      } else {
        el.backgroundColor = i.fill ?? "#6366f1";
        el.strokeColor = i.stroke ?? "#1f2230";
      }
      el.strokeWidth = i.strokeWidth ?? 2;
      st.addElement(el, "ai add shape");
      return true;
    }
    case "add_image": {
      const i = safeParse(AddImageInputSchema, m.input);
      if (!i) return false;
      const { createImage } = await import("./factory");
      let entry: { fileId: string; width: number; height: number };
      try {
        entry = await loadDataURL(i.src);
      } catch {
        return false;
      }
      const el = createImage({
        x: (i.x ?? 0) * SCALE_X,
        y: (i.y ?? 0) * SCALE_Y,
        width: (i.width ?? entry.width) * SCALE_X,
        height: (i.height ?? entry.height) * SCALE_Y,
        fileId: entry.fileId,
        naturalWidth: entry.width,
        naturalHeight: entry.height,
      });
      st.addElement(el, "ai add image");
      return true;
    }
    case "update_object": {
      const i = safeParse(UpdateObjectInputSchema, m.input);
      if (!i) return false;
      const exists = slide.elements.some((e) => e.id === i.id && !e.isDeleted);
      if (!exists) return false;
      const patch = mapLegacyPatch(i.patch);
      st.updateElements([{ id: i.id, patch }], "ai update");
      return true;
    }
    case "delete_object": {
      const i = safeParse(DeleteObjectInputSchema, m.input);
      if (!i) return false;
      const exists = slide.elements.some((e) => e.id === i.id && !e.isDeleted);
      if (!exists) return false;
      st.deleteElements([i.id]);
      return true;
    }
    case "set_background": {
      const i = safeParse(SetBackgroundInputSchema, m.input);
      if (!i) return false;
      st.setSlideBackground(slide.id, i.color);
      return true;
    }
    case "add_slide": {
      const i = safeParse(AddSlideInputSchema, m.input);
      if (!i) return false;
      st.addSlide();
      return true;
    }
    case "apply_template": {
      const i = safeParse(ApplyTemplateInputSchema, m.input);
      if (!i) return false;
      const result = runTemplate(i as ApplyTemplateInput);
      if (!result) return false;
      for (const el of result.objects) {
        st.addElement(el as EngineElement, "ai template");
      }
      if (result.background) {
        st.setSlideBackground(slide.id, result.background);
      }
      return true;
    }
    default:
      return false;
  }
}

function mapLegacyPatch(patch: Record<string, unknown>): Partial<EngineElement> {
  const out: Record<string, unknown> = {};
  if (typeof patch.x === "number") out.x = patch.x * SCALE_X;
  if (typeof patch.y === "number") out.y = patch.y * SCALE_Y;
  if (typeof patch.width === "number") out.width = patch.width * SCALE_X;
  if (typeof patch.height === "number") out.height = patch.height * SCALE_Y;
  if (typeof patch.rotation === "number") out.angle = (patch.rotation * Math.PI) / 180;
  if (typeof patch.opacity === "number") out.opacity = patch.opacity;
  if (typeof patch.fill === "string") out.backgroundColor = patch.fill;
  if (typeof patch.stroke === "string") out.strokeColor = patch.stroke;
  if (typeof patch.strokeWidth === "number") out.strokeWidth = patch.strokeWidth;
  if (typeof patch.text === "string") out.text = patch.text;
  if (typeof patch.fontSize === "number") out.fontSize = patch.fontSize;
  if (typeof patch.align === "string") out.textAlign = patch.align;
  if (typeof patch.cornerRadius === "number") out.cornerRadius = patch.cornerRadius;
  return out as Partial<EngineElement>;
}
