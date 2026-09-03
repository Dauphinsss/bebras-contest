import { test, expect, request } from "@playwright/test";
import { canAccessSiteNav } from "../frontend/src/lib/site-navigation";
import { API, ADMIN, loginAdmin } from "./support/helpers";

test("blocks the panel for users without a session", async ({ page }) => {
  await page.goto("/competencias");
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
});

test("filters navigation sections by user role", () => {
  expect(canAccessSiteNav("public")).toBe(true);
  expect(canAccessSiteNav("admin", "admin")).toBe(true);
  expect(canAccessSiteNav("staff", "admin")).toBe(true);
  expect(canAccessSiteNav("staff", "maestro")).toBe(true);
  expect(canAccessSiteNav("admin", "maestro")).toBe(false);
  expect(canAccessSiteNav("staff")).toBe(false);
});

test("keeps the new contest form within a mobile viewport", async ({
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
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/competencias/nueva");

  await expect(
    page.getByText("Datos generales", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ventana de inscripción")).toHaveCount(0);
  await expect(page.getByText("Duración por equipo (minutos)")).toHaveCount(0);
  await expect(page.getByText("Disponibles")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  const mainBeforeMenu = await page.locator("main").boundingBox();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  const mobileNavigation = page.getByRole("navigation", {
    name: "Navegación principal",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Práctica" }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Tareas" }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Desafíos" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    mobileNavigation.getByRole("link", { name: "Grupos" }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Maestros" }),
  ).toBeVisible();
  const mainWithMenu = await page.locator("main").boundingBox();
  expect(mainWithMenu!.y).toBeGreaterThan(mainBeforeMenu!.y);
  await page.getByRole("button", { name: "Cerrar menú" }).click();
  await expect(mobileNavigation).toBeHidden();

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.evaluate(() => {
    (
      window as Window & { __bebrasClientNavigation?: boolean }
    ).__bebrasClientNavigation = true;
  });
  await page.getByRole("link", { name: "Volver: Crear desafío" }).click();
  await expect(page).toHaveURL(/\/competencias\/?$/);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __bebrasClientNavigation?: boolean })
          .__bebrasClientNavigation,
    ),
  ).toBe(true);
  await expect(page.locator("html")).toHaveCSS("scrollbar-width", "none");
  await expect(page.getByRole("banner")).toHaveCSS(
    "view-transition-name",
    "app-header",
  );

  await api.dispose();
});


test("keeps the contest calendar within a mobile viewport", async ({
  page,
}) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const draft = await api
    .post(`${API}/api/contests`, {
      headers,
      data: {
        title: "PW Calendario " + Date.now(),
        category: "Capibara",
        durationMinutes: 45,
        tasks: [],
      },
    })
    .then((response) => response.json());

  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((response) => response.json());
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/competencias/editar?id=${draft.id}`);

  await expect(page.getByText("Inscripción", { exact: true })).toBeVisible();
  await expect(page.getByText("Rendición", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Ventana de rendición/ }).click();
  const calendarBounds = await page
    .locator('[data-slot="calendar"]')
    .boundingBox();
  expect(calendarBounds).not.toBeNull();
  expect(calendarBounds!.x).toBeGreaterThanOrEqual(0);
  expect(calendarBounds!.x + calendarBounds!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await api.dispose();
});
