import { expect, test } from "@playwright/test";

const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);

test("uses VTracer WASM from the backend dropdown and creates editable paths", async ({ page }) => {
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

  await page.getByRole("button", { name: /Generate Vector Paths/ }).click();
  await expect(page.getByText("Vector Path (Illustrator)", { exact: true })).toBeVisible();
  await expect(page.getByText(/elements$/)).toBeVisible();
  await expect(page.getByText(/^\d+ nodes$/)).toBeVisible();

  expect(wasmResponses).toEqual([200, 200]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
