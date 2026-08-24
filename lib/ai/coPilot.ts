/**
 * AI Design Co-Pilot Orchestrator for ArtShift
 * Workspace-aware multi-agent system that plans, writes copy, generates images (FLUX),
 * edits visuals (RemoveBG, Vectorize), and arranges layouts (60-30-10).
 */

import { cleanImagePrompt, generateAIImage, isImageGenerationPrompt } from "@/lib/ai/pollinations";
import { removeBackground } from "@/lib/ai/removeBg";
import { compute603010AutoLayout } from "@/lib/engine/autoLayout603010";
import { createImage, createRect, createText } from "@/lib/engine/factory";
import { getCached, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, ImageElement, TextElement } from "@/lib/engine/types";
import { vectorizeImage } from "@/lib/vectorize/vectorizer";
import { enqueueAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";
import type { AIMode } from "./modes";

export type CoPilotRole = "user" | "assistant" | "system";

export type SubAgentKind =
  | "orchestrator"
  | "image_gen"
  | "image_edit"
  | "vectorizer"
  | "layout_designer"
  | "copywriter"
  | "brand_stylist"
  | "remote_chat";

export interface SubAgentActionLog {
  id: string;
  agent: SubAgentKind;
  title: string;
  description: string;
  status: "running" | "success" | "error";
  timestamp: number;
  mode?: AIMode;
}

export interface CoPilotMessage {
  id: string;
  role: CoPilotRole;
  content: string;
  timestamp: number;
  kind?: "message" | "progress";
  actions?: SubAgentActionLog[];
  suggestions?: string[];
}

export interface WorkspaceContext {
  slideId: string;
  width: number;
  height: number;
  background: string;
  elementCount: number;
  selectedIds: string[];
  elementsSummary: Array<{
    id: string;
    type: string;
    text?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export type CoPilotOptions = {
  /** Explicit mode is required by the UI; legacy callers retain the previous API behavior. */
  mode?: AIMode;
  signal?: AbortSignal;
};

/** Prompts that need a specialized asset/local processor rather than the slide chat API. */
export function isSpecializedCoPilotPrompt(userPrompt: string): boolean {
  const prompt = userPrompt.trim();
  const lower = prompt.toLowerCase();
  return (
    isImageGenerationPrompt(prompt) ||
    lower.includes("ลบพื้นหลัง") ||
    lower.includes("remove bg") ||
    lower.includes("remove background") ||
    lower.includes("ตัดพื้นหลัง") ||
    lower.includes("ไดคัท") ||
    lower.includes("vectorize") ||
    lower.includes("แปลงเป็น vector") ||
    lower.includes("แปลงเป็นเวกเตอร์") ||
    lower.includes("auto-trace") ||
    lower.includes("trace vector")
  );
}

/**
 * Extracts a concise summary of the current slide and workspace state for the AI.
 */
export function getWorkspaceContext(): WorkspaceContext {
  const st = useEngine.getState();
  const slide = st.doc.slides.find((s) => s.id === st.currentSlideId) || st.doc.slides[0];

  const sw = slide?.width ?? 1920;
  const sh = slide?.height ?? 1080;
  const bg = slide?.background ?? "#ffffff";
  const elements = (slide?.elements ?? []).filter((e) => !e.isDeleted);
  const selectedIds = Array.from(st.selectedIds);

  const elementsSummary = elements.map((el) => ({
    id: el.id,
    type: el.type,
    text: el.type === "text" ? (el as TextElement).text : undefined,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
  }));

  return {
    slideId: slide?.id ?? "",
    width: sw,
    height: sh,
    background: bg,
    elementCount: elements.length,
    selectedIds,
    elementsSummary,
  };
}

/**
 * Master Sub-Agent Dispatcher: Analyzes user intent and executes local & AI tools on canvas.
 */
export async function executeCoPilotInstruction(
  userPrompt: string,
  onActionUpdate?: (action: SubAgentActionLog) => void,
  options: CoPilotOptions = {},
): Promise<{
  reply: string;
  actions: SubAgentActionLog[];
  suggestions: string[];
}> {
  const prompt = userPrompt.trim();
  const lower = prompt.toLowerCase();
  // Preserve the existing behavior for non-UI callers that do not pass a mode.
  const mode = options.mode ?? "fast";
  const context = getWorkspaceContext();
  const actions: SubAgentActionLog[] = [];
  const st = useEngine.getState();

  const logAction = (
    agent: SubAgentKind,
    title: string,
    description: string,
    status: "running" | "success" | "error" = "running",
  ): SubAgentActionLog => {
    const act: SubAgentActionLog = {
      id: crypto.randomUUID(),
      agent,
      title,
      description,
      status,
      timestamp: Date.now(),
      mode,
    };
    actions.push(act);
    if (onActionUpdate) onActionUpdate(act);
    return act;
  };

  const updateActionStatus = (
    act: SubAgentActionLog,
    status: "success" | "error",
    newDesc?: string,
  ) => {
    act.status = status;
    if (newDesc) act.description = newDesc;
    if (onActionUpdate) onActionUpdate({ ...act });
  };

  // -------------------------------------------------------------
  // 1. SUB-AGENT: IMAGE GENERATOR (FLUX)
  // Keywords: "สร้างรูป", "วาดรูป", "generate image", "create image", "วาด", "รูปภาพ"
  // -------------------------------------------------------------
  if (isImageGenerationPrompt(prompt)) {
    const act = logAction(
      "image_gen",
      mode === "eco" ? "🍃 Local Image Generation" : "🎨 Generating Image with FLUX AI",
      mode === "eco"
        ? `Local image generation is not installed for this workspace yet.`
        : `Creating visual asset for: "${prompt}"...`,
    );

    if (mode === "eco") {
      updateActionStatus(
        act,
        "error",
        "No on-device image model is configured; no remote request was made.",
      );
      return {
        reply:
          "โหมด Eco ยังไม่มีโมเดลสร้างภาพที่ติดตั้งบนเครื่อง จึงยังไม่ส่งงานออกอินเทอร์เน็ตครับ หากต้องการสร้างภาพตอนนี้ให้สลับเป็นโหมด Fast (∞) หรือเพิ่ม local image model ในภายหลัง",
        actions,
        suggestions: ["∞ สลับเป็น Fast แล้วสร้างภาพนี้", "🖼️ นำเข้ารูปภาพจากเครื่อง", "📐 จัด Layout สไลด์นี้"],
      };
    }

    try {
      // Clean up prompt
      let cleanPrompt = cleanImagePrompt(prompt);

      if (!cleanPrompt) cleanPrompt = prompt;

      const imageRequest = {
        prompt: cleanPrompt,
        model: "flux-realism" as const,
        width: 1024,
        height: 1024,
        enhance: true,
      };
      const res = options.signal
        ? await generateAIImage(imageRequest, options.signal)
        : await generateAIImage(imageRequest);

      const maxW = context.width * 0.5;
      const maxH = context.height * 0.5;
      const scale = Math.min(maxW / res.width, maxH / res.height, 1);
      const w = Math.round(res.width * scale);
      const h = Math.round(res.height * scale);
      const x = Math.round((context.width - w) / 2);
      const y = Math.round((context.height - h) / 2);

      const newElement = createImage({
        x,
        y,
        width: w,
        height: h,
        fileId: res.fileId,
        naturalWidth: res.width,
        naturalHeight: res.height,
      });

      const generatedAsset = getCached(res.fileId);
      if (generatedAsset) {
        enqueueAssetAnalysis({
          fileId: generatedAsset.fileId,
          dataURL: generatedAsset.dataURL,
          width: generatedAsset.width,
          height: generatedAsset.height,
        });
      }
      st.addElement(newElement, `co-pilot generate image: ${cleanPrompt.slice(0, 20)}`);
      st.selectOnly([newElement.id]);

      updateActionStatus(
        act,
        "success",
        `Created and placed high-res FLUX image (${w}×${h}px) on canvas.`,
      );

      return {
        reply: `สร้างรูปภาพ "${cleanPrompt}" ด้วยโมเดล FLUX ให้เรียบร้อยและวางลงกึ่งกลางแคนวาสแล้วครับ!`,
        actions,
        suggestions: [
          "🪄 ลบพื้นหลังของรูปนี้",
          "⚡ แปลงรูปนี้เป็น Vector Paths",
          "📐 จัดวาง Layout ให้สวยงาม",
          "✍️ เพิ่มหัวข้อและสโลแกน",
        ],
      };
    } catch (err) {
      updateActionStatus(act, "error", `Failed: ${(err as Error).message}`);
      return {
        reply: `ขออภัยครับ ไม่สามารถสร้างรูปภาพได้: ${(err as Error).message}`,
        actions,
        suggestions: ["✨ ลองสร้างรูปภาพใหม่อีกครั้ง", "🎨 ระบุคำค้นหาเพิ่มเติม เช่น แมวส้มน่ารัก"],
      };
    }
  }

  // -------------------------------------------------------------
  // 2. SUB-AGENT: VISION / REMOVE BACKGROUND
  // Keywords: "ลบพื้นหลัง", "remove bg", "transparent bg", "ตัดพื้นหลัง", "ไดคัท"
  // -------------------------------------------------------------
  if (
    lower.includes("ลบพื้นหลัง") ||
    lower.includes("remove bg") ||
    lower.includes("remove background") ||
    lower.includes("ตัดพื้นหลัง") ||
    lower.includes("ไดคัท")
  ) {
    const act = logAction(
      "image_edit",
      "✂️ Removing Background",
      "Analyzing image and isolating foreground object...",
    );

    try {
      // Find selected image or first image on canvas
      const slide = st.doc.slides.find((s) => s.id === st.currentSlideId) || st.doc.slides[0];
      const elements = (slide?.elements ?? []).filter((e) => !e.isDeleted);
      const targetImg = (elements.find((e) => st.selectedIds.has(e.id) && e.type === "image") ||
        elements.find((e) => e.type === "image")) as ImageElement | undefined;

      if (!targetImg) {
        updateActionStatus(act, "error", "No image found on canvas to remove background.");
        return {
          reply: "ไม่พบรูปภาพบน Canvas กรุณาสร้างหรือเลือกรูปภาพที่ต้องการลบพื้นหลังก่อนครับ",
          actions,
          suggestions: ["✨ สร้างรูปสินค้าด้วย AI", "🖼️ วางรูปภาพจากเครื่อง"],
        };
      }

      const cached = getCached(targetImg.fileId);
      if (!cached?.dataURL) throw new Error("Image data not found in cache");

      const resultUrl = await removeBackground(cached.dataURL, {
        signal: options.signal,
      });
      const newCached = await loadDataURL(resultUrl);

      st.updateElements(
        [
          {
            id: targetImg.id,
            patch: {
              fileId: newCached.fileId,
              naturalWidth: newCached.width,
              naturalHeight: newCached.height,
              crop: null,
              status: "loaded",
            },
          },
        ],
        "co-pilot remove background",
      );

      updateActionStatus(act, "success", "Background removed cleanly with AI!");

      return {
        reply: "ลบพื้นหลังของรูปภาพให้โปร่งใสเรียบร้อยแล้วครับ!",
        actions,
        suggestions: [
          "⚡ แปลงรูปนี้เป็น Vector Paths",
          "📐 จัด Layout 60-30-10",
          "🎨 ใส่สีพื้นหลังให้ตัดกับวัตถุ",
        ],
      };
    } catch (err) {
      updateActionStatus(act, "error", `Failed: ${(err as Error).message}`);
      return {
        reply: `ขออภัยครับ ไม่สามารถลบพื้นหลังได้: ${(err as Error).message}`,
        actions,
        suggestions: ["✨ ลองเลือกรูปภาพอื่นบน Canvas", "🖼️ วางรูปภาพใหม่"],
      };
    }
  }

  // -------------------------------------------------------------
  // 3. SUB-AGENT: VECTORIZER (AUTO-TRACE)
  // Keywords: "vectorize", "แปลงเป็น vector", "trace", "เวกเตอร์"
  // -------------------------------------------------------------
  if (
    lower.includes("vectorize") ||
    lower.includes("แปลงเป็น vector") ||
    lower.includes("แปลงเป็นเวกเตอร์") ||
    lower.includes("auto-trace") ||
    lower.includes("trace vector")
  ) {
    const act = logAction(
      "vectorizer",
      "⚡ Auto-Tracing to Vector Paths",
      "Extracting color contours and fitting Bézier curves...",
    );

    try {
      const slide = st.doc.slides.find((s) => s.id === st.currentSlideId) || st.doc.slides[0];
      const elements = (slide?.elements ?? []).filter((e) => !e.isDeleted);
      const targetImg = (elements.find((e) => st.selectedIds.has(e.id) && e.type === "image") ||
        elements.find((e) => e.type === "image")) as ImageElement | undefined;

      if (!targetImg) {
        updateActionStatus(act, "error", "No image found on canvas to vectorize.");
        return {
          reply: "ไม่พบรูปภาพบน Canvas ที่จะแปลงเป็นเวกเตอร์ครับ",
          actions,
          suggestions: ["✨ สร้างรูปด้วย AI ก่อน", "🖼️ วางรูปภาพ"],
        };
      }

      const cached = getCached(targetImg.fileId);
      if (!cached?.dataURL) throw new Error("Image data not found in cache");

      const res = await vectorizeImage(
        cached.dataURL,
        {
          x: targetImg.x + 20,
          y: targetImg.y + 20,
          width: targetImg.width,
          height: targetImg.height,
        },
        { preset: "highFidelity", colors: 16, detailLevel: 3 },
        { signal: options.signal },
      );

      st.addElements(res.elements, "co-pilot vectorize image");
      st.selectOnly(res.elements.map((el) => el.id));

      updateActionStatus(
        act,
        "success",
        `Traced ${res.elements.length} vector layers (${res.totalNodes} anchor nodes).`,
      );

      return {
        reply: `แปลงรูปภาพเป็น ${res.elements.length} เลเยอร์เวกเตอร์อิสระเรียบร้อย สามารถเลือกดัด Anchor Nodes ต่อได้ทันทีครับ!`,
        actions,
        suggestions: ["🎨 เปลี่ยนสีเลเยอร์เวกเตอร์", "📐 จัดเรียง Layout ใหม่", "✍️ ใส่ข้อความพาดหัว"],
      };
    } catch (err) {
      updateActionStatus(act, "error", `Failed: ${(err as Error).message}`);
      return {
        reply: `ขออภัยครับ ไม่สามารถแปลงเป็นเวกเตอร์ได้: ${(err as Error).message}`,
        actions,
        suggestions: ["✨ ลองเลือกรูปภาพอื่น", "🖼️ นำเข้ารูปภาพใหม่"],
      };
    }
  }

  // -------------------------------------------------------------
  // 4. SUB-AGENT: LAYOUT & COMPOSER (60-30-10 Rule)
  // Keywords: "จัด layout", "จัดหน้า", "auto layout", "จัดระเบียบ", "จัดกึ่งกลาง", "จัดองค์ประกอบ"
  // -------------------------------------------------------------
  if (
    lower.includes("layout") ||
    lower.includes("จัดหน้า") ||
    lower.includes("จัดระเบียบ") ||
    lower.includes("จัดกึ่งกลาง") ||
    lower.includes("จัดองค์ประกอบ") ||
    lower.includes("60-30-10")
  ) {
    const act = logAction(
      "layout_designer",
      "📐 Applying 60-30-10 Harmonic Layout",
      "Optimizing visual hierarchy, padding, and alignments...",
    );

    try {
      const slide = st.doc.slides.find((s) => s.id === st.currentSlideId) || st.doc.slides[0];
      if (!slide || slide.elements.length === 0) {
        updateActionStatus(act, "error", "Canvas is empty.");
        return {
          reply: "บน Canvas ยังไม่มีวัตถุที่จะจัด Layout ครับ ลองสั่งให้ผมสร้างรูปหรือข้อความก่อนได้ครับ",
          actions,
          suggestions: ["✨ สร้างแบนเนอร์โปรโมชั่น", "🖼️ สร้างรูปภาพด้วย AI"],
        };
      }

      const patches = compute603010AutoLayout(slide);
      if (patches.length > 0) {
        st.updateElements(patches, "co-pilot auto layout 60-30-10");
      }

      updateActionStatus(
        act,
        "success",
        `Applied balanced 60-30-10 layout pattern to ${patches.length} elements.`,
      );

      return {
        reply: "จัดองค์ประกอบภาพตามสัดส่วนสีทอง 60-30-10 และปรับตำแหน่งให้สมดุลเรียบร้อยครับ!",
        actions,
        suggestions: ["🎨 เปลี่ยนโทนสีด้วย Brand Kit", "✍️ ปรับข้อความพาดหัว", "✨ เพิ่ม Badge โปรโมชั่น"],
      };
    } catch (err) {
      updateActionStatus(act, "error", `Failed: ${(err as Error).message}`);
      return {
        reply: `ขออภัยครับ ไม่สามารถจัด Layout ได้: ${(err as Error).message}`,
        actions,
        suggestions: ["✨ ลองเพิ่มวัตถุลงบนสไลด์ก่อน", "🖼️ สร้างรูปภาพ"],
      };
    }
  }

  // -------------------------------------------------------------
  // 5. SUB-AGENT: COPYWRITER / BANNER BUILDER (Composed Design)
  // Keywords: "แบนเนอร์", "โปรโมชั่น", "sale", "พาดหัว", "banner", "poster", "ออกแบบ"
  // -------------------------------------------------------------
  const act = logAction(
    "copywriter",
    "✍️ Composing Content & Visuals",
    `Designing elements for: "${prompt}"...`,
  );

  try {
    const sw = context.width;
    const sh = context.height;

    // Detect if user wants promotion/sale banner
    const isPromo =
      lower.includes("sale") ||
      lower.includes("โปรโมชั่น") ||
      lower.includes("ลดราคา") ||
      lower.includes("แบนเนอร์") ||
      lower.includes("banner");

    const newElements: EngineElement[] = [];

    // 1. Title Headline
    const headlineText = isPromo ? "SPECIAL PROMOTION" : prompt.toUpperCase();
    const titleEl: TextElement = {
      ...createText({
        x: Math.round(sw * 0.08),
        y: Math.round(sh * 0.15),
        width: Math.round(sw * 0.84),
        height: 90,
        text: headlineText,
        fontSize: 54,
        fontFamily: "Noto Sans Thai, sans-serif",
      }),
      strokeColor: "#0f172a",
      textAlign: "center",
      fontStyle: "bold",
    };
    newElements.push(titleEl);

    // 2. Subtitle / Body
    const subtitleText = isPromo
      ? "ลดสูงสุด 50% ทุกรายการสินค้า • วันนี้ - สิ้นเดือนนี้เท่านั้น"
      : `ดีไซน์และองค์ประกอบสำหรับ "${prompt}"`;
    const subEl: TextElement = {
      ...createText({
        x: Math.round(sw * 0.1),
        y: Math.round(sh * 0.28),
        width: Math.round(sw * 0.8),
        height: 50,
        text: subtitleText,
        fontSize: 24,
        fontFamily: "Noto Sans Thai, sans-serif",
      }),
      strokeColor: "#64748b",
      textAlign: "center",
    };
    newElements.push(subEl);

    // 3. Decorative Badge or Container
    if (isPromo) {
      const badgeContainer = {
        ...createRect({
          x: Math.round(sw * 0.38),
          y: Math.round(sh * 0.78),
          width: Math.round(sw * 0.24),
          height: 58,
        }),
        backgroundColor: "#6366f1",
        strokeColor: "#4f46e5",
        strokeWidth: 0,
        cornerRadius: 29,
      };
      const badgeText: TextElement = {
        ...createText({
          x: Math.round(sw * 0.38),
          y: Math.round(sh * 0.79),
          width: Math.round(sw * 0.24),
          height: 48,
          text: "SHOP NOW ➔",
          fontSize: 20,
          fontFamily: "Noto Sans Thai, sans-serif",
        }),
        strokeColor: "#ffffff",
        textAlign: "center",
        fontStyle: "bold",
      };
      newElements.push(badgeContainer, badgeText);
    }

    st.addElements(newElements, `co-pilot compose: ${prompt.slice(0, 20)}`);
    st.selectOnly(newElements.map((e) => e.id));

    updateActionStatus(act, "success", `Created ${newElements.length} design elements on canvas.`);

    return {
      reply: `ออกแบบองค์ประกอบและพาดหัวข้อความสำหรับ "${prompt}" วางลงบน Canvas ให้เรียบร้อยแล้วครับ!`,
      actions,
      suggestions: [
        "✨ สร้างรูปภาพประกอบตรงกลาง",
        "📐 จัด Layout 60-30-10",
        "🎨 เปลี่ยนชุดสีตาม Brand Kit",
      ],
    };
  } catch (err) {
    updateActionStatus(act, "error", `Failed: ${(err as Error).message}`);
    return {
      reply: `เกิดข้อผิดพลาดในการประมวลผล: ${(err as Error).message}`,
      actions,
      suggestions: ["✨ ลองสร้างรูปภาพด้วย AI", "📐 จัด Layout ใหม่อีกครั้ง"],
    };
  }
}
