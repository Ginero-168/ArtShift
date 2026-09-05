import { expect, test } from "@playwright/test";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);

test("keeps Custom and VTracer buttons and settings independent", async ({ page }) => {
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

  const imageToolbar = page.getByRole("toolbar", { name: "Image options", exact: true });
  await expect(imageToolbar).toBeVisible();
  expect(await imageToolbar.evaluate((node) => (node as HTMLElement).style.transform)).toBe(
    "translateX(-50%)",
  );
  for (const label of [
    "Flip Horizontal",
    "Flip Vertical",
    "Rotate 90°",
    "Crop",
    "Vector",
    "Image Intelligence",
    "Download",
  ]) {
    await expect(imageToolbar.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await expect(imageToolbar.locator(".object-context-label")).toHaveCount(0);
  await expect(page.getByText("✨ Image Intelligence", { exact: true })).toHaveCount(0);
  await imageToolbar.getByRole("button", { name: "Image Intelligence", exact: true }).click();
  await expect(page.getByText("✨ Image Intelligence", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Extract All", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quick Extract", exact: true })).toHaveCount(0);

  const customButton = page.getByRole("button", { name: "Custom Auto-Trace" });
  const vtracerButton = page.getByRole("button", { name: "VTracer WASM" });
  await expect(customButton).toBeVisible();
  await expect(vtracerButton).toBeVisible();

  await customButton.click();
  await expect(page.getByText("ArtShift Custom Settings", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "VTracer geometry" })).toHaveCount(0);
  await page.getByRole("button", { name: /Illustration/ }).click();

  await vtracerButton.click();
  await expect(page.getByText("VTracer WASM Settings", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Poster (Official)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Photo (Official)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "B&W (Official)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Poster (Official)", exact: true })).toHaveCSS(
    "font-weight",
    "700",
  );
  await expect(page.getByRole("button", { name: "8", exact: true })).toHaveCSS(
    "font-weight",
    "700",
  );
  const geometry = page.getByRole("combobox", { name: "VTracer geometry" });
  const composition = page.getByRole("combobox", { name: "VTracer composition" });
  const clustering = page.getByRole("combobox", { name: "VTracer clustering" });
  await expect(geometry).toHaveValue("polygon");
  await expect(composition).toHaveValue("cutout");
  await expect(clustering).toHaveValue("color-cluster");
  await expect(page.getByRole("slider", { name: "VTracer color sensitivity" })).toHaveValue("16");
  await expect(page.getByRole("slider", { name: "VTracer noise filter" })).toHaveValue("4");

  await page.getByRole("button", { name: "Photo (Official)", exact: true }).click();
  await expect(geometry).toHaveValue("spline");
  await expect(composition).toHaveValue("stacked");
  await expect(page.getByRole("slider", { name: "VTracer noise filter" })).toHaveValue("10");
  await expect(page.getByRole("button", { name: "VTracer no palette limit" })).toHaveCSS(
    "font-weight",
    "700",
  );

  await page.getByRole("button", { name: "Poster (Official)", exact: true }).click();
  await expect(geometry).toHaveValue("polygon");
  await expect(composition).toHaveValue("cutout");
  await expect(page.getByRole("slider", { name: "VTracer noise filter" })).toHaveValue("4");

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

  await page.getByRole("button", { name: /Generate VTracer Paths/ }).click();
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
        maxColors: 8,
        usePresetDefaults: false,
        simplify: 0.85,
      },
    },
  });

  expect(wasmResponses).toEqual([200, 200]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("runs the original Custom Auto-Trace workflow from its own button", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({
      name: "custom-fixture.png",
      mimeType: "image/png",
      buffer: syntheticPng,
    });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();
  const customImageToolbar = page.getByRole("toolbar", { name: "Image options", exact: true });
  await customImageToolbar.getByRole("button", { name: "Image Intelligence", exact: true }).click();
  await expect(page.getByText("✨ Image Intelligence", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Custom Auto-Trace" }).click();
  await expect(page.getByText("ArtShift Custom Settings", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Generate Custom Paths/ }).click();
  await expect(page.getByText("Vector Path (Illustrator)", { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d+ nodes$/)).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("runs Recraft Vectorize through the Replicate task route and imports editable paths", async ({
  page,
}) => {
  let recraftRequest: Record<string, unknown> | null = null;
  let releaseRecraft: () => void = () => {};
  const recraftPending = new Promise<void>((resolve) => {
    releaseRecraft = resolve;
  });
  await page.route("**/api/vectorize/recraft", async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
    if (body.task !== "vectorize.recraft") {
      await route.continue();
      return;
    }
    recraftRequest = body;
    await recraftPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        execution: {
          output: {
            svg: '<svg viewBox="0 0 32 32"><path fill="#ef4444" d="M2 2 H30 V30 H2 Z"/></svg>',
          },
          metadata: {
            provider: "replicate",
            model: "recraft-ai/recraft-vectorize",
          },
        },
      }),
    });
  });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "recraft-fixture.png", mimeType: "image/png", buffer: syntheticPng });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();
  const recraftImageToolbar = page.getByRole("toolbar", { name: "Image options", exact: true });
  await recraftImageToolbar
    .getByRole("button", { name: "Image Intelligence", exact: true })
    .click();
  await expect(page.getByText("✨ Image Intelligence", { exact: true })).toBeVisible();

  const recraftButton = page.getByRole("button", {
    name: "Recraft Vectorize (Cloud)",
    exact: true,
  });
  await expect(recraftButton).toBeVisible();
  await recraftButton.click();
  const processingPreview = page.getByTestId("processing-preview");
  await expect(processingPreview).toBeVisible();
  await expect(processingPreview).toHaveAttribute("data-preview-kind", "vectorize");
  await expect(processingPreview).toHaveAttribute("aria-label", "Recraft Vectorize loading");
  const previewWidth = await processingPreview.getAttribute("data-preview-width");
  const previewHeight = await processingPreview.getAttribute("data-preview-height");
  expect(Number(previewWidth)).toBeGreaterThan(0);
  expect(previewWidth).toBe(previewHeight);
  await expect(processingPreview.locator("img")).toHaveCount(1);
  await expect(processingPreview.getByTestId("processing-preview-swipe")).toHaveCSS(
    "animation-name",
    "model-manager-shimmer",
  );
  await page.mouse.click(850, 480);
  await expect(processingPreview).toBeVisible();
  releaseRecraft();
  await expect(page.getByText("Vector Path (Illustrator)", { exact: true })).toBeVisible();
  await expect(processingPreview).toHaveCount(0);
  await expect(page.getByText(/^\d+ nodes$/)).toBeVisible();

  expect(recraftRequest).toMatchObject({
    task: "vectorize.recraft",
    options: {
      profile: "quality",
      provider: "replicate",
      modelAlias: "recraft-vectorize",
      cloudConsent: true,
      allowFallback: false,
      cache: false,
    },
    input: { width: 32, height: 32 },
  });
  const capturedRequest = recraftRequest as Record<string, unknown> | null;
  const input = (capturedRequest?.input ?? {}) as { image?: { dataUrl?: unknown } };
  expect(input.image?.dataUrl).toEqual(expect.stringMatching(/^data:image\/png;base64,/));
  expect(JSON.stringify(recraftRequest)).not.toContain("apiKey");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
