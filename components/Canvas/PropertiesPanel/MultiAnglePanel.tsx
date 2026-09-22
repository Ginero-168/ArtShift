"use client";

import { useEffect, useRef, useState } from "react";
import { type AIProgressStatus, reportAIProgress, reportAIResult } from "@/lib/ai/progressReporter";
import {
  DEFAULT_MULTI_ANGLE_GO_FAST,
  DEFAULT_MULTI_ANGLE_LORA_SCALE,
  DEFAULT_MULTI_ANGLE_LORA_WEIGHTS,
  DEFAULT_MULTI_ANGLE_OUTPUT_FORMAT,
  DEFAULT_MULTI_ANGLE_OUTPUT_QUALITY,
  DEFAULT_MULTI_ANGLE_TRUE_GUIDANCE_SCALE,
  MULTI_ANGLE_ASPECT_RATIOS,
  MULTI_ANGLE_OUTPUT_FORMATS,
  type MultiAngleAspectRatio,
  type MultiAngleOutputFormat,
} from "@/lib/ai-runtime/contracts";
import { createImage } from "@/lib/engine/factory";
import { getCached, loadDataURL, preloadDataURL } from "@/lib/engine/imageCache";
import {
  getProcessingPreviewBounds,
  getProcessingPreviewPlacement,
  updateProcessingPreview,
} from "@/lib/engine/processingPreview";
import {
  cancelProcessingJob,
  enqueueProcessingJob,
  type ProcessingJobContext,
} from "@/lib/engine/processingQueue";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import {
  clampMultiAngleCamera,
  DEFAULT_MULTI_ANGLE_CAMERA,
  type MultiAngleCamera,
} from "@/lib/image/multiAngleCamera";
import { createCachedImageAsset } from "@/lib/vision/extractedImageAsset";
import { preloadLayerSource } from "@/lib/vision/layerPreload";
import { MULTI_ANGLE_LABEL } from "./imageToolTypes";
import { MultiAnglePreview } from "./MultiAnglePreview";

const FIELD_LABEL = {
  display: "block",
  marginTop: 8,
  color: "#334155",
  fontSize: 9,
  fontWeight: 700,
} as const;

export function MultiAnglePanel({ element }: { element: ImageElement }) {
  const addElement = useEngine((state) => state.addElement);
  const selectOnly = useEngine((state) => state.selectOnly);
  const [camera, setCamera] = useState<MultiAngleCamera>(DEFAULT_MULTI_ANGLE_CAMERA);
  const [prompt, setPrompt] = useState("");
  const [goFast, setGoFast] = useState<boolean>(DEFAULT_MULTI_ANGLE_GO_FAST);
  const [loraWeights, setLoraWeights] = useState(DEFAULT_MULTI_ANGLE_LORA_WEIGHTS);
  const [loraScale, setLoraScale] = useState(DEFAULT_MULTI_ANGLE_LORA_SCALE);
  const [trueGuidanceScale, setTrueGuidanceScale] = useState(
    DEFAULT_MULTI_ANGLE_TRUE_GUIDANCE_SCALE,
  );
  const [inferenceSteps, setInferenceSteps] = useState("");
  const [aspectRatio, setAspectRatio] = useState<MultiAngleAspectRatio>("match_input_image");
  const [seed, setSeed] = useState("");
  const [outputFormat, setOutputFormat] = useState<MultiAngleOutputFormat>(
    DEFAULT_MULTI_ANGLE_OUTPUT_FORMAT,
  );
  const [outputQuality, setOutputQuality] = useState(DEFAULT_MULTI_ANGLE_OUTPUT_QUALITY);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const processingJobIdRef = useRef<string | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useEffect(() => {
    void preloadLayerSource(element.fileId);
  }, [element.fileId]);

  const updateCamera = (next: MultiAngleCamera) => {
    setCamera(clampMultiAngleCamera(next));
  };

  const handleRun = async (queuedContext?: ProcessingJobContext, launch?: MultiAngleLaunch) => {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      setStatusMessage("Image data not found in cache");
      return;
    }
    const parsedSeed = launch ? launch.seed : parseOptionalSeed(seed);
    if (parsedSeed === "invalid") {
      setStatusMessage("Seed must be an integer from 0 to 2147483647.");
      return;
    }
    const parsedSteps = launch ? launch.numInferenceSteps : parseOptionalSteps(inferenceSteps);
    if (parsedSteps === "invalid") {
      setStatusMessage("Inference steps must be an integer from 1 to 40, or left blank.");
      return;
    }

    if (!queuedContext) {
      await preloadLayerSource(element.fileId);
      const preloaded = await preloadDataURL(cached.dataURL);
      if (
        !window.confirm(
          "Multi-Angle จะส่งภาพนี้ไปยัง Replicate (qwen/qwen-edit-multiangle) เพื่อแก้มุมกล้อง และอาจมีค่าใช้จ่ายตามบัญชี Replicate ดำเนินการต่อหรือไม่?",
        )
      ) {
        return;
      }
      const launch = {
        camera: cameraRef.current,
        prompt: prompt.trim(),
        goFast,
        loraWeights,
        loraScale,
        trueGuidanceScale,
        numInferenceSteps: parsedSteps,
        aspectRatio,
        seed: parsedSeed,
        outputFormat,
        outputQuality,
      };
      const job = enqueueProcessingJob({
        preview: {
          ...getProcessingPreviewBounds(element),
          kind: "multi-angle",
          label: MULTI_ANGLE_LABEL,
          progress: 0,
          message: "กำลังเตรียมผลลัพธ์…",
          sourceDataUrl: preloaded.dataURL,
        },
        run: (context) => handleRun(context, launch),
      });
      processingJobIdRef.current = job.id;
      setBusy(true);
      try {
        await job.promise;
      } finally {
        if (processingJobIdRef.current === job.id) processingJobIdRef.current = null;
        setBusy(false);
      }
      return;
    }

    const { id: previewId, signal } = queuedContext;
    const settings = launch?.camera ?? cameraRef.current;
    const requestPrompt = launch?.prompt ?? prompt.trim();
    const requestGoFast = launch?.goFast ?? goFast;
    const requestLoraWeights = launch?.loraWeights ?? loraWeights;
    const requestLoraScale = launch?.loraScale ?? loraScale;
    const requestGuidance = launch?.trueGuidanceScale ?? trueGuidanceScale;
    const requestSteps = launch ? launch.numInferenceSteps : parsedSteps;
    const requestAspect = launch?.aspectRatio ?? aspectRatio;
    const requestSeed = launch ? launch.seed : parsedSeed;
    const requestFormat = launch?.outputFormat ?? outputFormat;
    const requestQuality = launch?.outputQuality ?? outputQuality;
    setBusy(true);
    updateProcessingPreview(previewId, {
      progress: 0.05,
      message: "กำลังเตรียมภาพต้นฉบับสำหรับ Multi-Angle…",
    });
    const report = createProgressReporter("Multi-Angle");
    report("preload", "เตรียมภาพต้นฉบับแล้ว", "started", 0.05);

    try {
      const source = getCached(element.fileId) ?? cached;
      setStatusMessage("Sending image to Qwen Edit Multi-Angle...");
      updateProcessingPreview(previewId, {
        progress: 0.12,
        message: "กำลังส่งภาพไปยัง Qwen Edit Multi-Angle…",
      });
      report("consent", "ผู้ใช้ยืนยันการส่งภาพไป Replicate เพื่อแก้มุมกล้อง", "step", 0.12);
      const response = await fetch("/api/multi-angle", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          task: "image.multiAngle",
          input: {
            image: {
              dataUrl: source.dataURL,
              mimeType: source.dataURL
                .match(/^data:(image\/(?:jpeg|png|webp));/i)?.[1]
                ?.toLowerCase(),
            },
            width: source.width,
            height: source.height,
            rotateDegrees: settings.rotateDegrees,
            moveForward: settings.moveForward,
            verticalTilt: settings.verticalTilt,
            useWideAngle: settings.useWideAngle,
            ...(requestPrompt ? { prompt: requestPrompt } : {}),
            goFast: requestGoFast,
            ...(requestSteps === undefined ? {} : { numInferenceSteps: requestSteps }),
            loraWeights: requestLoraWeights.trim() || DEFAULT_MULTI_ANGLE_LORA_WEIGHTS,
            loraScale: requestLoraScale,
            trueGuidanceScale: requestGuidance,
            aspectRatio: requestAspect,
            ...(requestSeed === undefined ? {} : { seed: requestSeed }),
            outputFormat: requestFormat,
            outputQuality: requestQuality,
          },
          options: {
            profile: "quality",
            provider: "replicate",
            modelAlias: "qwen-edit-multiangle",
            cloudConsent: true,
            allowFallback: false,
            timeoutMs: 120_000,
            cache: false,
          },
        }),
        signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        execution?: { output?: { dataUrl?: unknown } };
        error?: { message?: unknown } | string;
      } | null;
      if (!response.ok) {
        const providerError =
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.error?.message === "string"
              ? payload.error.message
              : "Multi-Angle request failed.";
        throw new Error(providerError);
      }
      const resultDataUrl = payload?.execution?.output?.dataUrl;
      if (
        typeof resultDataUrl !== "string" ||
        !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(resultDataUrl)
      ) {
        throw new Error("Multi-Angle returned no valid image output.");
      }
      if (signal.aborted) return;

      setStatusMessage("Loading the new camera angle...");
      updateProcessingPreview(previewId, {
        progress: 0.82,
        message: "กำลังโหลดผลลัพธ์และเตรียมวางบน Preload…",
      });
      const resultCached = await loadDataURL(resultDataUrl);
      if (signal.aborted) return;
      const placement = getProcessingPreviewPlacement(
        previewId,
        getProcessingPreviewBounds(element),
      );
      const outputAspect = resultCached.width / Math.max(1, resultCached.height);
      const resultImage = {
        ...createImage({
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: Math.max(8, Math.round(placement.width / outputAspect)),
          ...createCachedImageAsset(resultCached),
        }),
        angle: element.angle,
        flipX: element.flipX,
        flipY: element.flipY,
        sourceName: element.sourceName ? `${element.sourceName} · Multi-Angle` : "Multi-Angle",
      };
      updateProcessingPreview(previewId, {
        progress: 0.95,
        message: "กำลังวางผลลัพธ์ลงบน Canvas…",
      });
      addElement(resultImage, "multi-angle camera edit");
      selectOnly([resultImage.id]);
      setStatusMessage("Multi-Angle completed on the Preload card.");
      report("complete", "Multi-Angle สำเร็จและคงภาพต้นฉบับไว้", "success", 100);
    } catch (error) {
      if (signal.aborted || (error as Error).name === "AbortError") {
        setStatusMessage("Multi-Angle cancelled.");
      } else {
        const message = error instanceof Error ? error.message : "Unknown Multi-Angle error.";
        setStatusMessage(`Multi-Angle error: ${message}`);
        report("error", `Multi-Angle ไม่สำเร็จ: ${message}`, "error");
        window.alert(`Multi-Angle ไม่สำเร็จ: ${message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="multi-angle-panel" data-tool="multi-angle">
      <strong style={{ display: "block", color: "#1e1b4b", fontSize: 11 }}>Multi-Angle</strong>
      <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 8.5 }}>
        Camera control for Qwen Edit. Drag the scene to set the camera. This is not the AI result.
      </span>
      <div style={{ marginTop: 8 }}>
        <MultiAnglePreview camera={camera} onCameraChange={updateCamera} />
      </div>
      <span style={{ display: "block", marginTop: 4, color: "#94a3b8", fontSize: 8 }}>
        Drag to orbit · scroll to move closer · arrow keys nudge
      </span>

      <Slider
        id="multi-angle-rotate"
        label="Rotate"
        hint="±90 · positive turns the camera left"
        min={-90}
        max={90}
        step={1}
        value={camera.rotateDegrees}
        suffix="°"
        onChange={(value) => updateCamera({ ...camera, rotateDegrees: value })}
      />
      <Slider
        id="multi-angle-forward"
        label="Move forward"
        hint="0 stays back · 10 is a close-up"
        min={0}
        max={10}
        step={1}
        value={camera.moveForward}
        onChange={(value) => updateCamera({ ...camera, moveForward: value })}
      />
      <Slider
        id="multi-angle-tilt"
        label="Vertical tilt"
        hint="Three positions only: −1 top-down · 0 eye level · +1 low angle"
        min={-1}
        max={1}
        step={1}
        value={camera.verticalTilt}
        onChange={(value) => updateCamera({ ...camera, verticalTilt: value })}
      />
      <label
        htmlFor="multi-angle-wide"
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 10 }}
      >
        <input
          id="multi-angle-wide"
          type="checkbox"
          checked={camera.useWideAngle}
          onChange={(event) => updateCamera({ ...camera, useWideAngle: event.target.checked })}
        />
        Wide angle
      </label>

      <label htmlFor="multi-angle-prompt" style={FIELD_LABEL}>
        Prompt
      </label>
      <textarea
        id="multi-angle-prompt"
        aria-label="Prompt"
        value={prompt}
        maxLength={2000}
        rows={2}
        placeholder="Optional. Lighting or style only — the camera sliders drive the angle."
        onChange={(event) => setPrompt(event.target.value)}
        style={controlStyle}
      />

      <label
        htmlFor="multi-angle-fast"
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 10 }}
      >
        <input
          id="multi-angle-fast"
          type="checkbox"
          checked={goFast}
          onChange={(event) => setGoFast(event.target.checked)}
        />
        Lightning (go fast)
      </label>
      <span style={{ display: "block", color: "#94a3b8", fontSize: 8 }}>
        Leave steps blank and Lightning uses about 4 steps. Detailed uses about 40.
      </span>
      <label htmlFor="multi-angle-steps" style={FIELD_LABEL}>
        Inference steps
      </label>
      <input
        id="multi-angle-steps"
        aria-label="Inference steps"
        inputMode="numeric"
        placeholder="Optional. Blank lets Lightning choose."
        value={inferenceSteps}
        onChange={(event) => setInferenceSteps(event.target.value)}
        style={controlStyle}
      />
      <label htmlFor="multi-angle-lora-weights" style={FIELD_LABEL}>
        LoRA weights
      </label>
      <input
        id="multi-angle-lora-weights"
        aria-label="LoRA weights"
        value={loraWeights}
        maxLength={200}
        onChange={(event) => setLoraWeights(event.target.value)}
        style={controlStyle}
      />
      <Slider
        id="multi-angle-lora-scale"
        label="LoRA scale"
        hint="0–4 · default 1.25"
        min={0}
        max={4}
        step={0.05}
        value={loraScale}
        onChange={setLoraScale}
      />
      <Slider
        id="multi-angle-guidance"
        label="True guidance scale"
        hint="0–10 · default 1"
        min={0}
        max={10}
        step={0.1}
        value={trueGuidanceScale}
        onChange={setTrueGuidanceScale}
      />

      <label htmlFor="multi-angle-aspect" style={FIELD_LABEL}>
        Aspect ratio
      </label>
      <select
        id="multi-angle-aspect"
        aria-label="Aspect ratio"
        value={aspectRatio}
        onChange={(event) => setAspectRatio(event.target.value as MultiAngleAspectRatio)}
        style={controlStyle}
      >
        {MULTI_ANGLE_ASPECT_RATIOS.map((ratio) => (
          <option key={ratio} value={ratio}>
            {ratio === "match_input_image" ? "Match input image" : ratio}
          </option>
        ))}
      </select>

      <label htmlFor="multi-angle-seed" style={FIELD_LABEL}>
        Seed
      </label>
      <input
        id="multi-angle-seed"
        aria-label="Seed"
        inputMode="numeric"
        placeholder="Optional"
        value={seed}
        onChange={(event) => setSeed(event.target.value)}
        style={controlStyle}
      />

      <label htmlFor="multi-angle-format" style={FIELD_LABEL}>
        Output format
      </label>
      <select
        id="multi-angle-format"
        aria-label="Output format"
        value={outputFormat}
        onChange={(event) => setOutputFormat(event.target.value as MultiAngleOutputFormat)}
        style={controlStyle}
      >
        {MULTI_ANGLE_OUTPUT_FORMATS.map((format) => (
          <option key={format} value={format}>
            {format}
          </option>
        ))}
      </select>
      <Slider
        id="multi-angle-quality"
        label="Output quality"
        hint={outputFormat === "png" ? "Ignored for PNG" : "0–100, used for WebP and JPEG"}
        min={0}
        max={100}
        step={1}
        value={outputQuality}
        disabled={outputFormat === "png"}
        onChange={setOutputQuality}
      />

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          type="button"
          disabled={busy}
          aria-label="Run Multi-Angle"
          onClick={() => void handleRun()}
          style={{
            flex: 1,
            padding: "7px 8px",
            border: "none",
            borderRadius: 6,
            background: "#4f46e5",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Processing..." : "Run Multi-Angle"}
        </button>
        {processingJobIdRef.current ? (
          <button
            type="button"
            aria-label="Cancel Multi-Angle"
            onClick={() => {
              if (processingJobIdRef.current) cancelProcessingJob(processingJobIdRef.current);
            }}
            style={{
              padding: "7px 8px",
              borderRadius: 6,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#be123c",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>
      {statusMessage ? (
        <span
          role="status"
          style={{ display: "block", marginTop: 6, color: "#64748b", fontSize: 8.5 }}
        >
          {statusMessage}
        </span>
      ) : null}
    </div>
  );
}

type MultiAngleLaunch = {
  camera: MultiAngleCamera;
  prompt: string;
  goFast: boolean;
  loraWeights: string;
  loraScale: number;
  trueGuidanceScale: number;
  numInferenceSteps: number | undefined;
  aspectRatio: MultiAngleAspectRatio;
  seed: number | undefined;
  outputFormat: MultiAngleOutputFormat;
  outputQuality: number;
};

function Slider({
  id,
  label,
  hint,
  min,
  max,
  step,
  value,
  suffix,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const shown = Number.isInteger(step) ? String(value) : value.toFixed(2);
  return (
    <div>
      <label htmlFor={id} style={FIELD_LABEL}>
        {label}
        <span style={{ float: "right", fontWeight: 600, color: "#0f172a" }}>
          {shown}
          {suffix ?? ""}
        </span>
      </label>
      <input
        id={id}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: "100%", marginTop: 2, accentColor: "#4f46e5" }}
      />
      {hint ? (
        <span style={{ display: "block", color: "#94a3b8", fontSize: 8 }}>{hint}</span>
      ) : null}
    </div>
  );
}

const controlStyle = {
  width: "100%",
  marginTop: 4,
  padding: "6px 7px",
  border: "1px solid #cbd5e1",
  borderRadius: 5,
  background: "#fff",
  color: "#0f172a",
  fontSize: 10,
  fontFamily: "inherit",
  boxSizing: "border-box" as const,
};

function parseOptionalSteps(value: string): number | undefined | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 40) return "invalid";
  return parsed;
}

function parseOptionalSeed(value: string): number | undefined | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed > 2_147_483_647) return "invalid";
  return parsed;
}

function createProgressReporter(operation: string) {
  const taskId = crypto.randomUUID();
  const report = (
    stage: string,
    message: string,
    status: AIProgressStatus = "step",
    progress?: number,
  ) => {
    reportAIProgress({ taskId, operation, stage, message, status, progress });
  };
  return Object.assign(report, {
    result: (message: string) => reportAIResult({ taskId, operation, message }),
  });
}
