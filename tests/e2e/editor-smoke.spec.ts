import { expect, test } from "@playwright/test";

test("keeps pixel tools out of the design-canvas chrome", async ({ page }) => {
  await page.goto("/");

  const toolbar = page.getByRole("toolbar", { name: "Vector editing tools" });
  await expect(toolbar).toBeVisible();
  await expect(page.getByRole("group", { name: "Editing mode" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Raster Studio", exact: true })).toHaveCount(0);
  await expect(page.getByTitle("Select contiguous similar colors (W)")).toHaveCount(0);
  await expect(page.getByTitle("Repair pixels with Healing Brush")).toHaveCount(0);
  await expect(page.getByTitle("Select and move objects (V)")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Convert to Brief" })).toHaveCount(0);
  await expect(toolbar.getByText("Brief", { exact: true })).toHaveCount(0);
  for (const label of ["Pan", "Select", "Direct", "Pen", "Draw", "Text"]) {
    await expect(toolbar.getByText(label, { exact: true })).toBeVisible();
  }
});

test("reports a real Canvas pointer dispatch p95 performance gate", async ({ page }) => {
  await page.goto("/?perf=1");

  const canvas = page.getByRole("application", { name: /Slide canvas/ });
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + Math.min(160, box.width / 2);
  const startY = box.y + Math.min(160, box.height / 2);
  await page.mouse.move(startX, startY);
  for (let index = 1; index <= 36; index++) {
    await page.mouse.move(startX + index * 2, startY + (index % 4));
  }

  const hud = page.getByRole("status", { name: "Raster performance" });
  await expect(hud).toContainText("pointerMove dispatch p95");
  const text = (await hud.textContent()) ?? "";
  const match = /pointerMove dispatch p95 ([0-9.]+)ms/.exec(text);
  expect(match).not.toBeNull();
  expect(Number(match?.[1])).toBeLessThan(32);
});
