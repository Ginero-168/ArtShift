import { expect, test } from "@playwright/test";

const asymmetricPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAcklEQVR42mP4dUb0/3sXF7KxavJrijADzCByHUI1B5DrEKo7gFSH0MwBxDqE5g4g5BC6OQCXQ+juAHSHDJgDkB0yoA4Q2NkIxiCHwNikYKo5gFyHUN0BpDqEZg4Y8BAYdcDQccB/CsGoA0YdMOoASh0AAPFU5dWorKciAAAAAElFTkSuQmCC",
  "base64",
);

test("Flip Horizontal and Flip Vertical mirror the selected image", async ({ page }) => {
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
      name: "flip-asymmetric.png",
      mimeType: "image/png",
      buffer: asymmetricPng,
    });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();

  const toolbar = page.getByRole("toolbar", { name: "Image options", exact: true });
  const canvas = page.locator("canvas").first();
  await expect(toolbar).toBeVisible();
  await expect(canvas).toBeVisible();

  const before = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
  await toolbar.getByRole("button", { name: "Flip Horizontal", exact: true }).click();
  await expect
    .poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);
  const afterHorizontal = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());

  await toolbar.getByRole("button", { name: "Flip Vertical", exact: true }).click();
  await expect
    .poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL()))
    .not.toBe(afterHorizontal);

  await expect(page.getByRole("toolbar", { name: "Image options", exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
