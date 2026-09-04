import { test, expect, request } from "@playwright/test";
import {
  API,
  ADMIN,
  createContest,
  createPracticeTask,
} from "./support/helpers";

test("keeps contest and task card actions responsive and compact", async ({
  browser,
  page,
}) => {
  const api = await request.newContext();
  const loginResponse = await api.post(`${API}/api/auth/login`, {
    data: ADMIN,
  });
  expect(loginResponse.ok()).toBe(true);
  const session = (await loginResponse.json()) as {
    token: string;
    user: { id: number; email: string; name: string | null; role: string };
  };
  const headers = { authorization: `Bearer ${session.token}` };
  const listedContest = await createContest(api, headers, {
    title: `Responsive actions ${Date.now()}`,
    tasks: [
      { taskId: "seed-bebras-easy" },
      { taskId: "seed-bebras-medium" },
      { taskId: "seed-bebras-hard" },
    ],
  });
  const tasksResponse = await api.get(`${API}/api/tasks`, { headers });
  expect(tasksResponse.ok()).toBe(true);
  const listedTask = (
    (await tasksResponse.json()) as Array<{ id: string; title: string }>
  )[0];
  expect(listedTask).toBeDefined();

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/competencias");

  const contestCard = page
    .getByText(listedContest.title, { exact: true })
    .locator("xpath=ancestor::li[1]");
  // El listado ya no vive en una card: la comprobación de que no queda hueco
  // entre el encabezado de la página y la primera fila se mantiene igual.
  const contestListHeader = page
    .getByRole("heading", { name: "Desafíos", level: 1 })
    .locator("xpath=ancestor::div[2]");
  const firstContestRow = page.locator("main li").first();
  const [contestListHeaderBox, firstContestRowBox] = await Promise.all([
    contestListHeader.boundingBox(),
    firstContestRow.boundingBox(),
  ]);
  expect(contestListHeaderBox).not.toBeNull();
  expect(firstContestRowBox).not.toBeNull();
  // La separación real es la del contenedor (gap-8); el margen extra tolera
  // la variación de alto del encabezado del sitio entre anchos de pantalla.
  expect(
    firstContestRowBox!.y -
      (contestListHeaderBox!.y + contestListHeaderBox!.height),
  ).toBeLessThanOrEqual(56);
  const contestActions = [
    contestCard.getByRole("link", { name: "Resultados" }),
    contestCard.getByRole("button", { name: "Suspender" }),
    contestCard.getByRole("link", { name: "Editar" }),
    contestCard.getByRole("button", { name: "Eliminar" }),
  ];
  const mobileContestActions = await Promise.all(
    contestActions.map((action) => action.boundingBox()),
  );
  expect(mobileContestActions[0]!.width).toBe(mobileContestActions[1]!.width);
  expect(mobileContestActions[1]!.width).toBe(mobileContestActions[2]!.width);
  expect(mobileContestActions[2]!.width).toBe(mobileContestActions[3]!.width);
  expect(mobileContestActions[1]!.y).toBeGreaterThan(
    mobileContestActions[0]!.y,
  );
  expect(mobileContestActions[2]!.y).toBeGreaterThan(
    mobileContestActions[1]!.y,
  );
  expect(mobileContestActions[3]!.y).toBeGreaterThan(
    mobileContestActions[2]!.y,
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopContestActions = await Promise.all(
    contestActions.map((action) => action.boundingBox()),
  );
  expect(desktopContestActions[0]!.width).toBeLessThan(160);
  expect(desktopContestActions[0]!.width).toBe(desktopContestActions[1]!.width);
  expect(desktopContestActions[1]!.width).toBe(desktopContestActions[2]!.width);
  expect(desktopContestActions[2]!.width).toBe(desktopContestActions[3]!.width);
  expect(desktopContestActions[1]!.y).toBe(desktopContestActions[0]!.y);
  expect(desktopContestActions[1]!.x).toBeGreaterThan(
    desktopContestActions[0]!.x,
  );
  expect(desktopContestActions[2]!.y).toBeGreaterThan(
    desktopContestActions[0]!.y,
  );
  expect(desktopContestActions[3]!.y).toBe(desktopContestActions[2]!.y);
  expect(desktopContestActions[3]!.x).toBeGreaterThan(
    desktopContestActions[2]!.x,
  );

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/tareas");
  const taskCard = page
    .getByText(listedTask.title, { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const taskActions = [
    taskCard.getByRole("button", { name: /^(En práctica|Práctica)$/ }),
    taskCard.getByRole("link", { name: "Editar" }),
    taskCard.getByRole("link", { name: "Probar" }),
    taskCard.getByRole("button", { name: "Eliminar" }),
  ];
  const mobileTaskActions = await Promise.all(
    taskActions.map((action) => action.boundingBox()),
  );
  expect(mobileTaskActions[0]!.width).toBe(mobileTaskActions[1]!.width);
  expect(mobileTaskActions[1]!.width).toBe(mobileTaskActions[2]!.width);
  expect(mobileTaskActions[2]!.width).toBe(mobileTaskActions[3]!.width);
  expect(mobileTaskActions[1]!.y).toBeGreaterThan(mobileTaskActions[0]!.y);
  expect(mobileTaskActions[2]!.y).toBeGreaterThan(mobileTaskActions[1]!.y);
  expect(mobileTaskActions[3]!.y).toBeGreaterThan(mobileTaskActions[2]!.y);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopTaskActions = await Promise.all(
    taskActions.map((action) => action.boundingBox()),
  );
  expect(desktopTaskActions[0]!.width).toBeLessThan(160);
  expect(desktopTaskActions[0]!.width).toBe(desktopTaskActions[1]!.width);
  expect(desktopTaskActions[1]!.width).toBe(desktopTaskActions[2]!.width);
  expect(desktopTaskActions[2]!.width).toBe(desktopTaskActions[3]!.width);
  expect(desktopTaskActions[1]!.y).toBe(desktopTaskActions[0]!.y);
  expect(desktopTaskActions[1]!.x).toBeGreaterThan(desktopTaskActions[0]!.x);
  expect(desktopTaskActions[2]!.y).toBeGreaterThan(desktopTaskActions[0]!.y);
  expect(desktopTaskActions[3]!.y).toBe(desktopTaskActions[2]!.y);
  expect((await taskCard.boundingBox())!.height).toBeLessThan(260);

  const taskCardLink = taskCard.getByRole("link", {
    name: `Abrir edición de ${listedTask.title}`,
    exact: true,
  });
  await expect(taskCardLink).toHaveAttribute(
    "href",
    `/tareas/editar?id=${listedTask.id}`,
  );

  await taskCard.getByRole("link", { name: "Probar", exact: true }).click();
  await expect(page).toHaveURL(`/tareas/probador?id=${listedTask.id}`);
  await page.goBack();
  await expect(taskCard).toBeVisible();

  const taskCardLinkBox = await taskCardLink.boundingBox();
  expect(taskCardLinkBox).not.toBeNull();
  await taskCardLink.click({
    position: {
      x: taskCardLinkBox!.width / 2,
      y: taskCardLinkBox!.height - 16,
    },
  });
  await expect(page).toHaveURL(`/tareas/editar?id=${listedTask.id}`);

  await page.goBack();
  await expect(taskCard).toBeVisible();
  await taskCardLink.focus();
  await expect(taskCardLink).toBeFocused();
  await taskCardLink.press("Enter");
  await expect(page).toHaveURL(`/tareas/editar?id=${listedTask.id}`);

  const touchContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const touchPage = await touchContext.newPage();
    await touchPage.addInitScript(({ token, user }) => {
      window.localStorage.setItem("bebras_token", token);
      window.localStorage.setItem("bebras_user", JSON.stringify(user));
    }, session);
    await touchPage.goto("/tareas");
    const touchTaskCard = touchPage
      .getByText(listedTask.title, { exact: true })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    const touchCardLink = touchTaskCard.getByRole("link", {
      name: `Abrir edición de ${listedTask.title}`,
      exact: true,
    });
    const touchCardLinkBox = await touchCardLink.boundingBox();
    expect(touchCardLinkBox).not.toBeNull();
    await touchCardLink.tap({
      position: {
        x: touchCardLinkBox!.width / 2,
        y: touchCardLinkBox!.height - 16,
      },
    });
    await expect(touchPage).toHaveURL(`/tareas/editar?id=${listedTask.id}`);
  } finally {
    await touchContext.close();
  }

  await api.dispose();
});

test("confirms task deletion and keeps the task list compact", async ({
  page,
}) => {
  const api = await request.newContext();
  const loginResponse = await api.post(`${API}/api/auth/login`, {
    data: ADMIN,
  });
  expect(loginResponse.ok()).toBe(true);
  const session = await loginResponse.json();
  const headers = { authorization: `Bearer ${session.token}` };
  const removableTask = await createPracticeTask(api, headers, "short_text", {
    title: `Tarea eliminable ${Date.now()}`,
    isPractice: false,
  });
  const protectedTask = await createPracticeTask(api, headers, "short_text", {
    title: `Tarea protegida ${Date.now()}`,
    difficulties: { "8–10": "easy" },
    isPractice: false,
  });
  await createContest(api, headers, {
    title: `Desafío que protege tarea ${Date.now()}`,
    tasks: [{ taskId: protectedTask.id }],
  });

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto("/tareas");

  const listTitle = page
    .locator('[data-slot="card-title"]')
    .filter({ hasText: /^Tareas$/ });
  const listCard = listTitle.locator('xpath=ancestor::*[@data-slot="card"][1]');
  const listHeader = listCard.locator(':scope > [data-slot="card-header"]');
  const firstTaskCard = listCard
    .locator(':scope > [data-slot="card-content"] > [data-slot="card"]')
    .first();
  const removableCard = page
    .getByText(removableTask.title, { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const protectedCard = page
    .getByText(protectedTask.title, { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  await expect(removableCard).toBeVisible();
  await expect(protectedCard).toBeVisible();
  await expect(
    page.getByText("Estas son las tareas registradas actualmente.", {
      exact: true,
    }),
  ).toHaveCount(0);
  const [headerBox, firstTaskBox] = await Promise.all([
    listHeader.boundingBox(),
    firstTaskCard.boundingBox(),
  ]);
  expect(headerBox).not.toBeNull();
  expect(firstTaskBox).not.toBeNull();
  expect(
    firstTaskBox!.y - (headerBox!.y + headerBox!.height),
  ).toBeLessThanOrEqual(25);

  await removableCard
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  let dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("¿Eliminar esta tarea?")).toBeVisible();
  await expect(dialog).toContainText(removableTask.title);
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(removableCard).toBeVisible();

  let releaseDelete: (() => void) | undefined;
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  await page.route(`${API}/api/tasks/${removableTask.id}`, async (route) => {
    await deleteGate;
    await route.continue();
  });
  await removableCard
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Eliminando..." }),
  ).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await expect(dialog).toBeVisible();
  releaseDelete?.();
  await expect(removableCard).toHaveCount(0);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("La tarea se eliminó correctamente.", { exact: true }),
  ).toBeVisible();

  await protectedCard
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(
    page.getByText(/Esta tarea está asociada a 1 desafío/),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Eliminar", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(protectedCard).toBeVisible();
  await api.dispose();
});

test("keeps group and teacher cards responsive and compact", async ({
  page,
}) => {
  const api = await request.newContext();
  const loginResponse = await api.post(`${API}/api/auth/login`, {
    data: ADMIN,
  });
  expect(loginResponse.ok()).toBe(true);
  const session = (await loginResponse.json()) as {
    token: string;
    user: { id: number; email: string; name: string | null; role: string };
  };
  const now = new Date().toISOString();

  await page.route(`${API}/api/published-contests`, (route) =>
    route.fulfill({
      json: [
        {
          id: "responsive-contest",
          title: "Desafío responsive",
          category: "Capibara",
          startsAt: now,
          endsAt: new Date(Date.now() + 3600000).toISOString(),
        },
      ],
    }),
  );
  await page.route(`${API}/api/groups`, (route) =>
    route.fulfill({
      json: [
        {
          id: "responsive-group",
          name: "Grupo responsive",
          accessCode: "ABC123",
          contestId: "responsive-contest",
          contestTitle: "Desafío responsive",
          contestCategory: "Capibara",
          contestAllowPairs: true,
          scheduledAt: now,
          firstUsedAt: null,
          expiresAt: null,
          createdAt: now,
          teamCount: 1,
          teams: [
            {
              id: "responsive-team",
              participationMode: "individual",
              grade: "P3",
              memberOneFirstName: "Participante",
              memberOneLastName: "Con apellido extenso",
              memberTwoFirstName: null,
              memberTwoLastName: null,
              personalCode: "TEAM01",
              status: "registered",
              createdAt: now,
            },
          ],
        },
      ],
    }),
  );
  await page.route(`${API}/api/users/maestros`, (route) =>
    route.fulfill({
      json: [
        {
          id: 999,
          name: "Maestro responsive",
          email: "maestro.responsive.con.correo.extenso@example.com",
          status: "pending",
          schoolName: "Colegio de prueba responsive",
          institutionType: "school",
          phone: "70000000",
          isHomeschool: false,
          hasLetter: true,
          hasIdFront: true,
          hasIdBack: true,
          createdAt: now,
          schools: [],
        },
      ],
    }),
  );
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/grupos");
  const groupCard = page
    .getByText("Grupo responsive", { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const groupActions = [
    groupCard.getByRole("button", { name: "Copiar enlace" }),
    groupCard.getByRole("button", { name: "Eliminar", exact: true }),
  ];
  const mobileGroupActions = await Promise.all(
    groupActions.map((action) => action.boundingBox()),
  );
  expect(mobileGroupActions[0]!.width).toBe(mobileGroupActions[1]!.width);
  expect(mobileGroupActions[1]!.y).toBeGreaterThan(mobileGroupActions[0]!.y);
  await groupCard.getByRole("button", { name: /1 equipo/ }).click();
  await expect(
    groupCard.getByRole("button", { name: "Editar participante" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopGroupActions = await Promise.all(
    groupActions.map((action) => action.boundingBox()),
  );
  expect(desktopGroupActions[0]!.width).toBeLessThan(160);
  expect(desktopGroupActions[0]!.width).toBe(desktopGroupActions[1]!.width);
  expect(desktopGroupActions[0]!.y).toBe(desktopGroupActions[1]!.y);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/maestros");
  const teacherRow = page
    .getByText("Maestro responsive", { exact: true })
    .locator("xpath=ancestor::article[1]");
  const teacherActions = [
    teacherRow.getByRole("button", { name: "Carta", exact: true }),
    teacherRow.getByRole("button", { name: "Carnet anverso" }),
    teacherRow.getByRole("button", { name: "Carnet reverso" }),
    teacherRow.getByRole("button", { name: "Aprobar" }),
    teacherRow.getByRole("button", { name: "Rechazar a Maestro responsive" }),
  ];
  const mobileTeacherActions = await Promise.all(
    teacherActions.map((action) => action.boundingBox()),
  );
  for (const action of mobileTeacherActions) {
    expect(action).not.toBeNull();
    expect(action!.x).toBeGreaterThanOrEqual(0);
    expect(action!.x + action!.width).toBeLessThanOrEqual(320);
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopTeacherActions = await Promise.all(
    teacherActions.map((action) => action.boundingBox()),
  );
  expect(desktopTeacherActions[0]!.width).toBeLessThan(130);
  expect(desktopTeacherActions[0]!.y).toBe(desktopTeacherActions[1]!.y);
  expect(desktopTeacherActions[1]!.x).toBeGreaterThan(
    desktopTeacherActions[0]!.x,
  );
  expect((await teacherRow.boundingBox())!.height).toBeLessThan(260);

  await api.dispose();
});
