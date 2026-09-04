import { expect, test } from "@playwright/test";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);

test("uses VTracer WASM from the backend dropdown and creates editable paths", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __vectorizerWorkerMessages?: unknown[] }).__vectorizerWorkerMessages =
      [];
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      if (message && typeof message === "object" && "options" in message) {
        (
          window as unknown as { __vectorizerWorkerMessages: unknown[] }
        ).__vectorizerWorkerMessages.push(message);
      }
      return Reflect.apply(originalPostMessage, this, [message, transfer]);
    };
  });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const wasmResponses: number[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/wasm/vtracer/")) wasmResponses.push(response.status());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({
      name: "vtracer-fixture.png",
      mimeType: "image/png",
      buffer: syntheticPng,
    });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Vectorize \(Auto-Trace\)/ }).click();
  const backend = page.getByRole("combobox", { name: "Vectorizer backend" });
  await expect(backend).toBeVisible();
  await expect(backend.locator("option")).toHaveText(["ArtShift Custom", "VTracer WASM"]);
  await backend.selectOption("vtracer-wasm");
  await expect(backend).toHaveValue("vtracer-wasm");

  await page.getByRole("button", { name: "Advanced Detail & Curve Controls" }).click();
  const geometry = page.getByRole("combobox", { name: "VTracer geometry" });
  const composition = page.getByRole("combobox", { name: "VTracer composition" });
  const clustering = page.getByRole("combobox", { name: "VTracer clustering" });
  await expect(geometry).toHaveValue("spline");
  await expect(composition).toHaveValue("cutout");
  await expect(clustering).toHaveValue("color-cluster");
  await expect(page.getByRole("slider", { name: "VTracer color sensitivity" })).toHaveValue("16");
  await expect(page.getByRole("slider", { name: "VTracer noise filter" })).toHaveValue("2");

  await geometry.selectOption("polygon");
  await composition.selectOption("stacked");
  await clustering.selectOption("watershed");
  await clustering.selectOption("color-cluster");
  await page.getByRole("slider", { name: "VTracer color sensitivity" }).fill("32");
  await page.getByRole("slider", { name: "VTracer noise filter" }).fill("6");
  await page.getByRole("checkbox", { name: "VTracer extra curve simplification" }).check();
  await expect(geometry).toHaveValue("polygon");
  await expect(composition).toHaveValue("stacked");
  await expect(page.getByRole("slider", { name: "VTracer color sensitivity" })).toHaveValue("32");
  await expect(page.getByRole("slider", { name: "VTracer noise filter" })).toHaveValue("6");

  await page.getByRole("button", { name: /Generate Vector Paths/ }).click();
  await expect(page.getByText("Vector Path (Illustrator)", { exact: true })).toBeVisible();
  await expect(page.getByText(/elements$/)).toBeVisible();
  await expect(page.getByText(/^\d+ nodes$/)).toBeVisible();

  const vtracerPayload = await page.evaluate(() => {
    const messages =
      (window as unknown as { __vectorizerWorkerMessages?: Array<{ options?: unknown }> })
        .__vectorizerWorkerMessages ?? [];
    return messages.find((message) => {
      const options = message.options as { vtracer?: unknown } | undefined;
      return options?.vtracer !== undefined;
    });
  });
  expect(vtracerPayload).toMatchObject({
    options: {
      vtracer: {
        mode: "polygon",
        hierarchical: "stacked",
        clustering: "color-cluster",
        filterSpeckle: 6,
        layerDifference: 32,
        simplify: 0.85,
      },
    },
  });

  expect(wasmResponses).toEqual([200, 200]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
