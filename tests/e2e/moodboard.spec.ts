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

test("Moodboard reuses editor chrome, Pinterest panel, and Block Note", async ({ page }) => {
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
  await page.getByRole("button", { name: "+ Moodboard" }).click();

  await expect(page.locator("[data-moodboard-viewport]")).toBeVisible();
  await expect(page.getByText("Infinite artboard", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Moodboard keyword")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand", exact: true })).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Vector editing tools" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "AI Assistance" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Block" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pinterest" })).toBeVisible();
  await expect(page.getByText("✨ AI Image Studio (GPT Image 2 · low)")).toHaveCount(0);

  await page.getByRole("tab", { name: "Block" }).click();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.locator("[data-moodboard-item]")).toHaveCount(1);
  await expect(page.locator("[data-moodboard-item]")).toHaveAttribute("data-rotation", "0");

  await page.getByRole("tab", { name: "Pinterest" }).click();
  await expect(page.locator("[data-pinterest-panel]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pinterest" })).toBeVisible();
  await expect(page.getByText("Not connected to Pinterest yet")).toBeVisible();
  await page.getByRole("button", { name: "Connect Pinterest" }).click();
  await expect(page.getByText(/PINTEREST_CLIENT_ID/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pins" })).toHaveCount(0);

  await page.screenshot({
    path: `${ARTIFACT_DIR}/moodboard_pinterest_empty.png`,
    fullPage: true,
  });

  const pinSrc = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  await page.route("**/api/pinterest/status", async (route) => {
    await route.fulfill({
      json: {
        oauthConfigured: true,
        connected: true,
        officialSavedPins: "oauth_when_configured",
        userPaste: "fallback",
        scrape: "not_supported",
      },
    });
  });
  await page.route("**/api/pinterest/pins", async (route) => {
    await route.fulfill({
      json: {
        pins: [{ id: "pin-1", title: "Prompt capsule", src: pinSrc }],
        connected: true,
      },
    });
  });
  await page.route("**/api/pinterest/boards", async (route) => {
    await route.fulfill({
      json: { boards: [{ id: "board-1", name: "Refs", pinCount: 1 }], connected: true },
    });
  });
  await page.route("**/api/pinterest/disconnect", async (route) => {
    await route.fulfill({ json: { connected: false } });
  });

  await page.getByRole("tab", { name: "Block" }).click();
  await page.getByRole("tab", { name: "Pinterest" }).click();
  await expect(page.getByRole("tab", { name: "Pins" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Boards" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Prompt capsule" })).toBeVisible();
  await page.screenshot({
    path: `${ARTIFACT_DIR}/moodboard_pinterest_panel.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pinterest menu" }).click();
  await expect(page.getByRole("button", { name: "Paste Pin URL (fallback)" })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("Not connected to Pinterest yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Pinterest" })).toBeVisible();

  await page.getByTitle("Menu").click();
  await page.getByText("Copy moodboard to slide").click();
  await expect(page.locator("[data-moodboard-viewport]")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("toolbar", { name: "Vector editing tools" })).toBeVisible();
  await page.screenshot({
    path: `${ARTIFACT_DIR}/moodboard_copied_to_artwork_slide.png`,
    fullPage: true,
  });
});
