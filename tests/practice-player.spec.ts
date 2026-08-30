import { test, expect, request } from "@playwright/test";
import {
  API,
  loginAdmin,
  taskBlock,
  DRAG_DROP_TARGETS,
  DRAG_DROP_ITEMS,
  DRAG_DROP_CORRECT_PLACEMENTS,
  createPracticeTask,
} from "./support/helpers";

test("solves a v2 drag-drop practice task with pointer and touch input", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createPracticeTask(api, headers, "drag_drop");
  await api.dispose();

  await page.goto(`/practica/tarea?id=${task.id}&nombre=Titi`);
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();

  const stage = page.locator('[aria-label^="Escenario de la tarea."]');
  const itemButton = (imageName: string) =>
    page.getByRole("img", { name: imageName }).locator("..");
  const targetPoint = async (target: (typeof DRAG_DROP_TARGETS)[number]) => {
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    return {
      x: box!.x + (target.x / 100) * box!.width,
      y: box!.y + (target.y / 100) * box!.height,
    };
  };
  const expectAtTarget = async (
    imageName: string,
    target: (typeof DRAG_DROP_TARGETS)[number],
  ) => {
    const [buttonBox, point] = await Promise.all([
      itemButton(imageName).boundingBox(),
      targetPoint(target),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(
      Math.abs(buttonBox!.x + buttonBox!.width / 2 - point.x),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(buttonBox!.y + buttonBox!.height / 2 - point.y),
    ).toBeLessThanOrEqual(1);
  };
  const expectScaledWidth = async (
    imageName: string,
    widthPercent: number,
    activeStage = stage,
    activeItemButton = itemButton(imageName),
  ) => {
    const [buttonBox, stageBox] = await Promise.all([
      activeItemButton.boundingBox(),
      activeStage.boundingBox(),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(
      Math.abs(buttonBox!.width - (stageBox!.width * widthPercent) / 100),
    ).toBeLessThanOrEqual(1);
  };

  await expect(stage).toHaveText("");
  await expect(stage.getByRole("button")).toHaveCount(0);
  const initialHtml = await stage.evaluate((element) => element.outerHTML);
  expect(initialHtml).not.toContain("snapRadius");
  for (const target of DRAG_DROP_TARGETS) {
    await expect(page.getByText(target.id, { exact: true })).toHaveCount(0);
  }

  const alpha = itemButton(DRAG_DROP_ITEMS[0].image.name);
  await alpha.click();
  await expect(alpha).toHaveAttribute("aria-pressed", "true");
  await stage.click({ position: { x: 400, y: 20 } });
  await expect(stage.getByRole("button")).toHaveCount(0);
  await expect(alpha).toHaveAttribute("aria-pressed", "true");

  const targetTwoPoint = await targetPoint(DRAG_DROP_TARGETS[0]);
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.width).toBeLessThanOrEqual(769);
  const outsideCircleOffset =
    Math.min(stageBox!.width, stageBox!.height) * 0.08;
  await page.mouse.click(
    targetTwoPoint.x + outsideCircleOffset,
    targetTwoPoint.y + outsideCircleOffset,
  );
  await expect(stage.getByRole("button")).toHaveCount(0);
  await expect(alpha).toHaveAttribute("aria-pressed", "true");

  await page.mouse.click(targetTwoPoint.x, targetTwoPoint.y);
  await expectAtTarget(DRAG_DROP_ITEMS[0].image.name, DRAG_DROP_TARGETS[0]);
  await expectScaledWidth(
    DRAG_DROP_ITEMS[0].image.name,
    DRAG_DROP_ITEMS[0].widthPercent,
  );

  const beta = itemButton(DRAG_DROP_ITEMS[1].image.name);
  const betaBox = await beta.boundingBox();
  expect(betaBox).not.toBeNull();
  await page.mouse.move(
    betaBox!.x + betaBox!.width / 2,
    betaBox!.y + betaBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(targetTwoPoint.x, targetTwoPoint.y, { steps: 8 });
  await page.mouse.up();
  await expectAtTarget(DRAG_DROP_ITEMS[1].image.name, DRAG_DROP_TARGETS[0]);
  await expectScaledWidth(
    DRAG_DROP_ITEMS[1].image.name,
    DRAG_DROP_ITEMS[1].widthPercent,
  );
  await expect(stage.getByRole("button")).toHaveCount(1);
  await expect(itemButton(DRAG_DROP_ITEMS[0].image.name)).toContainText(
    DRAG_DROP_ITEMS[0].label,
  );

  await itemButton(DRAG_DROP_ITEMS[0].image.name).click();
  const targetOnePoint = await targetPoint(DRAG_DROP_TARGETS[1]);
  await page.mouse.click(targetOnePoint.x, targetOnePoint.y);
  await expectAtTarget(DRAG_DROP_ITEMS[0].image.name, DRAG_DROP_TARGETS[1]);

  await itemButton(DRAG_DROP_ITEMS[0].image.name).click();
  const occupiedTargetPoint = await targetPoint(DRAG_DROP_TARGETS[0]);
  await page.mouse.click(occupiedTargetPoint.x, occupiedTargetPoint.y);
  await expectAtTarget(DRAG_DROP_ITEMS[0].image.name, DRAG_DROP_TARGETS[0]);
  await expectAtTarget(DRAG_DROP_ITEMS[1].image.name, DRAG_DROP_TARGETS[1]);

  const checkRequest = page.waitForRequest(
    (candidate) =>
      candidate.url() === `${API}/api/practice/tasks/${task.id}/check` &&
      candidate.method() === "POST",
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  expect((await checkRequest).postDataJSON()).toEqual({
    payload: { placements: DRAG_DROP_CORRECT_PLACEMENTS },
  });
  await expect(page.getByText("¡Correcto!", { exact: true })).toBeVisible();

  const touchContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const touchPage = await touchContext.newPage();
    await touchPage.goto(`/practica/tarea?id=${task.id}&nombre=Titi`);
    await expect(
      touchPage.getByRole("heading", { name: task.title }),
    ).toBeVisible();
    const touchStage = touchPage.locator(
      '[aria-label^="Escenario de la tarea."]',
    );
    const touchBeta = touchPage
      .getByRole("img", { name: DRAG_DROP_ITEMS[1].image.name })
      .locator("..");
    await touchBeta.tap();
    await expect(touchBeta).toHaveAttribute("aria-pressed", "true");
    const touchStageBox = await touchStage.boundingBox();
    expect(touchStageBox).not.toBeNull();
    const touchTarget = DRAG_DROP_TARGETS[1];
    await touchPage.touchscreen.tap(
      touchStageBox!.x + (touchTarget.x / 100) * touchStageBox!.width,
      touchStageBox!.y + (touchTarget.y / 100) * touchStageBox!.height,
    );
    const placedBeta = await touchBeta.boundingBox();
    expect(placedBeta).not.toBeNull();
    expect(
      Math.abs(
        placedBeta!.x +
          placedBeta!.width / 2 -
          (touchStageBox!.x + (touchTarget.x / 100) * touchStageBox!.width),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        placedBeta!.y +
          placedBeta!.height / 2 -
          (touchStageBox!.y + (touchTarget.y / 100) * touchStageBox!.height),
      ),
    ).toBeLessThanOrEqual(1);
    await expectScaledWidth(
      DRAG_DROP_ITEMS[1].image.name,
      DRAG_DROP_ITEMS[1].widthPercent,
      touchStage,
      touchBeta,
    );
  } finally {
    await touchContext.close();
  }
});

test("uses any and all selection modes in the practice player", async ({
  page,
}) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const answers = ["A", "B", "C"].map((id) => ({
    id,
    blocks: [taskBlock(`player-${id}-${Date.now()}`, `Respuesta ${id}`)],
  }));
  const anyTask = await createPracticeTask(
    api,
    headers,
    "multiple_choice",
    {
      title: "Jugador criterio any",
      answers,
      correctAnswerId: "any:B,C",
    },
  );
  const allTask = await createPracticeTask(
    api,
    headers,
    "multiple_choice",
    {
      title: "Jugador criterio all",
      answers,
      correctAnswerId: "all:B,C",
    },
  );
  await api.dispose();

  await page.goto(`/practica/tarea?id=${anyTask.id}&nombre=Titi`);
  await page.getByRole("button", { name: "Respuesta B", exact: true }).click();
  await page.getByRole("button", { name: "Respuesta C", exact: true }).click();
  const anyCheck = page.waitForRequest(
    (candidate) =>
      candidate.url() === `${API}/api/practice/tasks/${anyTask.id}/check` &&
      candidate.method() === "POST",
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  expect((await anyCheck).postDataJSON().payload.selected).toEqual(["C"]);
  await expect(page.getByText("¡Correcto!", { exact: true })).toBeVisible();

  await page.goto(`/practica/tarea?id=${allTask.id}&nombre=Titi`);
  await expect(
    page.getByText("Debes marcar todas las opciones correctas.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Respuesta B", exact: true }).click();
  await page.getByRole("button", { name: "Respuesta C", exact: true }).click();
  const allCheck = page.waitForRequest(
    (candidate) =>
      candidate.url() === `${API}/api/practice/tasks/${allTask.id}/check` &&
      candidate.method() === "POST",
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  expect((await allCheck).postDataJSON().payload.selected).toEqual(["B", "C"]);
  await expect(page.getByText("¡Correcto!", { exact: true })).toBeVisible();
});
