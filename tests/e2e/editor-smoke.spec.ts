import { expect, test } from "@playwright/test";

test("switches into Raster mode and exposes Photoshop-style tools", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Raster" }).click();
  const toolbar = page.getByRole("toolbar", { name: "raster editing tools" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveScreenshot("raster-toolbar.png", { animations: "disabled" });
  await expect(page.getByTitle("Select contiguous similar colors (W)")).toBeVisible();
  await expect(page.getByTitle("Brush-select similar pixels ([ / ])")).toBeVisible();
  await expect(page.getByTitle("Repair pixels with Healing Brush")).toBeVisible();
  await expect(page.getByTitle("Clone pixels from an Alt-click source")).toBeVisible();

  await page.getByTitle("Select contiguous similar colors (W)").click();
  await expect(page.getByRole("group", { name: "Magic Wand options" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Tolerance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Auto Subject" })).toBeVisible();
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
