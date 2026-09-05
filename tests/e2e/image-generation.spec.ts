import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("uses the fixed Replicate GPT Image 2 low image-generation contract", async ({ page }) => {
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/ai/image", async (route) => {
    requestBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl: ONE_PIXEL_PNG,
        prompt: "a warm editorial portrait",
        width: 1024,
        height: 1024,
        seed: 0,
        provider: "replicate",
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "AI Image Studio", exact: true }).click();

  const modal = page.getByRole("dialog", { name: "AI Image Studio" });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/openai\/gpt-image-2/)).toBeVisible();
  await expect(modal.getByText(/quality: low/)).toBeVisible();
  await expect(modal.getByText(/100% Free|FLUX|Pollinations/)).toHaveCount(0);

  await modal.getByLabel("Prompt (คำอธิบายภาพ)").fill("a warm editorial portrait");
  await modal.getByRole("button", { name: /Generate Image/ }).click();
  await expect(modal.getByRole("button", { name: /Insert to Canvas/ })).toBeVisible();

  expect(requestBody).toMatchObject({
    prompt: expect.stringContaining("a warm editorial portrait"),
    aspectRatio: "1:1",
    width: 1024,
    height: 1024,
    enhance: true,
  });
  expect(requestBody).not.toHaveProperty("model");
  expect(requestBody).not.toHaveProperty("provider");
});
