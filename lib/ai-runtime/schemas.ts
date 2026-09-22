import * as v from "valibot";
import type {
  AiExecutionOptions,
  AiImageDecomposeLayersInput,
  AiImageGenerateInput,
  AiImageMultiAngleInput,
  AiImageUpscaleInput,
  AiPromptEnhanceInput,
  AiVectorizeInput,
  AiVisionInput,
} from "./contracts";
import {
  DECOMPOSE_LAYERS_MAX,
  DECOMPOSE_LAYERS_MIN,
  isAllowedImageAspectRatio,
  MULTI_ANGLE_ASPECT_RATIOS,
  MULTI_ANGLE_OUTPUT_FORMATS,
} from "./contracts";

const DATA_URL_MAX_CHARS = 4 * 1024 * 1024;
const PromptSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(32_000));
const DataUrlSchema = v.pipe(
  v.string(),
  v.maxLength(DATA_URL_MAX_CHARS),
  v.regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
);

const VisionInputSchema = v.strictObject({
  image: v.strictObject({
    dataUrl: DataUrlSchema,
    mimeType: v.optional(v.picklist(["image/jpeg", "image/png", "image/webp"])),
  }),
  prompt: v.optional(PromptSchema),
  language: v.optional(v.pipe(v.string(), v.maxLength(32))),
});

const RecraftImageDataUrlSchema = v.pipe(
  v.string(),
  v.maxLength(7_000_000),
  v.regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
);

const RecraftVectorizeInputSchema = v.strictObject({
  image: v.strictObject({
    dataUrl: RecraftImageDataUrlSchema,
    mimeType: v.optional(v.picklist(["image/jpeg", "image/png", "image/webp"])),
  }),
  width: v.pipe(v.number(), v.integer(), v.minValue(256), v.maxValue(4_096)),
  height: v.pipe(v.number(), v.integer(), v.minValue(256), v.maxValue(4_096)),
});

const PImageUpscaleInputSchema = v.strictObject({
  image: v.strictObject({
    dataUrl: RecraftImageDataUrlSchema,
    mimeType: v.optional(v.picklist(["image/jpeg", "image/png", "image/webp"])),
  }),
  width: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4_096)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4_096)),
  targetMegapixels: v.picklist([8, 16, 32]),
});

const DecomposeLayersInputSchema = v.strictObject({
  image: v.strictObject({
    dataUrl: RecraftImageDataUrlSchema,
    mimeType: v.optional(v.picklist(["image/jpeg", "image/png", "image/webp"])),
  }),
  width: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4_096)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4_096)),
  numLayers: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(DECOMPOSE_LAYERS_MIN),
      v.maxValue(DECOMPOSE_LAYERS_MAX),
    ),
  ),
  prompt: v.optional(v.pipe(v.string(), v.maxLength(2_000))),
});

const MultiAngleInputSchema = v.strictObject({
  image: v.strictObject({
    dataUrl: RecraftImageDataUrlSchema,
    mimeType: v.optional(v.picklist(["image/jpeg", "image/png", "image/webp"])),
  }),
  width: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4_096)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4_096)),
  rotateDegrees: v.pipe(v.number(), v.integer(), v.minValue(-180), v.maxValue(180)),
  moveForward: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10)),
  verticalTilt: v.pipe(v.number(), v.integer(), v.minValue(-1), v.maxValue(1)),
  useWideAngle: v.boolean(),
  prompt: v.optional(v.pipe(v.string(), v.maxLength(2_000))),
  goFast: v.optional(v.boolean()),
  useMultipleAngles: v.optional(v.boolean()),
  multipleAnglesStrength: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
  aspectRatio: v.optional(v.picklist(MULTI_ANGLE_ASPECT_RATIOS)),
  seed: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2_147_483_647))),
  outputFormat: v.optional(v.picklist(MULTI_ANGLE_OUTPUT_FORMATS)),
  outputQuality: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
});

const PromptEnhanceInputSchema = v.strictObject({
  prompt: PromptSchema,
  purpose: v.optional(v.picklist(["image", "design", "general"])),
});

const ImageGenerateInputSchema = v.strictObject({
  prompt: PromptSchema,
  width: v.pipe(v.number(), v.integer(), v.minValue(256), v.maxValue(2_048)),
  height: v.pipe(v.number(), v.integer(), v.minValue(256), v.maxValue(2_048)),
  quality: v.optional(v.picklist(["low", "medium", "high", "xhigh", "max", "auto"])),
  modelAlias: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  background: v.optional(v.picklist(["auto", "opaque", "transparent"])),
  inputImages: v.optional(
    v.pipe(
      v.array(
        v.strictObject({
          dataUrl: DataUrlSchema,
          mimeType: v.optional(v.picklist(["image/jpeg", "image/png", "image/webp"])),
        }),
      ),
      v.maxLength(4),
    ),
  ),
  mask: v.optional(
    v.strictObject({
      dataUrl: DataUrlSchema,
      mimeType: v.optional(v.picklist(["image/jpeg", "image/png", "image/webp"])),
    }),
  ),
  cloudConsent: v.optional(v.boolean()),
  aspectRatio: v.optional(
    v.pipe(
      v.string(),
      v.check((value) => isAllowedImageAspectRatio(value), "Unsupported aspect ratio"),
    ),
  ),
  enhance: v.optional(v.boolean()),
  seed: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2_147_483_647))),
});

const ExecutionOptionsSchema = v.strictObject({
  profile: v.optional(v.picklist(["economy", "quality"])),
  provider: v.optional(v.picklist(["anthropic", "google", "openai", "replicate"])),
  modelAlias: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  cloudConsent: v.optional(v.boolean()),
  allowFallback: v.optional(v.boolean()),
  timeoutMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1_000), v.maxValue(120_000))),
  maxCostUsd: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
  cache: v.optional(v.boolean()),
});

export type PublicAiExecuteRequest =
  | {
      task: "vision.describe" | "vision.propose" | "vision.ocr";
      input: AiVisionInput;
      options: AiExecutionOptions;
    }
  | { task: "vectorize.recraft"; input: AiVectorizeInput; options: AiExecutionOptions }
  | { task: "prompt.enhance"; input: AiPromptEnhanceInput; options: AiExecutionOptions }
  | { task: "image.generate"; input: AiImageGenerateInput; options: AiExecutionOptions }
  | { task: "image.upscale"; input: AiImageUpscaleInput; options: AiExecutionOptions }
  | {
      task: "image.decomposeLayers";
      input: AiImageDecomposeLayersInput;
      options: AiExecutionOptions;
    }
  | {
      task: "image.multiAngle";
      input: AiImageMultiAngleInput;
      options: AiExecutionOptions;
    };

export function parsePublicAiExecuteRequest(input: unknown): PublicAiExecuteRequest | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const options = v.safeParse(ExecutionOptionsSchema, record.options ?? {});
  if (!options.success) return null;
  if (
    record.task === "vision.describe" ||
    record.task === "vision.propose" ||
    record.task === "vision.ocr"
  ) {
    const parsed = v.safeParse(VisionInputSchema, record.input);
    return parsed.success
      ? { task: record.task, input: parsed.output, options: options.output }
      : null;
  }
  if (record.task === "vectorize.recraft") {
    const parsed = v.safeParse(RecraftVectorizeInputSchema, record.input);
    if (!parsed.success || parsed.output.width * parsed.output.height > 16_000_000) return null;
    return { task: record.task, input: parsed.output, options: options.output };
  }
  if (record.task === "prompt.enhance") {
    const parsed = v.safeParse(PromptEnhanceInputSchema, record.input);
    return parsed.success
      ? { task: record.task, input: parsed.output, options: options.output }
      : null;
  }
  if (record.task === "image.generate") {
    const parsed = v.safeParse(ImageGenerateInputSchema, record.input);
    return parsed.success
      ? { task: "image.generate", input: parsed.output, options: options.output }
      : null;
  }
  if (record.task === "image.upscale") {
    const parsed = v.safeParse(PImageUpscaleInputSchema, record.input);
    if (!parsed.success || parsed.output.width * parsed.output.height > 16_000_000) return null;
    return { task: "image.upscale", input: parsed.output, options: options.output };
  }
  if (record.task === "image.decomposeLayers") {
    const parsed = v.safeParse(DecomposeLayersInputSchema, record.input);
    if (!parsed.success || parsed.output.width * parsed.output.height > 16_000_000) return null;
    return { task: "image.decomposeLayers", input: parsed.output, options: options.output };
  }
  if (record.task === "image.multiAngle") {
    const parsed = v.safeParse(MultiAngleInputSchema, record.input);
    if (!parsed.success || parsed.output.width * parsed.output.height > 16_000_000) return null;
    return { task: "image.multiAngle", input: parsed.output, options: options.output };
  }
  return null;
}
