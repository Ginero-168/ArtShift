import { expect, test } from "@playwright/test";

const fixturePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);

const tools = [
  { label: "Upscale", key: "upscale" },
  { label: "RemoveBG", key: "remove-bg" },
  { label: "Extract", key: "extract" },
  { label: "Vectorize", key: "vectorize" },
] as const;

const vectorizeTabs = [
  { label: "Vectorize", key: "vectorize2" },
  { label: "Vectorize(Cloud)", key: "vectorize3" },
] as const;

test("keeps each image tool as its own Option Bar settings entry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "option-bar-tools.png", mimeType: "image/png", buffer: fixturePng });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();

  const optionBar = page.getByRole("toolbar", { name: "Image options", exact: true });
  await expect(optionBar).toBeVisible();
  await expect(
    optionBar.getByRole("button", { name: "Image Intelligence", exact: true }),
  ).toHaveCount(0);

  for (const tool of tools) {
    await expect(optionBar.getByRole("button", { name: tool.label, exact: true })).toBeVisible();
  }
  const optionBarLabels = await optionBar
    .locator("button")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(optionBarLabels.indexOf("Upscale")).toBeLessThan(optionBarLabels.indexOf("RemoveBG"));
  expect(optionBarLabels.indexOf("RemoveBG")).toBeLessThan(optionBarLabels.indexOf("Extract"));
  expect(optionBarLabels.indexOf("Extract")).toBeLessThan(optionBarLabels.indexOf("Vectorize"));
  await expect(optionBar.getByRole("button", { name: "Vectorize1", exact: true })).toHaveCount(0);
  await expect(
    optionBar.getByRole("button", { name: "Vectorize(Cloud)", exact: true }),
  ).toHaveCount(0);
  await expect(
    optionBar.getByRole("button", { name: "Image Intelligence", exact: true }),
  ).toHaveCount(0);

  const vectorizeButton = optionBar.getByRole("button", { name: "Vectorize", exact: true });
  await vectorizeButton.click();
  const vectorizeDialog = page.getByRole("dialog", { name: "Vectorize settings", exact: true });
  await expect(vectorizeDialog).toBeVisible();
  await expect(vectorizeDialog.getByRole("tab")).toHaveCount(2);
  await expect(
    vectorizeDialog.getByRole("button", { name: "Extract (separate pipeline)", exact: true }),
  ).toHaveCount(0);
  await expect(vectorizeDialog.getByRole("button", { name: "object", exact: true })).toHaveCount(0);
  for (const tab of vectorizeTabs) {
    const tabButton = vectorizeDialog.getByRole("tab", { name: tab.label, exact: true });
    await expect(tabButton).toBeVisible();
    await tabButton.click();
    await expect(tabButton).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("image-tool-settings")).toHaveAttribute("data-tool", tab.key);
  }
});

test("runs RemoveBG immediately with the VPS fallback and no settings step", async ({ page }) => {
  let rmbgRequest: Record<string, unknown> | null = null;
  let rmbgRequestCount = 0;
  let releaseRmbg: () => void = () => {};
  const rmbgPending = new Promise<void>((resolve) => {
    releaseRmbg = resolve;
  });
  await page.route("**/api/local-ai/rmbg", async (route) => {
    rmbgRequestCount += 1;
    rmbgRequest = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await rmbgPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: { dataUrl: `data:image/png;base64,${fixturePng.toString("base64")}` },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "remove-bg-immediate.png", mimeType: "image/png", buffer: fixturePng });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();

  const optionBar = page.getByRole("toolbar", { name: "Image options", exact: true });
  const removeBgButton = optionBar.getByRole("button", { name: "RemoveBG", exact: true });
  await removeBgButton.click();
  await expect(page.getByTestId("processing-preview")).toBeVisible();
  await expect(page.getByText("RemoveBG Settings", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Allow VPS fallback for background removal" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run RemoveBG", exact: true })).toHaveCount(0);
  await expect.poll(() => rmbgRequest).toMatchObject({ allowServerFallback: true });
  expect(rmbgRequestCount).toBe(1);
  await page.waitForTimeout(100);
  expect(rmbgRequestCount).toBe(1);
  releaseRmbg();
  await page.waitForTimeout(100);
  expect(rmbgRequestCount).toBe(1);
  await expect(page.getByText("Remove BG · เริ่มลบพื้นหลังแบบ Local (0%)", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.getByText("Remove BG · ลบพื้นหลังและสร้าง Alpha สำเร็จ (100%)", { exact: true }),
  ).toHaveCount(1);
});

test("runs Extract from the middle Option Bar action", async ({ page }) => {
  let rmbgRequest: Record<string, unknown> | null = null;
  let rmbgRequestCount = 0;
  let releaseRmbg: () => void = () => {};
  const rmbgPending = new Promise<void>((resolve) => {
    releaseRmbg = resolve;
  });
  await page.route("**/api/local-ai/rmbg", async (route) => {
    rmbgRequestCount += 1;
    rmbgRequest = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await rmbgPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: { dataUrl: `data:image/png;base64,${fixturePng.toString("base64")}` },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "extract-option-bar.png", mimeType: "image/png", buffer: fixturePng });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();

  const optionBar = page.getByRole("toolbar", { name: "Image options", exact: true });
  await optionBar.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByTestId("processing-preview")).toHaveAttribute(
    "data-preview-kind",
    "extract",
  );
  await expect.poll(() => rmbgRequest).toMatchObject({ allowServerFallback: true });
  expect(rmbgRequestCount).toBe(1);
  await page.waitForTimeout(100);
  expect(rmbgRequestCount).toBe(1);
  releaseRmbg();
  await page.waitForTimeout(100);
  expect(rmbgRequestCount).toBe(1);
  await expect(
    page.getByText("Extract · เริ่มแยก Object แบบรวดเร็ว (0%)", { exact: true }),
  ).toHaveCount(1);
});

test("preloads and upscales a duplicate through Recraft Crisp Upscale", async ({ page }) => {
  let upscaleRequest: Record<string, unknown> | null = null;
  let releaseUpscale: () => void = () => {};
  const upscalePending = new Promise<void>((resolve) => {
    releaseUpscale = resolve;
  });
  await page.route("**/api/upscale/recraft", async (route) => {
    upscaleRequest = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await upscalePending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        execution: {
          output: { dataUrl: `data:image/png;base64,${fixturePng.toString("base64")}` },
        },
      }),
    });
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "upscale-source.png", mimeType: "image/png", buffer: fixturePng });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();

  const optionBar = page.getByRole("toolbar", { name: "Image options", exact: true });
  await optionBar.getByRole("button", { name: "Upscale", exact: true }).click();
  const preview = page.getByTestId("processing-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-preview-kind", "upscale");
  await expect(preview).toHaveAttribute("data-preview-phase", "running");
  await expect(preview.locator("img")).toHaveCount(1);
  await expect(preview.getByTestId("processing-preview-swipe")).toHaveCSS(
    "animation-name",
    "model-manager-shimmer",
  );
  const previewWidth = await preview.getAttribute("data-preview-width");
  const previewHeight = await preview.getAttribute("data-preview-height");
  expect(Number(previewWidth)).toBeGreaterThan(0);
  expect(previewWidth).toBe(previewHeight);
  await expect
    .poll(() => upscaleRequest)
    .toMatchObject({
      task: "image.upscale",
      options: {
        provider: "replicate",
        modelAlias: "recraft-crisp-upscale",
        cloudConsent: true,
        allowFallback: false,
      },
    });
  const requestBody = upscaleRequest as unknown as Record<string, unknown>;
  expect(JSON.stringify(requestBody)).not.toContain("apiKey");
  releaseUpscale();
  await expect(preview).toHaveCount(0);
});
