import { expect, test } from "@playwright/test";

const fixturePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);

const tools = [
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
  let releaseRmbg: () => void = () => {};
  const rmbgPending = new Promise<void>((resolve) => {
    releaseRmbg = resolve;
  });
  await page.route("**/api/local-ai/rmbg", async (route) => {
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
  releaseRmbg();
});

test("runs Extract from the middle Option Bar action", async ({ page }) => {
  let rmbgRequest: Record<string, unknown> | null = null;
  let releaseRmbg: () => void = () => {};
  const rmbgPending = new Promise<void>((resolve) => {
    releaseRmbg = resolve;
  });
  await page.route("**/api/local-ai/rmbg", async (route) => {
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
  releaseRmbg();
});
