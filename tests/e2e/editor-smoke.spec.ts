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
