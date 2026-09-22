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
  marginTop: 6,
  color: "#334155",
  fontSize: 9,
  fontWeight: 700,
} as const;

export function MultiAnglePanel({ element }: { element: ImageElement }) {
  const addElement = useEngine((state) => state.addElement);
  const selectOnly = useEngine((state) => state.selectOnly);
  const [camera, setCamera] = useState<MultiAngleCamera>(DEFAULT_MULTI_ANGLE_CAMERA);
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

    if (!queuedContext) {
      await preloadLayerSource(element.fileId);
      const preloaded = await preloadDataURL(cached.dataURL);
      if (
        !window.confirm(
          "Multi-Angle จะส่งภาพนี้ไปยัง Replicate (qwen/qwen-edit-multiangle) เพื่อเปลี่ยนมุมของวัตถุ และอาจมีค่าใช้จ่ายตามบัญชี Replicate ดำเนินการต่อหรือไม่?",
        )
      ) {
        return;
      }
      const nextLaunch = { camera: cameraRef.current };
      const job = enqueueProcessingJob({
        preview: {
          ...getProcessingPreviewBounds(element),
          kind: "multi-angle",
          label: MULTI_ANGLE_LABEL,
          progress: 0,
          message: "กำลังเตรียมผลลัพธ์…",
          sourceDataUrl: preloaded.dataURL,
        },
        run: (context) => handleRun(context, nextLaunch),
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
      report("consent", "ผู้ใช้ยืนยันการส่งภาพไป Replicate เพื่อเปลี่ยนมุม", "step", 0.12);
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
            // Object turn → camera inputs. Yaw is rotate_degrees, the
            // Vertical tilt slider (and preview drag) sets vertical_tilt,
            // and dolly stays at the hidden default.
            rotateDegrees: settings.rotateDegrees,
            moveForward: DEFAULT_MULTI_ANGLE_CAMERA.moveForward,
            verticalTilt: settings.verticalTilt,
            useWideAngle: settings.useWideAngle,
            goFast: DEFAULT_MULTI_ANGLE_GO_FAST,
            loraWeights: DEFAULT_MULTI_ANGLE_LORA_WEIGHTS,
            loraScale: DEFAULT_MULTI_ANGLE_LORA_SCALE,
            trueGuidanceScale: DEFAULT_MULTI_ANGLE_TRUE_GUIDANCE_SCALE,
            aspectRatio: "match_input_image",
            outputFormat: DEFAULT_MULTI_ANGLE_OUTPUT_FORMAT,
            outputQuality: DEFAULT_MULTI_ANGLE_OUTPUT_QUALITY,
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

      setStatusMessage("Loading the new angle...");
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
        Turn the object to set the angle. This is not the AI result.
      </span>
      <div style={{ marginTop: 6 }}>
        <MultiAnglePreview camera={camera} onCameraChange={updateCamera} />
      </div>
      <span
        id="multi-angle-gesture-hint"
        style={{ display: "block", marginTop: 4, color: "#94a3b8", fontSize: 8 }}
      >
        Drag sideways to turn the object. Drag up or down to tip it.
      </span>

      <Slider
        id="multi-angle-rotate"
        label="Angle"
        hint="±90 · positive turns the object to the right"
        min={-90}
        max={90}
        step={1}
        value={camera.rotateDegrees}
        suffix="°"
        onChange={(value) => updateCamera({ ...camera, rotateDegrees: value })}
      />
      <Slider
        id="multi-angle-tilt"
        label="Vertical tilt"
        hint="−1 to +1 · positive raises the front"
        min={-1}
        max={1}
        step={1}
        value={camera.verticalTilt}
        onChange={(value) => updateCamera({ ...camera, verticalTilt: value })}
      />
      <label
        htmlFor="multi-angle-wide"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 8,
          color: "#0f172a",
          fontSize: 10,
        }}
      >
        <input
          id="multi-angle-wide"
          type="checkbox"
          checked={camera.useWideAngle}
          onChange={(event) => updateCamera({ ...camera, useWideAngle: event.target.checked })}
          style={{ accentColor: "#4f46e5" }}
        />
        Wide angle
      </label>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 1,
          display: "flex",
          gap: 6,
          marginTop: 8,
          paddingTop: 6,
          background: "var(--surface-solid, #fff)",
        }}
      >
        <button
          type="button"
          disabled={busy}
          aria-label="Generate Multi-Angle"
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
          {busy ? "Processing..." : "Generate"}
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
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: "100%", marginTop: 2, accentColor: "#4f46e5" }}
      />
      {hint ? (
        <span style={{ display: "block", color: "#94a3b8", fontSize: 8 }}>{hint}</span>
      ) : null}
    </div>
  );
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
