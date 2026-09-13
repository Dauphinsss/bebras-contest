import { expect, test, type Locator, type Page } from "@playwright/test";
import { DRAG_DROP_BACKGROUND, DRAG_DROP_ITEMS, loginAdminPage } from "./support/helpers";

const targets = [
  { id: "center", x: 50, y: 50, snapRadius: 5 },
  { id: "left", x: 0, y: 50, snapRadius: 8 },
  { id: "right", x: 100, y: 50, snapRadius: 8 },
  { id: "top", x: 50, y: 0, snapRadius: 8 },
  { id: "bottom", x: 50, y: 100, snapRadius: 8 },
];

async function openDraft(page: Page, textual = false) {
  await loginAdminPage(page);
  const task = {
    taskId: "player-refinement-draft",
    title: "Borrador del player",
    categories: [],
    difficulties: {},
    bodyBlocks: [],
    challengeBlocks: [],
    answerType: "drag_drop",
    answers: [],
    dragDropBackground: DRAG_DROP_BACKGROUND,
    dragDropTargets: targets,
    dragDropItems: [
      { id: "a", label: "Ficha de prueba", image: textual ? null : DRAG_DROP_ITEMS[0].image, widthPercent: 12 },
      { id: "b", label: "", image: textual ? null : DRAG_DROP_ITEMS[1].image, widthPercent: 12 },
    ],
  };
  await page.addInitScript((task) => {
    sessionStorage.setItem("bebras:task-draft-test", JSON.stringify({ taskId: null, task }));
  }, task);
  // This is a frontend draft fixture, including incomplete pieces. It does not
  // assert that the backend accepts missing images when saving or previewing.
  await page.route("**/api/tasks/draft/preview", (route) => route.fulfill({ json: task }));
  await page.goto("/tareas/probador?borrador=1");
  await expect(page.getByText("Cambios sin guardar", { exact: true })).toBeVisible();
  const stage = page.locator('[aria-label^="Escenario de la tarea."]');
  await expect(stage).toBeVisible();
  await expect.poll(() => stage.locator('img[alt="Escenario de la tarea"]').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await stage.scrollIntoViewIfNeeded();
  return stage;
}

async function drag(page: Page, from: Locator, to: { x: number; y: number }, touch: boolean) {
  const box = await from.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start.x + (to.x - start.x) * step / 8, y: start.y + (to.y - start.y) * step / 8 }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
}

for (const width of [1280, 390]) {
  test.describe(`drag-drop player refinement ${width}px`, () => {
    const touch = width === 390;
    test.use({ viewport: { width, height: 1000 }, hasTouch: touch });

    test("outside each edge returns to tray even inside an overflowing snap circle", async ({ page }) => {
      const stage = await openDraft(page);
      const piece = page.getByRole("button", { name: "Ficha de prueba", exact: true });
      for (const target of targets.slice(1)) {
        await piece.click();
        const box = (await stage.boundingBox())!;
        await stage.click({ position: { x: box.width / 2, y: box.height / 2 } });
        await expect(stage.getByRole("button", { name: "Ficha de prueba" })).toBeVisible();
        const x = box.x + box.width * target.x / 100 + (target.id === "left" ? -1 : target.id === "right" ? 1 : 0);
        const y = box.y + box.height * target.y / 100 + (target.id === "top" ? -1 : target.id === "bottom" ? 1 : 0);
        await drag(page, piece, { x, y }, touch);
        await expect(stage.getByRole("button", { name: "Ficha de prueba" })).toHaveCount(0);
        await expect(page.locator('[data-tray-slot="0"]')).toHaveAttribute("aria-label", "Ficha de prueba");
      }
    });

    test("inside away from destinations preserves the original placement", async ({ page }) => {
      const stage = await openDraft(page);
      const piece = page.getByRole("button", { name: "Ficha de prueba", exact: true });
      await piece.click();
      const box = (await stage.boundingBox())!;
      await stage.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await drag(page, piece, { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 }, touch);
      await expect(stage.getByRole("button", { name: "Ficha de prueba" })).toHaveAttribute("style", /left: 50%; top: 50%;/);
      await expect(page.locator('[data-tray-slot="0"]')).toHaveAttribute("aria-label", "Lugar 1 de la bandeja, vacío");
    });

    test("textual draft fallback remains usable and reset preserves reordered tray", async ({ page }) => {
      const stage = await openDraft(page, true);
      const piece = page.getByRole("button", { name: "Ficha de prueba", exact: true });
      const other = page.getByRole("button", { name: "Objeto", exact: true });
      await expect(piece).toHaveText("Ficha de prueba");
      await expect(other).toHaveText("Objeto");
      await expect(piece.locator("img")).toHaveCount(0);
      const otherBox = (await other.boundingBox())!;
      await drag(page, piece, { x: otherBox.x + otherBox.width / 2, y: otherBox.y + otherBox.height / 2 }, touch);
      await expect(page.locator('[data-tray-slot="1"]')).toHaveAttribute("aria-label", "Ficha de prueba");
      await piece.click();
      const box = (await stage.boundingBox())!;
      await stage.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(stage.getByRole("button", { name: "Ficha de prueba" })).toHaveText("Ficha de prueba");
      await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
      await expect(stage.getByRole("button")).toHaveCount(0);
      await expect(page.locator('[data-tray-slot="1"]')).toHaveAttribute("aria-label", "Ficha de prueba");
      await expect(page.locator('[data-tray-slot="0"]')).toHaveAttribute("aria-label", "Objeto");
    });
  });
}
