import { expect, test } from "@playwright/test";

const TEST_IMAGE_PNG_256 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAACYUlEQVR42u3UMQEAAAQAQXFEFFYXCmjghivww0dWD/BTiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABCAEGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAGAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQCXBWNwJTbzQ1x7AAAAAElFTkSuQmCC";

test("uses the automatic Replicate GPT Image 2 generation contract", async ({ page }) => {
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/ai/image", async (route) => {
    requestBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl: TEST_IMAGE_PNG_256,
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
  await expect(modal.getByText(/quality: auto \(default medium\)/)).toBeVisible();
  await expect(modal.getByText(/100% Free|FLUX|Pollinations/)).toHaveCount(0);

  await modal.getByLabel("Prompt (คำอธิบายภาพ)").fill("a warm editorial portrait");
  await modal.getByRole("button", { name: /Generate Image/ }).click();
  await expect(modal.getByRole("button", { name: /Insert to Canvas/ })).toBeVisible();

  expect(requestBody).toMatchObject({
    prompt: expect.stringContaining("a warm editorial portrait"),
    aspectRatio: "1:1",
    width: 1024,
    height: 1024,
    quality: "medium",
    enhance: true,
  });
  expect(requestBody).not.toHaveProperty("model");
  expect(requestBody).not.toHaveProperty("provider");
});

test("does not send an ambiguous chat image request before clarification", async ({ page }) => {
  let requestBody: Record<string, unknown> | undefined;
  let requestCount = 0;
  await page.route("**/api/ai/image", async (route) => {
    requestCount += 1;
    requestBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl: TEST_IMAGE_PNG_256,
        prompt: "แมว",
        width: 256,
        height: 256,
        seed: 1,
        provider: "replicate",
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const chatInput = page.getByPlaceholder("บอกสิ่งที่ต้องการออกแบบ...");
  await expect(chatInput).toHaveAttribute("rows", "3");
  await chatInput.fill("ขอภาพแมว");
  await chatInput.press("Enter");

  await expect(page.getByText(/direction/i)).toBeVisible({ timeout: 60_000 });
  expect(requestCount).toBe(0);
  expect(requestBody).toBeUndefined();
});

test("runs a complete image task only after consent and shows the Canvas preloader", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | undefined;
  let releaseResponse: (() => void) | undefined;
  const responseReady = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/ai/image", async (route) => {
    requestBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await responseReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl: TEST_IMAGE_PNG_256,
        prompt: "แมวในสตูดิโอ",
        width: 256,
        height: 256,
        seed: 1,
        provider: "replicate",
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const chatInput = page.getByPlaceholder("บอกสิ่งที่ต้องการออกแบบ...");
  await chatInput.fill("สร้างภาพแมวในสตูดิโอสำหรับ Instagram อัตราส่วน 1:1");
  await chatInput.press("Enter");

  await expect.poll(() => requestBody).toBeTruthy();
  await expect(page.getByTestId("processing-preview").getByText(/กำลังสร้างภาพ/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByTestId("processing-preview").getByText("กำลังทำงาน", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  expect(requestBody).toMatchObject({
    quality: "medium",
    width: 1024,
    height: 1024,
    aspectRatio: "1:1",
    cloudConsent: true,
  });
  releaseResponse?.();

  await expect(page.getByText(/สร้างภาพตาม brief และวางบน Canvas/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Task · image_generator/)).toBeVisible();
});

test("cancels a running image task without leaving a preview", async ({ page }) => {
  let releaseResponse: (() => void) | undefined;
  const responseReady = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/ai/image", async (route) => {
    await responseReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl: TEST_IMAGE_PNG_256,
        width: 1024,
        height: 1024,
        provider: "replicate",
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const chatInput = page.getByPlaceholder("บอกสิ่งที่ต้องการออกแบบ...");
  await chatInput.fill("สร้างภาพแมวในสตูดิโอสำหรับ Instagram อัตราส่วน 1:1");
  await chatInput.press("Enter");

  await expect(page.getByTestId("processing-preview")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "ยกเลิก Task", exact: true }).click();
  releaseResponse?.();

  await expect(page.getByText(/ยกเลิกงานที่กำลังประมวลผลแล้ว/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("processing-preview")).toHaveCount(0);
});
test("answers a Canvas inventory question locally without calling a provider", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") requestCount += 1;
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const chatInput = page.getByPlaceholder("บอกสิ่งที่ต้องการออกแบบ...");
  await chatInput.fill("บน Canvas มีอะไรอยู่บ้าง");
  await chatInput.press("Enter");

  await expect(page.getByText(/บน Canvas (?:มี|ยังไม่มี) Object/)).toBeVisible({ timeout: 10_000 });
  expect(requestCount).toBe(0);
});

test("shows a selected-image name tag and local hover preview", async ({ page }) => {
  const imageBuffer = Buffer.from(TEST_IMAGE_PNG_256.split(",")[1] ?? "", "base64");
  let providerRequests = 0;
  await page.route("**/api/ai/**", async (route) => {
    providerRequests += 1;
    await route.abort();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "selected-product.png", mimeType: "image/png", buffer: imageBuffer });
  await expect(page.getByText("Image source", { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const tags = page.getByTestId("selected-image-tags");
  await expect(tags).toBeVisible({ timeout: 10_000 });
  const tag = tags.locator("button").first();
  await expect(tag).toContainText("selected-product.png");
  await tag.hover();
  await expect(page.getByTestId("selected-image-preview")).toBeVisible({ timeout: 10_000 });
  expect(providerRequests).toBe(0);
});
