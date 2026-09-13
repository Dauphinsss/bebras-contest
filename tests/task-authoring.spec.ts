import { test, expect, request } from "@playwright/test";
import {
  API,
  taskBlock,
  DRAG_DROP_TARGETS,
  createPracticeTask,
  loginAdmin,
  loginAdminPage,
} from "./support/helpers";

test("keeps task authoring controls responsive in the current layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createPracticeTask(api, headers, "drag_drop");

  await loginAdminPage(page);
  await page.goto(`/tareas/editar?id=${task.id}`);
  await api.dispose();

  const section = (name: string) =>
    page
      .getByRole("heading", { name, exact: true, level: 2 })
      .locator("xpath=ancestor::section[1]");
  const generalSection = section("Información general");
  const difficultySection = section("Dificultad por rango de edad");
  const bodySection = section("Cuerpo");
  const challengeSection = section("Pregunta o desafío");
  const answersSection = section("Respuestas");
  const explanationSection = section("Explicación de la respuesta");

  await expect(generalSection).toBeVisible();
  await expect(difficultySection).toBeVisible();
  await expect(bodySection).toBeVisible();
  await expect(challengeSection).toBeVisible();
  await expect(answersSection).toBeVisible();
  await expect(explanationSection).toBeVisible();

  const title = generalSection.getByRole("textbox", { name: "Título" });
  const firstCategory = generalSection.getByRole("checkbox", {
    name: "Algoritmos y programación",
  });
  const secondCategory = generalSection.getByRole("checkbox", {
    name: "Estructuras de datos y representaciones",
  });
  const firstCategoryField = firstCategory.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const secondCategoryField = secondCategory.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const [titleBox, desktopCategoryOne, desktopCategoryTwo] = await Promise.all([
    title.boundingBox(),
    firstCategoryField.boundingBox(),
    secondCategoryField.boundingBox(),
  ]);
  expect(titleBox).not.toBeNull();
  expect(desktopCategoryOne).not.toBeNull();
  expect(desktopCategoryTwo).not.toBeNull();
  expect(desktopCategoryTwo!.y).toBe(desktopCategoryOne!.y);

  const firstAgeCheckbox = difficultySection.getByRole("checkbox", {
    name: "5–8",
  });
  const secondAgeCheckbox = difficultySection.getByRole("checkbox", {
    name: "8–10",
  });
  const firstAgeField = firstAgeCheckbox.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const secondAgeField = secondAgeCheckbox.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const firstDifficulty = firstAgeField.getByRole("combobox", {
    name: "Dificultad para 5–8",
  });
  const secondDifficulty = secondAgeField.getByRole("combobox", {
    name: "Dificultad para 8–10",
  });
  const [
    desktopFirstAgeField,
    desktopSecondAgeField,
    desktopFirstDifficulty,
    desktopSecondDifficulty,
  ] = await Promise.all([
    firstAgeField.boundingBox(),
    secondAgeField.boundingBox(),
    firstDifficulty.boundingBox(),
    secondDifficulty.boundingBox(),
  ]);
  expect(desktopFirstAgeField).not.toBeNull();
  expect(desktopSecondAgeField).not.toBeNull();
  expect(desktopFirstDifficulty).not.toBeNull();
  expect(desktopSecondDifficulty).not.toBeNull();
  expect(desktopSecondAgeField!.y).toBe(desktopFirstAgeField!.y);
  expect(desktopSecondAgeField!.x).toBeGreaterThan(desktopFirstAgeField!.x);
  expect(desktopFirstDifficulty!.width).toBeLessThanOrEqual(193);
  expect(desktopSecondDifficulty!.width).toBe(desktopFirstDifficulty!.width);

  const bodyEditor = bodySection.getByRole("textbox", {
    name: "Escribe el contenido del cuerpo.",
  });
  const challengeEditor = challengeSection.getByRole("textbox", {
    name: "Escribe el contenido de la consigna.",
  });
  const explanationEditor = explanationSection.getByRole("textbox", {
    name: "Explica por qué la respuesta es correcta.",
  });
  await expect(bodyEditor).toContainText("Contenido");
  await expect(challengeEditor).toContainText("Resuelve");
  await expect(explanationEditor).toContainText("Explicación drag_drop");
  await expect(
    bodySection.getByRole("button", { name: "Arrastrar para mover bloque" }),
  ).toBeVisible();

  const multipleChoiceType = answersSection.getByRole("radio", {
    name: "Opción múltiple",
  });
  const shortTextType = answersSection.getByRole("radio", {
    name: "Respuesta corta",
  });
  const stateGridType = answersSection.getByRole("radio", {
    name: "Estados por casilla",
  });
  const dragDropType = answersSection.getByRole("radio", {
    name: "Arrastrar y soltar",
  });
  const multipleChoiceTypeField = multipleChoiceType.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const shortTextTypeField = shortTextType.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const stateGridTypeField = stateGridType.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const dragDropTypeField = dragDropType.locator(
    'xpath=ancestor::*[@data-slot="field"][1]',
  );
  const [
    desktopMultipleChoiceTypeField,
    desktopShortTextTypeField,
    desktopStateGridTypeField,
    desktopDragDropTypeField,
  ] = await Promise.all([
    multipleChoiceTypeField.boundingBox(),
    shortTextTypeField.boundingBox(),
    stateGridTypeField.boundingBox(),
    dragDropTypeField.boundingBox(),
  ]);
  expect(desktopMultipleChoiceTypeField).not.toBeNull();
  expect(desktopShortTextTypeField).not.toBeNull();
  expect(desktopStateGridTypeField).not.toBeNull();
  expect(desktopDragDropTypeField).not.toBeNull();
  expect(desktopShortTextTypeField!.y).toBe(desktopMultipleChoiceTypeField!.y);
  expect(desktopShortTextTypeField!.x).toBeGreaterThan(
    desktopMultipleChoiceTypeField!.x,
  );
  expect(desktopStateGridTypeField!.y).toBeGreaterThan(
    desktopMultipleChoiceTypeField!.y,
  );
  // Six answer types: drag/drop is in row two, state-grid in row three.
  // Both belong to the first column of the desktop layout.
  expect(desktopDragDropTypeField!.y).toBeGreaterThan(
    desktopMultipleChoiceTypeField!.y + desktopMultipleChoiceTypeField!.height,
  );
  expect(desktopStateGridTypeField!.y).toBeGreaterThan(
    desktopDragDropTypeField!.y + desktopDragDropTypeField!.height,
  );
  expect(desktopDragDropTypeField!.x).toBe(desktopStateGridTypeField!.x);

  const marker = answersSection.getByRole("button", {
    name: "Mover destino 1",
  });
  const horizontal = answersSection.getByRole("spinbutton", {
    name: "Horizontal (%)",
  });
  const vertical = answersSection.getByRole("spinbutton", {
    name: "Vertical (%)",
  });
  const radius = answersSection.getByRole("spinbutton", {
    name: "Radio de encaje (%)",
  });
  const firstPiece = answersSection
    .getByText("Pieza 1", { exact: true })
    .locator("xpath=ancestor::fieldset[1]");
  const secondPiece = answersSection
    .getByText("Pieza 2", { exact: true })
    .locator("xpath=ancestor::fieldset[1]");
  const pieceName = answersSection.getByRole("textbox", {
    name: "Nombre de la pieza 1",
  });
  const pieceWidth = firstPiece.locator('[data-slot="slider"]');
  const [
    desktopHorizontal,
    desktopVertical,
    desktopRadius,
    desktopFirstPiece,
    desktopSecondPiece,
  ] = await Promise.all([
    horizontal.boundingBox(),
    vertical.boundingBox(),
    radius.boundingBox(),
    firstPiece.boundingBox(),
    secondPiece.boundingBox(),
  ]);
  expect(desktopHorizontal).not.toBeNull();
  expect(desktopVertical).not.toBeNull();
  expect(desktopRadius).not.toBeNull();
  expect(desktopFirstPiece).not.toBeNull();
  expect(desktopSecondPiece).not.toBeNull();
  expect(desktopVertical!.y).toBe(desktopHorizontal!.y);
  expect(desktopRadius!.y).toBe(desktopHorizontal!.y);
  expect(desktopVertical!.x).toBeGreaterThan(desktopHorizontal!.x);
  expect(desktopRadius!.x).toBeGreaterThan(desktopVertical!.x);
  expect(desktopSecondPiece!.y).toBe(desktopFirstPiece!.y);
  expect(desktopSecondPiece!.x).toBeGreaterThan(desktopFirstPiece!.x);

  const horizontalBefore = Number(await horizontal.inputValue());
  await marker.focus();
  await marker.press("ArrowRight");
  expect(Number(await horizontal.inputValue())).toBeCloseTo(
    horizontalBefore + 1,
    3,
  );

  await multipleChoiceType.click();
  await expect(
    answersSection.getByRole("button", { name: "Mover respuesta 1 antes" }),
  ).toBeDisabled();
  await expect(
    answersSection.getByRole("button", { name: "Mover respuesta 1 después" }),
  ).toBeEnabled();
  await expect(
    answersSection.getByRole("button", { name: "Mover respuesta 2 después" }),
  ).toBeDisabled();

  await stateGridType.click();
  const gridRows = answersSection.getByRole("spinbutton", { name: "Filas" });
  const gridColumns = answersSection.getByRole("spinbutton", {
    name: "Columnas",
  });
  const [desktopGridRows, desktopGridColumns] = await Promise.all([
    gridRows.boundingBox(),
    gridColumns.boundingBox(),
  ]);
  expect(desktopGridRows).not.toBeNull();
  expect(desktopGridColumns).not.toBeNull();
  expect(desktopGridColumns!.y).toBe(desktopGridRows!.y);
  expect(desktopGridColumns!.x).toBeGreaterThan(desktopGridRows!.x);

  await dragDropType.click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 320, height: 800 });
  const [
    mobileCategoryOne,
    mobileCategoryTwo,
    mobileFirstDifficulty,
    mobileSecondDifficulty,
    mobileFirstAgeField,
    mobileSecondAgeField,
    mobileMultipleChoiceTypeField,
    mobileShortTextTypeField,
    mobileStateGridTypeField,
    mobileDragDropTypeField,
    mobileHorizontal,
    mobileVertical,
    mobileRadius,
    mobileFirstPiece,
    mobileSecondPiece,
    mobilePieceName,
    mobilePieceWidth,
    mobileBodyEditor,
    mobileChallengeEditor,
  ] = await Promise.all([
    firstCategoryField.boundingBox(),
    secondCategoryField.boundingBox(),
    firstDifficulty.boundingBox(),
    secondDifficulty.boundingBox(),
    firstAgeField.boundingBox(),
    secondAgeField.boundingBox(),
    multipleChoiceTypeField.boundingBox(),
    shortTextTypeField.boundingBox(),
    stateGridTypeField.boundingBox(),
    dragDropTypeField.boundingBox(),
    horizontal.boundingBox(),
    vertical.boundingBox(),
    radius.boundingBox(),
    firstPiece.boundingBox(),
    secondPiece.boundingBox(),
    pieceName.boundingBox(),
    pieceWidth.boundingBox(),
    bodyEditor.boundingBox(),
    challengeEditor.boundingBox(),
  ]);
  for (const box of [
    mobileCategoryOne,
    mobileCategoryTwo,
    mobileFirstDifficulty,
    mobileSecondDifficulty,
    mobileFirstAgeField,
    mobileSecondAgeField,
    mobileMultipleChoiceTypeField,
    mobileShortTextTypeField,
    mobileStateGridTypeField,
    mobileDragDropTypeField,
    mobileHorizontal,
    mobileVertical,
    mobileRadius,
    mobileFirstPiece,
    mobileSecondPiece,
    mobilePieceName,
    mobilePieceWidth,
    mobileBodyEditor,
    mobileChallengeEditor,
  ]) {
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  expect(mobileCategoryTwo!.y).toBeGreaterThan(
    mobileCategoryOne!.y + mobileCategoryOne!.height,
  );
  expect(mobileSecondAgeField!.y).toBeGreaterThan(
    mobileFirstAgeField!.y + mobileFirstAgeField!.height,
  );
  expect(mobileFirstDifficulty!.width).toBeLessThanOrEqual(161);
  expect(mobileSecondDifficulty!.width).toBe(mobileFirstDifficulty!.width);
  expect(mobileSecondDifficulty!.x).toBe(mobileFirstDifficulty!.x);
  expect(mobileShortTextTypeField!.x).toBe(mobileMultipleChoiceTypeField!.x);
  expect(mobileStateGridTypeField!.x).toBe(mobileMultipleChoiceTypeField!.x);
  expect(mobileDragDropTypeField!.x).toBe(mobileMultipleChoiceTypeField!.x);
  expect(mobileShortTextTypeField!.y).toBeGreaterThan(
    mobileMultipleChoiceTypeField!.y + mobileMultipleChoiceTypeField!.height,
  );
  expect(mobileStateGridTypeField!.y).toBeGreaterThan(
    mobileShortTextTypeField!.y + mobileShortTextTypeField!.height,
  );
  expect(mobileDragDropTypeField!.y).toBeGreaterThan(
    mobileShortTextTypeField!.y + mobileShortTextTypeField!.height,
  );
  expect(mobileStateGridTypeField!.y).toBeGreaterThan(
    mobileDragDropTypeField!.y + mobileDragDropTypeField!.height,
  );
  expect(mobileVertical!.y).toBeGreaterThan(
    mobileHorizontal!.y + mobileHorizontal!.height,
  );
  expect(mobileRadius!.y).toBeGreaterThan(
    mobileVertical!.y + mobileVertical!.height,
  );
  expect(mobileSecondPiece!.y).toBeGreaterThan(
    mobileFirstPiece!.y + mobileFirstPiece!.height,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const wideMobileDifficulty = await firstDifficulty.boundingBox();
  expect(wideMobileDifficulty).not.toBeNull();
  expect(wideMobileDifficulty!.width).toBeLessThanOrEqual(193);
  expect(wideMobileDifficulty!.width).toBeGreaterThan(
    mobileFirstDifficulty!.width,
  );
});

test("edits task content with touch without adding mobile controls", async ({
  browser,
}) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const blockIds = {
    first: `touch-first-${Date.now()}`,
    image: `touch-image-${Date.now()}`,
    last: `touch-last-${Date.now()}`,
  };
  const task = await createPracticeTask(api, headers, "drag_drop", {
    bodyBlocks: [
      taskBlock(blockIds.first, "Primer bloque táctil"),
      {
        id: blockIds.image,
        type: "image",
        content: "",
        image: {
          id: `touch-content-image-${Date.now()}`,
          name: "contenido-tactil.svg",
          url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='100' viewBox='0 0 400 100'%3E%3Crect width='400' height='100' fill='%2314b8a6'/%3E%3C/svg%3E",
        },
        widthPercent: 50,
      },
      taskBlock(blockIds.last, "Último bloque táctil"),
    ],
  });
  const touchContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 1200 },
  });

  try {
    const page = await touchContext.newPage();
    await loginAdminPage(page);
    const cdp = await touchContext.newCDPSession(page);
    const dragWithTouch = async (
      start: { x: number; y: number },
      end: { x: number; y: number },
    ) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...start, id: 1 }],
      });
      for (let step = 1; step <= 8; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              id: 1,
              x: start.x + ((end.x - start.x) * step) / 8,
              y: start.y + ((end.y - start.y) * step) / 8,
            },
          ],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };

    await page.goto(`/tareas/editar?id=${task.id}`);
    await expect(page.getByRole("textbox", { name: "Título" })).toHaveValue(
      task.title,
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    const initialScroll = await page.evaluate(() => window.scrollY);
    await dragWithTouch({ x: 380, y: 900 }, { x: 380, y: 300 });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(initialScroll);

    const bodySection = page
      .getByRole("heading", { name: "Cuerpo", exact: true, level: 2 })
      .locator("xpath=ancestor::section[1]");
    const blockRows = bodySection.locator("[data-content-block-id]");
    const firstRow = bodySection.locator(
      `[data-content-block-id="${blockIds.first}"]`,
    );
    const imageRow = bodySection.locator(
      `[data-content-block-id="${blockIds.image}"]`,
    );
    const image = imageRow.getByRole("img", { name: "contenido-tactil.svg" });
    const reorderHandle = firstRow.getByRole("button", {
      name: "Arrastrar para mover bloque",
    });
    await firstRow.scrollIntoViewIfNeeded();
    const [reorderHandleBox, imageRowBox] = await Promise.all([
      reorderHandle.boundingBox(),
      imageRow.boundingBox(),
    ]);
    expect(reorderHandleBox).not.toBeNull();
    expect(imageRowBox).not.toBeNull();
    await dragWithTouch(
      {
        x: reorderHandleBox!.x + reorderHandleBox!.width / 2,
        y: reorderHandleBox!.y + reorderHandleBox!.height / 2,
      },
      {
        x: imageRowBox!.x + imageRowBox!.width / 2,
        y: imageRowBox!.y + imageRowBox!.height * 0.75,
      },
    );
    await expect
      .poll(() =>
        blockRows.evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-content-block-id")),
        ),
      )
      .toEqual([blockIds.image, blockIds.first, blockIds.last]);

    const rightResizeHandle = imageRow.getByRole("button", {
      name: "Reducir o ampliar imagen desde la derecha",
    });
    await imageRow.scrollIntoViewIfNeeded();
    await expect(rightResizeHandle).toBeVisible();
    await expect(rightResizeHandle).toHaveCSS("touch-action", "none");
    const [resizeHandleBox, imageAreaWidth] = await Promise.all([
      rightResizeHandle.boundingBox(),
      image.evaluate(
        (element) =>
          element.parentElement?.parentElement?.getBoundingClientRect().width ??
          0,
      ),
    ]);
    expect(resizeHandleBox).not.toBeNull();
    expect(imageAreaWidth).toBeGreaterThan(0);
    const resizeDelta = 30;
    const expectedWidth = Math.round(
      50 + (resizeDelta * 2 * 100) / imageAreaWidth,
    );
    const resizeStart = {
      x: resizeHandleBox!.x + resizeHandleBox!.width / 2,
      y: resizeHandleBox!.y + resizeHandleBox!.height / 2,
    };
    await dragWithTouch(resizeStart, {
      x: resizeStart.x + resizeDelta,
      y: resizeStart.y,
    });
    await expect
      .poll(() =>
        image.evaluate((element) =>
          Number.parseFloat(element.parentElement?.style.width ?? "0"),
        ),
      )
      .toBe(expectedWidth);

    const stage = page.locator("[data-drag-target-editor]");
    const marker = page.getByRole("button", {
      name: "Mover destino 1",
    });
    await stage.scrollIntoViewIfNeeded();
    const [stageBox, markerBox] = await Promise.all([
      stage.boundingBox(),
      marker.boundingBox(),
    ]);
    expect(stageBox).not.toBeNull();
    expect(markerBox).not.toBeNull();
    const targetPoint = {
      x: stageBox!.x + stageBox!.width * 0.55,
      y: stageBox!.y + stageBox!.height * 0.25,
    };
    await dragWithTouch(
      {
        x: markerBox!.x + markerBox!.width / 2,
        y: markerBox!.y + markerBox!.height / 2,
      },
      targetPoint,
    );

    const updateResponse = page.waitForResponse(
      (candidate) =>
        candidate.url() === `${API}/api/tasks/${task.id}` &&
        candidate.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    const response = await updateResponse;
    expect(response.ok()).toBe(true);
    const payload = response.request().postDataJSON();
    expect(payload.bodyBlocks.map((block: { id: string }) => block.id)).toEqual(
      [blockIds.image, blockIds.first, blockIds.last],
    );
    expect(
      payload.bodyBlocks.find(
        (block: { id: string }) => block.id === blockIds.image,
      ).widthPercent,
    ).toBe(expectedWidth);
    const movedTarget = payload.dragDropTargets.find(
      (target: { id: string }) => target.id === DRAG_DROP_TARGETS[0].id,
    );
    expect(movedTarget.x).toBeCloseTo(55, 0);
    expect(movedTarget.y).toBeCloseTo(25, 0);
    await expect(page).toHaveURL(/\/tareas\/?$/);

    const persistedResponse = await api.get(`${API}/api/tasks/${task.id}`, {
      headers,
    });
    expect(persistedResponse.ok(), await persistedResponse.text()).toBe(true);
    const persisted = await persistedResponse.json();
    expect(
      persisted.bodyBlocks.map((block: { id: string }) => block.id),
    ).toEqual([blockIds.image, blockIds.first, blockIds.last]);
    expect(
      persisted.bodyBlocks.find(
        (block: { id: string }) => block.id === blockIds.image,
      ).widthPercent,
    ).toBe(expectedWidth);
  } finally {
    await touchContext.close();
    await api.dispose();
  }
});

test("returns a newly created task to the list and reopens its data", async ({
  page,
}) => {
  const title = `Tarea creada ${Date.now()}`;

  await loginAdminPage(page);
  await page.goto("/tareas/nueva");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    const island = form?.closest("astro-island");
    return island && !island.hasAttribute("ssr");
  });

  await page.getByRole("textbox", { name: "Título", exact: true }).fill(title);
  await page
    .getByRole("textbox", { name: "Código original" })
    .fill(" 2024-DE-04a ");
  await page
    .getByRole("checkbox", { name: "Algoritmos y programación" })
    .click();
  await page.getByRole("checkbox", { name: "10–12" }).click();
  await page.getByRole("combobox", { name: "Dificultad para 10–12" }).click();
  await page.getByRole("option", { name: "Medio", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Escribe el contenido del cuerpo." })
    .fill("Contenido que debe conservarse");
  await page
    .getByRole("textbox", { name: "Escribe el contenido de la consigna." })
    .fill("Consigna que debe conservarse");
  await page.getByRole("radio", { name: "Respuesta corta" }).click();
  await page
    .getByRole("textbox", { name: "Respuesta corta esperada" })
    .fill("Respuesta conservada");
  await page
    .getByRole("textbox", {
      name: "Explica por qué la respuesta es correcta.",
    })
    .fill("Explicación que debe conservarse");

  const createResponse = page.waitForResponse(
    (candidate) =>
      candidate.url() === `${API}/api/tasks` &&
      candidate.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  const response = await createResponse;
  expect(response.ok()).toBe(true);
  await expect(page).toHaveURL(/\/tareas\/?$/);

  const titleLink = page.getByRole("link", { name: title, exact: true });
  await expect(titleLink).toHaveAttribute("href", /\/tareas\/editar\?id=.+/);
  const editUrl = await titleLink.getAttribute("href");
  await titleLink.click();
  await expect(page).toHaveURL(editUrl!);
  await expect(
    page.getByRole("textbox", { name: "Título", exact: true }),
  ).toHaveValue(title);
  await expect(
    page.getByRole("textbox", { name: "Código original" }),
  ).toHaveValue("2024-DE-04a");
  await expect(
    page.getByRole("textbox", { name: "Escribe el contenido del cuerpo." }),
  ).toContainText("Contenido que debe conservarse");
  await expect(
    page.getByRole("textbox", { name: "Escribe el contenido de la consigna." }),
  ).toContainText("Consigna que debe conservarse");
  await expect(
    page.getByRole("textbox", { name: "Respuesta corta esperada" }),
  ).toHaveValue("Respuesta conservada");
  await expect(
    page.getByRole("textbox", {
      name: "Explica por qué la respuesta es correcta.",
    }),
  ).toContainText("Explicación que debe conservarse");
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeVisible();
});

test("serializes every multiple-choice correctness criterion", async ({
  page,
}) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createPracticeTask(api, headers, "multiple_choice");

  await loginAdminPage(page);
  const editUrl = `/tareas/editar?id=${task.id}`;
  await page.goto(editUrl);

  const answersSection = page
    .getByRole("heading", { name: "Respuestas", exact: true, level: 2 })
    .locator("xpath=ancestor::section[1]");
  const saveCriterion = async (expected: string) => {
    const updateResponse = page.waitForResponse(
      (candidate) =>
        candidate.url() === `${API}/api/tasks/${task.id}` &&
        candidate.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    const response = await updateResponse;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON().correctAnswerId).toBe(expected);
    await expect(page).toHaveURL(/\/tareas\/?$/);
    await page.goto(editUrl);
    await expect(page.getByRole("textbox", { name: "Título" })).toHaveValue(
      task.title,
    );
  };

  await expect(
    answersSection.getByRole("radio", {
      name: "Una sola respuesta correcta",
    }),
  ).toBeChecked();
  await saveCriterion("single:B");

  await answersSection
    .getByRole("radio", {
      name: "Varias correctas (basta marcar una)",
    })
    .click();
  const optionCheckboxes = [1, 2].map((answerNumber) =>
    answersSection.getByRole("checkbox", {
      name: `Marcar respuesta ${answerNumber} como correcta`,
    }),
  );
  await expect(optionCheckboxes[1]).toBeChecked();
  await optionCheckboxes[0].click();
  await saveCriterion("any:B,A");

  await answersSection
    .getByRole("radio", {
      name: "Varias correctas (debe marcar todas)",
    })
    .click();
  await expect(optionCheckboxes[0]).toBeChecked();
  await expect(optionCheckboxes[1]).toBeChecked();
  await saveCriterion("all:B,A");

  const persistedResponse = await api.get(`${API}/api/tasks/${task.id}`, {
    headers,
  });
  expect(persistedResponse.ok(), await persistedResponse.text()).toBe(true);
  expect(await persistedResponse.json()).toMatchObject({
    correctAnswerId: "all:B,A",
  });
  await expect(
    answersSection.getByRole("radio", {
      name: "Varias correctas (debe marcar todas)",
    }),
  ).toBeChecked();
  await expect(optionCheckboxes[0]).toBeChecked();
  await expect(optionCheckboxes[1]).toBeChecked();
  await api.dispose();
});

test("evaluates any and all criteria in the task tester", async ({ page }) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const answers = ["A", "B", "C"].map((id) => ({
    id,
    blocks: [taskBlock(`tester-${id}-${Date.now()}`, `Respuesta ${id}`)],
  }));
  const anyTask = await createPracticeTask(api, headers, "multiple_choice", {
    title: "Probador criterio any",
    answers,
    correctAnswerId: "any:B,C",
  });
  const allTask = await createPracticeTask(api, headers, "multiple_choice", {
    title: "Probador criterio all",
    answers,
    correctAnswerId: "all:B,C",
  });

  await loginAdminPage(page);

  await page.goto(`/tareas/probador?id=${anyTask.id}`);
  const resultAlert = page.locator("main").getByRole("alert");
  await page.getByRole("button", { name: "Respuesta B", exact: true }).click();
  await page.getByRole("button", { name: "Probar", exact: true }).click();
  await expect(
    resultAlert.getByText("Correcto", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reiniciar" }).click();
  await page.getByRole("button", { name: "Respuesta A", exact: true }).click();
  await page.getByRole("button", { name: "Probar", exact: true }).click();
  await expect(
    resultAlert.getByText("Incorrecto", { exact: true }),
  ).toBeVisible();

  await page.goto(`/tareas/probador?id=${allTask.id}`);
  await page.getByRole("button", { name: "Respuesta B", exact: true }).click();
  await page.getByRole("button", { name: "Probar", exact: true }).click();
  await expect(
    resultAlert.getByText("Incorrecto", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Respuesta C", exact: true }).click();
  await page.getByRole("button", { name: "Probar", exact: true }).click();
  await expect(
    resultAlert.getByText("Correcto", { exact: true }),
  ).toBeVisible();
  await api.dispose();
});

test("labels tester controls for each answer type", async ({ page }) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const cases = [
    { answerType: "multiple_choice", heading: "Opciones de respuesta" },
    { answerType: "short_text", heading: "Respuesta corta" },
    { answerType: "drag_drop", heading: "Arrastrar y soltar" },
  ] as const;
  const tasks = [];

  for (const testCase of cases) {
    tasks.push(await createPracticeTask(api, headers, testCase.answerType));
  }

  await loginAdminPage(page);

  for (const [index, testCase] of cases.entries()) {
    const task = tasks[index];
    await page.goto(`/tareas/probador?id=${task.id}`);
    await expect(
      page.getByRole("heading", { name: task.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: testCase.heading, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Respuestas", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Resuelve", { exact: true })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Probar", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reiniciar" })).toBeVisible();

    if (testCase.answerType === "short_text") {
      await expect(
        page.getByRole("textbox", { name: "Tu respuesta", exact: true }),
      ).toBeVisible();
    }
  }

  await api.dispose();
});
