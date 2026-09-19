import { describe, expect, it } from "vitest";
import { isPinterestUrl, PINTEREST_API_STATUS } from "@/lib/moodboard/pinterest";
import {
  classifyReferenceUrl,
  listMoodboardReferences,
  removeMoodboardReference,
  saveMoodboardReference,
} from "@/lib/moodboard/referenceStore";

describe("Pinterest / reference tray", () => {
  it("documents official saved-Pins as OAuth when configured", () => {
    expect(PINTEREST_API_STATUS.officialSavedPins).toBe("oauth_when_configured");
    expect(PINTEREST_API_STATUS.scrape).toBe("not_supported");
    expect(PINTEREST_API_STATUS.userPaste).toBe("fallback");
  });

  it("classifies Pin and pinimg URLs without scraping", () => {
    expect(isPinterestUrl("https://www.pinterest.com/pin/123")).toBe(true);
    expect(isPinterestUrl("https://i.pinimg.com/736x/ab/cd.jpg")).toBe(true);
    expect(isPinterestUrl("https://example.com/photo.jpg")).toBe(false);
    expect(classifyReferenceUrl("https://www.pinterest.com/pin/123")).toBe("pinterest");
    expect(classifyReferenceUrl("https://images.unsplash.com/x")).toBe("url");
  });

  it("stores and removes local references", () => {
    const saved = saveMoodboardReference({
      src: "https://i.pinimg.com/736x/ab/cd.jpg",
      title: "Pin",
      origin: "pinterest",
    });
    expect(listMoodboardReferences().some((item) => item.id === saved.id)).toBe(true);
    removeMoodboardReference(saved.id);
    expect(listMoodboardReferences().some((item) => item.id === saved.id)).toBe(false);
  });
});
