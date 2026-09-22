import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiAnglePanel } from "@/components/Canvas/PropertiesPanel/MultiAnglePanel";
import { createImage } from "@/lib/engine/factory";

vi.mock("@/lib/engine/imageCache", () => ({
  getCached: vi.fn(() => ({
    fileId: "file-1",
    dataURL: "data:image/png;base64,AAAA",
    img: { width: 32, height: 32 },
    width: 32,
    height: 32,
  })),
  preloadDataURL: vi.fn(async (dataURL: string) => ({
    dataURL,
    width: 32,
    height: 32,
    fileId: "file-1",
    img: { width: 32, height: 32 },
  })),
  loadDataURL: vi.fn(async (dataURL: string) => ({
    dataURL,
    width: 16,
    height: 16,
    fileId: "result-1",
    img: { width: 16, height: 16 },
  })),
}));

const RESULT_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function imageElement() {
  return createImage({
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    fileId: "file-1",
    naturalWidth: 32,
    naturalHeight: 32,
    sourceName: "Subject",
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Multi-Angle vertical tilt control", () => {
  it("starts at 0 and sends the slider value with angle and wide angle", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ execution: { output: { dataUrl: RESULT_DATA_URL } } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", () => true);
    vi.stubGlobal("alert", vi.fn());

    render(createElement(MultiAnglePanel, { element: imageElement() }));

    const tilt = screen.getByRole("slider", { name: "Vertical tilt" }) as HTMLInputElement;
    const angle = screen.getByRole("slider", { name: "Angle" }) as HTMLInputElement;
    expect(tilt.min).toBe("-1");
    expect(tilt.max).toBe("1");
    expect(tilt.step).toBe("1");
    expect(tilt.value).toBe("0");
    expect(angle.value).toBe("0");
    expect(screen.getByTestId("multi-angle-preview").getAttribute("data-vertical-tilt")).toBe("0");

    fireEvent.change(tilt, { target: { value: "-1" } });
    expect(screen.getByTestId("multi-angle-preview").getAttribute("data-vertical-tilt")).toBe("-1");

    fireEvent.change(angle, { target: { value: "24" } });
    fireEvent.change(tilt, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Wide angle" }));
    expect(screen.getByTestId("multi-angle-preview").getAttribute("data-vertical-tilt")).toBe("1");
    expect(screen.getByTestId("multi-angle-preview").getAttribute("data-wide-angle")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Generate Multi-Angle" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/multi-angle");
    const body = JSON.parse(String(init.body));
    expect(body.task).toBe("image.multiAngle");
    expect(body.input.rotateDegrees).toBe(24);
    expect(body.input.verticalTilt).toBe(1);
    expect(body.input.moveForward).toBe(0);
    expect(body.input.useWideAngle).toBe(true);
    expect(body.input.outputFormat).toBe("png");
    expect(body.options).toMatchObject({
      provider: "replicate",
      modelAlias: "qwen-edit-multiangle",
      cloudConsent: true,
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/Preload/);
    });
  });
});
