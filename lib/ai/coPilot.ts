/**
 * AI Design Co-Pilot Orchestrator for ArtShift
 * Workspace-aware multi-agent system that plans, writes copy, generates images (GPT Image 2),
 * edits visuals (RemoveBG, Vectorize), and arranges layouts (60-30-10).
 */

import {
  isImageGenerationPrompt,
  streamlinePromptForImageGen,
} from "@/lib/ai/imageGeneration";
import {
  prepareRemoteCreativeDirection,
  reviewRemoteCreativeOutput,
} from "@/lib/ai/orchestration/creativeDirectorClient";
import { runContextAwareImageRun } from "@/lib/ai/orchestration/imageBatchRunner";
import {
  buildComposerImageSelection,
  type ComposerImageRef,
} from "@/lib/ai/orchestration/imageReferences";
import { composeClarifiedImagePrompt } from "@/lib/ai/orchestration/intentCompleteness";
import { analyzeImageReferences } from "@/lib/ai/orchestration/referenceAnalysis";
import {
  createDirectedImageRun,
  type PendingClarification,
} from "@/lib/ai/orchestration/turnOrchestrator";
import { removeBackground } from "@/lib/ai/removeBg";
import type { VisualRoutePlan } from "@/lib/ai/visualOrchestrator";
import type { AiImageRenderQuality } from "@/lib/ai-runtime/contracts";
import { buildDesignAgentContext } from "@/lib/designAgent/client";
import type { PlanProposal } from "@/lib/designAgent/contracts";
import { compute603010AutoLayout } from "@/lib/engine/autoLayout603010";
import { createRect, createText } from "@/lib/engine/factory";
import { getCached, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, ImageElement, TextElement } from "@/lib/engine/types";
import { vectorizeImage } from "@/lib/vectorize/vectorizer";

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
  taskId?: string;
  stage?: string;
  attempt?: number;
  quality?: AiImageRenderQuality;
}

export interface CoPilotErrorCard {
  title: string;
  description: string;
  actionText?: string;
  promptToEdit?: string;
}

export interface CoPilotMessageImage {
  url: string;
  fileId?: string;
  label?: string;
  prompt?: string;
}

export interface CoPilotMessage {
  id: string;
  role: CoPilotRole;
  content: string;
  timestamp: number;
  kind?: "message" | "progress";
  actions?: SubAgentActionLog[];
  suggestions?: string[];
  thought?: string;
  toolLabel?: string;
  errorCard?: CoPilotErrorCard;
  images?: CoPilotMessageImage[];
  imageRefs?: ComposerImageRef[];
  requestedCount?: number;
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
  signal?: AbortSignal;
  cloudConsent?: boolean;
  visualPlan?: VisualRoutePlan;
  contextAwareValidated?: boolean; // Legacy caller hint; never bypasses the Director.
  pendingClarification?: PendingClarification;
  imageConversation?: boolean;
  imageQuality?: "low" | "medium" | "high";
};

/** Prompts that map to a built-in tool command rather than Design Agent chat. */
export function isToolCoPilotPrompt(userPrompt: string): boolean {
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
    lower.includes("trace vector") ||
    lower.includes("layout") ||
    lower.includes("จัดหน้า") ||
    lower.includes("จัดระเบียบ") ||
    lower.includes("จัดกึ่งกลาง") ||
    lower.includes("จัดองค์ประกอบ") ||
    lower.includes("60-30-10")
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
  pendingClarification?: PendingClarification;
  imageCreated?: boolean;
  planProposal?: PlanProposal;
}> {
  const pending = options.pendingClarification;
  const prompt = pending
    ? composeClarifiedImagePrompt(pending.originalPrompt, userPrompt.trim(), pending.question)
    : userPrompt.trim();
  const lower = prompt.toLowerCase();
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
  // 1. SUB-AGENT: CONTEXT-AWARE IMAGE SPECIALIST
  // Keywords: "สร้างรูป", "วาดรูป", "generate image", "create image", "วาด", "รูปภาพ"
  // -------------------------------------------------------------
  if (pending || options.imageConversation || isImageGenerationPrompt(prompt)) {
    const selection = buildComposerImageSelection(
      st.doc.slides.find((slide) => slide.id === st.currentSlideId)?.elements ?? [],
      st.selectedIds,
    );
    if (!pending && selection.omittedCount > 0) {
      const act = logAction(
        "orchestrator",
        "🧭 Context-aware image task",
        "เลือกภาพเกินขีดจำกัด 4 ภาพ",
        "error",
      );
      return {
        reply: "ยังไม่สร้างภาพครับ กรุณาลด selection เหลือไม่เกิน 4 ภาพ",
        actions: [act],
        suggestions: ["เปิด AI Assistance", "ตรวจสอบภาพที่เลือก"],
      };
    }

    const selectedRefs = pending?.selectedImages ?? selection.refs;
    const workspaceSlide = st.currentSlide();
    const act = logAction("orchestrator", "🧠 Creative Director", "กำลังเตรียมบริบทก่อนส่งให้ Director");
    if (options.cloudConsent !== true) {
      updateActionStatus(act, "error", "ยังไม่ได้รับอนุญาตให้ส่งงานไปยัง AI provider");
      return {
        reply: "ยังไม่ได้สร้างภาพครับ ต้องได้รับอนุญาตก่อนส่งงานไปยัง AI provider",
        actions,
        suggestions: ["ยืนยันการส่งงานไปยัง AI provider"],
      };
    }

    try {
      const analyses =
        pending?.analyses ??
        (await analyzeImageReferences(
          selectedRefs,
          options.signal ?? new AbortController().signal,
        ));
      act.stage = "analyzing";
      act.description = "กำลังส่ง brief ให้ gpt-oss-120b Creative Director วางแผน…";
      onActionUpdate?.({ ...act });
      const direction = await prepareRemoteCreativeDirection(
        {
          prompt,
          canvasSummary: {
            objectCount: context.elementCount,
            selectedCount: context.selectedIds.length,
            width: context.width,
            height: context.height,
          },
          designContext: buildDesignAgentContext(st),
          referenceAnalyses: analyses,
        },
        { signal: options.signal, cloudConsent: true },
      );
      if (direction.kind === "answer") {
        updateActionStatus(act, "success", "Creative Director ตอบโดยไม่เรียก Image Model");
        return { reply: direction.text, actions, suggestions: ["ระบุ brief สำหรับสร้างภาพ"] };
      }
      if (direction.kind === "clarification") {
        updateActionStatus(act, "success", "Creative Director ต้องการรายละเอียดเพิ่มก่อนสร้างภาพ");
        return {
          reply: direction.question,
          actions,
          suggestions: direction.options,
          pendingClarification: {
            id: crypto.randomUUID(),
            originalPrompt: prompt,
            selectedImages: selectedRefs,
            analyses,
            question: direction.question,
            options: direction.options.map((label, index) => ({ id: String(index), label })),
            round: (pending?.round ?? 0) + 1,
          },
        };
      }
      if (direction.kind === "design-plan") {
        updateActionStatus(
          act,
          "success",
          `Creative Director เตรียมแผนแก้ Canvas ${direction.proposal.commands.length} รายการ`,
        );
        return {
          reply: `Creative Director เตรียมแผนแก้ไข Canvas แล้วครับ (${direction.proposal.summary}) ตรวจสอบและกด Apply plan เพื่อดำเนินงาน`,
          actions,
          suggestions: ["ตรวจสอบแผนแล้วกด Apply plan", "แก้ brief ก่อนเริ่มงาน"],
          planProposal: direction.proposal,
        };
      }
      if (direction.kind === "sequential-plan") {
        updateActionStatus(
          act,
          "success",
          `Creative Director เสนอแผนงาน ${direction.plan.steps.length} ขั้นตอน`,
        );
        return {
          reply: `Creative Director เสนอแผนงานต่อเนื่อง ${direction.plan.steps.length} ขั้นตอน (${direction.plan.summary}) กรุณาตรวจสอบและกด Approve & Execute เพื่อเริ่มงานครับ`,
          actions,
          suggestions: ["อนุมัติและเริ่มรันแผน", "ยกเลิกแผนนี้"],
        };
      }
      if (direction.search.required) {
        updateActionStatus(act, "success", "Creative Director ระบุว่าต้องค้น Context ก่อนสร้างภาพ");
        return {
          reply: `ยังไม่เรียก Image Model ครับ ต้องค้นข้อมูลเพิ่มก่อน: ${direction.search.queries.join(", ")}`,
          actions,
          suggestions: ["เพิ่ม Reference เอง", "ปรับ brief โดยไม่ใช้ข้อมูลภายนอก"],
        };
      }
      const imageRun = createDirectedImageRun(
        {
          prompt,
          refs: selectedRefs,
          analyses,
          canvas: workspaceSlide
            ? { slide: workspaceSlide, selectedIds: st.selectedIds }
            : undefined,
        },
        direction,
      );
      act.taskId = imageRun.id;
      const countLabel =
        imageRun.requestedOutputCount > 1 ? ` (${imageRun.requestedOutputCount} ภาพ)` : "";
      act.title = `🧠 Creative Director → ${direction.specialist}${countLabel}`;
      act.stage = "planned";
      act.description = `เลือก ${direction.modelAlias} · วางแผนสร้าง ${imageRun.requestedOutputCount} ภาพ · Knowledge: ${direction.knowledgeSkillIds.join(", ") || "none"}`;
      onActionUpdate?.({ ...act });

      const runResult = await runContextAwareImageRun(imageRun, selectedRefs, {
        signal: options.signal,
        cloudConsent: true,
        reviewOutput: ({ prompt, reviewCriteria, outputAnalysis, signal }) =>
          reviewRemoteCreativeOutput(
            { prompt, reviewCriteria, outputAnalysis },
            { signal, cloudConsent: true },
          ),
        onUpdate: (update) => {
          act.stage = update.stage;
          act.description = `${update.message} · สำเร็จ ${update.completedCount}/${update.requestedOutputCount}`;
          onActionUpdate?.({ ...act });
        },
      });

      if (runResult.status === "cancelled") {
        updateActionStatus(
          act,
          "error",
          "ยกเลิกงานสร้างภาพตามคำขอแล้ว และไม่มีการเปลี่ยนแปลงที่ไม่สมบูรณ์บน Canvas",
        );
        return {
          reply: "ยกเลิกงานสร้างภาพตามคำขอแล้วครับ ไม่มีการเปลี่ยนแปลงบน Canvas",
          actions,
          suggestions: ["ระบุ brief ใหม่", "ตรวจสอบภาพที่เลือก"],
        };
      }

      if (runResult.status === "partial" && runResult.completedCount === 0) {
        const firstError = runResult.items.find((i) => i.error)?.error || "การสร้างภาพไม่สำเร็จ";
        const diagnosis = diagnoseOrchestratorError(firstError, prompt);
        updateActionStatus(act, "error", `Task ไม่สำเร็จ: ${diagnosis.shortReason}`);
        return {
          reply: diagnosis.reply,
          actions,
          suggestions: diagnosis.suggestions,
        };
      }

      const completedSummary =
        imageRun.requestedOutputCount > 1
          ? `สร้างและจัดวางสำเร็จ ${runResult.completedCount}/${imageRun.requestedOutputCount} ภาพ`
          : "สร้างและวางผลลัพธ์สำเร็จ";
      updateActionStatus(act, "success", `${completedSummary} โดยจัดวางไม่ซ้อนทับกัน`);

      const partialNote =
        runResult.failedCount > 0 ? ` (มี ${runResult.failedCount} ภาพที่ไม่สำเร็จ)` : "";

      return {
        reply: `สร้างภาพตามแผนของ Creative Director และวางบน Canvas เรียบร้อยแล้วครับ (${completedSummary})${partialNote} ใช้ ${direction.modelAlias} โดยจัดวางแยกตำแหน่งไม่ซ้อนทับกัน`,
        imageCreated: runResult.completedCount > 0,
        actions,
        suggestions: ["🪄 ลบพื้นหลังของรูปนี้", "⚡ แปลงรูปนี้เป็น Vector Paths", "📐 จัดวาง Layout ให้สวยงาม"],
      };
    } catch (error) {
      const wasCancelled = (error as Error).name === "AbortError" || options.signal?.aborted;
      const outcomeUnknown = (error as Error).name === "OutcomeUnknownError";
      if (outcomeUnknown) {
        act.stage = "outcome-unknown";
        updateActionStatus(act, "error", "ผลลัพธ์ provider ยังยืนยันไม่ได้ จึงไม่สร้างงานซ้ำอัตโนมัติ");
        return {
          reply:
            "ตอนนี้ยังยืนยันผลลัพธ์จาก AI provider ไม่ได้ครับ ผมจะไม่สร้างงานซ้ำอัตโนมัติจนกว่าจะตรวจสอบงานเดิมได้",
          actions,
          suggestions: [
            "ตรวจสอบสถานะ provider ก่อนลองใหม่",
            "ลองใหม่หลังยืนยันว่าไม่มีงานเดิมค้างอยู่",
          ],
        };
      }
      if (wasCancelled) {
        act.stage = "cancelled";
        updateActionStatus(act, "error", "ยกเลิก Task แล้ว ไม่มีการเปลี่ยนแปลงบน Canvas");
        return {
          reply: "ยกเลิกงานที่กำลังประมวลผลแล้วครับ ไม่มีการเปลี่ยนแปลงบน Canvas",
          actions,
          suggestions: ["ส่ง brief เดิมอีกครั้ง", "ตรวจสอบภาพที่เลือก"],
        };
      }
      act.stage = "failed";
      const diagnosis = diagnoseOrchestratorError((error as Error).message, prompt);
      updateActionStatus(act, "error", `Task ไม่สำเร็จ: ${diagnosis.shortReason}`);
      return {
        reply: diagnosis.reply,
        actions,
        suggestions: diagnosis.suggestions,
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

export type OrchestratorDiagnosis = {
  shortReason: string;
  reply: string;
  suggestions: string[];
  errorCard?: CoPilotErrorCard;
  alternativePrompt?: string;
};

export function diagnoseOrchestratorError(
  rawError: string,
  userPrompt: string,
  context?: {
    conversationHistory?: Array<{ role: string; content: string }>;
    canvasSummary?: { objectCount?: number };
  },
): OrchestratorDiagnosis {
  const errorLower = (rawError || "").toLowerCase();
  const promptLower = (userPrompt || "").toLowerCase();

  // 1. Safety / Content Policy / Sensitive / Copyright / Trademark
  const isPolicyViolation =
    /safety|nsfw|sensitive|policy|flagged|copyright|trademark|content filter|violated|violation|policy_denied/i.test(
      errorLower,
    );

  const characterPattern =
    /(?:สไปเดอร์แมน|spider[- ]?man|spiderman|ไอรอนแมน|iron[- ]?man|ironman|แบทแมน|batman|ซูเปอร์แมน|superman|มิกกี้|mickey|เอลซ่า|elsa|โดราเอมอน|doraemon|นารูโตะ|naruto|ลูฟี่|luffy|วันพีซ|one piece|โปเกมอน|pokemon|ปิกาจู|pikachu|มาริโอ้|mario|ดิสนีย์|disney|มาร์เวล|marvel|avenger|endgame|end game|อเวนเจอร์|star wars|สตาร์วอร์ส|harry potter|แฮร์รี่)/iu;
  const detectedCharacterMatch = characterPattern.exec(userPrompt);
  const detectedCharacter = detectedCharacterMatch ? detectedCharacterMatch[0] : null;

  if (isPolicyViolation || detectedCharacter) {
    let detectedSubjectEn = "subject";
    let detectedSubjectTh = "ภาพหลักของคุณ";

    const allContextText = [
      userPrompt,
      ...(context?.conversationHistory?.map((m) => m.content) ?? []),
    ].join(" ");

    if (/cat|kitten|feline|แมว|น้องแมว/i.test(allContextText)) {
      detectedSubjectEn = "cat";
      detectedSubjectTh = "แมว";
    } else if (/dog|puppy|canine|หมา|สุนัข/i.test(allContextText)) {
      detectedSubjectEn = "dog";
      detectedSubjectTh = "สุนัข";
    } else if (/car|vehicle|รถ|ยานยนต์/i.test(allContextText)) {
      detectedSubjectEn = "car";
      detectedSubjectTh = "รถ";
    } else if (/person|character|portrait|man|woman|คน|ตัวละคร|ผู้หญิง|ผู้ชาย/i.test(allContextText)) {
      detectedSubjectEn = "character";
      detectedSubjectTh = "ตัวละคร";
    }

    const isBackgroundRequest =
      /ฉากหลัง|scene|background|ฉาก|วิว|environment|setting/i.test(userPrompt);

    const errorCard: CoPilotErrorCard = {
      title: "Request violates content policy",
      description:
        "Your request violates the AI provider's content policy. This request will not consume any credits.",
      actionText: "Edit my prompt",
      promptToEdit: userPrompt,
    };

    let entityName = "copyrighted content";
    let alternativeEn = "";
    let alternativePrompt = "";
    let samplePromptTh = "";
    let suggestions: string[] = [];

    if (/avenger|endgame|end game|อเวนเจอร์/i.test(userPrompt)) {
      entityName = "Avengers: Endgame";
      if (isBackgroundRequest) {
        alternativeEn = `an epic final-battlefield background — stormy sky, ruins, heroic cinematic atmosphere — while keeping the same ${detectedSubjectEn} in front`;
        alternativePrompt = `An epic cinematic final-battlefield background with stormy dark sky, ruins, dramatic smoke, heroic cinematic atmosphere behind a ${detectedSubjectEn}`;
        samplePromptTh = `ฉากหลังสมรภูมิรบครั้งสุดท้ายสุดยิ่งใหญ่ บรรยากาศท้องฟ้าพายุ ซากปรักหักพัง และแสงสีอันน่าเกรงขาม โดยมี${detectedSubjectTh}อยู่ด้านหน้า`;
        suggestions = [
          "✨ Yes, go ahead with that",
          "⚡ สร้างฉากหลังสมรภูมิรบ (เลี่ยงลิขสิทธิ์)",
          "✏️ Edit prompt",
        ];
      } else {
        alternativeEn = "an original ensemble of heroic warriors in futuristic tactical battle suits";
        alternativePrompt = "A team of original heroic superheroes in advanced high-tech battle armor and tactical suits";
        samplePromptTh = "กลุ่มซูเปอร์ฮีโร่สไตล์ออริจินัลในชุดเกราะและสูทไฮเทคเพื่อการต่อสู้สุดอลังการ";
        suggestions = [
          "✨ Yes, go ahead with that",
          "🦸 สร้างทีมฮีโร่ออริจินัล",
          "✏️ Edit prompt",
        ];
      }
    } else if (/spider[- ]?man|spiderman|สไปเดอร์แมน/i.test(userPrompt)) {
      entityName = "Spider-Man";
      alternativeEn =
        "an original superhero in a modern red-and-blue bodysuit with web-pattern accents, swinging between skyscrapers in a dramatic metropolis";
      alternativePrompt =
        "An original acrobatic superhero in a sleek red and dark blue athletic suit with subtle geometric webbing, swinging between sunlit skyscrapers in a sprawling modern city";
      samplePromptTh =
        "ซูเปอร์ฮีโร่ในชุดบอดี้สูทโทนสีแดง-น้ำเงิน สไตล์คอมิกส์โมเดิร์น กำลังโหนตัวระหว่างตึกสูงในมหานคร";
      suggestions = [
        "✨ Yes, go ahead with that",
        "🦸 สร้างฮีโร่ชุดแดงน้ำเงิน (เลี่ยงลิขสิทธิ์)",
        "🎨 สร้างฮีโร่สไตล์ออริจินัล",
        "✏️ Edit prompt",
      ];
    } else if (/iron[- ]?man|ironman|ไอรอนแมน/i.test(userPrompt)) {
      entityName = "Iron Man";
      alternativeEn =
        "an original armored superhero in a crimson-and-gold high-tech mechanical suit with a glowing energy reactor on the chest";
      alternativePrompt =
        "An original superhero in a crimson red and gold powered exoskeleton armor with glowing blue arc reactor chest piece";
      samplePromptTh =
        "ซูเปอร์ฮีโร่ในชุดเกราะไฮเทคสีแดงและทอง มีแสงพลังงานสีฟ้าเรืองรองที่หน้าอก สไตล์ไซไฟแห่งอนาคต";
      suggestions = [
        "✨ Yes, go ahead with that",
        "🤖 สร้างเกราะไฮเทคแดงทอง (เลี่ยงลิขสิทธิ์)",
        "🎨 สร้างเกราะสไตล์ออริจินัล",
        "✏️ Edit prompt",
      ];
    } else if (/batman|แบทแมน/i.test(userPrompt)) {
      entityName = "Batman";
      alternativeEn =
        "an original dark vigilante in tactical black armor with a flowing cape, standing atop a gothic skyscraper at night";
      alternativePrompt =
        "An original nocturnal vigilante in matte black tactical armor with a flowing practical cape, standing atop a gargoyle on a gothic cathedral at night";
      samplePromptTh =
        "อัศวินรัตติกาลในชุดเกราะสีดำทมิฬ ผ้าคลุมยาว กำลังยืนตรวจตราบนยอดตึกสูงในเมืองโกธิคยามค่ำคืน";
      suggestions = [
        "✨ Yes, go ahead with that",
        "🦇 สร้างอัศวินรัตติกาล (เลี่ยงลิขสิทธิ์)",
        "🎨 สร้างฮีโร่สไตล์ออริจินัล",
        "✏️ Edit prompt",
      ];
    } else {
      entityName = detectedCharacter || "copyrighted content";
      if (isBackgroundRequest) {
        alternativeEn = `an epic cinematic and atmospheric background inspired by this aesthetic — while keeping the same ${detectedSubjectEn} in front`;
        alternativePrompt = `A stunning cinematic atmospheric background inspired by this aesthetic behind a ${detectedSubjectEn}`;
        samplePromptTh = `ฉากหลังบรรยากาศอลังการสไตล์ออริจินัล โดยมี${detectedSubjectTh}อยู่ด้านหน้า`;
      } else {
        alternativeEn = "an original character with distinctive styling, detailed costume, and heroic atmosphere";
        alternativePrompt = "An original character with detailed creative costume, artistic lighting, and distinct visual personality";
        samplePromptTh = "ตัวละครสไตล์ออริจินัล พร้อมเครื่องแต่งกายและโทนสีที่เป็นเอกลักษณ์";
      }
      suggestions = [
        "✨ Yes, go ahead with that",
        "🎨 สร้างสไตล์ออริจินัล",
        "✏️ Edit prompt",
      ];
    }

    let reply = "";
    if (detectedCharacter || /avenger|endgame|spider|iron|batman/i.test(userPrompt)) {
      if (isBackgroundRequest) {
        reply = `The system blocked the direct reference to *${entityName}* because of copyright/IP policy. I can still give your ${detectedSubjectEn} ${alternativeEn}. Shall I go ahead with that?`;
      } else {
        reply = `The system blocked the direct reference to *${entityName}* because of copyright/IP policy. I can create ${alternativeEn}. Shall I go ahead with that?`;
      }
      reply += `

💡 **คำแนะนำในการแก้ไข:**
1. **หลีกเลี่ยงการระบุชื่อตัวละครหรือแบรนด์ที่มีลิขสิทธิ์โดยตรง**
2. **ใช้การบรรยายลักษณะ รูปร่าง โทนสี และสไตล์แทน** เช่น:
   > *"${samplePromptTh}"*

(ระบบ AI ตรวจพบว่าคำขอเข้าข่ายเนื้อหาที่มีลิขสิทธิ์หรือนโยบายความปลอดภัย (Content Safety & Copyright Policy) เกี่ยวกับตัวละครลิขสิทธิ์ "${detectedCharacter || entityName}")`;
    } else {
      reply = `The system blocked this request because of content safety guidelines. I can create a creative original artwork focusing on aesthetic composition, artistic lighting, and mood. Shall I go ahead with that?`;
      reply += `

💡 **คำแนะนำในการแก้ไข:**
1. **หลีกเลี่ยงการระบุชื่อตัวละครหรือคำที่ติดตัวกรองความปลอดภัย**
2. **ใช้การบรรยายลักษณะ รูปร่าง โทนสี และสไตล์แทน** เช่น:
   > *"${samplePromptTh}"*

(ระบบ AI ตรวจพบว่าคำขอเข้าข่ายเนื้อหาที่มีลิขสิทธิ์หรือนโยบายความปลอดภัย (Content Safety & Copyright Policy) ซึ่งอาจมีคำหรือเนื้อหาที่ตรงกับตัวกรองความปลอดภัยของโมเดล)`;
    }

    return {
      shortReason: detectedCharacter
        ? `ติดนโยบายลิขสิทธิ์ตัวละคร (${detectedCharacter})`
        : "ติดนโยบายความปลอดภัยของโมเดล",
      reply,
      suggestions,
      errorCard,
      alternativePrompt,
    };
  }

  // 2. Authentication / API Key
  if (
    errorLower.includes("auth") ||
    errorLower.includes("credential") ||
    errorLower.includes("api key") ||
    errorLower.includes("token") ||
    errorLower.includes("provider_auth") ||
    errorLower.includes("503")
  ) {
    return {
      shortReason: "ไม่พบการตั้งค่า API Token",
      reply:
        "ไม่สามารถเชื่อมต่อกับ AI Provider ได้ครับ เนื่องจากระบบไม่พบ API Token หรือ Token หมดอายุ กรุณาไปที่หน้า Settings เพื่อตรวจสอบและบันทึก Replicate หรือ Google API Key ของคุณครับ",
      suggestions: ["⚙️ ตรวจสอบการตั้งค่า API Token", "ลองใหม่อีกครั้ง"],
      errorCard: {
        title: "ไม่พบการตั้งค่า API Token",
        description: "กรุณาไปที่หน้า Settings เพื่อตรวจสอบและบันทึก API Token ของคุณ",
        actionText: "⚙️ ตรวจสอบการตั้งค่า API Token",
        promptToEdit: userPrompt,
      },
    };
  }

  // 3. Rate Limit / Quota
  if (
    errorLower.includes("rate limit") ||
    errorLower.includes("429") ||
    errorLower.includes("quota") ||
    errorLower.includes("too many requests")
  ) {
    return {
      shortReason: "คำขอเกินขีดจำกัดชั่วคราว (Rate limit)",
      reply:
        "ขณะนี้ระบบถูกเรียกใช้งานถี่เกินไปจนติดข้อจำกัดอัตราการเรียก (Rate Limit) กรุณารอสักครู่แล้วลองส่งคำขอใหม่อีกครั้งครับ",
      suggestions: ["⏳ ลองใหม่อีกครั้งใน 10 วินาที", "✏️ ปรับปรุงคำขอก่อนส่ง"],
      errorCard: {
        title: "คำขอเกินขีดจำกัดชั่วคราว (Rate limit)",
        description:
          "ระบบถูกเรียกใช้งานถี่เกินไป คุณสามารถปรับแต่งคำขอในช่องพิมพ์แล้วลองส่งใหม่ได้ครับ",
        actionText: "✏️ ปรับปรุงคำขอก่อนส่ง",
        promptToEdit: userPrompt,
      },
    };
  }

  // 4. Provider 502 / Bad Gateway / Overload / Timeout
  if (
    errorLower.includes("502") ||
    errorLower.includes("504") ||
    errorLower.includes("bad gateway") ||
    errorLower.includes("gateway timeout") ||
    errorLower.includes("provider_unavailable") ||
    errorLower.includes("timeout") ||
    errorLower.includes("timed out")
  ) {
    const streamlined = streamlinePromptForImageGen(userPrompt);
    return {
      shortReason: "AI Provider ขัดข้องชั่วคราว (Status 502 / Timeout)",
      reply: `ไม่สามารถสร้างภาพได้สำเร็จครับ: AI Image Studio failed with status 502 (AI Provider ขัดข้องชั่วคราวหรือประมวลผลไม่ทัน)

💡 ระบบได้จัดเตรียมคำขอฉบับปรับปรุงที่ลดความซับซ้อนให้เรียบร้อยแล้ว คุณสามารถกด "✏️ ปรับแต่งคำขอใหม่" เพื่อแก้ไขในช่องพิมพ์ หรือกด "🔄 ลองสร้างใหม่อีกครั้ง" ได้ทันทีครับ`,
      suggestions: ["✏️ ปรับแต่งคำขอใหม่", "🔄 ลองสร้างใหม่อีกครั้ง", "🔍 ตรวจสอบภาพที่เลือกบน Canvas"],
      errorCard: {
        title: "การสร้างภาพไม่สำเร็จ (Status 502)",
        description:
          "เซิร์ฟเวอร์ AI Provider ขัดข้องชั่วคราว หรือคำขอมีความซับซ้อนเกินไป คุณสามารถปรับแต่งคำขอในช่องพิมพ์แล้วลองใหม่อีกครั้ง",
        actionText: "✏️ ปรับแต่งคำขอใหม่",
        promptToEdit: streamlined || userPrompt,
      },
      alternativePrompt: streamlined,
    };
  }

  // 5. Fallback / General Error
  const fallbackStreamlined = streamlinePromptForImageGen(userPrompt);
  return {
    shortReason: "การสร้างภาพไม่สำเร็จ",
    reply: `ไม่สามารถสร้างภาพได้สำเร็จครับ: ${rawError || "เกิดข้อผิดพลาดในการประมวลผลจากโมเดล AI"}

💡 ลองปรับคำบรรยายให้กระชับ ชัดเจนขึ้น หรือตรวจสอบภาพอ้างอิงที่เลือกบน Canvas ครับ`,
    suggestions: ["✏️ ปรับแต่งคำขอใหม่", "🔄 ลองสร้างใหม่อีกครั้ง", "🔍 ตรวจสอบภาพที่เลือกบน Canvas"],
    errorCard: {
      title: "การสร้างภาพไม่สำเร็จ",
      description: `${rawError || "เกิดข้อผิดพลาดในการประมวลผลจากโมเดล AI"} คุณสามารถกดปุ่มด้านล่างเพื่อแก้ไขคำขอในช่องพิมพ์`,
      actionText: "✏️ ปรับแต่งคำขอใหม่",
      promptToEdit: fallbackStreamlined || userPrompt,
    },
    alternativePrompt: fallbackStreamlined,
  };
}
