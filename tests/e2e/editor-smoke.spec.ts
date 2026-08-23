import { expect, test } from "@playwright/test";

test("switches into Raster mode and exposes Photoshop-style tools", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Raster" }).click();
  await expect(page.getByRole("toolbar", { name: "raster editing tools" })).toBeVisible();
  await expect(page.getByTitle("Select contiguous similar colors (W)")).toBeVisible();
  await expect(page.getByTitle("Brush-select similar pixels ([ / ])")).toBeVisible();

  await page.getByTitle("Select contiguous similar colors (W)").click();
  await expect(page.getByRole("group", { name: "Magic Wand options" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Tolerance" })).toBeVisible();
});
