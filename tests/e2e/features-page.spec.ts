import { expect, test } from "@playwright/test";

test("public /features marketing page renders without auth", async ({ page }) => {
  await page.goto("/features");

  await expect(page).toHaveURL(/\/features$/);
  await expect(page.getByTestId("features-landing")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("แคนวาส");
  await expect(page.getByRole("link", { name: "เข้าสู่ระบบ" }).first()).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "เปิดโปรเจกต์" }).first()).toHaveAttribute(
    "href",
    "/projects",
  );
});

test("home remains the sign-in gate and links to /features", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "ArtShift" })).toBeVisible();
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบด้วย Google/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "ดูฟีเจอร์" })).toHaveAttribute("href", "/features");
  await expect(page.getByTestId("home-shape-wave")).toBeAttached();
});
