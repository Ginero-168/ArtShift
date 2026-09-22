export const AI_TASK_KINDS = [
  "assistant.chat",
  "vision.describe",
  "vision.propose",
  "vision.ocr",
  "vectorize.recraft",
  "prompt.enhance",
  "image.generate",
  "image.upscale",
  "image.decomposeLayers",
  "image.multiAngle",
  "image.poseSkeleton",
] as const;

export type AiTaskKind = (typeof AI_TASK_KINDS)[number];
export type AiExecutionProfile = "local" | "economy" | "quality";
export type AiProviderId = "anthropic" | "google" | "openai" | "replicate" | "mock";

export type AiTextContent = { type: "text"; text: string };
export type AiToolCallContent = {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type AiToolResultContent = {
  type: "tool_result";
  toolCallId: string;
  content: string;
  isError?: boolean;
};
export type AiChatContent = AiTextContent | AiToolCallContent | AiToolResultContent;

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string | AiChatContent[];
};

export type AiToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AiAssistantChatInput = {
  messages: AiChatMessage[];
  system?: string;
  tools?: AiToolDefinition[];
  maxTokens?: number;
};

export type AiAssistantChatOutput = {
  text: string;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "unknown";
  assistantMessage: AiChatMessage;
  toolCalls: AiToolCallContent[];
};

export type AiImageInput = {
  dataUrl: string;
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
};

export type AiVisionInput = {
  image: AiImageInput;
  prompt?: string;
  language?: string;
};

export type AiVectorizeInput = {
  image: AiImageInput;
  width: number;
  height: number;
};

export type AiVectorizeOutput = {
  svg: string;
};

export type AiObjectProposal = {
  label: string;
  confidence?: number;
  /** Normalized coordinates in the inclusive 0..1 range. */
  box: { x: number; y: number; width: number; height: number };
};

export type AiVisionTextOutput = {
  text: string;
};

export type AiVisionProposalOutput = {
  text: string;
  objects: AiObjectProposal[];
};

export type AiPromptEnhanceInput = {
  prompt: string;
  purpose?: "image" | "design" | "general";
};

export type AiPromptEnhanceOutput = {
  prompt: string;
};

export const AI_NAMED_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:1",
  "1:3",
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1536x1152",
  "1152x1536",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "2048x688",
  "688x2048",
  "3840x2160",
  "2160x3840",
] as const;

export type AiNamedImageAspectRatio = (typeof AI_NAMED_IMAGE_ASPECT_RATIOS)[number];

/** Named ratio, preset size, or any custom WIDTHxHEIGHT accepted by GPT Image. */
export type AiImageAspectRatio = AiNamedImageAspectRatio | (string & {});

export function isAllowedImageAspectRatio(value: string): boolean {
  if ((AI_NAMED_IMAGE_ASPECT_RATIOS as readonly string[]).includes(value)) return true;
  return /^\d{2,5}x\d{2,5}$/i.test(value.trim());
}

/**
 * Render quality for image generation — distinct from AiExecutionProfile.
 * xhigh and max are only supported by GPT Image 2.5 models (Flare, Sunburst).
 */
export type AiImageRenderQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export type AiImageGenerateInput = {
  prompt: string;
  width: number;
  height: number;
  aspectRatio?: AiImageAspectRatio;
  /** Render quality sent to the image model. Defaults to "medium" for general generation. */
  quality?: AiImageRenderQuality;
  /** Semantic model alias resolved server-side. Client must not send raw model slugs. */
  modelAlias?: string;
  /** Background mode. Defaults to "opaque". */
  background?: "auto" | "opaque" | "transparent";
  inputImages?: AiImageInput[];
  /**
   * Optional RGBA mask for OpenAI `/images/edits` (α=0 = edit region).
   * Ignored on providers that do not support masks (e.g. Replicate GPT Image).
   */
  mask?: AiImageInput;
  cloudConsent?: boolean;
  enhance?: boolean;
  seed?: number;
};

export type AiImageGenerateOutput = {
  dataUrl: string;
  prompt: string;
  width: number;
  height: number;
  seed: number;
};

export const UPSCALE_RESOLUTION_PRESETS = [
  { value: "2k", label: "2K", rangeLabel: "4–8 MP", targetMegapixels: 8 },
  { value: "4k", label: "4K", rangeLabel: "8–16 MP", targetMegapixels: 16 },
  { value: "8k", label: "8K", rangeLabel: "16–32 MP", targetMegapixels: 32 },
] as const;

export type UpscaleResolutionPreset = (typeof UPSCALE_RESOLUTION_PRESETS)[number]["value"];
export type UpscaleTargetMegapixels =
  (typeof UPSCALE_RESOLUTION_PRESETS)[number]["targetMegapixels"];

export function getUpscaleTargetMegapixels(
  preset: UpscaleResolutionPreset,
): UpscaleTargetMegapixels {
  return UPSCALE_RESOLUTION_PRESETS.find((option) => option.value === preset)!.targetMegapixels;
}

export type AiImageUpscaleInput = {
  image: AiImageInput;
  width: number;
  height: number;
  targetMegapixels: UpscaleTargetMegapixels;
};

export type AiImageUpscaleOutput = {
  dataUrl: string;
};

/**
 * Bounds for Replicate `qwen/qwen-image-layered` input `num_layers`.
 * Live schema: integer, minimum 2, maximum 8, default 4.
 */
export const DEFAULT_DECOMPOSE_LAYERS = 4;
export const DECOMPOSE_LAYERS_MIN = 2;
export const DECOMPOSE_LAYERS_MAX = 8;

export type DecomposeLayerCountResolution =
  | { status: "valid"; value: number }
  | { status: "clamped"; value: number; entered: number }
  | { status: "invalid" };

/** Interpret a Layer-count draft against `num_layers` (integer 2–8). */
export function resolveDecomposeLayerCount(raw: string): DecomposeLayerCountResolution {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { status: "invalid" };
  const entered = Number(trimmed);
  if (!Number.isSafeInteger(entered)) return { status: "invalid" };
  if (entered < DECOMPOSE_LAYERS_MIN || entered > DECOMPOSE_LAYERS_MAX) {
    return {
      status: "clamped",
      entered,
      value: Math.min(DECOMPOSE_LAYERS_MAX, Math.max(DECOMPOSE_LAYERS_MIN, entered)),
    };
  }
  return { status: "valid", value: entered };
}

export function describeDecomposeLayerCountIssue(
  resolution: Exclude<DecomposeLayerCountResolution, { status: "valid" }>,
  committed = false,
): string {
  if (resolution.status === "clamped") {
    const range = `Qwen Image Layered accepts ${DECOMPOSE_LAYERS_MIN}–${DECOMPOSE_LAYERS_MAX} layers.`;
    return committed ? `Adjusted to ${resolution.value}. ${range}` : range;
  }
  return `Enter a whole number from ${DECOMPOSE_LAYERS_MIN} to ${DECOMPOSE_LAYERS_MAX}.`;
}

export type AiImageDecomposeLayersInput = {
  image: AiImageInput;
  width: number;
  height: number;
  /** Number of RGBA layers to request (2–8). Defaults to 4. */
  numLayers?: number;
  /** Optional caption that describes overall image content for the model. */
  prompt?: string;
};

export type AiImageDecomposeLayersOutput = {
  /** Background-first RGBA PNG data URLs (index 0 = bottom layer). */
  layers: Array<{ dataUrl: string }>;
};

/** Camera and output bounds for `qwen/qwen-edit-multiangle`. */
export const MULTI_ANGLE_ASPECT_RATIOS = [
  "match_input_image",
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
] as const;
export type MultiAngleAspectRatio = (typeof MULTI_ANGLE_ASPECT_RATIOS)[number];

export const MULTI_ANGLE_OUTPUT_FORMATS = ["webp", "jpg", "png"] as const;
export type MultiAngleOutputFormat = (typeof MULTI_ANGLE_OUTPUT_FORMATS)[number];

export const DEFAULT_MULTI_ANGLE_GO_FAST = true;
export const DEFAULT_MULTI_ANGLE_LORA_WEIGHTS = "dx8152/Qwen-Edit-2509-Multiple-angles";
/** 0–4. Live schema default is 1.25, not the README strength of 1. */
export const DEFAULT_MULTI_ANGLE_LORA_SCALE = 1.25;
export const DEFAULT_MULTI_ANGLE_TRUE_GUIDANCE_SCALE = 1;
/** PNG so a returned alpha channel survives. The model ignores quality for PNG. */
export const DEFAULT_MULTI_ANGLE_OUTPUT_FORMAT: MultiAngleOutputFormat = "png";
export const DEFAULT_MULTI_ANGLE_OUTPUT_QUALITY = 95;

export type AiImageMultiAngleInput = {
  image: AiImageInput;
  width: number;
  height: number;
  /** ±90. Positive rotates the camera left. */
  rotateDegrees: number;
  /** 0–10. Higher values push the camera closer. */
  moveForward: number;
  /** -1 top-down, 0 eye level, +1 low angle. */
  verticalTilt: number;
  useWideAngle: boolean;
  prompt?: string;
  goFast?: boolean;
  /**
   * 1–40. Omit so `go_fast` picks the step count (about 4 when fast, about 40 when detailed).
   */
  numInferenceSteps?: number;
  /** Hugging Face LoRA repo. Blank falls back to the official multiple-angles weights. */
  loraWeights?: string;
  /** 0–4. Default 1.25. */
  loraScale?: number;
  /** 0–10. Default 1. */
  trueGuidanceScale?: number;
  aspectRatio?: MultiAngleAspectRatio;
  seed?: number;
  outputFormat?: MultiAngleOutputFormat;
  /** 0–100. Ignored by the model for PNG. */
  outputQuality?: number;
};

export type AiImageMultiAngleOutput = {
  dataUrl: string;
};

/**
 * Bounds for Replicate `ultralytics/yolo26-pose`.
 * Live schema: model_size n/s/m/l/x (default n), conf 0–1 (default 0.25),
 * iou 0–1 (default 0.45), imgsz one of 320/416/512/640/832/1024/1280 (default 640).
 * COCO-17 keypoints come back in `json_str` when `return_json` is true.
 */
export const YOLO_POSE_MODEL_SIZES = ["n", "s", "m", "l", "x"] as const;
export type YoloPoseModelSize = (typeof YOLO_POSE_MODEL_SIZES)[number];
export const DEFAULT_YOLO_POSE_MODEL_SIZE: YoloPoseModelSize = "n";
export const DEFAULT_YOLO_POSE_CONF = 0.25;
export const DEFAULT_YOLO_POSE_IOU = 0.45;
export const DEFAULT_YOLO_POSE_IMGSZ = 640;

export type AiPoseLandmark = {
  /** Normalized 0..1 in the source image, origin at the top left. */
  x: number;
  y: number;
  /** Keypoint confidence. Values below the skeleton threshold are not drawn. */
  visibility: number;
};

export type AiImagePoseSkeletonInput = {
  image: AiImageInput;
  width: number;
  height: number;
  /** YOLO26 pose size. Defaults to nano. */
  modelSize?: YoloPoseModelSize;
};

export type AiImagePoseSkeletonOutput = {
  /** Highest-confidence people first. Empty when the model finds nobody. */
  poses: Array<{
    landmarks: AiPoseLandmark[];
    confidence: number;
  }>;
};

export type AiTaskInputMap = {
  "assistant.chat": AiAssistantChatInput;
  "vision.describe": AiVisionInput;
  "vision.propose": AiVisionInput;
  "vision.ocr": AiVisionInput;
  "vectorize.recraft": AiVectorizeInput;
  "prompt.enhance": AiPromptEnhanceInput;
  "image.generate": AiImageGenerateInput;
  "image.upscale": AiImageUpscaleInput;
  "image.decomposeLayers": AiImageDecomposeLayersInput;
  "image.multiAngle": AiImageMultiAngleInput;
  "image.poseSkeleton": AiImagePoseSkeletonInput;
};

export type AiTaskOutputMap = {
  "assistant.chat": AiAssistantChatOutput;
  "vision.describe": AiVisionTextOutput;
  "vision.propose": AiVisionProposalOutput;
  "vision.ocr": AiVisionTextOutput;
  "vectorize.recraft": AiVectorizeOutput;
  "prompt.enhance": AiPromptEnhanceOutput;
  "image.generate": AiImageGenerateOutput;
  "image.upscale": AiImageUpscaleOutput;
  "image.decomposeLayers": AiImageDecomposeLayersOutput;
  "image.multiAngle": AiImageMultiAngleOutput;
  "image.poseSkeleton": AiImagePoseSkeletonOutput;
};

export type AiTaskInput<K extends AiTaskKind> = AiTaskInputMap[K];
export type AiTaskOutput<K extends AiTaskKind> = AiTaskOutputMap[K];

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  providerSeconds?: number;
  estimatedUsd?: number;
};

export type AiExecutionMetadata = {
  task: AiTaskKind;
  provider: AiProviderId;
  model: string;
  modelAlias?: string;
  requestId?: string;
  finishReason?: string;
  durationMs: number;
  usage: AiUsage;
  cached: boolean;
  warnings: string[];
};

export type AiExecution<T> = {
  output: T;
  metadata: AiExecutionMetadata;
};

export type AiExecutionOptions = {
  profile?: AiExecutionProfile;
  provider?: AiProviderId;
  modelAlias?: string;
  /** Required for cloud-opt-in tasks. A user action should set this explicitly. */
  cloudConsent?: boolean;
  /** Disabled by default so a paid fallback is never hidden from the user. */
  allowFallback?: boolean;
  timeoutMs?: number;
  maxCostUsd?: number;
  cache?: boolean;
  /** Internal server scope; public clients must never be allowed to set this. */
  accountId?: string;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  reasoning?: {
    mode?: "off" | "fixed" | "dynamic";
    budgetTokens?: number;
  };
};

export type AiProviderStatus = {
  id: AiProviderId;
  label: string;
  configured: boolean;
  state: "ready" | "missing-key" | "disabled" | "degraded";
  tasks: AiTaskKind[];
  models: Array<{
    id: string;
    alias?: string;
    profile: AiExecutionProfile;
    pricing?: AiModelPricing;
  }>;
  message?: string;
};

export type AiCapabilities = {
  tasks: Record<AiTaskKind, { locality: AiTaskLocality; providers: AiProviderId[] }>;
  providers: AiProviderStatus[];
  localOnlyFeatures: string[];
};

export type AiTaskLocality = "local-only" | "cloud-opt-in" | "cloud-required";

export type AiModelPricing = {
  currency: "USD";
  inputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
  perRunUsd?: number;
  note?: string;
};

export interface AiRuntime {
  execute<K extends AiTaskKind>(
    task: K,
    input: AiTaskInput<K>,
    options?: AiExecutionOptions,
  ): Promise<AiExecution<AiTaskOutput<K>>>;

  capabilities(): Promise<AiCapabilities>;
}
