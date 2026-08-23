/* eslint-disable @typescript-eslint/no-explicit-any */

export const ADVANCED_VISION_MODELS = {
  groundingDino: "onnx-community/grounding-dino-tiny-ONNX",
  sam2: "onnx-community/sam2-hiera-tiny",
} as const;

export type VisionBox = {
  label: string;
  score?: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

export type VisionMask = {
  width: number;
  height: number;
  data: Uint8Array;
  score: number;
};

export type Sam2Session = {
  segment: (box: VisionBox, onProgress?: (progress: number) => void) => Promise<VisionMask>;
};

// biome-ignore lint/suspicious/noExplicitAny: Transformers.js model types are runtime-generated.
let groundingDinoPromise: Promise<any> | null = null;
// biome-ignore lint/suspicious/noExplicitAny: Transformers.js model types are runtime-generated.
let sam2RuntimePromise: Promise<{ model: any; processor: any }> | null = null;

/** Detect candidate objects with the optional local Grounding DINO model. */
export async function groundingDinoDetect(
  imageDataUrl: string,
  candidateLabels: readonly string[],
  onProgress?: (progress: number) => void,
): Promise<VisionBox[]> {
  const labels = [...new Set(candidateLabels.map((label) => label.trim()).filter(Boolean))];
  if (!labels.length) return [];
  const { pipeline, RawImage } = await import("@huggingface/transformers");
  let detector = groundingDinoPromise;
  if (!detector) {
    detector = pipeline("zero-shot-object-detection", ADVANCED_VISION_MODELS.groundingDino, {
      progress_callback: (event: { status?: string; loaded?: number; total?: number }) => {
        if (event.status === "progress" && event.total) {
          onProgress?.((event.loaded ?? 0) / event.total);
        }
      },
    });
    groundingDinoPromise = detector;
  }
  const [detectorPipeline, image] = await Promise.all([detector, RawImage.fromURL(imageDataUrl)]);
  const detections = await detectorPipeline(image, labels);
  const width = Math.max(1, image.width);
  const height = Math.max(1, image.height);

  const boxes: VisionBox[] = [];
  for (const detection of Array.isArray(detections) ? detections : []) {
    const box = detection?.box;
    if (!box) continue;
    const candidate: VisionBox = {
      label: typeof detection.label === "string" ? detection.label : "object",
      score: typeof detection.score === "number" ? detection.score : undefined,
      x_min: Number(box.xmin) / width,
      y_min: Number(box.ymin) / height,
      x_max: Number(box.xmax) / width,
      y_max: Number(box.ymax) / height,
    };
    if (
      [candidate.x_min, candidate.y_min, candidate.x_max, candidate.y_max].every(Number.isFinite)
    ) {
      boxes.push(candidate);
    }
  }
  return boxes;
}

/** Prepare one SAM 2 image session so multiple object boxes reuse image embeddings. */
export async function createSam2Session(
  imageDataUrl: string,
  onProgress?: (progress: number) => void,
): Promise<Sam2Session> {
  const { RawImage } = await import("@huggingface/transformers");
  const [{ model, processor }, image] = await Promise.all([
    ensureSam2Runtime(onProgress),
    RawImage.fromURL(imageDataUrl),
  ]);
  const baseInputs = await processor(image);
  const embeddings = await model.get_image_embeddings({ pixel_values: baseInputs.pixel_values });

  return {
    async segment(box, segmentProgress) {
      segmentProgress?.(0.1);
      const inputs = await processor(image, {
        input_boxes: [
          [
            [
              box.x_min * image.width,
              box.y_min * image.height,
              box.x_max * image.width,
              box.y_max * image.height,
            ],
          ],
        ],
      });
      const outputs = await model({ ...inputs, ...embeddings });
      segmentProgress?.(0.8);
      const masks = await processor.post_process_masks(
        outputs.pred_masks,
        inputs.original_sizes,
        inputs.reshaped_input_sizes,
        { binarize: true },
      );
      const mask = selectBestMask(masks[0], outputs.iou_scores, image.width, image.height);
      segmentProgress?.(1);
      return mask;
    },
  };
}

async function ensureSam2Runtime(onProgress?: (progress: number) => void) {
  if (sam2RuntimePromise) return sam2RuntimePromise;
  sam2RuntimePromise = (async () => {
    const { Sam2Model, Sam2Processor } = await import("@huggingface/transformers");
    const [model, processor] = await Promise.all([
      Sam2Model.from_pretrained(ADVANCED_VISION_MODELS.sam2, {
        progress_callback: (event: { status?: string; loaded?: number; total?: number }) => {
          if (event.status === "progress" && event.total) {
            onProgress?.((event.loaded ?? 0) / event.total);
          }
        },
      }),
      Sam2Processor.from_pretrained(ADVANCED_VISION_MODELS.sam2),
    ]);
    return { model, processor };
  })();

  try {
    return await sam2RuntimePromise;
  } catch (error) {
    sam2RuntimePromise = null;
    throw error;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Tensor shapes vary by Transformers.js model output.
function selectBestMask(tensor: any, scoreTensor: any, width: number, height: number): VisionMask {
  const dimensions = Array.isArray(tensor?.dims) ? tensor.dims.map(Number) : [];
  const maskCount = dimensions.length >= 4 ? Math.max(1, dimensions.at(-3) ?? 1) : 1;
  const sourceHeight = Math.max(1, dimensions.at(-2) ?? height);
  const sourceWidth = Math.max(1, dimensions.at(-1) ?? width);
  const scores = Array.from(scoreTensor?.data ?? [], Number);
  let bestIndex = 0;
  for (let index = 1; index < maskCount; index++) {
    if ((scores[index] ?? 0) > (scores[bestIndex] ?? 0)) bestIndex = index;
  }

  const output = new Uint8Array(width * height);
  const sourceData = tensor?.data ?? [];
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y / height) * sourceHeight));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x / width) * sourceWidth));
      const sourceIndex = (bestIndex * sourceHeight + sourceY) * sourceWidth + sourceX;
      output[y * width + x] = Number(sourceData[sourceIndex]) > 0 ? 1 : 0;
    }
  }

  return {
    width,
    height,
    data: output,
    score: Number(scores[bestIndex] ?? 0),
  };
}
