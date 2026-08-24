import { describe, expect, it } from "vitest";
import {
  cacheUrlMatchesModel,
  formatBytes,
  getModelDefinition,
  getModelStates,
  markModelFailed,
  markModelLoaded,
  markModelLoading,
  markModelProgress,
  resetModelRuntimeStatus,
} from "@/lib/ai/modelRegistry";

describe("model registry", () => {
  it("tracks lazy, loading, loaded and failed states", () => {
    const id = "grounding-dino-tiny";
    resetModelRuntimeStatus(id);
    expect(getModelStates().find((model) => model.id === id)?.status).toBe("lazy");

    markModelLoading(id);
    markModelProgress(id, 0.4);
    expect(getModelStates().find((model) => model.id === id)).toMatchObject({
      status: "loading",
      progress: 0.4,
    });

    markModelLoaded(id);
    expect(getModelStates().find((model) => model.id === id)).toMatchObject({
      status: "loaded",
      progress: 1,
    });

    markModelFailed(id, new Error("test failure"));
    expect(getModelStates().find((model) => model.id === id)).toMatchObject({
      status: "failed",
      error: "test failure",
    });
    resetModelRuntimeStatus(id);
  });

  it("matches model files inside Transformers cache URLs", () => {
    const model = getModelDefinition("rmbg-1.4");
    expect(model).toBeDefined();
    expect(
      cacheUrlMatchesModel(
        "https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx",
        model!,
      ),
    ).toBe(true);
    expect(cacheUrlMatchesModel("https://example.com/other-model.bin", model!)).toBe(false);
  });

  it("formats cache sizes for the settings panel", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
  });
});
