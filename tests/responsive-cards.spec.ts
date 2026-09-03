import { test, expect, request } from "@playwright/test";
import { API, ADMIN, createContest } from "./support/helpers";

test("keeps contest and task card actions responsive and compact", async ({
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
  const teacherCard = page
    .getByText("Maestro responsive", { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const teacherActions = [
    teacherCard.getByRole("button", { name: "Ver carta" }),
    teacherCard.getByRole("button", { name: "Carnet anverso" }),
    teacherCard.getByRole("button", { name: "Carnet reverso" }),
    teacherCard.getByRole("button", { name: "Aprobar" }),
    teacherCard.getByRole("button", { name: "Rechazar" }),
  ];
  const mobileTeacherActions = await Promise.all(
    teacherActions.map((action) => action.boundingBox()),
  );
  for (let index = 1; index < mobileTeacherActions.length; index += 1) {
    expect(mobileTeacherActions[index]!.width).toBe(
      mobileTeacherActions[0]!.width,
    );
    expect(mobileTeacherActions[index]!.y).toBeGreaterThan(
      mobileTeacherActions[index - 1]!.y,
    );
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
  expect(desktopTeacherActions[0]!.width).toBeLessThan(170);
  expect(desktopTeacherActions[0]!.width).toBe(desktopTeacherActions[1]!.width);
  expect(desktopTeacherActions[0]!.y).toBe(desktopTeacherActions[1]!.y);
  expect(desktopTeacherActions[1]!.x).toBeGreaterThan(
    desktopTeacherActions[0]!.x,
  );
  expect((await teacherCard.boundingBox())!.height).toBeLessThan(260);

  await api.dispose();
});
