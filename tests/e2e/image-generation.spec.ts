import { expect, test } from "@playwright/test";

const TEST_IMAGE_PNG_256 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAACYUlEQVR42u3UMQEAAAQAQXFEFFYXCmjghivww0dWD/BTiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABCAEGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAGAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQCXBWNwJTbzQ1x7AAAAAElFTkSuQmCC";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockVisionWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage(message: { type: string; id: number; taskPrompt?: string }) {
        if (message.type !== "execute") return;
        const task = message.taskPrompt ?? "";
        const output = task.includes("<OD>")
          ? {
              bboxes: [
                [0, 0, 128, 256],
                [128, 0, 256, 256],
              ],
              labels: ["product", "cat แมว"],
            }
          : task.includes("<OCR>")
            ? "SALE"
            : "a product photo of a cat แมว in a studio";
        queueMicrotask(() => {
          this.onmessage?.({
            data: { type: "result", id: message.id, result: { output, width: 256, height: 256 } },
          } as MessageEvent);
        });
      }
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return false;
      }
    }
    window.Worker = MockVisionWorker as unknown as typeof Worker;
  });
  await page.route("**/api/ai/director", async (route) => {
    const request = JSON.parse(route.request().postData() ?? "{}") as {
      prompt?: string;
      referenceAnalyses?: unknown[];
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        direction: {
          kind: "image-task",
          summary: "Validated E2E creative direction",
          refinedPrompt: request.prompt || "Validated E2E image brief",
          specialist: request.referenceAnalyses?.length ? "image_editor" : "image_generator",
          capability: request.referenceAnalyses?.length ? "IMAGE_EDIT" : "IMAGE_DEFAULT",
          modelAlias: "image-gpt-2",
          knowledgeSkillIds: ["poster-design"],
          reviewCriteria: ["main subject is clear", "composition follows the brief"],
          search: { required: false, queries: [], sources: [] },
        },
      }),
    });
  });
  await page.route("**/api/ai/director/review", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        review: { passed: true, summary: "Matches the approved E2E direction." },
      }),
    });
  });
});

test("refuses an explicitly requested unavailable model before any paid call", async ({ page }) => {
  let directorRequests = 0;
  let imageRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/director")) directorRequests += 1;
    if (request.url().includes("/api/ai/image")) imageRequests += 1;
  });

  await page.goto("/");
  await page.getByRole("tab", { name: /AI Assistance/i }).click();
  await page.getByLabel("AI Assistance prompt").fill("สร้างภาพโปสเตอร์คอนเสิร์ตสีแดงจัดจ้าน ใช้ Flux");
  await page.getByTitle("Send to AI Assistance").click();

  await expect(page.getByText(/Model flux-2-max ยังไม่พร้อม/)).toBeVisible();
  expect(directorRequests).toBe(0);
  expect(imageRequests).toBe(0);
});

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
  page.once("dialog", async (dialog) => dialog.accept());
  await modal.getByRole("button", { name: /Generate Image/ }).click();
  await expect(modal).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Image", exact: true })).toBeVisible({
    timeout: 30_000,
  });

  expect(requestBody).toMatchObject({
    prompt: expect.stringContaining("a warm editorial portrait"),
    aspectRatio: "1:1",
    width: 1024,
    height: 1024,
    quality: "high",
    enhance: false,
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

  await expect(page.getByText("ช่วยเลือก direction", { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });
  expect(requestCount).toBe(0);
  expect(requestBody).toBeUndefined();
});

test("does not call the provider until the user chooses a clarification direction", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/ai/image", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl: TEST_IMAGE_PNG_256,
        width: 1024,
        height: 1024,
        seed: 2,
        provider: "replicate",
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const chatInput = page.getByPlaceholder("บอกสิ่งที่ต้องการออกแบบ...");
  await chatInput.fill("สร้างภาพแมว");
  await chatInput.press("Enter");

  await expect(page.getByText("ช่วยเลือก direction", { exact: false }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /^A\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^B\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^C\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Other/ })).toBeVisible();
  expect(requestCount).toBe(0);
});

test("creates the task only after a clarification answer and consent", async ({ page }) => {
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
        width: 1024,
        height: 1024,
        seed: 3,
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
  await chatInput.fill("สร้างภาพแมว");
  await chatInput.press("Enter");
  await page.getByRole("button", { name: /^A\./ }).click();

  await expect.poll(() => requestBody).toBeTruthy();
  await expect(page.getByTestId("processing-preview")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Creative Director → image_generator/)).toBeVisible({
    timeout: 10_000,
  });
  expect(requestBody).toMatchObject({
    quality: "medium",
    cloudConsent: true,
    aspectRatio: "1:1",
  });
  releaseResponse?.();
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toBeVisible({
    timeout: 60_000,
  });
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

  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/Creative Director → image_generator/)).toBeVisible();
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

test("analyzes the visible selected image before the generation request", async ({ page }) => {
  await page.addInitScript(() => {
    class MockVisionWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage(message: { type: string; id: number; taskPrompt?: string }) {
        if (message.type !== "execute") return;
        const task = message.taskPrompt ?? "";
        const output = task.includes("<OD>")
          ? { bboxes: [[0, 0, 256, 256]], labels: ["product"] }
          : task.includes("<OCR>")
            ? "SALE"
            : "a product photo";
        queueMicrotask(() => {
          this.onmessage?.({
            data: { type: "result", id: message.id, result: { output, width: 256, height: 256 } },
          } as MessageEvent);
        });
      }
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return false;
      }
    }
    window.Worker = MockVisionWorker as unknown as typeof Worker;
  });

  const imageBuffer = Buffer.from(TEST_IMAGE_PNG_256.split(",")[1] ?? "", "base64");
  let providerCalls = 0;
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/ai/image", async (route) => {
    providerCalls += 1;
    requestBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl: TEST_IMAGE_PNG_256,
        width: 1024,
        height: 1024,
        seed: 4,
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
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "visible-product.png", mimeType: "image/png", buffer: imageBuffer });
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  await expect(page.getByTestId("selected-image-tags")).toBeVisible({ timeout: 10_000 });

  const chatInput = page.getByPlaceholder("แก้ไขภาพหรือวัตถุที่เลือก...");
  await chatInput.fill(
    "สร้างภาพโฆษณาจากภาพนี้ แบบภาพถ่ายสตูดิโอ ฉากหลังสะอาด สำหรับ Instagram อัตราส่วน 1:1",
  );
  await chatInput.press("Enter");

  await expect(page.getByText(/วิเคราะห์ภาพเสร็จแล้ว 1 รายการ/)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => providerCalls).toBe(1);
  expect(requestBody?.inputImages).toHaveLength(1);
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toBeVisible({
    timeout: 30_000,
  });
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
  const tagBox = await tag.boundingBox();
  const tagThumbnailBox = await tag.locator("img").boundingBox();
  const previewBox = await page.getByTestId("selected-image-preview").boundingBox();
  expect(tagBox?.width).toBeLessThanOrEqual(160);
  expect(tagBox?.height).toBeLessThanOrEqual(28);
  expect(tagThumbnailBox?.width).toBeLessThanOrEqual(20);
  expect(tagThumbnailBox?.height).toBeLessThanOrEqual(20);
  expect(previewBox?.width).toBe(75);
  expect(previewBox?.height).toBe(75);
  await page
    .getByRole("button", { name: "Remove selected image selected-product.png", exact: true })
    .click();
  await expect(tags.locator("button")).toHaveCount(0);
  expect(providerRequests).toBe(0);
});
