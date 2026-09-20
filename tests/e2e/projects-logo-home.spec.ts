import { expect, type Page, test } from "@playwright/test";

async function mockAuth(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: "e2e-user",
          provider: "google",
          email: "e2e@example.com",
          name: "E2E",
          picture: null,
          createdAt: Date.now(),
        },
      }),
    });
  });
}

test("Projects header ArtShift wordmark navigates to Index home", async ({ page }) => {
  await mockAuth(page);
  await page.goto("/projects");

  const homeLink = page.getByRole("link", { name: "ArtShift home" });
  await expect(homeLink).toBeVisible();
  await expect(homeLink).toHaveAttribute("href", "/");

  await homeLink.click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "ArtShift" })).toBeVisible();
});
