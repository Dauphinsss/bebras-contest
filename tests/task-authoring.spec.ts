import { test, expect, request } from "@playwright/test";
import {
  API,
  ADMIN,
  taskBlock,
  DRAG_DROP_TARGETS,
  createPracticeTask,
} from "./support/helpers";

test("keeps task authoring fields compact and responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const api = await request.newContext();
  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((response) => response.json());
  const task = await createPracticeTask(
    api,
    { authorization: `Bearer ${session.token}` },
    "drag_drop",
  );

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto(`/tareas/editar?id=${task.id}`);
  await api.dispose();

  const generalCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Información general" })
    .first();
  await expect(generalCard).toBeVisible();
  await expect(
    page.getByText(
      "Define la identidad y la clasificación principal de la tarea.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText("Debe permitir identificar la tarea rápidamente."),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Define en qué grupos aplica la tarea y con qué dificultad.",
    ),
  ).toHaveCount(1);
  await expect(
    page.getByText(
      "Activa los rangos de edad donde aplica la tarea y luego define su dificultad.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Construye el contenido principal con bloques de texto o imagen.",
    ),
  ).toHaveCount(1);
  await expect(
    page.getByText("Construye la consigna con bloques de texto o imagen."),
  ).toHaveCount(1);
  await expect(
    page.getByText("Agrega texto o imágenes para el cuerpo."),
  ).toHaveCount(0);
  await expect(
    page.getByText("Agrega bloques para redactar la consigna."),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Explica la respuesta para la revisión interna; esta parte no la ve el estudiante.",
    ),
  ).toHaveCount(1);
  await expect(
    page.getByText("Deja trazabilidad pedagógica para revisión y publicación."),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Esta parte no la ve el estudiante, pero sí mejora la edición interna.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText("Define el tipo de respuesta y configura cómo se validará."),
  ).toHaveCount(1);
  await expect(
    page.getByText("Define el tipo de respuesta y su configuración."),
  ).toHaveCount(0);
  await expect(
    page.getByText("Elige cómo responderá el participante esta tarea."),
  ).toHaveCount(0);

  const generalHeader = generalCard.locator('[data-slot="card-header"]');
  const titleLabel = page.locator('label[for="title"]');
  const firstCategory = page.getByRole("checkbox", {
    name: "Algoritmos y programación",
  });
  const secondCategory = page.getByRole("checkbox", {
    name: "Estructuras de datos y representaciones",
  });
  const [headerBox, titleLabelBox, desktopCategoryOne, desktopCategoryTwo] =
    await Promise.all([
      generalHeader.boundingBox(),
      titleLabel.boundingBox(),
      firstCategory.boundingBox(),
      secondCategory.boundingBox(),
    ]);
  expect(headerBox).not.toBeNull();
  expect(titleLabelBox).not.toBeNull();
  expect(desktopCategoryOne).not.toBeNull();
  expect(desktopCategoryTwo).not.toBeNull();
  expect(
    titleLabelBox!.y - (headerBox!.y + headerBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    Math.abs(desktopCategoryOne!.y - desktopCategoryTwo!.y),
  ).toBeLessThanOrEqual(1);

  const difficultyCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Dificultad por rango de edad" })
    .first();
  const difficultyHeader = difficultyCard.locator('[data-slot="card-header"]');
  const difficultyHeaderContent = difficultyHeader.locator(":scope > div");
  const firstAgeCheckbox = page.getByRole("checkbox", { name: "5–8" });
  const secondAgeCheckbox = page.getByRole("checkbox", { name: "8–10" });
  const thirdAgeCheckbox = page.getByRole("checkbox", { name: "10–12" });
  const firstAgeField = difficultyCard
    .locator('[data-slot="field"]')
    .filter({ has: firstAgeCheckbox });
  const secondAgeField = difficultyCard
    .locator('[data-slot="field"]')
    .filter({ has: secondAgeCheckbox });
  const thirdAgeField = difficultyCard
    .locator('[data-slot="field"]')
    .filter({ has: thirdAgeCheckbox });
  const thirdAgeLabel = page.locator('label[for="age-range-10–12"]');
  const firstDifficulty = firstAgeField.getByRole("combobox", {
    name: "Dificultad para 5–8",
  });
  const secondDifficulty = secondAgeField.getByRole("combobox", {
    name: "Dificultad para 8–10",
  });
  const [
    difficultyCardBox,
    difficultyHeaderBox,
    difficultyHeaderContentBox,
    desktopFirstAgeField,
    desktopSecondAgeField,
    desktopThirdAgeField,
    desktopFirstDifficulty,
    desktopSecondDifficulty,
    desktopThirdAgeLabel,
  ] = await Promise.all([
    difficultyCard.boundingBox(),
    difficultyHeader.boundingBox(),
    difficultyHeaderContent.boundingBox(),
    firstAgeField.boundingBox(),
    secondAgeField.boundingBox(),
    thirdAgeField.boundingBox(),
    firstDifficulty.boundingBox(),
    secondDifficulty.boundingBox(),
    thirdAgeLabel.boundingBox(),
  ]);
  expect(difficultyCardBox).not.toBeNull();
  expect(difficultyHeaderBox).not.toBeNull();
  expect(difficultyHeaderContentBox).not.toBeNull();
  expect(desktopFirstAgeField).not.toBeNull();
  expect(desktopSecondAgeField).not.toBeNull();
  expect(desktopThirdAgeField).not.toBeNull();
  expect(desktopFirstDifficulty).not.toBeNull();
  expect(desktopSecondDifficulty).not.toBeNull();
  expect(desktopThirdAgeLabel).not.toBeNull();
  const difficultyHeaderTopSpace =
    difficultyHeaderContentBox!.y - difficultyCardBox!.y;
  const difficultyHeaderBottomSpace =
    difficultyHeaderBox!.y +
    difficultyHeaderBox!.height -
    (difficultyHeaderContentBox!.y + difficultyHeaderContentBox!.height);
  expect(
    Math.abs(difficultyHeaderTopSpace - difficultyHeaderBottomSpace),
  ).toBeLessThanOrEqual(1);
  expect(
    desktopFirstAgeField!.y -
      (difficultyHeaderBox!.y + difficultyHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(desktopSecondAgeField!.y).toBe(desktopFirstAgeField!.y);
  expect(desktopSecondAgeField!.x).toBeGreaterThan(desktopFirstAgeField!.x);
  expect(desktopThirdAgeField!.y).toBeGreaterThan(desktopFirstAgeField!.y);
  expect(desktopThirdAgeLabel!.height).toBeLessThanOrEqual(20);
  expect(desktopFirstDifficulty!.width).toBeLessThanOrEqual(193);
  expect(desktopSecondDifficulty!.width).toBe(desktopFirstDifficulty!.width);
  expect(
    desktopSecondAgeField!.x -
      (desktopFirstAgeField!.x + desktopFirstAgeField!.width),
  ).toBeGreaterThanOrEqual(23);
  expect(
    desktopFirstAgeField!.x +
      desktopFirstAgeField!.width -
      (desktopFirstDifficulty!.x + desktopFirstDifficulty!.width),
  ).toBeLessThanOrEqual(1);
  expect(
    desktopSecondAgeField!.x +
      desktopSecondAgeField!.width -
      (desktopSecondDifficulty!.x + desktopSecondDifficulty!.width),
  ).toBeLessThanOrEqual(1);

  const bodyCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Cuerpo" })
    .first();
  const challengeCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Pregunta o desafío" })
    .first();
  const bodyHeader = bodyCard.locator('[data-slot="card-header"]');
  const challengeHeader = challengeCard.locator('[data-slot="card-header"]');
  const bodyHeaderContent = bodyHeader.locator(":scope > div");
  const challengeHeaderContent = challengeHeader.locator(":scope > div");
  const bodyTextarea = bodyCard.getByPlaceholder(
    "Escribe el contenido del cuerpo.",
  );
  const challengeTextarea = challengeCard.getByPlaceholder(
    "Escribe el contenido de la consigna.",
  );
  const bodyAddText = bodyCard.getByRole("button", {
    name: "Agregar texto",
  });
  const challengeAddText = challengeCard.getByRole("button", {
    name: "Agregar texto",
  });
  await expect(
    bodyHeader.locator('[data-slot="card-description"]'),
  ).toHaveCount(0);
  await expect(
    challengeHeader.locator('[data-slot="card-description"]'),
  ).toHaveCount(0);
  const [
    bodyCardBox,
    bodyHeaderBox,
    bodyHeaderContentBox,
    bodyTextareaBox,
    bodyAddTextBox,
    challengeCardBox,
    challengeHeaderBox,
    challengeHeaderContentBox,
    challengeTextareaBox,
    challengeAddTextBox,
  ] = await Promise.all([
    bodyCard.boundingBox(),
    bodyHeader.boundingBox(),
    bodyHeaderContent.boundingBox(),
    bodyTextarea.boundingBox(),
    bodyAddText.boundingBox(),
    challengeCard.boundingBox(),
    challengeHeader.boundingBox(),
    challengeHeaderContent.boundingBox(),
    challengeTextarea.boundingBox(),
    challengeAddText.boundingBox(),
  ]);
  expect(bodyCardBox).not.toBeNull();
  expect(bodyHeaderBox).not.toBeNull();
  expect(bodyHeaderContentBox).not.toBeNull();
  expect(bodyTextareaBox).not.toBeNull();
  expect(bodyAddTextBox).not.toBeNull();
  expect(challengeCardBox).not.toBeNull();
  expect(challengeHeaderBox).not.toBeNull();
  expect(challengeHeaderContentBox).not.toBeNull();
  expect(challengeTextareaBox).not.toBeNull();
  expect(challengeAddTextBox).not.toBeNull();
  const bodyHeaderTopSpace = bodyHeaderContentBox!.y - bodyCardBox!.y;
  const bodyHeaderBottomSpace =
    bodyHeaderBox!.y +
    bodyHeaderBox!.height -
    (bodyHeaderContentBox!.y + bodyHeaderContentBox!.height);
  const challengeHeaderTopSpace =
    challengeHeaderContentBox!.y - challengeCardBox!.y;
  const challengeHeaderBottomSpace =
    challengeHeaderBox!.y +
    challengeHeaderBox!.height -
    (challengeHeaderContentBox!.y + challengeHeaderContentBox!.height);
  expect(
    Math.abs(bodyHeaderTopSpace - bodyHeaderBottomSpace),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(challengeHeaderTopSpace - challengeHeaderBottomSpace),
  ).toBeLessThanOrEqual(1);
  expect(
    bodyTextareaBox!.y - (bodyHeaderBox!.y + bodyHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    challengeTextareaBox!.y -
      (challengeHeaderBox!.y + challengeHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    bodyAddTextBox!.y - (bodyTextareaBox!.y + bodyTextareaBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    challengeAddTextBox!.y -
      (challengeTextareaBox!.y + challengeTextareaBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    bodyCardBox!.y +
      bodyCardBox!.height -
      (bodyAddTextBox!.y + bodyAddTextBox!.height),
  ).toBeLessThanOrEqual(21);
  expect(
    challengeCardBox!.y +
      challengeCardBox!.height -
      (challengeAddTextBox!.y + challengeAddTextBox!.height),
  ).toBeLessThanOrEqual(21);

  const explanationCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Explicación de la respuesta" })
    .first();
  const explanationHeader = explanationCard.locator(
    '[data-slot="card-header"]',
  );
  const explanationHeaderContent = explanationHeader.locator(":scope > div");
  const explanationLabel = explanationCard.locator('label[for="explanation"]');
  const explanationTextarea = explanationCard.getByLabel("Explicación", {
    exact: true,
  });
  const explanationFooter = explanationCard.locator(
    '[data-slot="card-footer"]',
  );
  await expect(
    explanationHeader.locator('[data-slot="card-description"]'),
  ).toHaveCount(0);
  const [
    explanationCardBox,
    explanationHeaderBox,
    explanationHeaderContentBox,
    explanationLabelBox,
    explanationTextareaBox,
    explanationFooterBox,
  ] = await Promise.all([
    explanationCard.boundingBox(),
    explanationHeader.boundingBox(),
    explanationHeaderContent.boundingBox(),
    explanationLabel.boundingBox(),
    explanationTextarea.boundingBox(),
    explanationFooter.boundingBox(),
  ]);
  expect(explanationCardBox).not.toBeNull();
  expect(explanationHeaderBox).not.toBeNull();
  expect(explanationHeaderContentBox).not.toBeNull();
  expect(explanationLabelBox).not.toBeNull();
  expect(explanationTextareaBox).not.toBeNull();
  expect(explanationFooterBox).not.toBeNull();
  const explanationHeaderTopSpace =
    explanationHeaderContentBox!.y - explanationCardBox!.y;
  const explanationHeaderBottomSpace =
    explanationHeaderBox!.y +
    explanationHeaderBox!.height -
    (explanationHeaderContentBox!.y + explanationHeaderContentBox!.height);
  expect(
    Math.abs(explanationHeaderTopSpace - explanationHeaderBottomSpace),
  ).toBeLessThanOrEqual(1);
  expect(
    explanationLabelBox!.y -
      (explanationHeaderBox!.y + explanationHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    explanationTextareaBox!.y -
      (explanationLabelBox!.y + explanationLabelBox!.height),
  ).toBeLessThanOrEqual(16);
  expect(
    explanationFooterBox!.y -
      (explanationTextareaBox!.y + explanationTextareaBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    explanationCardBox!.y +
      explanationCardBox!.height -
      (explanationFooterBox!.y + explanationFooterBox!.height),
  ).toBeLessThanOrEqual(21);

  const answersCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Respuestas" })
    .first();
  const answersHeader = answersCard
    .locator('[data-slot="card-header"]')
    .first();
  const answersHeaderContent = answersHeader.locator(":scope > div");
  const answerTypeLegend = answersCard
    .locator('[data-slot="field-legend"]')
    .filter({ hasText: "Tipo de respuesta" });
  const answerTypeGroup = answerTypeLegend
    .locator("..")
    .locator('[data-slot="radio-group"]');
  const multipleChoiceType = answersCard.getByRole("radio", {
    name: "Opción múltiple",
  });
  const shortTextType = answersCard.getByRole("radio", {
    name: "Respuesta corta",
  });
  const rangeType = answersCard.getByRole("radio", {
    name: "Respuesta por rangos",
  });
  const dragDropType = answersCard.getByRole("radio", {
    name: "Arrastrar y soltar",
  });
  const multipleChoiceTypeField = multipleChoiceType.locator("..");
  const shortTextTypeField = shortTextType.locator("..");
  const rangeTypeField = rangeType.locator("..");
  const dragDropTypeField = dragDropType.locator("..");
  await expect(
    answersHeader.locator('[data-slot="card-description"]'),
  ).toHaveCount(0);
  expect(
    await answerTypeGroup.evaluate(
      (element) => window.getComputedStyle(element).marginTop,
    ),
  ).toBe("4px");
  const [
    answersCardBox,
    answersHeaderBox,
    answersHeaderContentBox,
    answerTypeLegendBox,
    desktopMultipleChoiceTypeField,
    desktopShortTextTypeField,
    desktopRangeTypeField,
    desktopDragDropTypeField,
  ] = await Promise.all([
    answersCard.boundingBox(),
    answersHeader.boundingBox(),
    answersHeaderContent.boundingBox(),
    answerTypeLegend.boundingBox(),
    multipleChoiceTypeField.boundingBox(),
    shortTextTypeField.boundingBox(),
    rangeTypeField.boundingBox(),
    dragDropTypeField.boundingBox(),
  ]);
  expect(answersCardBox).not.toBeNull();
  expect(answersHeaderBox).not.toBeNull();
  expect(answersHeaderContentBox).not.toBeNull();
  expect(answerTypeLegendBox).not.toBeNull();
  expect(desktopMultipleChoiceTypeField).not.toBeNull();
  expect(desktopShortTextTypeField).not.toBeNull();
  expect(desktopRangeTypeField).not.toBeNull();
  expect(desktopDragDropTypeField).not.toBeNull();
  const answersHeaderTopSpace = answersHeaderContentBox!.y - answersCardBox!.y;
  const answersHeaderBottomSpace =
    answersHeaderBox!.y +
    answersHeaderBox!.height -
    (answersHeaderContentBox!.y + answersHeaderContentBox!.height);
  expect(
    Math.abs(answersHeaderTopSpace - answersHeaderBottomSpace),
  ).toBeLessThanOrEqual(1);
  expect(
    answerTypeLegendBox!.y - (answersHeaderBox!.y + answersHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(desktopShortTextTypeField!.y).toBe(desktopMultipleChoiceTypeField!.y);
  expect(desktopShortTextTypeField!.x).toBeGreaterThan(
    desktopMultipleChoiceTypeField!.x,
  );
  expect(desktopRangeTypeField!.y).toBeGreaterThan(
    desktopMultipleChoiceTypeField!.y,
  );
  expect(desktopDragDropTypeField!.y).toBe(desktopRangeTypeField!.y);
  expect(desktopDragDropTypeField!.x).toBeGreaterThan(desktopRangeTypeField!.x);
  await expect(
    answersCard.getByText(
      "Configura el fondo, el nombre y la imagen de cada objeto. Selecciona uno y toca o arrástralo sobre el escenario para ubicar su destino; los círculos indican el radio de encaje solo durante la edición.",
    ),
  ).toHaveCount(1);
  await expect(
    answersCard.getByText(
      "Define la imagen de fondo, los objetos y la posición correcta de cada uno.",
    ),
  ).toHaveCount(0);
  await expect(
    answersCard.getByText(
      "Selecciona un objeto y toca el escenario para ubicar su destino. También puedes arrastrar directamente el objeto.",
    ),
  ).toHaveCount(0);
  await expect(
    answersCard.getByText(
      "Los círculos muestran el radio de encaje y solo aparecen en este editor de autoría.",
    ),
  ).toHaveCount(0);
  await expect(
    answersCard.getByText(
      "El objeto seleccionado se muestra en su destino sobre el escenario.",
    ),
  ).toHaveCount(0);
  await expect(
    answersCard.getByText("Define su imagen y su destino fijo sobre el fondo."),
  ).toHaveCount(0);
  await expect(
    answersCard.getByText("Escenario de fondo", { exact: true }),
  ).toHaveCount(1);
  await expect(
    answersCard.getByText("Objetos arrastrables", { exact: true }),
  ).toHaveCount(1);

  const nameInput = page.locator('input[id^="drag-item-label-"]').first();
  const firstObjectCard = nameInput.locator(
    'xpath=ancestor::*[@data-slot="card"][1]',
  );
  const firstObjectHeader = firstObjectCard.locator(
    '[data-slot="card-header"]',
  );
  const firstObjectTitle = firstObjectCard.locator('[data-slot="card-title"]');
  const firstObjectContent = firstObjectCard.locator(
    '[data-slot="card-content"]',
  );
  const firstObjectNameLabel = firstObjectCard.locator(
    'label[for^="drag-item-label-"]',
  );
  const firstObjectFields = firstObjectContent.locator(":scope > div.grid");
  const firstObjectImageField = firstObjectCard
    .locator('[data-slot="field"]')
    .filter({ hasText: "Imagen del objeto" });
  const firstObjectImageTitle = firstObjectImageField.getByText(
    "Imagen del objeto",
    {
      exact: true,
    },
  );
  const firstObjectPreview = firstObjectImageField.locator("img").first();
  const replaceObjectImage = firstObjectCard.getByText("Reemplazar", {
    exact: true,
  });
  const replaceObjectImageInput = firstObjectCard.getByLabel(
    /^Reemplazar imagen de /,
  );
  await expect(
    firstObjectHeader.locator('[data-slot="card-description"]'),
  ).toHaveCount(0);
  const [
    firstObjectCardBox,
    firstObjectHeaderBox,
    firstObjectContentBox,
    firstObjectNameLabelBox,
    firstObjectFieldsBox,
    firstObjectImageFieldBox,
    firstObjectImageTitleBox,
    firstObjectPreviewBox,
    replaceObjectImageBox,
  ] = await Promise.all([
    firstObjectCard.boundingBox(),
    firstObjectHeader.boundingBox(),
    firstObjectContent.boundingBox(),
    firstObjectNameLabel.boundingBox(),
    firstObjectFields.boundingBox(),
    firstObjectImageField.boundingBox(),
    firstObjectImageTitle.boundingBox(),
    firstObjectPreview.boundingBox(),
    replaceObjectImage.boundingBox(),
  ]);
  expect(firstObjectCardBox).not.toBeNull();
  expect(firstObjectHeaderBox).not.toBeNull();
  expect(firstObjectContentBox).not.toBeNull();
  expect(firstObjectNameLabelBox).not.toBeNull();
  expect(firstObjectFieldsBox).not.toBeNull();
  expect(firstObjectImageFieldBox).not.toBeNull();
  expect(firstObjectImageTitleBox).not.toBeNull();
  expect(firstObjectPreviewBox).not.toBeNull();
  expect(replaceObjectImageBox).not.toBeNull();
  await expect(replaceObjectImageInput).toHaveCount(1);
  await expect(
    firstObjectCard.getByText("Reemplazar imagen", { exact: true }),
  ).toHaveCount(0);
  expect(
    await replaceObjectImage.evaluate(
      (element) => element.parentElement?.tagName,
    ),
  ).toBe("LABEL");
  await expect(replaceObjectImage).toHaveCSS("opacity", "0");
  expect(
    firstObjectNameLabelBox!.y -
      (firstObjectHeaderBox!.y + firstObjectHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(firstObjectImageFieldBox!.x).toBeGreaterThan(
    firstObjectFieldsBox!.x + firstObjectFieldsBox!.width,
  );
  expect(
    Math.abs(
      firstObjectImageTitleBox!.x +
        firstObjectImageTitleBox!.width / 2 -
        (firstObjectImageFieldBox!.x + firstObjectImageFieldBox!.width / 2),
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(replaceObjectImageBox!.x - firstObjectPreviewBox!.x),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(replaceObjectImageBox!.y - firstObjectPreviewBox!.y),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(replaceObjectImageBox!.width - firstObjectPreviewBox!.width),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(replaceObjectImageBox!.height - firstObjectPreviewBox!.height),
  ).toBeLessThanOrEqual(1);
  expect(
    firstObjectCardBox!.y +
      firstObjectCardBox!.height -
      (firstObjectContentBox!.y + firstObjectContentBox!.height),
  ).toBeLessThanOrEqual(21);
  const originalObjectName = await nameInput.inputValue();
  await expect(firstObjectTitle).toHaveText(originalObjectName);
  await nameInput.fill("Pieza principal");
  await expect(firstObjectTitle).toHaveText("Pieza principal");
  await nameInput.fill("");
  await expect(firstObjectTitle).toHaveText("Objeto 1");
  await nameInput.fill(originalObjectName);
  await expect(firstObjectTitle).toHaveText(originalObjectName);

  const widthInput = page.locator('input[id^="drag-item-width-"]').first();
  const radiusInput = page.locator('input[id^="drag-target-radius-"]').first();
  await expect(nameInput).toBeVisible();
  await expect(widthInput).toBeVisible();
  await expect(radiusInput).toBeVisible();
  await expect(page.locator('input[id^="drag-target-x-"]')).toHaveCount(0);
  await expect(page.locator('input[id^="drag-target-y-"]')).toHaveCount(0);

  const [desktopName, desktopWidth, desktopRadius] = await Promise.all([
    nameInput.boundingBox(),
    widthInput.boundingBox(),
    radiusInput.boundingBox(),
  ]);
  expect(desktopName).not.toBeNull();
  expect(desktopWidth).not.toBeNull();
  expect(desktopRadius).not.toBeNull();
  expect(desktopWidth!.y).toBeGreaterThan(desktopName!.y + desktopName!.height);
  expect(Math.abs(desktopWidth!.y - desktopRadius!.y)).toBeLessThanOrEqual(1);

  const stage = page.getByRole("group", {
    name: "Ubicación de los destinos de encaje",
  });
  const movedTarget = await stage.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const event = new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + element.clientLeft + element.clientWidth * 0.3333357,
      clientY: rect.top + element.clientTop + element.clientHeight * 0.4444457,
    });
    const coordinate = (
      position: number,
      start: number,
      border: number,
      size: number,
    ) =>
      Math.round(
        Math.max(0, Math.min(100, ((position - start - border) / size) * 100)) *
          1000,
      ) / 1000;
    element.dispatchEvent(event);
    return {
      x: coordinate(
        event.clientX,
        rect.left,
        element.clientLeft,
        element.clientWidth,
      ),
      y: coordinate(
        event.clientY,
        rect.top,
        element.clientTop,
        element.clientHeight,
      ),
    };
  });
  const updateRequest = page.waitForRequest(
    (candidate) =>
      candidate.url() === `${API}/api/tasks/${task.id}` &&
      candidate.method() === "PUT",
  );
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const updatedTarget = (await updateRequest)
    .postDataJSON()
    .dragDropTargets.find(
      (target: { id: string }) => target.id === DRAG_DROP_TARGETS[0].id,
    );
  expect(updatedTarget).toMatchObject(movedTarget);

  await multipleChoiceType.click();
  await expect(multipleChoiceType).toBeChecked();
  await expect(
    answersCard.getByText(
      "Define cómo se presentan las opciones y cuáles se aceptan como correctas.",
    ),
  ).toHaveCount(1);
  await expect(
    answersCard.getByText(
      "Completa al menos dos opciones y marca cuáles deben aceptarse como correctas.",
    ),
  ).toHaveCount(1);
  const contentConfiguration = answersCard
    .getByText("Contenido", { exact: true })
    .locator("..");
  const presentationConfiguration = answersCard
    .getByText("Presentación", { exact: true })
    .locator("..");
  const correctnessConfiguration = answersCard
    .getByText("Criterio de corrección", { exact: true })
    .locator("..");
  const multipleChoiceConfigurationGrid = contentConfiguration.locator("../..");
  const multipleChoiceSettings = multipleChoiceConfigurationGrid.locator("..");
  await expect(
    answersCard.getByText("Orden para cada estudiante.", { exact: true }),
  ).toHaveCount(1);
  await expect(
    answersCard.getByText("Número de respuestas correctas y a marcar.", {
      exact: true,
    }),
  ).toHaveCount(1);
  const [
    contentConfigurationBox,
    presentationConfigurationBox,
    correctnessConfigurationBox,
  ] = await Promise.all([
    contentConfiguration.boundingBox(),
    presentationConfiguration.boundingBox(),
    correctnessConfiguration.boundingBox(),
  ]);
  expect(contentConfigurationBox).not.toBeNull();
  expect(presentationConfigurationBox).not.toBeNull();
  expect(correctnessConfigurationBox).not.toBeNull();
  expect(presentationConfigurationBox!.y).toBe(contentConfigurationBox!.y);
  expect(correctnessConfigurationBox!.y).toBe(contentConfigurationBox!.y);
  expect(presentationConfigurationBox!.x).toBeGreaterThan(
    contentConfigurationBox!.x,
  );
  expect(correctnessConfigurationBox!.x).toBeGreaterThan(
    presentationConfigurationBox!.x,
  );
  expect(
    await multipleChoiceConfigurationGrid.evaluate(
      (element) =>
        window
          .getComputedStyle(element)
          .gridTemplateColumns.split(" ")
          .filter((column) => Number.parseFloat(column) > 0).length,
    ),
  ).toBe(3);
  await expect(multipleChoiceSettings).toHaveCSS("row-gap", "16px");
  const singleModeConfigurationGridBox =
    await multipleChoiceConfigurationGrid.boundingBox();
  expect(singleModeConfigurationGridBox).not.toBeNull();
  const singleModeConfigurationGridY =
    singleModeConfigurationGridBox!.y +
    (await page.evaluate(() => window.scrollY));
  const addAnswer = answersCard.getByRole("button", {
    name: "Agregar respuesta",
  });
  await addAnswer.click();
  await addAnswer.click();
  const firstOptionCard = answersCard
    .locator('[data-slot="card"]')
    .filter({ hasText: "Respuesta 1" })
    .first();
  const secondOptionCard = answersCard
    .locator('[data-slot="card"]')
    .filter({ hasText: "Respuesta 2" })
    .first();
  const thirdOptionCard = answersCard
    .locator('[data-slot="card"]')
    .filter({ hasText: "Respuesta 3" })
    .first();
  const fourthOptionCard = answersCard
    .locator('[data-slot="card"]')
    .filter({ hasText: "Respuesta 4" })
    .first();
  const firstOptionHeader = firstOptionCard.locator(
    '[data-slot="card-header"]',
  );
  const firstOptionInput = firstOptionCard.getByPlaceholder(
    "Escribe la respuesta.",
  );
  const [
    firstOptionCardBox,
    secondOptionCardBox,
    thirdOptionCardBox,
    fourthOptionCardBox,
    firstOptionHeaderBox,
    firstOptionInputBox,
  ] = await Promise.all([
    firstOptionCard.boundingBox(),
    secondOptionCard.boundingBox(),
    thirdOptionCard.boundingBox(),
    fourthOptionCard.boundingBox(),
    firstOptionHeader.boundingBox(),
    firstOptionInput.boundingBox(),
  ]);
  expect(firstOptionCardBox).not.toBeNull();
  expect(secondOptionCardBox).not.toBeNull();
  expect(thirdOptionCardBox).not.toBeNull();
  expect(fourthOptionCardBox).not.toBeNull();
  expect(firstOptionHeaderBox).not.toBeNull();
  expect(firstOptionInputBox).not.toBeNull();
  expect(
    firstOptionInputBox!.y -
      (firstOptionHeaderBox!.y + firstOptionHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    firstOptionCardBox!.y +
      firstOptionCardBox!.height -
      (firstOptionInputBox!.y + firstOptionInputBox!.height),
  ).toBeLessThanOrEqual(21);
  expect(
    Math.abs(secondOptionCardBox!.y - firstOptionCardBox!.y),
  ).toBeLessThanOrEqual(1);
  expect(secondOptionCardBox!.x).toBeGreaterThan(firstOptionCardBox!.x);
  expect(thirdOptionCardBox!.y).toBeGreaterThan(
    firstOptionCardBox!.y + firstOptionCardBox!.height,
  );
  expect(
    Math.abs(fourthOptionCardBox!.y - thirdOptionCardBox!.y),
  ).toBeLessThanOrEqual(1);
  expect(fourthOptionCardBox!.x).toBeGreaterThan(thirdOptionCardBox!.x);

  const singleCorrectOptionRadios = [1, 2, 3, 4].map((answerNumber) =>
    answersCard.getByRole("radio", {
      name: `Marcar respuesta ${answerNumber} como correcta`,
    }),
  );
  await expect(singleCorrectOptionRadios[0]).toHaveCount(1);
  await expect(
    answersCard.getByRole("checkbox", {
      name: /^Marcar respuesta \d como correcta$/,
    }),
  ).toHaveCount(0);
  await singleCorrectOptionRadios[1].click();
  await expect(singleCorrectOptionRadios[1]).toBeChecked();
  await expect(singleCorrectOptionRadios[0]).not.toBeChecked();
  await expect(
    firstOptionCard.getByText("Respuesta correcta", { exact: true }),
  ).toHaveCount(0);
  await expect(
    secondOptionCard.getByText("Respuesta correcta", { exact: true }),
  ).toHaveCount(1);
  await expect(
    answersCard.getByText("Marcar como correcta", { exact: true }),
  ).toHaveCount(0);

  await answersCard
    .getByRole("radio", {
      name: "Varias correctas (debe marcar todas)",
    })
    .click();
  await expect(multipleChoiceSettings).toHaveCSS("row-gap", "16px");
  const multipleModeConfigurationGridBox =
    await multipleChoiceConfigurationGrid.boundingBox();
  expect(multipleModeConfigurationGridBox).not.toBeNull();
  const multipleModeConfigurationGridY =
    multipleModeConfigurationGridBox!.y +
    (await page.evaluate(() => window.scrollY));
  expect(multipleModeConfigurationGridY).toBe(singleModeConfigurationGridY);
  await expect(
    answersCard.getByRole("radio", {
      name: /^Marcar respuesta \d como correcta$/,
    }),
  ).toHaveCount(0);
  const correctOptionCheckboxes = [1, 2, 3, 4].map((answerNumber) =>
    answersCard.getByRole("checkbox", {
      name: `Marcar respuesta ${answerNumber} como correcta`,
    }),
  );
  for (const checkbox of correctOptionCheckboxes) {
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
    }
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).toHaveCSS("opacity", "1");
  }
  await expect(
    answersCard.getByText("Respuesta correcta", { exact: true }),
  ).toHaveCount(4);
  await expect(
    firstOptionCard.getByRole("button", {
      name: "Mover respuesta 1 antes",
    }),
  ).toBeDisabled();
  await expect(
    firstOptionCard.getByRole("button", {
      name: "Mover respuesta 1 después",
    }),
  ).toBeEnabled();
  await expect(
    fourthOptionCard.getByRole("button", {
      name: "Mover respuesta 4 después",
    }),
  ).toBeDisabled();
  await fourthOptionCard
    .getByRole("button", { name: "Eliminar respuesta 4" })
    .click();
  await expect(
    answersCard.getByPlaceholder("Escribe la respuesta."),
  ).toHaveCount(3);
  await thirdOptionCard
    .getByRole("button", { name: "Eliminar respuesta 3" })
    .click();
  await expect(
    answersCard.getByPlaceholder("Escribe la respuesta."),
  ).toHaveCount(2);
  await expect(
    answersCard.getByRole("button", { name: /^Eliminar respuesta \d$/ }),
  ).toHaveCount(0);
  await expect(addAnswer).toBeVisible();

  await shortTextType.click();
  await expect(shortTextType).toBeChecked();
  await expect(
    answersCard.getByLabel("Respuesta corta esperada"),
  ).toBeVisible();

  await rangeType.click();
  await expect(rangeType).toBeChecked();
  await expect(
    answersCard.getByText(
      "Define uno o varios intervalos aceptados. La respuesta será correcta si el valor cae dentro de al menos uno de ellos.",
    ),
  ).toHaveCount(1);
  await expect(
    answersCard.getByText(
      "Define uno o varios intervalos aceptados para la respuesta.",
    ),
  ).toHaveCount(0);
  await expect(
    answersCard.getByText(
      "El participante será correcto si su valor cae dentro de este rango.",
    ),
  ).toHaveCount(0);
  const firstRangeName = answersCard.getByLabel("Nombre del rango").first();
  const firstRangeCard = firstRangeName.locator(
    'xpath=ancestor::*[@data-slot="card"][1]',
  );
  const firstRangeHeader = firstRangeCard.locator('[data-slot="card-header"]');
  const firstRangeTitle = firstRangeCard.locator('[data-slot="card-title"]');
  const firstRangeContent = firstRangeCard.locator(
    '[data-slot="card-content"]',
  );
  const firstRangeLabelField = firstRangeContent
    .locator(':scope > [data-slot="field"]')
    .first();
  const firstRangeLabel = firstRangeCard.getByText("Nombre del rango", {
    exact: true,
  });
  const firstRangeLimits = firstRangeContent.locator(":scope > div.grid");
  await expect(
    firstRangeHeader.locator('[data-slot="card-description"]'),
  ).toHaveCount(0);
  const [
    firstRangeCardBox,
    firstRangeHeaderBox,
    firstRangeLabelFieldBox,
    firstRangeLabelBox,
    firstRangeLimitsBox,
  ] = await Promise.all([
    firstRangeCard.boundingBox(),
    firstRangeHeader.boundingBox(),
    firstRangeLabelField.boundingBox(),
    firstRangeLabel.boundingBox(),
    firstRangeLimits.boundingBox(),
  ]);
  expect(firstRangeCardBox).not.toBeNull();
  expect(firstRangeHeaderBox).not.toBeNull();
  expect(firstRangeLabelFieldBox).not.toBeNull();
  expect(firstRangeLabelBox).not.toBeNull();
  expect(firstRangeLimitsBox).not.toBeNull();
  expect(
    firstRangeLabelBox!.y -
      (firstRangeHeaderBox!.y + firstRangeHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    firstRangeLimitsBox!.y -
      (firstRangeLabelFieldBox!.y + firstRangeLabelFieldBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    firstRangeCardBox!.y +
      firstRangeCardBox!.height -
      (firstRangeLimitsBox!.y + firstRangeLimitsBox!.height),
  ).toBeLessThanOrEqual(21);
  await expect(firstRangeTitle).toHaveText("Rango válido");
  await firstRangeName.fill("Intervalo principal");
  await expect(firstRangeTitle).toHaveText("Intervalo principal");
  await firstRangeName.fill("");
  await expect(firstRangeTitle).toHaveText("Rango 1");

  await dragDropType.click();
  await expect(dragDropType).toBeChecked();

  await page.setViewportSize({ width: 320, height: 800 });
  const [
    mobileName,
    mobileWidth,
    mobileRadius,
    mobileCategoryOne,
    mobileCategoryTwo,
    mobileFirstAgeCheckbox,
    mobileFirstDifficulty,
    mobileSecondDifficulty,
    mobileFirstAgeField,
    mobileSecondAgeField,
    mobileThirdAgeLabel,
    mobileMultipleChoiceTypeField,
    mobileShortTextTypeField,
    mobileRangeTypeField,
    mobileDragDropTypeField,
    mobileFirstObjectImageField,
    mobileReplaceObjectImage,
  ] = await Promise.all([
    nameInput.boundingBox(),
    widthInput.boundingBox(),
    radiusInput.boundingBox(),
    firstCategory.boundingBox(),
    secondCategory.boundingBox(),
    firstAgeCheckbox.boundingBox(),
    firstDifficulty.boundingBox(),
    secondDifficulty.boundingBox(),
    firstAgeField.boundingBox(),
    secondAgeField.boundingBox(),
    thirdAgeLabel.boundingBox(),
    multipleChoiceTypeField.boundingBox(),
    shortTextTypeField.boundingBox(),
    rangeTypeField.boundingBox(),
    dragDropTypeField.boundingBox(),
    firstObjectImageField.boundingBox(),
    replaceObjectImage.boundingBox(),
  ]);
  expect(mobileName).not.toBeNull();
  expect(mobileWidth).not.toBeNull();
  expect(mobileRadius).not.toBeNull();
  expect(mobileCategoryOne).not.toBeNull();
  expect(mobileCategoryTwo).not.toBeNull();
  expect(mobileFirstAgeCheckbox).not.toBeNull();
  expect(mobileFirstDifficulty).not.toBeNull();
  expect(mobileSecondDifficulty).not.toBeNull();
  expect(mobileFirstAgeField).not.toBeNull();
  expect(mobileSecondAgeField).not.toBeNull();
  expect(mobileThirdAgeLabel).not.toBeNull();
  expect(mobileMultipleChoiceTypeField).not.toBeNull();
  expect(mobileShortTextTypeField).not.toBeNull();
  expect(mobileRangeTypeField).not.toBeNull();
  expect(mobileDragDropTypeField).not.toBeNull();
  expect(mobileFirstObjectImageField).not.toBeNull();
  expect(mobileReplaceObjectImage).not.toBeNull();
  await expect(replaceObjectImage).toHaveCSS("opacity", "1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(mobileWidth!.y).toBeGreaterThan(mobileName!.y + mobileName!.height);
  expect(mobileRadius!.y).toBeGreaterThan(mobileWidth!.y + mobileWidth!.height);
  expect(mobileCategoryTwo!.y).toBeGreaterThan(
    mobileCategoryOne!.y + mobileCategoryOne!.height,
  );
  const checkboxOpticalOffset =
    mobileFirstAgeCheckbox!.y +
    mobileFirstAgeCheckbox!.height / 2 -
    (mobileFirstDifficulty!.y + mobileFirstDifficulty!.height / 2);
  expect(checkboxOpticalOffset).toBeGreaterThanOrEqual(-3);
  expect(checkboxOpticalOffset).toBeLessThanOrEqual(-1);
  expect(mobileFirstDifficulty!.width).toBeLessThanOrEqual(161);
  expect(mobileSecondDifficulty!.width).toBe(mobileFirstDifficulty!.width);
  expect(mobileSecondDifficulty!.x).toBe(mobileFirstDifficulty!.x);
  expect(mobileThirdAgeLabel!.height).toBeLessThanOrEqual(20);
  expect(
    mobileFirstAgeField!.x +
      mobileFirstAgeField!.width -
      (mobileFirstDifficulty!.x + mobileFirstDifficulty!.width),
  ).toBeLessThanOrEqual(1);
  expect(
    mobileSecondAgeField!.y -
      (mobileFirstAgeField!.y + mobileFirstAgeField!.height),
  ).toBeLessThanOrEqual(16);
  expect(mobileShortTextTypeField!.x).toBe(mobileMultipleChoiceTypeField!.x);
  expect(mobileRangeTypeField!.x).toBe(mobileMultipleChoiceTypeField!.x);
  expect(mobileDragDropTypeField!.x).toBe(mobileMultipleChoiceTypeField!.x);
  expect(mobileShortTextTypeField!.y).toBeGreaterThan(
    mobileMultipleChoiceTypeField!.y + mobileMultipleChoiceTypeField!.height,
  );
  expect(mobileRangeTypeField!.y).toBeGreaterThan(
    mobileShortTextTypeField!.y + mobileShortTextTypeField!.height,
  );
  expect(mobileDragDropTypeField!.y).toBeGreaterThan(
    mobileRangeTypeField!.y + mobileRangeTypeField!.height,
  );
  expect(
    Math.abs(
      mobileReplaceObjectImage!.x +
        mobileReplaceObjectImage!.width / 2 -
        (mobileFirstObjectImageField!.x +
          mobileFirstObjectImageField!.width / 2),
    ),
  ).toBeLessThanOrEqual(1);

  await multipleChoiceType.click();
  const [
    mobileFirstOptionCard,
    mobileSecondOptionCard,
    mobileContentConfiguration,
    mobilePresentationConfiguration,
    mobileCorrectnessConfiguration,
  ] = await Promise.all([
    firstOptionCard.boundingBox(),
    secondOptionCard.boundingBox(),
    contentConfiguration.boundingBox(),
    presentationConfiguration.boundingBox(),
    correctnessConfiguration.boundingBox(),
  ]);
  expect(mobileFirstOptionCard).not.toBeNull();
  expect(mobileSecondOptionCard).not.toBeNull();
  expect(mobileContentConfiguration).not.toBeNull();
  expect(mobilePresentationConfiguration).not.toBeNull();
  expect(mobileCorrectnessConfiguration).not.toBeNull();
  expect(mobileSecondOptionCard!.x).toBe(mobileFirstOptionCard!.x);
  expect(mobileSecondOptionCard!.y).toBeGreaterThan(
    mobileFirstOptionCard!.y + mobileFirstOptionCard!.height,
  );
  expect(mobilePresentationConfiguration!.x).toBe(
    mobileContentConfiguration!.x,
  );
  expect(mobileCorrectnessConfiguration!.x).toBe(mobileContentConfiguration!.x);
  expect(mobilePresentationConfiguration!.y).toBeGreaterThan(
    mobileContentConfiguration!.y + mobileContentConfiguration!.height,
  );
  expect(mobileCorrectnessConfiguration!.y).toBeGreaterThan(
    mobilePresentationConfiguration!.y +
      mobilePresentationConfiguration!.height,
  );
  expect(
    await multipleChoiceConfigurationGrid.evaluate(
      (element) =>
        window
          .getComputedStyle(element)
          .gridTemplateColumns.split(" ")
          .filter((column) => Number.parseFloat(column) > 0).length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const [wideMobileDifficulty, wideMobileAgeField] = await Promise.all([
    firstDifficulty.boundingBox(),
    firstAgeField.boundingBox(),
  ]);
  expect(wideMobileDifficulty).not.toBeNull();
  expect(wideMobileAgeField).not.toBeNull();
  expect(wideMobileDifficulty!.width).toBeLessThanOrEqual(193);
  expect(wideMobileDifficulty!.width).toBeGreaterThan(
    mobileFirstDifficulty!.width,
  );
  expect(
    wideMobileAgeField!.x +
      wideMobileAgeField!.width -
      (wideMobileDifficulty!.x + wideMobileDifficulty!.width),
  ).toBeLessThanOrEqual(1);
});

test("edits task content with touch without adding mobile controls", async ({
  browser,
}) => {
  const api = await request.newContext();
  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((response) => response.json());
  const headers = { authorization: `Bearer ${session.token}` };
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
    await touchContext.addInitScript(({ token, user }) => {
      window.localStorage.setItem("bebras_token", token);
      window.localStorage.setItem("bebras_user", JSON.stringify(user));
    }, session);
    const page = await touchContext.newPage();
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

    const bodyCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Cuerpo" })
      .first();
    const blockRows = bodyCard.locator("[data-content-block-id]");
    const firstRow = bodyCard.locator(
      `[data-content-block-id="${blockIds.first}"]`,
    );
    const imageRow = bodyCard.locator(
      `[data-content-block-id="${blockIds.image}"]`,
    );
    const image = imageRow.getByRole("img", { name: "contenido-tactil.svg" });
    const reorderHandle = firstRow.getByRole("button", {
      name: "Arrastrar para reordenar bloque",
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

    const stage = page.getByRole("group", {
      name: "Ubicación de los destinos de encaje",
    });
    const marker = page.getByRole("button", {
      name: "Mover destino de Objeto alfa",
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
    expect(response.ok(), await response.text()).toBe(true);
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

test("serializes every multiple-choice correctness criterion", async ({
  page,
}) => {
  const api = await request.newContext();
  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((response) => response.json());
  const headers = { authorization: `Bearer ${session.token}` };
  const task = await createPracticeTask(
    api,
    headers,
    "multiple_choice",
  );

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto(`/tareas/editar?id=${task.id}`);

  const answersCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Respuestas" })
    .first();
  const saveCriterion = async (expected: string) => {
    const updateResponse = page.waitForResponse(
      (candidate) =>
        candidate.url() === `${API}/api/tasks/${task.id}` &&
        candidate.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    const response = await updateResponse;
    expect(response.ok(), await response.text()).toBe(true);
    expect(response.request().postDataJSON().correctAnswerId).toBe(expected);
  };

  await expect(
    answersCard.getByRole("radio", {
      name: "Una sola respuesta correcta",
    }),
  ).toBeChecked();
  await saveCriterion("B");

  await answersCard
    .getByRole("radio", {
      name: "Varias correctas (basta marcar una)",
    })
    .click();
  const optionCheckboxes = [1, 2].map((answerNumber) =>
    answersCard.getByRole("checkbox", {
      name: `Marcar respuesta ${answerNumber} como correcta`,
    }),
  );
  await expect(optionCheckboxes[1]).toBeChecked();
  await optionCheckboxes[0].click();
  await saveCriterion("any:B,A");

  await answersCard
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
  await page.reload();
  await expect(
    answersCard.getByRole("radio", {
      name: "Varias correctas (debe marcar todas)",
    }),
  ).toBeChecked();
  await expect(optionCheckboxes[0]).toBeChecked();
  await expect(optionCheckboxes[1]).toBeChecked();
  await api.dispose();
});

test("evaluates any and all criteria in the task tester", async ({ page }) => {
  const api = await request.newContext();
  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((response) => response.json());
  const headers = { authorization: `Bearer ${session.token}` };
  const answers = ["A", "B", "C"].map((id) => ({
    id,
    blocks: [taskBlock(`tester-${id}-${Date.now()}`, `Respuesta ${id}`)],
  }));
  const anyTask = await createPracticeTask(
    api,
    headers,
    "multiple_choice",
    {
      title: "Probador criterio any",
      answers,
      correctAnswerId: "any:B,C",
    },
  );
  const allTask = await createPracticeTask(
    api,
    headers,
    "multiple_choice",
    {
      title: "Probador criterio all",
      answers,
      correctAnswerId: "all:B,C",
    },
  );

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);

  await page.goto(`/tareas/probador?id=${anyTask.id}`);
  const resultAlert = page.locator("main").getByRole("alert");
  await page.getByRole("button", { name: "Respuesta B", exact: true }).click();
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(resultAlert.getByText("Correcto", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reiniciar" }).click();
  await page.getByRole("button", { name: "Respuesta A", exact: true }).click();
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(resultAlert.getByText("Incorrecto", { exact: true })).toBeVisible();

  await page.goto(`/tareas/probador?id=${allTask.id}`);
  await page.getByRole("button", { name: "Respuesta B", exact: true }).click();
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(resultAlert.getByText("Incorrecto", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Respuesta C", exact: true }).click();
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(resultAlert.getByText("Correcto", { exact: true })).toBeVisible();
  await api.dispose();
});

test("labels tester controls for each answer type", async ({ page }) => {
  const api = await request.newContext();
  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((response) => response.json());
  const headers = { authorization: `Bearer ${session.token}` };
  const cases = [
    { answerType: "multiple_choice", heading: "Opciones de respuesta" },
    { answerType: "short_text", heading: "Respuesta corta" },
    { answerType: "range", heading: "Respuesta por rangos" },
    { answerType: "drag_drop", heading: "Arrastrar y soltar" },
  ] as const;
  const tasks = [];

  for (const testCase of cases) {
    tasks.push(await createPracticeTask(api, headers, testCase.answerType));
  }

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);

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
      page.getByRole("button", { name: "Probar respuesta" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reiniciar" })).toBeVisible();
  }

  await api.dispose();
});
