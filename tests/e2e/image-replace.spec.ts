import { expect, type Page, test } from "@playwright/test";

const initialPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);
const replacementPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAcklEQVR42mP4dUb0/3sXF7KxavJrijADzCByHUI1B5DrEKo7gFSH0MwBxDqE5g4g5BC6OQCXQ+juAHSHDJgDkB0yoA4Q2NkIxiCHwNikYKo5gFyHUN0BpDqEZg4Y8BAYdcDQccB/CsGoA0YdMOoASh0AAPFU5dWorKciAAAAAElFTkSuQmCC",
  "base64",
);

async function uploadImage(page: Page, name: string, buffer: Buffer) {
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: "image/png", buffer });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible();
}

test("double-clicking an image opens Browse/Replace instead of Crop", async ({ page }) => {
  await page.goto("/");
  await uploadImage(page, "double-click-source.png", initialPng);

  const canvas = page.locator("canvas").first();
  const selection = page.getByRole("group", { name: "Selection controls", exact: true });
  const polygon = selection.locator("polygon").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Canvas is not visible");
  const center = await polygon.evaluate((node) => {
    const points = (node.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((point) => point.split(",").map(Number));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  });

  const chooser = page.waitForEvent("filechooser");
  await page.mouse.dblclick(canvasBox.x + center.x, canvasBox.y + center.y);
  await (await chooser).setFiles({
    name: "double-click-replacement.png",
    mimeType: "image/png",
    buffer: replacementPng,
  });

  await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  await expect(page.locator('[title="double-click-replacement.png"]')).toBeVisible();
});
