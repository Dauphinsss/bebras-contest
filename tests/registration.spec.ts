import { test, expect, request } from "@playwright/test";
import {
  ADMIN,
  API,
  loginAdmin,
  uploadedDocuments,
  removeNewUploads,
  registrationFields,
  VALID_PDF,
  VALID_JPG,
  VALID_PNG,
} from "./support/helpers";

test("rejects documents whose content does not match the extension", async () => {
  const api = await request.newContext();
  const response = await api.post(`${API}/api/auth/register`, {
    multipart: {
      firstName: "Archivo",
      lastName: "Disfrazado",
      email: `archivo-${Date.now()}@example.com`,
      password: "segura123",
      schoolName: "Colegio manual",
      institutionType: "school",
      phone: "70000000",
      letter: {
        name: "carta.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("esto no es un documento PDF"),
      },
    },
  });

  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("contenido del documento");
  await api.dispose();
});

test("registers school and homeschool teachers with valid documents", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const previousUploads = uploadedDocuments();
  const schoolEmail = `colegio-${Date.now()}@example.com`;
  const homeschoolEmail = `casa-${Date.now()}@example.com`;

  try {
    const school = await api.post(`${API}/api/auth/register`, {
      multipart: {
        ...registrationFields(schoolEmail, "school"),
        letter: VALID_PDF,
      },
    });
    expect(school.status(), await school.text()).toBe(201);

    const homeschool = await api.post(`${API}/api/auth/register`, {
      multipart: {
        ...registrationFields(homeschoolEmail, "homeschool"),
        idFront: VALID_JPG,
        idBack: VALID_PNG,
      },
    });
    expect(homeschool.status(), await homeschool.text()).toBe(201);

    const teachersResponse = await api.get(`${API}/api/users/maestros`, {
      headers,
    });
    expect(teachersResponse.ok(), await teachersResponse.text()).toBe(true);
    const teachers = await teachersResponse.json();
    expect(teachers).toContainEqual(
      expect.objectContaining({
        email: schoolEmail,
        institutionType: "school",
        hasLetter: true,
        hasIdFront: false,
        hasIdBack: false,
      }),
    );
    expect(teachers).toContainEqual(
      expect.objectContaining({
        email: homeschoolEmail,
        institutionType: "homeschool",
        hasLetter: false,
        hasIdFront: true,
        hasIdBack: true,
      }),
    );
  } finally {
    removeNewUploads(previousUploads);
    await api.dispose();
  }
});

test("rejects incomplete, unsupported and oversized document uploads cleanly", async () => {
  const api = await request.newContext();
  const previousUploads = uploadedDocuments();

  const assertRejectedWithoutUploads = async (
    multipart: Record<string, string | typeof VALID_PDF>,
    expectedMessage: string,
  ) => {
    const response = await api.post(`${API}/api/auth/register`, { multipart });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toContain(expectedMessage);
    expect(uploadedDocuments()).toEqual(previousUploads);
  };

  try {
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`tipo-${Date.now()}@example.com`, "school"),
        letter: {
          name: "carta.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("documento"),
        },
      },
      "PDF o una imagen",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`grande-${Date.now()}@example.com`, "school"),
        letter: {
          name: "carta.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0x25),
        },
      },
      "5 MB",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`campos-${Date.now()}@example.com`, "school"),
        firstName: "",
        letter: VALID_PDF,
      },
      "son obligatorios",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`parcial-${Date.now()}@example.com`, "school"),
        letter: VALID_PDF,
        idFront: {
          name: "carnet.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("documento"),
        },
      },
      "PDF o una imagen",
    );
  } finally {
    removeNewUploads(previousUploads);
    await api.dispose();
  }
});

test("separates the manual school from teaching at home", async ({ page }) => {
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

  const manualOption = page.getByRole("button", {
    name: "Mi colegio no está en la lista",
  });
  const homeOption = page.getByRole("button", { name: "Enseño en casa" });

  await expect(manualOption).toBeVisible();
  await expect(homeOption).toBeVisible();
  await expect(
    page.getByText(
      "Con un colegio te pediremos la carta del director; si enseñas en casa, tu carnet de identidad.",
    ),
  ).toBeVisible();

  const documentBlock = (label: string) =>
    page
      .getByText(label, { exact: true })
      .locator(
        'xpath=ancestor::div[contains(@class,"transition-[grid-template-rows]")][1]',
      );
  const blockHeight = async (label: string) =>
    (await documentBlock(label).boundingBox())?.height ?? 0;

  await manualOption.click();
  await page
    .getByPlaceholder("Nombre de tu unidad educativa")
    .fill("Colegio de Prueba");
  await expect(async () => {
    expect(
      await blockHeight("Carta de autorización del director"),
    ).toBeGreaterThan(0);
    expect(await blockHeight("Carnet — anverso")).toBe(0);
  }).toPass({ timeout: 10000 });

  await page
    .getByRole("button", { name: "Buscar mi colegio en la lista" })
    .click();
  await homeOption.click();
  await expect(page.getByText("Educación en casa")).toBeVisible();
  await expect(async () => {
    expect(await blockHeight("Carnet — anverso")).toBeGreaterThan(0);
    expect(await blockHeight("Carta de autorización del director")).toBe(0);
  }).toPass({ timeout: 10000 });
});

test("lets a teacher sign in first and upload the documents later", async () => {
  const api = await request.newContext();
  const email = `luego-${Date.now()}@example.com`;

  const registered = await api.post(`${API}/api/auth/register`, {
    multipart: {
      firstName: "Sube",
      lastName: "Después",
      email,
      password: "segura123",
      schoolName: "Colegio de Prueba",
      institutionType: "school",
      phone: "70000001",
    },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const created = await registered.json();
  expect(created.pendingDocuments).toBe(true);

  expect(created.user.status).toBe("pending");
  const meWithRegisterToken = await api.get(`${API}/api/auth/me`, {
    headers: { authorization: `Bearer ${created.token}` },
  });
  expect(meWithRegisterToken.ok(), await meWithRegisterToken.text()).toBe(true);

  const login = await api.post(`${API}/api/auth/login`, {
    data: { email, password: "segura123" },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const session = await login.json();
  expect(session.user.status).toBe("pending");
  const headers = { authorization: `Bearer ${session.token}` };

  const profile = await api
    .get(`${API}/api/auth/me`, { headers })
    .then((r) => r.json());
  expect(profile.documents.complete).toBe(false);
  expect(profile.documents.missing).toEqual(["letter"]);

  const groups = await api.get(`${API}/api/groups`, { headers });
  expect(groups.status()).toBe(403);

  const wrongDocument = await api.post(`${API}/api/auth/me/documents`, {
    headers,
    multipart: { idFront: VALID_PNG },
  });
  expect(wrongDocument.status()).toBe(400);

  const upload = await api.post(`${API}/api/auth/me/documents`, {
    headers,
    multipart: { letter: VALID_PDF },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  expect((await upload.json()).documents.complete).toBe(true);

  const updated = await api
    .get(`${API}/api/auth/me`, { headers })
    .then((r) => r.json());
  expect(updated.documents.letter).toBe(true);
  expect(updated.documents.missing).toEqual([]);
  expect(updated.status).toBe("pending");

  const homeEmail = `casa-${Date.now()}@example.com`;
  const homeRegistered = await api.post(`${API}/api/auth/register`, {
    multipart: {
      firstName: "Media",
      lastName: "Carnet",
      email: homeEmail,
      password: "segura123",
      schoolName: "Educación en casa",
      institutionType: "homeschool",
      phone: "70000002",
      idFront: VALID_JPG,
    },
  });
  expect(homeRegistered.status(), await homeRegistered.text()).toBe(201);

  const homeLogin = await api
    .post(`${API}/api/auth/login`, {
      data: { email: homeEmail, password: "segura123" },
    })
    .then((r) => r.json());
  const homeProfile = await api
    .get(`${API}/api/auth/me`, {
      headers: { authorization: `Bearer ${homeLogin.token}` },
    })
    .then((r) => r.json());
  expect(homeProfile.documents.idFront).toBe(true);
  expect(homeProfile.documents.missing).toEqual(["idBack"]);

  await api.dispose();
});

test("sorts teachers by status and confirms rejecting or suspending", async ({
  page,
}) => {
  const api = await request.newContext();
  const stamp = Date.now();
  const approvedEmail = `aprobado-${stamp}@example.com`;
  const rejectedEmail = `rechazado-${stamp}@example.com`;

  for (const [email, firstName] of [
    [approvedEmail, "Aprobable"],
    [rejectedEmail, "Rechazable"],
  ]) {
    const created = await api.post(`${API}/api/auth/register`, {
      multipart: {
        firstName,
        lastName: "Maestro",
        email,
        password: "segura123",
        schoolName: "Colegio de Prueba",
        institutionType: "school",
        phone: "70000003",
        letter: VALID_PDF,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
  }

  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((r) => r.json());
  await api.dispose();

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto("/maestros");

  const filterBy = (name: RegExp) => page.getByRole("button", { name });

  await expect(page.getByText(approvedEmail)).toBeVisible({
    timeout: 15000,
  });

  const rowFor = (email: string) =>
    page.locator("article").filter({ hasText: email });

  await rowFor(approvedEmail).getByRole("button", { name: "Aprobar" }).click();
  await filterBy(/^Aprobados/).click();
  await expect(page.getByText(approvedEmail)).toBeVisible();

  await rowFor(approvedEmail)
    .getByRole("button", { name: "Suspender" })
    .click();
  const suspendDialog = page.getByRole("alertdialog");
  await expect(suspendDialog).toContainText("¿Suspender a este maestro?");
  await suspendDialog.getByRole("button", { name: "Suspender" }).click();
  await filterBy(/^Suspendidos/).click();
  await expect(page.getByText(approvedEmail)).toBeVisible();

  await filterBy(/^Pendientes/).click();
  await rowFor(rejectedEmail)
    .getByRole("button", { name: /^Rechazar a/ })
    .click();
  const rejectDialog = page.getByRole("alertdialog");
  await expect(rejectDialog).toContainText("¿Rechazar a este maestro?");
  await rejectDialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText(rejectedEmail)).toBeVisible();

  await rowFor(rejectedEmail)
    .getByRole("button", { name: /^Rechazar a/ })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Rechazar" })
    .click();
  await filterBy(/^Rechazados/).click();
  await expect(page.getByText(rejectedEmail)).toBeVisible();

  const suspendedApi = await request.newContext();
  const suspendedLogin = await suspendedApi
    .post(`${API}/api/auth/login`, {
      data: { email: approvedEmail, password: "segura123" },
    })
    .then((r) => r.json());
  const groups = await suspendedApi.get(`${API}/api/groups`, {
    headers: { authorization: `Bearer ${suspendedLogin.token}` },
  });
  expect(groups.status()).toBe(403);
  await suspendedApi.dispose();
});

test("asks for another school that the admin approves on its own", async ({
  page,
}) => {
  const api = await request.newContext();
  const email = `dos-colegios-${Date.now()}@example.com`;

  const registered = await api.post(`${API}/api/auth/register`, {
    multipart: {
      firstName: "Dos",
      lastName: "Colegios",
      email,
      password: "segura123",
      schoolName: "Colegio Principal",
      institutionType: "school",
      phone: "70000004",
      letter: VALID_PDF,
    },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const session = await registered.json();
  const headers = { authorization: `Bearer ${session.token}` };

  const asked = await api.post(`${API}/api/auth/me/schools`, {
    headers,
    multipart: { schoolName: "Colegio Segundo", letter: VALID_PDF },
  });
  expect(asked.status(), await asked.text()).toBe(201);
  const school = await asked.json();
  expect(school.status).toBe("pending");
  expect(school.hasLetter).toBe(true);

  const repeated = await api.post(`${API}/api/auth/me/schools`, {
    headers,
    multipart: { schoolName: "colegio segundo", letter: VALID_PDF },
  });
  expect(repeated.status()).toBe(409);

  const main = await api.post(`${API}/api/auth/me/schools`, {
    headers,
    multipart: { schoolName: "Colegio Principal" },
  });
  expect(main.status()).toBe(409);

  const profile = await api
    .get(`${API}/api/auth/me`, { headers })
    .then((r) => r.json());
  expect(profile.phone).toBe("70000004");
  expect(profile.schoolName).toBe("Colegio Principal");
  expect(profile.schools).toHaveLength(1);
  expect(profile.schools[0].schoolName).toBe("Colegio Segundo");

  const adminHeaders = await loginAdmin(api);
  const listed = await api
    .get(`${API}/api/users/maestros`, { headers: adminHeaders })
    .then((r) => r.json());
  const listedTeacher = listed.find(
    (item: { email: string }) => item.email === email,
  );
  expect(listedTeacher.schools).toHaveLength(1);
  expect(listedTeacher.status).toBe("pending");

  const approvedSchool = await api.post(
    `${API}/api/users/schools/${school.id}/approve`,
    { headers: adminHeaders },
  );
  expect(approvedSchool.ok(), await approvedSchool.text()).toBe(true);
  expect((await approvedSchool.json()).status).toBe("approved");

  const removal = await api.delete(`${API}/api/auth/me/schools/${school.id}`, {
    headers,
  });
  expect(removal.status()).toBe(409);

  await api.dispose();

  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem("bebras_token", token);
      window.localStorage.setItem("bebras_user", JSON.stringify(user));
    },
    { token: session.token, user: session.user },
  );
  await page.goto("/perfil");

  await expect(page.getByText(email).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("70000004").first()).toBeVisible();
  await expect(page.getByText("Colegio Principal").first()).toBeVisible();
  await expect(page.getByText("Colegio Segundo").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Administrar otro colegio" }),
  ).toBeVisible();
});

test("builds the authorization letter as a PDF", async () => {
  const api = await request.newContext();
  const response = await api.post(`${API}/api/letter/pdf`, {
    data: {
      ciudad: "Cochabamba",
      dia: "31",
      mes: "agosto",
      anio: "2026",
      colegio: "AMERICA",
      maestro: "Jorge Eduardo Rojas",
      ci: "8765432 CB",
      director: "Rosa Chávez Antezana",
      colegioFirma: "AMERICA",
    },
  });

  expect(response.ok(), await response.text()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["content-disposition"]).toContain("attachment");

  const body = await response.body();
  expect(body.subarray(0, 4).toString()).toBe("%PDF");
  expect(body.byteLength).toBeGreaterThan(1000);

  await api.dispose();
});

test("hides the panel sections until the teacher is approved", async ({
  page,
}) => {
  const api = await request.newContext();
  const email = `panel-${Date.now()}@example.com`;
  const registered = await api.post(`${API}/api/auth/register`, {
    multipart: {
      firstName: "Sin",
      lastName: "Aprobar",
      email,
      password: "segura123",
      schoolName: "Colegio de Prueba",
      institutionType: "school",
      phone: "70000005",
      letter: VALID_PDF,
    },
  });
  const teacher = await registered.json();

  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem("bebras_token", token);
      window.localStorage.setItem("bebras_user", JSON.stringify(user));
    },
    { token: teacher.token, user: teacher.user },
  );
  await page.goto("/perfil");
  await expect(page.getByText("MIS COLEGIOS")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: "Grupos" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Práctica" })).toBeVisible();

  const adminHeaders = await loginAdmin(api);
  const listed = await api
    .get(`${API}/api/users/maestros`, { headers: adminHeaders })
    .then((r) => r.json());
  const stored = listed.find((item: { email: string }) => item.email === email);
  await api.post(`${API}/api/users/${stored.id}/approve`, {
    headers: adminHeaders,
  });
  await api.dispose();

  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem("bebras_token", token);
      window.localStorage.setItem(
        "bebras_user",
        JSON.stringify({ ...user, status: "approved" }),
      );
    },
    { token: teacher.token, user: teacher.user },
  );
  await page.goto("/grupos");
  await expect(page.getByRole("link", { name: "Grupos" })).toBeVisible({
    timeout: 15000,
  });
});
