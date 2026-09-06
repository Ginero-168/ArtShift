import { expect, test } from "@playwright/test";

const TEST_IMAGE_PNG_256 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAACYUlEQVR42u3UMQEAAAQAQXFEFFYXCmjghivww0dWD/BTiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABiAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABCAEGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAGAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQCXBWNwJTbzQ1x7AAAAAElFTkSuQmCC";

test.describe("Visual Orchestrator Kernel UI routing", () => {
  test("keeps a simple image request in clarification before the image API", async ({ page }) => {
    let imageRequestCount = 0;
    let requestBody: Record<string, unknown> | undefined;
    await page.route("**/api/ai/image", async (route) => {
      imageRequestCount += 1;
      requestBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          dataUrl: TEST_IMAGE_PNG_256,
          seed: 1,
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("tab", { name: "AI Assistance" }).click();
    const input = page.getByPlaceholder("บอกสิ่งที่ต้องการออกแบบ...");
    await input.fill("ขอภาพแมว");
    await input.press("Enter");

    await expect(page.getByText(/direction/i)).toBeVisible();
    expect(imageRequestCount).toBe(0);
    expect(requestBody).toBeUndefined();
  });

  test("clarifies complex typography work before calling any execution route", async ({ page }) => {
    let imageRequestCount = 0;
    let designAgentRequestCount = 0;
    await page.route("**/api/ai/image", async (route) => {
      imageRequestCount += 1;
      await route.abort();
    });
    await page.route("**/api/design-agent", async (route) => {
      designAgentRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            type: "question",
            id: "need-brief",
            text: "ระบุข้อความและขนาดโปสเตอร์ก่อนเริ่มงานครับ",
          },
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("tab", { name: "AI Assistance" }).click();
    const input = page.getByPlaceholder("บอกสิ่งที่ต้องการออกแบบ...");
    await input.fill("สร้างภาพโปสเตอร์ 3 แบบ พร้อมข้อความภาษาไทย");
    await input.press("Enter");

    await expect(page.getByText("ช่วยเลือก direction", { exact: false }).first()).toBeVisible();
    expect(designAgentRequestCount).toBe(0);
    expect(imageRequestCount).toBe(0);
  });
});
