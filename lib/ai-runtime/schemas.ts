import * as v from "valibot";
import type {
  AiExecutionOptions,
  AiImageGenerateInput,
  AiPromptEnhanceInput,
  AiVisionInput,
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

const PromptEnhanceInputSchema = v.strictObject({
  prompt: PromptSchema,
  purpose: v.optional(v.picklist(["image", "design", "general"])),
});

const ImageGenerateInputSchema = v.strictObject({
  prompt: PromptSchema,
  width: v.pipe(v.number(), v.integer(), v.minValue(256), v.maxValue(2_048)),
  height: v.pipe(v.number(), v.integer(), v.minValue(256), v.maxValue(2_048)),
  enhance: v.optional(v.boolean()),
  seed: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2_147_483_647))),
});

const ExecutionOptionsSchema = v.strictObject({
  profile: v.optional(v.picklist(["economy", "quality"])),
  provider: v.optional(v.picklist(["anthropic", "google", "openai", "replicate", "pollinations"])),
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
  | { task: "prompt.enhance"; input: AiPromptEnhanceInput; options: AiExecutionOptions }
  | { task: "image.generate"; input: AiImageGenerateInput; options: AiExecutionOptions };

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
  if (record.task === "prompt.enhance") {
    const parsed = v.safeParse(PromptEnhanceInputSchema, record.input);
    return parsed.success
      ? { task: record.task, input: parsed.output, options: options.output }
      : null;
  }
  if (record.task === "image.generate") {
    const parsed = v.safeParse(ImageGenerateInputSchema, record.input);
    return parsed.success
      ? { task: record.task, input: parsed.output, options: options.output }
      : null;
  }
  return null;
}
