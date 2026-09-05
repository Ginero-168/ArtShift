import { expect, test } from "@playwright/test";

const fixturePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);

const tools = [
  { label: "RemoveBG", key: "remove-bg" },
  { label: "Vectorize1", key: "vectorize1" },
  { label: "Vectorize2", key: "vectorize2" },
  { label: "Vectorize3", key: "vectorize3" },
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
    await optionBar.getByRole("button", { name: tool.label, exact: true }).click();
    await expect(optionBar.getByRole("button", { name: tool.label, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("image-tool-settings")).toHaveAttribute("data-tool", tool.key);
    await expect(
      page.getByRole("dialog", { name: `${tool.label} settings`, exact: true }),
    ).toBeVisible();
  }
});
