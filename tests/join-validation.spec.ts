import { expect, request, test } from "@playwright/test";

import { API, createContest, loginAdmin } from "./support/helpers";

async function createGroup(allowPairs = false) {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers, { allowPairs });
  const response = await api.post(`${API}/api/groups`, {
    headers,
    data: { contestId: contest.id, name: "Validation Group" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const group = (await response.json()) as { accessCode: string };
  await api.dispose();
  return { accessCode: group.accessCode, grade: contest.picked.grade };
}

async function openJoinForm(page: import("@playwright/test").Page) {
  await page.goto("/entrar");
  await page.waitForFunction(
    () => {
      const island = document.querySelector(
        'astro-island[component-url*="join-form"]',
      );
      return island !== null && !island.hasAttribute("ssr");
    },
    null,
    { timeout: 30000 },
  );
}

test("associates code errors with the code field", async ({ page }) => {
  const group = await createGroup();
  await openJoinForm(page);

  const code = page.getByLabel("Tu código");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(code).toHaveAttribute("aria-describedby", "access-code-error");
  await expect(page.locator("#access-code-error")).toHaveText(
    "Escribe el código que te dio tu maestro.",
  );

  // Ocho caracteres: se intenta como codigo personal y no existe.
  await code.fill("ZZZZZZZZ");
  await expect(code).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator("#access-code-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#access-code-error")).toHaveText(
    "Código no encontrado.",
  );

  // El codigo del grupo lleva a inscribirse, nunca a rendir.
  await code.fill(group.accessCode);
  await expect(page.locator("#access-code-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByRole("combobox", { name: "¿En qué curso estás?" }),
  ).toBeVisible();
});

test("validates pair registration and preserves general step errors", async ({
  page,
}) => {
  const group = await createGroup(true);
  await openJoinForm(page);

  await page.getByLabel("Tu código").fill(group.accessCode);
  await page.getByRole("button", { name: "Continuar" }).click();

  const grade = page.getByRole("combobox", {
    name: "¿En qué curso estás?",
  });
  const firstName = page.getByLabel("Nombres", { exact: true });
  const lastName = page.getByLabel("Apellidos", { exact: true });
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(grade).toBeFocused();
  await expect(grade).toHaveAttribute("aria-invalid", "true");
  await expect(grade).toHaveAttribute("aria-describedby", "grade-error");
  await expect(firstName).toHaveAttribute("aria-invalid", "true");
  await expect(lastName).toHaveAttribute("aria-invalid", "true");

  await grade.click();
  await page.getByRole("option").first().click();
  await expect(grade).toHaveAttribute("aria-invalid", "false");
  await firstName.fill("Ana");
  await lastName.fill("Quispe");
  await page.getByRole("button", { name: "Pareja" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  const secondFirst = page.getByLabel("Nombres del 2.º integrante");
  const secondLast = page.getByLabel("Apellidos del 2.º integrante");
  await expect(secondFirst).toBeFocused();
  await expect(secondFirst).toHaveAttribute("aria-invalid", "true");
  await expect(secondLast).toHaveAttribute("aria-invalid", "true");

  await secondFirst.fill("Ana");
  await secondLast.fill("Quispe");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(secondFirst).toBeFocused();
  await expect(page.locator("#two-first-error")).toHaveText(
    "Debe ser una persona diferente.",
  );

  await secondFirst.fill("Bea");
  await expect(page.locator("#two-first-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Confirma tus datos")).toBeVisible();

  await page.route("**/api/play/join", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "No se pudo completar el registro." }),
    });
  });
  await page.getByRole("button", { name: "Confirmar y entrar" }).click();

  const formError = page
    .getByRole("alert")
    .filter({ hasText: "No se pudo completar el registro." });
  await expect(formError).toBeVisible();
  await expect(formError).toBeFocused();

  await page.unroute("**/api/play/join");
  await firstName.fill("Ana María");
  await expect(formError).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Confirmar y entrar" }).click();

  await expect(page.getByText("¡Listo, te registraste!")).toBeVisible();
});
