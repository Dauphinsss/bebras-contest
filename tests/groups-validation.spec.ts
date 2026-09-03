import { expect, request, test } from "@playwright/test";

import { ADMIN, API, createContest, loginAdmin } from "./support/helpers";

test("returns structured fields for basic group creation errors", async () => {
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
