import { expect, test } from "@playwright/test";

import {
  API,
  ADMIN,
  registrationFields,
  removeNewUploads,
  uploadedDocuments,
  VALID_JPG,
  VALID_PNG,
} from "./support/helpers";

async function openRegistration(page: import("@playwright/test").Page) {
  await page.goto("/registro");
  await page.waitForFunction(
    () => {
      const island = document.querySelector(
        'astro-island[component-url*="register-form"]',
      );
      return island !== null && !island.hasAttribute("ssr");
    },
    null,
    { timeout: 30000 },
  );
}

async function fillAccountFields(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.getByLabel("Nombres", { exact: true }).fill("Maestra");
  await page.getByLabel("Apellidos", { exact: true }).fill("Accesible");
  await page.getByLabel("Correo", { exact: true }).fill(email);
  await page.getByLabel("Teléfono", { exact: true }).fill("70000010");
  await page.getByLabel("Contraseña", { exact: true }).fill("segura123");
  await page
    .getByLabel("Confirmar contraseña", { exact: true })
    .fill("segura123");
}

test("validates phone numbers on the API and stores their international form", async ({
  request,
}) => {
  const email = `phone-api-${Date.now()}@example.com`;
  for (const phone of [
    "",
    "abcdef",
    "7abc1234",
    "1",
    "12345678",
    "+99971234567",
    "59171234567",
  ]) {
    const response = await request.post(`${API}/api/auth/register`, {
      multipart: { ...registrationFields(email, "school"), phone },
    });
    expect(response.status(), await response.text()).toBe(400);
    expect(await response.json()).toMatchObject({
      field: "phone",
      message: expect.any(String),
    });
  }

  // Reusing the rejected email also proves no account was created by invalid requests.
  for (const [index, [phone, normalized]] of [
    ["(7123) 45-67", "+59171234567"],
    ["22123456", "+59122123456"],
    ["+54 (11) 2345-6789", "+541123456789"],
  ].entries()) {
    const response = await request.post(`${API}/api/auth/register`, {
      multipart: {
        ...registrationFields(
          index === 0 ? email : `phone-${index}-${email}`,
          "school",
        ),
        phone,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const { token } = await response.json();
    const profile = await request.get(`${API}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.ok()).toBe(true);
    expect((await profile.json()).phone).toBe(normalized);
  }
});

for (const width of [390, 1280]) {
  test(`phone validation, normalization and recovery at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openRegistration(page);
    await fillAccountFields(
      page,
      `phone-ui-${width}-${Date.now()}@example.com`,
    );
    await page.getByRole("button", { name: "Enseño en casa" }).click();
    const phone = page.getByLabel("Teléfono", { exact: true });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText("7abc1234"));
    await phone.focus();
    await phone.press("ControlOrMeta+A");
    await phone.press("ControlOrMeta+V");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(phone).toBeFocused();
    await expect(phone).toHaveValue("7abc1234");
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#reg-phone-error")).toContainText("letras");
    await expect(phone).toHaveAttribute("aria-describedby", "reg-phone-error");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await phone.fill("+54 (11) 2345-6789");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.locator("dd").filter({ hasText: "+541123456789" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(phone).toHaveValue("+541123456789");
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.route("**/api/auth/register", (route) =>
      route.fulfill({
        status: 400,
        json: { field: "phone", message: "Revisa el número de contacto." },
      }),
    );
    await page
      .getByRole("button", { name: "Confirmar y crear cuenta" })
      .click();
    await expect(phone).toBeFocused();
    await expect(page.locator("#reg-phone-error")).toHaveText(
      "Revisa el número de contacto.",
    );
    await expect(phone).toHaveValue("+541123456789");
    await page.unroute("**/api/auth/register");
    await phone.fill("7123-4567");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page
      .getByRole("button", { name: "Confirmar y crear cuenta" })
      .click();
    await expect(
      page.getByText("Cuenta creada", { exact: true }),
    ).toBeVisible();
    const token = await page.evaluate(() =>
      localStorage.getItem("bebras_token"),
    );
    const profile = await page.request.get(`${API}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.ok()).toBe(true);
    expect((await profile.json()).phone).toBe("+59171234567");
  });
}

test("shows field errors and associates an existing email with its input", async ({
  page,
}) => {
  await openRegistration(page);

  const firstName = page.getByLabel("Nombres", { exact: true });
  const email = page.getByLabel("Correo", { exact: true });
  const school = page.getByLabel("¿Dónde enseñas?", { exact: true });
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(firstName).toBeFocused();
  await expect(firstName).toHaveAttribute("aria-invalid", "true");
  await expect(firstName).toHaveAttribute(
    "aria-describedby",
    "reg-first-error",
  );
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(school).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#reg-letter-error")).toHaveCount(0);

  await firstName.fill("Maestra");
  await page.getByLabel("Apellidos", { exact: true }).fill("Accesible");
  await email.fill("correo-invalido");
  await page.getByLabel("Teléfono", { exact: true }).fill("70000010");
  await page.getByLabel("Contraseña", { exact: true }).fill("123");
  await page
    .getByLabel("Confirmar contraseña", { exact: true })
    .fill("distinta");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(email).toBeFocused();
  await expect(page.locator("#reg-email-error")).toHaveText(
    "Ingresa un correo válido.",
  );
  await expect(page.locator("#reg-password-error")).toHaveText(
    "La contraseña debe tener al menos 6 caracteres.",
  );
  await expect(page.locator("#reg-confirm-error")).toHaveText(
    "Las contraseñas no coinciden.",
  );

  await email.fill(ADMIN.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(ADMIN.password);
  await page
    .getByLabel("Confirmar contraseña", { exact: true })
    .fill(ADMIN.password);
  await page
    .getByRole("button", { name: "Mi colegio no está en la lista" })
    .click();
  const manualSchool = page.getByLabel("¿Dónde enseñas?", { exact: true });
  await expect(manualSchool).toHaveAttribute("aria-invalid", "true");
  await expect(manualSchool).toHaveAttribute(
    "aria-describedby",
    "reg-school-error",
  );
  await manualSchool.fill("Colegio Accesible");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Confirmar y crear cuenta" }).click();

  const existingMessage = "Ya existe una cuenta con ese correo.";
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: existingMessage }),
  ).toBeVisible();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#reg-email-error")).toHaveText(existingMessage);

  await email.fill(`registro-${Date.now()}@example.com`);
  await expect(page.locator("#reg-email-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Confirmar y crear cuenta" }).click();

  await expect(page.getByText("Cuenta creada", { exact: true })).toBeVisible();
});

test("validates each homeschool document and maps backend errors to the file", async ({
  page,
}) => {
  const previousUploads = uploadedDocuments();

  try {
    await openRegistration(page);
    await fillAccountFields(page, `casa-ui-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Enseño en casa" }).click();

    const front = page.getByLabel("Carnet — anverso");
    const back = page.getByLabel("Carnet — reverso");

    await front.setInputFiles({
      name: "carnet.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("documento"),
    });
    await expect(page.locator("#reg-id-front-error")).toHaveText(
      "Elige un archivo PDF, JPG, JPEG o PNG.",
    );
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Elige un archivo PDF, JPG, JPEG o PNG." }),
    ).toBeVisible();

    await front.setInputFiles({
      name: "carnet.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0xff),
    });
    await expect(page.locator("#reg-id-front-error")).toHaveText(
      "El archivo no debe superar los 5 MB.",
    );

    await front.setInputFiles(VALID_JPG);
    await back.setInputFiles({
      name: "reverso.png",
      mimeType: "image/png",
      buffer: Buffer.from("contenido inválido"),
    });
    await expect(page.locator("#reg-id-front-error")).toHaveCount(0);
    await expect(page.locator("#reg-id-back-error")).toHaveCount(0);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page
      .getByRole("button", { name: "Confirmar y crear cuenta" })
      .click();

    await expect(back).toBeFocused();
    await expect(back).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#reg-id-back-error")).toContainText(
      "El contenido del documento no coincide",
    );
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "El contenido del documento no coincide" }),
    ).toBeVisible();

    await back.setInputFiles(VALID_PNG);
    await expect(page.locator("#reg-id-back-error")).toHaveCount(0);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page
      .getByRole("button", { name: "Confirmar y crear cuenta" })
      .click();
    await expect(
      page.getByText("Cuenta creada", { exact: true }),
    ).toBeVisible();
  } finally {
    removeNewUploads(previousUploads);
  }
});
