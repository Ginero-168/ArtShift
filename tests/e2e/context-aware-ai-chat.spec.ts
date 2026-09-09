import { expect, test } from "@playwright/test";
import { TEST_IMAGE_PNG_1X1, TEST_IMAGE_PNG_256 } from "./contextFixtures";

type GenerationRoute = {
  requests: Record<string, unknown>[];
  release: () => void;
};

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await installDeterministicVisionWorker(page);
  await page.route("**/api/ai/director", async (route) => {
    const request = JSON.parse(route.request().postData() ?? "{}") as {
      prompt?: string;
      referenceAnalyses?: unknown[];
    };
    const prompt = request.prompt ?? "";
    if (prompt === "ขอภาพแมว" || prompt === "สร้างภาพแมว") {
      await route.fulfill({
        json: {
          direction: {
            kind: "clarification",
            question: "แมวควรอยู่ที่ไหน?",
            options: ["ริมหน้าต่าง", "ในสวน", "ในสตูดิโอ"],
          },
        },
      });
      return;
    }
    if (prompt === "Infographic ที่เกี่ยวกับถั่ว") {
      await route.fulfill({
        json: {
          direction: {
            kind: "clarification",
            question: "อยากเล่าเรื่องถั่วด้วยแนวทางไหน?",
            options: [
              "อธิบายโครงสร้างและชนิดของถั่ว",
              "เปรียบเทียบข้อมูลและคุณสมบัติของถั่ว",
              "ใช้ตัวละครถั่วแบบมาสคอตในโปสเตอร์ editorial",
            ],
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        direction: {
          kind: "image-task",
          outputCount: 1,
          summary: "Validated context-aware E2E direction",
          refinedPrompt: prompt || "Validated context-aware E2E image brief",
          specialist: request.referenceAnalyses?.length ? "image_editor" : "image_generator",
          capability: request.referenceAnalyses?.length ? "IMAGE_EDIT" : "IMAGE_DEFAULT",
          modelAlias: "image-gpt-2",
          knowledgeSkillIds: [],
          reviewCriteria: ["main subject is clear", "composition follows the brief"],
          search: { required: false, queries: [], sources: [] },
        },
      },
    });
  });
  await page.route("**/api/ai/director/review", async (route) => {
    await route.fulfill({
      json: { review: { passed: true, summary: "Matches the approved E2E direction." } },
    });
  });
});

test("ambiguous image intent shows Director clarification without an image request", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/ai/image", async (route) => {
    requestCount += 1;
    await route.abort();
  });

  const chat = await openAssistant(page);
  await chat.fill("สร้างภาพแมว");
  await chat.press("Enter");

  await expect(page.getByText("แมวควรอยู่ที่ไหน?", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "ริมหน้าต่าง", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ในสวน", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ในสตูดิโอ", exact: true })).toBeVisible();
  expect(requestCount).toBe(0);
});

test("derives infographic directions from the submitted topic and composes the selected brief", async ({
  page,
}) => {
  const generation = await mockImageRoute(page);

  const chat = await openAssistant(page);
  await chat.fill("Infographic ที่เกี่ยวกับถั่ว");
  await chat.press("Enter");

  await expect(
    page.getByText("อยากเล่าเรื่องถั่วด้วยแนวทางไหน?", { exact: false }).first(),
  ).toBeVisible();
  const options = page.getByRole("button", {
    name: /อธิบายโครงสร้าง|เปรียบเทียบข้อมูล|ตัวละครถั่ว/iu,
  });
  await expect(options.nth(0)).toContainText("ถั่ว");
  await expect(options.nth(0)).not.toContainText("เกี่ยวกับInfographic");
  await expect(options.nth(0)).toContainText(/โครงสร้าง|อธิบาย/iu);
  await expect(options.nth(1)).toContainText(/เปรียบเทียบ|ข้อมูล|คุณสมบัติ/iu);
  await expect(options.nth(2)).toContainText(/ตัวละคร|มาสคอต|editorial/iu);
  await options.nth(2).click();

  await expect.poll(() => generation.requests.length).toBe(1);
  expect(generation.requests[0]?.prompt).toEqual(expect.stringContaining("Infographic"));
  expect(generation.requests[0]?.prompt).toEqual(expect.stringContaining("ถั่ว"));
  expect(generation.requests[0]?.prompt).toEqual(expect.stringContaining("ตัวละคร"));
  expect(generation.requests[0]?.prompt).toEqual(expect.stringContaining("โปสเตอร์"));
});

test("a clarification answer reuses the brief and reaches the task/provider seam", async ({
  page,
}) => {
  const generation = await mockImageRoute(page);

  const chat = await openAssistant(page);
  await chat.fill("ขอภาพแมว");
  await chat.press("Enter");
  await expect(page.getByText("แมวควรอยู่ที่ไหน?", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "ริมหน้าต่าง", exact: true }).click();

  await expect.poll(() => generation.requests.length).toBe(1);
  await expect(page.getByText(/Creative Director → image_generator/)).toBeVisible();
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toBeVisible({
    timeout: 30_000,
  });
  expect(generation.requests[0]?.prompt).toEqual(expect.stringContaining("ขอภาพแมว"));
  expect(generation.requests[0]).toMatchObject({ cloudConsent: true });
});

test("one selected image gets a tag, local preview, analysis, and reference request", async ({
  page,
}) => {
  const generation = await mockImageRoute(page);

  await page.goto("/");
  await uploadImage(page, "reference-one.png");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const chat = page.getByPlaceholder(/บอกสิ่งที่ต้องการออกแบบ|แก้ไขภาพ/).first();
  const tags = page.getByTestId("selected-image-tags");
  await expect(tags).toBeVisible();
  await expect(tags.locator("button").first()).toContainText("reference-one.png");
  await tags.locator("button").first().hover();
  await expect(page.getByTestId("selected-image-preview")).toBeVisible();

  await chat.fill("สร้างภาพโฆษณาจากภาพนี้ แบบภาพถ่ายสตูดิโอ ฉากหลังสะอาด สำหรับ Instagram อัตราส่วน 1:1");
  await chat.press("Enter");
  await expect(page.getByText(/วิเคราะห์ภาพเสร็จแล้ว 1 รายการ/)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => generation.requests.length).toBe(1);
  expect(generation.requests[0]?.inputImages).toHaveLength(1);
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toBeVisible({
    timeout: 30_000,
  });
});

test("five selected images are narrowed locally and do not call the provider", async ({ page }) => {
  let providerCalls = 0;
  await page.route("**/api/ai/image", async (route) => {
    providerCalls += 1;
    await route.abort();
  });

  await page.goto("/");
  for (let index = 1; index <= 5; index += 1) {
    await uploadImage(page, `reference-${index}.png`);
  }
  await page.getByRole("button", { name: "Open layers", exact: true }).click();
  const layers = page.locator('section[aria-label$=" layer"]');
  await expect(layers).toHaveCount(5);
  await layers.nth(0).click();
  for (let index = 1; index < 5; index += 1) {
    await layers.nth(index).click({ modifiers: ["Control"] });
  }
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();

  const tags = page.getByTestId("selected-image-tags");
  await expect(tags).toBeVisible();
  await expect(tags.getByText("+1", { exact: true })).toBeVisible();
  const chat = page.getByPlaceholder("แก้ไขภาพหรือวัตถุที่เลือก...");
  await chat.fill("สร้างภาพโฆษณาจากภาพที่เลือก สำหรับ Instagram อัตราส่วน 1:1");
  await chat.press("Enter");

  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  await expect(page.getByText("ตอนนี้เลือกภาพสำหรับ AI มากเกินไปครับ", { exact: false })).toBeVisible();
  expect(providerCalls).toBe(0);
});

test("changing the Canvas target while generation is blocked fails without a success commit", async ({
  page,
}) => {
  const generation = await mockImageRoute(page, { hold: true });
  const chat = await openAssistant(page);
  await chat.fill("สร้างภาพแมวในสตูดิโอสำหรับ Instagram อัตราส่วน 1:1");
  await chat.press("Enter");
  await expect(page.getByTestId("processing-preview")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: /Block/ }).click();
  await uploadImage(page, "target-change.png");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  generation.release();

  await expect(page.getByText(/Task ไม่สำเร็จ|Canvas target changed/).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toHaveCount(0);
});

test("preloader exposes analyzing/generating and clears after a successful viewport-safe commit", async ({
  page,
}) => {
  const generation = await mockImageRoute(page, { hold: true });
  const chat = await openAssistant(page);
  await chat.fill("สร้างภาพแมวในสตูดิโอสำหรับ Instagram อัตราส่วน 1:1");
  await chat.press("Enter");

  const preview = page.getByTestId("processing-preview");
  await expect(preview).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => preview.getAttribute("data-preview-phase"))
    .toMatch(/analyzing|generating/);
  await expect(preview.getByText("กำลังทำงาน", { exact: true })).toBeVisible();
  generation.release();
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(preview).toHaveCount(0);
});

test("cancelling a running task clears the preview and leaves no result message", async ({
  page,
}) => {
  const generation = await mockImageRoute(page, { hold: true });
  const chat = await openAssistant(page);
  await chat.fill("สร้างภาพแมวในสตูดิโอสำหรับ Instagram อัตราส่วน 1:1");
  await chat.press("Enter");
  await expect(page.getByTestId("processing-preview")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "ยกเลิก Task", exact: true }).click();
  generation.release();

  await expect(page.getByText(/ยกเลิกงานที่กำลังประมวลผลแล้ว/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("processing-preview")).toHaveCount(0);
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toHaveCount(0);
});

test("a known quality failure gets one corrected retry within the task budget", async ({
  page,
}) => {
  const generation = await mockImageRoute(page, { firstSmall: true });
  const chat = await openAssistant(page);
  await chat.fill("สร้างภาพแมวในสตูดิโอสำหรับ Instagram อัตราส่วน 1:1");
  await chat.press("Enter");

  await expect.poll(() => generation.requests.length).toBe(2);
  expect(generation.requests[1]?.prompt).not.toBe(generation.requests[0]?.prompt);
  await expect(page.getByText(/สร้างภาพตามแผนของ Creative Director และวางบน Canvas/)).toBeVisible({
    timeout: 30_000,
  });
});

test("keeps an uncertain provider result terminal without creating a second request", async ({
  page,
}) => {
  let providerCalls = 0;
  await page.route("**/api/ai/image", async (route) => {
    providerCalls += 1;
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        code: "OUTCOME_UNKNOWN",
        error: "AI provider result is uncertain; no duplicate request was created.",
        predictionId: "prediction-browser-1",
      }),
    });
  });
  const chat = await openAssistant(page);
  await chat.fill("สร้างภาพแมวในสตูดิโอสำหรับ Instagram อัตราส่วน 1:1");
  await chat.press("Enter");

  await expect(page.getByText(/ตอนนี้ยังยืนยันผลลัพธ์จาก AI provider ไม่ได้/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("processing-preview")).toHaveCount(0);
  expect(providerCalls).toBe(1);
});

test("answers a Canvas inventory question locally with zero non-GET provider work", async ({
  page,
}) => {
  let nonGetCalls = 0;
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") nonGetCalls += 1;
    await route.continue();
  });

  const chat = await openAssistant(page);
  await chat.fill("บน Canvas มีอะไรอยู่บ้าง");
  await chat.press("Enter");
  await expect(page.getByText(/บน Canvas (?:มี|ยังไม่มี) Object/)).toBeVisible({ timeout: 10_000 });
  expect(nonGetCalls).toBe(0);
});

test("selected tag supports Escape preview dismissal, three-row input, and viewport interaction", async ({
  page,
}) => {
  let providerCalls = 0;
  await page.route("**/api/ai/**", async (route) => {
    providerCalls += 1;
    await route.abort();
  });

  await page.goto("/");
  await uploadImage(page, "escape-preview.png");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  const tags = page.getByTestId("selected-image-tags");
  await expect(tags).toBeVisible();
  await tags.locator("button").first().hover();
  await expect(page.getByTestId("selected-image-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("selected-image-preview")).toHaveCount(0);
  await expect(page.getByPlaceholder("แก้ไขภาพหรือวัตถุที่เลือก...")).toHaveAttribute("rows", "3");
  await page.locator("canvas").first().hover();
  await page.mouse.wheel(0, 160);
  expect(providerCalls).toBe(0);
});

async function openAssistant(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "AI Assistance", exact: true }).click();
  return page.getByPlaceholder(/บอกสิ่งที่ต้องการออกแบบ|แก้ไขภาพ/).first();
}

async function uploadImage(page: import("@playwright/test").Page, name: string) {
  const photoButton = page.getByRole("button", { name: "Photo", exact: true });
  if ((await photoButton.count()) === 0) {
    await page.getByRole("tab", { name: /Block/ }).click();
  }
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  const imageBuffer = Buffer.from(TEST_IMAGE_PNG_256.split(",")[1] ?? "", "base64");
  await page
    .locator("label")
    .filter({ hasText: "Choose image" })
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: "image/png", buffer: imageBuffer });
}

async function mockImageRoute(
  page: import("@playwright/test").Page,
  options: { hold?: boolean; firstSmall?: boolean } = {},
): Promise<GenerationRoute> {
  const requests: Record<string, unknown>[] = [];
  let releaseGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  await page.route("**/api/ai/image", async (route) => {
    requests.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    if (options.hold) await gate;
    const dataUrl =
      options.firstSmall && requests.length === 1 ? TEST_IMAGE_PNG_1X1 : TEST_IMAGE_PNG_256;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        dataUrl,
        width: 1024,
        height: 1024,
        seed: requests.length,
        provider: "replicate",
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });
  return { requests, release: releaseGate };
}

async function installDeterministicVisionWorker(page: import("@playwright/test").Page) {
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
}
