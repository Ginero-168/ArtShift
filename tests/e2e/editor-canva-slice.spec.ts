import { expect, test } from "@playwright/test";

test("inserts an editable composition and exposes the smart editor controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Composition Blocks/ })).toBeVisible();

  await page.getByRole("button", { name: "Insert Hero composition" }).click();
  await expect(page.getByRole("toolbar", { name: "Multiple options" })).toBeVisible();

  await page.getByRole("button", { name: "Open layers" }).click();
  await expect(page.getByRole("button", { name: "Collapse Hero composition group" })).toBeVisible();
  await expect(page.getByText("4 slots")).toBeVisible();

  const smartArrange = page.getByRole("button", { name: /Smart Arrange/ });
  await expect(smartArrange).toBeVisible();
  await smartArrange.click();
  await expect(page.getByRole("dialog", { name: "Smart Arrange" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Smart Arrange" })).toHaveCount(0);
});
