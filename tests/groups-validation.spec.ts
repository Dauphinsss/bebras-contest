import { expect, request, test } from "@playwright/test";

import { ADMIN, API, createContest, loginAdmin } from "./support/helpers";

test("returns structured fields for group creation errors", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);

  const missingName = await api.post(`${API}/api/groups`, {
    headers,
    data: { contestId: contest.id, name: "" },
  });
  expect(missingName.status()).toBe(400);
  expect(await missingName.json()).toEqual({
    message: "El nombre del grupo es obligatorio.",
    code: "GROUP_NAME_REQUIRED",
    field: "name",
  });

  const missingContest = await api.post(`${API}/api/groups`, {
    headers,
    data: { contestId: "missing-contest", name: "Grupo válido" },
  });
  expect(missingContest.status()).toBe(400);
  expect(await missingContest.json()).toEqual({
    message: "El desafío no existe.",
    code: "GROUP_CONTEST_NOT_FOUND",
    field: "contestId",
  });

  const invalidSchedule = await api.post(`${API}/api/groups`, {
    headers,
    data: {
      contestId: contest.id,
      name: "Grupo con fecha inválida",
      scheduledAt: "not-a-date",
    },
  });
  expect(invalidSchedule.status()).toBe(400);
  expect(await invalidSchedule.json()).toEqual({
    message: "La fecha de la sesión no es válida.",
    code: "GROUP_SCHEDULE_INVALID",
    field: "scheduledAt",
  });

  const outsideSchedule = await api.post(`${API}/api/groups`, {
    headers,
    data: {
      contestId: contest.id,
      name: "Grupo fuera de horario",
      scheduledAt: new Date(
        new Date(contest.startsAt as string).getTime() - 60_000,
      ).toISOString(),
    },
  });
  expect(outsideSchedule.status()).toBe(400);
  expect(await outsideSchedule.json()).toEqual({
    message: "La sesión debe estar dentro del horario del desafío.",
    code: "GROUP_SCHEDULE_OUTSIDE_CONTEST",
    field: "scheduledAt",
  });

  await api.dispose();
});

test("creates groups with an optional bounded schedule that can be cleared", async ({
  page,
}) => {
  const api = await request.newContext();
  const login = await api.post(`${API}/api/auth/login`, { data: ADMIN });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()) as {
    token: string;
    user: { id: number; email: string; name: string | null; role: string };
  };
  const headers = { authorization: `Bearer ${session.token}` };
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 2);
  startsAt.setHours(10, 30, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(16, 45, 0, 0);
  const contest = await createContest(api, headers, {
    title: "Desafío con sesión opcional",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  });
  const dateKey = [
    startsAt.getFullYear(),
    String(startsAt.getMonth() + 1).padStart(2, "0"),
    String(startsAt.getDate()).padStart(2, "0"),
  ].join("-");

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto("/grupos");
  await page.waitForFunction(
    () => {
      const island = document.querySelector(
        'astro-island[component-url*="groups-home"]',
      );
      return island !== null && !island.hasAttribute("ssr");
    },
    null,
    { timeout: 30000 },
  );

  const challenge = page.getByRole("combobox", { name: "Desafío" });
  const name = page.getByLabel("Nombre del grupo");
  const date = page.getByRole("button", {
    name: "Fecha y hora de la sesión, día",
  });
  const time = page.getByLabel("Fecha y hora de la sesión, hora");
  const create = page.getByRole("button", { name: "Crear grupo" });
  await expect(
    page.getByText("Fecha y hora de la sesión (opcional)", { exact: true }),
  ).toBeVisible();
  await expect(date).toBeDisabled();
  await expect(time).toBeDisabled();

  await challenge.click();
  await page.getByRole("option", { name: contest.title }).click();
  await expect(date).toBeEnabled();
  await name.fill("Grupo sin programación");
  const unscheduledRequest = page.waitForRequest(
    (request) =>
      request.url() === `${API}/api/groups` &&
      request.method() === "POST" &&
      request.postDataJSON().name === "Grupo sin programación",
  );
  await create.click();
  expect((await unscheduledRequest).postDataJSON().scheduledAt).toBeNull();
  await expect(
    page.getByText("Grupo sin programación", { exact: true }),
  ).toBeVisible();

  await date.click();
  const day = page.locator(
    `[data-calendar-popover] [data-day="${dateKey}"] button`,
  );
  await expect(day).toBeEnabled();
  await day.click();
  await expect(time).toHaveAttribute("min", "10:30");
  await expect(time).toHaveAttribute("max", "16:45");
  await expect(time).toHaveValue("10:30");

  await name.fill("Grupo con programación");
  await time.fill("09:00");
  await create.click();
  const scheduleMessage =
    "La sesión debe estar dentro del horario del desafío.";
  await expect(date).toBeFocused();
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await expect(time).toHaveAttribute("aria-invalid", "true");
  await expect(date).toHaveAttribute(
    "aria-describedby",
    "group-scheduled-description group-scheduled-error",
  );
  await expect(page.locator("#group-scheduled-error")).toHaveText(
    scheduleMessage,
  );

  await time.fill("12:15");
  await expect(date).toHaveAttribute("aria-invalid", "false");
  const scheduledRequest = page.waitForRequest(
    (request) =>
      request.url() === `${API}/api/groups` &&
      request.method() === "POST" &&
      request.postDataJSON().name === "Grupo con programación",
  );
  await create.click();
  const expectedSchedule = new Date(startsAt);
  expectedSchedule.setHours(12, 15, 0, 0);
  expect((await scheduledRequest).postDataJSON().scheduledAt).toBe(
    expectedSchedule.toISOString(),
  );
  await expect(
    page.getByText("Grupo con programación", { exact: true }),
  ).toBeVisible();

  await date.click();
  await page
    .locator(`[data-calendar-popover] [data-day="${dateKey}"] button`)
    .click();
  await time.fill("14:00");
  await page
    .getByRole("button", { name: "Quitar fecha y hora de la sesión" })
    .click();
  await expect(date).toContainText("Elige un día");
  await expect(time).toBeDisabled();
  await expect(time).toHaveValue("");

  await date.click();
  await page
    .locator(`[data-calendar-popover] [data-day="${dateKey}"] button`)
    .click();
  await time.fill("13:00");
  await time.fill("");
  await expect(date).toContainText("Elige un día");
  await expect(time).toHaveValue("");
  await name.fill("Grupo después de limpiar");
  const clearedRequest = page.waitForRequest(
    (request) =>
      request.url() === `${API}/api/groups` &&
      request.method() === "POST" &&
      request.postDataJSON().name === "Grupo después de limpiar",
  );
  await create.click();
  expect((await clearedRequest).postDataJSON().scheduledAt).toBeNull();

  await api.dispose();
});

test("associates group creation errors and recovers after a remote rejection", async ({
  page,
}) => {
  const api = await request.newContext();
  const login = await api.post(`${API}/api/auth/login`, { data: ADMIN });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()) as {
    token: string;
    user: { id: number; email: string; name: string | null; role: string };
  };
  const headers = { authorization: `Bearer ${session.token}` };
  const firstContest = await createContest(api, headers, {
    title: "Desafío validación uno",
  });
  const secondContest = await createContest(api, headers, {
    title: "Desafío validación dos",
  });
  let rejectNextCreation = true;

  await page.route(`${API}/api/groups`, async (route) => {
    if (route.request().method() === "POST" && rejectNextCreation) {
      rejectNextCreation = false;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "El desafío ya cerró; no es posible crear grupos.",
          code: "GROUP_CONTEST_CLOSED",
          field: "contestId",
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto("/grupos");
  await page.waitForFunction(
    () => {
      const island = document.querySelector(
        'astro-island[component-url*="groups-home"]',
      );
      return island !== null && !island.hasAttribute("ssr");
    },
    null,
    { timeout: 30000 },
  );

  const contest = page.getByRole("combobox", { name: "Desafío" });
  const name = page.getByLabel("Nombre del grupo");
  const create = page.getByRole("button", { name: "Crear grupo" });
  await create.click();

  await expect(contest).toBeFocused();
  await expect(contest).toHaveAttribute("aria-invalid", "true");
  await expect(contest).toHaveAttribute(
    "aria-describedby",
    "group-contest-error",
  );
  await expect(page.locator("#group-contest-error")).toHaveText(
    "Elige un desafío publicado.",
  );
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAttribute("aria-describedby", "group-name-error");

  await contest.click();
  await page.getByRole("option", { name: firstContest.title }).click();
  await expect(contest).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator("#group-contest-error")).toHaveCount(0);
  await create.click();
  await expect(name).toBeFocused();

  await name.fill("Grupo con validación accesible");
  await expect(name).toHaveAttribute("aria-invalid", "false");
  await create.click();

  const closedMessage = "El desafío ya cerró; no es posible crear grupos.";
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: closedMessage }),
  ).toBeVisible();
  await expect(contest).toBeFocused();
  await expect(contest).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#group-contest-error")).toHaveText(closedMessage);

  await contest.click();
  await page.getByRole("option", { name: secondContest.title }).click();
  await expect(page.locator("#group-contest-error")).toHaveCount(0);
  await create.click();

  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Grupo creado." }),
  ).toBeVisible();
  await expect(
    page.getByText("Grupo con validación accesible", { exact: true }),
  ).toBeVisible();

  await api.dispose();
});
