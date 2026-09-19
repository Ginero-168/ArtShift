import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = existsSync("/opt/cursor/artifacts") ? "/opt/cursor/artifacts" : "test-results";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      json: {
        authenticated: true,
        user: {
          id: "e2e-user",
          provider: "google",
          email: "e2e@artshift.test",
          name: "E2E",
          picture: null,
          createdAt: Date.now(),
        },
      },
    });
  });
});

test("creates a frameless Moodboard slide from the rail", async ({ page }) => {
  page.on("pageerror", (error) => {
    console.log("pageerror", error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("console", msg.text());
  });

  await page.goto("/projects");
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page).toHaveURL(/\/projects\/.+\/editor/, { timeout: 30_000 });

  await page.getByTitle("Expand slides").click();
  await expect(page.getByRole("button", { name: "+ Moodboard" })).toBeVisible();
  await page.screenshot({
    path: `${ARTIFACT_DIR}/moodboard_rail_before_create.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "+ Moodboard" }).click();

  await expect(page.getByLabel("Moodboard keyword")).toBeVisible();
  await expect(page.getByText("Infinite artboard")).toBeVisible();
  await expect(page.locator("[data-moodboard-viewport]")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Moodboard tools" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Vector editing tools" })).toHaveCount(0);
  await expect(page.getByText("✨ AI Image Studio (GPT Image 2 · low)")).toHaveCount(0);

  await page.getByRole("button", { name: "+ Note" }).click();
  await expect(page.locator("[data-moodboard-item]")).toHaveCount(1);
  await expect(page.locator("[data-moodboard-item]")).toHaveAttribute("data-rotation", "0");

  await page.getByRole("button", { name: "References" }).click();
  await expect(page.locator("[data-moodboard-reference-panel]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pinterest" })).toBeVisible();
  await expect(page.getByText(/blocked_pending_app_review|does not scrape/i)).toBeVisible();

  await page.screenshot({
    path: `${ARTIFACT_DIR}/moodboard_infinite_artboard_with_note.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Copy to slide" }).first().click();
  await expect(page.locator("[data-moodboard-viewport]")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("toolbar", { name: "Vector editing tools" })).toBeVisible();
});
