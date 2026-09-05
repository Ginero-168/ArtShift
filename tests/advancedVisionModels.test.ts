import { describe, expect, it } from "vitest";
import { MODEL_DEFINITIONS } from "@/lib/ai/modelRegistry";
import { ADVANCED_VISION_MODELS } from "@/lib/vision/advancedVision";

describe("advanced vision model ids", () => {
  it("points SAM 2 at the published Transformers.js ONNX repository", () => {
    // onnx-community/sam2-hiera-tiny has no config.json and returns 404, which
    // made every SAM 2 refinement silently fall back to alpha geometry.
    expect(ADVANCED_VISION_MODELS.sam2).toBe("onnx-community/sam2-hiera-tiny-ONNX");
  });

  it("keeps the model registry cache id in sync with the loaded repository", () => {
    const sam2 = MODEL_DEFINITIONS.find((model) => model.id === "sam2-hiera-tiny");

    expect(sam2).toBeDefined();
    expect(sam2?.cacheIds).toContain(ADVANCED_VISION_MODELS.sam2);
  });
});
