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

test("Block tab has no Composition presets and still exposes smart editor controls", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /New Project/i })
    .first()
    .click();
  await expect(page.getByRole("application", { name: /Slide canvas/ })).toBeVisible({
    timeout: 20_000,
  });

  const library = page.getByLabel("Blocks and AI Assistance");
  await expect(page.getByRole("tab", { name: /Block/ })).toBeVisible();
  await page.getByRole("tab", { name: /Block/ }).click();
  await expect(library.getByLabel("Search blocks")).toBeVisible();

  await expect(library.getByText("Composition", { exact: true })).toHaveCount(0);
  await expect(library.getByRole("button", { name: "Insert Hero composition" })).toHaveCount(0);
  await expect(
    library.getByRole("button", { name: "Insert Text + Image composition" }),
  ).toHaveCount(0);
  await expect(library.getByRole("button", { name: "Insert Offer / CTA composition" })).toHaveCount(
    0,
  );
  await expect(library.getByRole("button", { name: "Hero", exact: true })).toHaveCount(0);
  await expect(library.getByRole("button", { name: "Text + Image", exact: true })).toHaveCount(0);
  await expect(library.getByRole("button", { name: "Offer / CTA", exact: true })).toHaveCount(0);

  await library.getByRole("button", { name: "Text", exact: true }).click();
  await library.getByRole("button", { name: "CTA button", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: /options/ })).toBeVisible();

  await page.getByRole("button", { name: "Open layers" }).click();
  await expect(page.getByRole("complementary", { name: "Layers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse Hero composition group" })).toHaveCount(
    0,
  );
  await expect(page.getByText("4 slots")).toHaveCount(0);

  const smartArrange = page.getByRole("button", { name: /Smart Arrange/ });
  await expect(smartArrange).toBeVisible();
  await smartArrange.click();
  await expect(page.getByRole("dialog", { name: "Smart Arrange" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Smart Arrange" })).toHaveCount(0);
});
