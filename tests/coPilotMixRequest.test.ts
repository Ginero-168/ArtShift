import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_MIX_PROMPT,
  requestCoPilotExternalTurn,
  subscribeCoPilotExternalTurn,
} from "@/lib/ai/coPilotRequestBus";
import { isImageGenerationPrompt } from "@/lib/ai/imageGeneration";
import { getObjectContextIconName } from "@/components/Canvas/objectContextIconRegistry";

describe("coPilot external Mix turn", () => {
  it("delivers Mix requests to subscribers with image ids", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCoPilotExternalTurn(listener);
    requestCoPilotExternalTurn({
      prompt: IMAGE_MIX_PROMPT,
      imageObjectIds: ["img-a", "img-b"],
      openAssistant: true,
    });
    expect(listener).toHaveBeenCalledWith({
      prompt: IMAGE_MIX_PROMPT,
      imageObjectIds: ["img-a", "img-b"],
      openAssistant: true,
    });
    unsubscribe();
  });

  it("treats the Mix brief as an image-generation prompt", () => {
    expect(isImageGenerationPrompt(IMAGE_MIX_PROMPT)).toBe(true);
  });

  it("maps Mix Option Bar labels to the mix icon", () => {
    expect(getObjectContextIconName("Mix")).toBe("mix");
    expect(getObjectContextIconName("Mixing...")).toBe("mix");
  });
});
