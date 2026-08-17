/**
 * Background Removal Engine — High-precision AI background removal.
 * Primary mode: 100% In-Browser Local RMBG (briaai/RMBG-1.4 via Transformers.js).
 * Fallback mode: Server API (/api/removebg) if configured.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";

// biome-ignore lint/suspicious/noExplicitAny: third-party RMBG model type
let rmbgModel: any = null;
// biome-ignore lint/suspicious/noExplicitAny: third-party RMBG processor type
let rmbgProcessor: any = null;
let rmbgLoading = false;

async function loadLocalRMBG(onProgress?: (p: number) => void) {
  if (rmbgModel && rmbgProcessor) return;
  if (rmbgLoading) {
    while (rmbgLoading) await new Promise((r) => setTimeout(r, 200));
    return;
  }
  rmbgLoading = true;
  try {
    const progressCallback = (p: { status: string; loaded?: number; total?: number }) => {
      if (onProgress && p.status === "progress" && p.total) {
        onProgress((p.loaded! / p.total) * 0.7);
      }
    };
    const [m, p] = await Promise.all([
      AutoModel.from_pretrained("briaai/RMBG-1.4", {
        progress_callback: progressCallback,
      }),
      AutoProcessor.from_pretrained("briaai/RMBG-1.4"),
    ]);
    rmbgModel = m;
    rmbgProcessor = p;
  } finally {
    rmbgLoading = false;
  }
}

export async function removeBackgroundClient(
  imageDataUrl: string,
  onProgress?: (p: number) => void,
): Promise<string> {
  await loadLocalRMBG(onProgress);
  onProgress?.(0.75);

  const image = await RawImage.fromURL(imageDataUrl);
  onProgress?.(0.85);

  const { pixel_values } = await rmbgProcessor(image);
  const { output } = await rmbgModel({ input: pixel_values });
  onProgress?.(0.95);

  const maskTensor = output[0].mul(255).to("uint8");
  const mask = await RawImage.fromTensor(maskTensor).resize(image.width, image.height);

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  const imgData = ctx.createImageData(image.width, image.height);
  const rawData = image.data;
  const maskData = mask.data;

  for (let i = 0; i < image.width * image.height; i++) {
    imgData.data[i * 4] = rawData[i * 3];
    imgData.data[i * 4 + 1] = rawData[i * 3 + 1];
    imgData.data[i * 4 + 2] = rawData[i * 3 + 2];
    imgData.data[i * 4 + 3] = maskData[i]; // Alpha channel from RMBG mask
  }

  ctx.putImageData(imgData, 0, 0);
  onProgress?.(1.0);
  return canvas.toDataURL("image/png");
}

export async function removeBackground(
  imageDataUrl: string,
  onProgress?: (p: number) => void,
): Promise<string> {
  // Try in-browser local AI first
  try {
    return await removeBackgroundClient(imageDataUrl, onProgress);
  } catch (localErr) {
    console.warn("Local RMBG failed, falling back to server API...", localErr);
  }

  // Fallback to server API
  const postRes = await fetch("/api/removebg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });

  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({ error: "unknown" }));
    throw new Error(err.error || `BG removal failed: ${postRes.status}`);
  }

  const postData = await postRes.json();
  const requestId = postData.id || postData.requestId;
  if (!requestId) {
    throw new Error("BG removal: no requestId returned");
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`/api/removebg?requestId=${encodeURIComponent(requestId)}`);
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.status === "completed" && statusData.output?.image) {
      return statusData.output.image as string;
    }
    if (statusData.status === "failed") {
      throw new Error("BG removal: job failed on server");
    }
  }

  throw new Error("BG removal: timeout waiting for result");
}
