import { expect, type Page, test } from "@playwright/test";

const fixturePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR42u3XsQ0AMAgDMM7h/3v4pX2gK6BKjpQlk9fEWU4AALzGymwpAAAAAAAAAAAAwD8AvwBgMheDCoGR2Tps8gAAAABJRU5ErkJggg==",
  "base64",
);

const MOCK_PHOTOPEA_HTML = `<!doctype html>
<html>
  <body>
    <script>
      let file = null;
      window.addEventListener("message", (event) => {
        if (event.data instanceof ArrayBuffer) {
          file = event.data;
          parent.postMessage("done", "*");
          return;
        }
        if (typeof event.data === "string" && event.data.includes("saveToOE")) {
          if (file) parent.postMessage(file, "*");
          parent.postMessage("artshift:photopea-save", "*");
          parent.postMessage("done", "*");
        }
      });
      parent.postMessage("done", "*");
    </script>
  </body>
</html>`;

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

async function mockPhotopeaOrigin(page: Page) {
  await page.route("https://www.photopea.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: MOCK_PHOTOPEA_HTML,
    });
  });
  await page.route("https://www.photopea.com/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: MOCK_PHOTOPEA_HTML,
    });
  });
}

async function dropPngOnCanvas(page: Page, name: string) {
  const canvas = page.getByRole("application", { name: /Slide canvas/ });
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas is not visible");

  await page.evaluate(
    async ({ x, y, name: fileName, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const file = new File([bytes], fileName, { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.elementFromPoint(x, y);
      if (!target) throw new Error("No drop target");
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: x,
          clientY: y,
        }),
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: x,
          clientY: y,
        }),
      );
    },
    {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      name,
      b64: fixturePng.toString("base64"),
    },
  );
}

async function openEditorWithImage(page: Page) {
  await mockAuth(page);
  await mockPhotopeaOrigin(page);
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /New Project/i })
    .first()
    .click();
  await expect(page.getByRole("application", { name: /Slide canvas/ })).toBeVisible({
    timeout: 20_000,
  });
  await dropPngOnCanvas(page, "photopea-source.png");
  await expect(editRasterButton(page)).toBeVisible({
    timeout: 10_000,
  });
}

function editRasterButton(page: Page) {
  return page.locator(".object-context-button[data-context-label='Edit Raster']");
}

async function selectionPoints(page: Page) {
  const selection = page.getByRole("group", { name: "Selection controls", exact: true });
  const polygon = selection.locator("polygon").first();
  await expect(polygon).toBeVisible();
  return polygon.getAttribute("points");
}

test("Edit Raster opens Photopea, Apply keeps placement, Close returns to canvas", async ({
  page,
}) => {
  await openEditorWithImage(page);

  const before = await selectionPoints(page);
  await expect(page.getByRole("dialog", { name: "Raster Studio" })).toHaveCount(0);

  await editRasterButton(page).click();

  await expect(page.getByRole("heading", { name: /Photopea/ })).toBeVisible();
  await expect(page.getByText("primary raster editor")).toBeVisible();
  await expect(page.getByText(/runs on photopea.com/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Raster Studio" })).toHaveCount(0);
  await expect(page.getByTitle("Photopea editor")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Ready — File → Save/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Apply back to ArtShift" }).click();
  await expect(page.getByRole("heading", { name: /Photopea/ })).toHaveCount(0, { timeout: 15_000 });
  await expect(editRasterButton(page)).toBeVisible();
  expect(await selectionPoints(page)).toBe(before);

  await editRasterButton(page).click();
  await expect(page.getByText(/Ready — File → Save/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: /Close Photopea without applying/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close without applying" }).click();
  await expect(page.getByRole("heading", { name: /Photopea/ })).toHaveCount(0);
  await expect(editRasterButton(page)).toBeVisible();
  expect(await selectionPoints(page)).toBe(before);
});
